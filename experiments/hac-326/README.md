# HAC-326 / S2 — the bounded MCP/API proxy enforcement gate

**Result: PASS.** The fallback enforcement point holds every property the
Interlock safety model needs, on a managed runtime, against direct attack.

This experiment exists because [HAC-325](../hac-325/README.md) falsified the
preferred one. It is not a retry of that topology and does not attempt to rescue
it.

## Where this starts

HAC-325 proved that an Agent Gateway `CONTENT_AUTHZ` extension **provisions and
binds** — the extension imports without allowlist gating, the gateway comes up
with PSC and DNS peering, the policy binds, and egress really is intercepted.
What it could not prove is that a request ever *reaches* the extension: binding
an `AGENT_TO_ANYWHERE` gateway put Agent Runtime's own managed session service
behind a TLS-decrypting proxy, session establishment failed certificate
verification, and the agent body never ran. Zero `ext_proc` events were observed.

So S2 begins from:

```
preferred Gateway insertion  = unavailable for this sprint
fallback proxy insertion     = the hypothesis under test
```

Nothing in this packet reuses an unproven S0 claim.

## The topology under test

```
minimal caller  (MCP client, or plain HTTP)
      │  authenticated request, correlation id
      ▼
bounded Interlock proxy            ← Cloud Run, IAM-authenticated
      │  pending-intent store: what else is in flight?
      │  deterministic decision over real co-change evidence
      │  ALLOW → mint + sign an authorization receipt (Ed25519)
      ▼
protected target                   ← Cloud Run, IAM-authenticated
      │  validates the receipt ITSELF, then mutates
      ▼
target state
      │
      ▼
independent re-read                ← the only thing that produces OBSERVED
```

The proxy is **not** authority. The target validates the receipt from the bytes
in front of it and refuses everything else, which is why the whole topology
survives the proxy being bypassed, dead, or replaced.

## What the decision is made from

Real co-change evidence, produced by the pinned upstream miner
(`@workspacejson/mining-core` at `defac1e5`) over a real commit graph during
HAC-330. This experiment **consumes** that artifact verbatim; it does not
synthesize pairs.

| Pair | Support | Meaning here |
| -- | -- | -- |
| `services/alpha/reservation.json` ↔ `services/beta/reservation.json` | 8 | the unsafe composed pair |
| `services/alpha/…` ↔ `services/gamma/…` | absent | the safe independent pair |

Both intents are individually valid — each fits the pool alone. Their
composition is not: 60 + 60 + 20 = 140 against a pool of 130. That is what makes
the hazard invisible to any check that examines one request at a time, and it is
the whole reason an enforcement point has to see *concurrency*, not just
requests.

## Running it

```sh
pnpm install --frozen-lockfile
pnpm run hac326          # builds, then runs every local arm and writes the packet
pnpm run check:packet:s2 # verifies the committed packet
```

The local arm needs nothing outside this repository — no cloud, no sibling
checkout, no network. It is re-run on every pull request by the `S2 enforcement
gate` CI job.

### The deployed arm

```sh
export PROJECT_ID=<billing-enabled project>
experiments/hac-326/bin/10-deploy.sh                     # build + deploy both services
PROXY_SERVICE=interlock-s2-proxy \
  node experiments/hac-326/bin/20-cloud-run.mjs          # drive it, write cloud-run.json
DELETE_PROJECT=true experiments/hac-326/bin/99-teardown.sh
```

Both services deploy with `--no-allow-unauthenticated`. That is not incidental
hardening — it is what puts a real, platform-verified caller identity in front of
the proxy, which is one of the things this gate had to freeze. It also avoids the
org policy that forbids `allUsers` (HAC-325 finding 9) rather than weakening it.

## What was frozen

### The request contract

Captured from a running service, not from documentation —
[`evidence/request-envelope.json`](evidence/request-envelope.json). Both
transports carry the same intent and reach the same decision path; only the
envelope differs, which is the point.

### Caller identity

[`evidence/identity.json`](evidence/identity.json). On Cloud Run with IAM
authentication the proxy observed:

```
identitySource: oidc-id-token/platform-verified:email
identity:       <local-part>@marcellelabs.io
```

The platform verifies the Google-signed ID token before the container is
invoked, so the container decodes an already-verified token rather than
re-fetching a JWKS inside the request path. That reasoning holds only while the
deployment posture does, so the posture is recorded in the identity source string
itself and the deployment flag is recorded alongside it.

**Recorded limitation.** No Agent Runtime *agent* identity is bound. HAC-325
established that the Gateway path never delivered a request, so the agent-identity
fields it would have carried were never observed — and this packet does not claim
them. The receipt binds only fields that are real and stable.

### The receipt

An S2 contract fixture, not the production schema. Ed25519 over canonically
serialized claims, binding: receipt id, correlation id, caller identity and its
source, operation, intent digest, target id, **expected target revision**,
evidence basis revision + artifact digest + producer revision, decision, issued-at,
expiry, and a single-use nonce.

### The portable decision contract: `ALLOW | DENY`

Argument modification is **excluded**, and this is a decision rather than an
omission. It is mechanically available — a proxy that rewrote arguments before
signing would produce a receipt the target accepts, because the digest binds
whatever was signed. It is excluded because that is precisely the problem: the
caller believes it sent X, the target executed Y, and *no receipt anywhere records
the divergence*. Supporting MODIFY would require a second binding carrying the
original intent, which is a schema commitment S2 has no evidence to justify.

## Results

Every arm, mechanically checked: [`evidence/results.json`](evidence/results.json)
(22 local checks) and [`evidence/cloud-run.json`](evidence/cloud-run.json)
(7 deployed checks).

### The two arms that matter

| Arm | Outcome |
| -- | -- |
| safe independent (`alpha` + `gamma`) | both ALLOW, both mutations execute |
| unsafe composed (`alpha` + `beta`, concurrent) | exactly one ALLOW, one DENY with rationale, pool never breached |

On the deployed topology the same pair produced `alpha ALLOW, beta DENY`, final
total 121 ≤ 130.

### The target refuses, and refuses *before* the side effect

Ten attacks made **directly** against the target, bypassing the proxy entirely —
[`evidence/target-rejections.json`](evidence/target-rejections.json). Every one
is HTTP 403 with `stateUnchanged` and `revisionUnchanged` both true, because
"rejected" and "rejected without side effect" are different claims and only the
second is worth anything.

`RECEIPT_ABSENT` · `RECEIPT_MALFORMED` · `RECEIPT_SIGNATURE_INVALID` (edited, and
fabricated with an untrusted key) · `RECEIPT_EXPIRED` · `RECEIPT_STALE_REVISION` ·
`RECEIPT_WRONG_TARGET` · `RECEIPT_WRONG_OPERATION` · `RECEIPT_INTENT_MISMATCH` ·
`RECEIPT_REPLAYED`

### Fail-closed

[`evidence/chaos.json`](evidence/chaos.json) — seven arms, no ALLOW, no receipt
issued, no state moved:

| Arm | Condition | Result |
| -- | -- | -- |
| A | proxy unavailable | caller cannot reach it; routing around it hits `RECEIPT_ABSENT` |
| B | decision exceeds its deadline | `DECISION_TIMEOUT`, no receipt |
| C | pending-intent store unavailable | `STORE_WRITE_FAILED` |
| C2 | replay ledger unavailable at the target | `REPLAY_LEDGER_UNAVAILABLE` |
| D | malformed evidence | `EVIDENCE_MALFORMED` |
| D2 | evidence absent | `EVIDENCE_ABSENT` |
| E | evidence stale relative to the source | `STALE_BASIS` |

### Latency

[`evidence/latency.json`](evidence/latency.json). Distributions, not one
happy-path number.

| Path | median | p95 | max | n |
| -- | -- | -- | -- | -- |
| authorized, loopback | 1.23 ms | 1.77 ms | 3.28 ms | 200 |
| denied, loopback | 0.51 ms | 0.79 ms | 9.51 ms | 200 |
| two concurrent, loopback | 1.44 ms | 2.59 ms | 3.35 ms | 50 |
| receipt signing only | 0.033 ms | 0.04 ms | 0.13 ms | 500 |
| authorized, Cloud Run from a workstation | 104.8 ms | 191.7 ms | 194.8 ms | 40 |

The enforcement path itself costs **single-digit milliseconds**; the Cloud Run
figure is dominated by workstation-to-region internet latency, which is not
attributable to Interlock. A defensible budget for the decision path is **p95 < 5 ms
in-region**, and it is comfortably met.

## Findings the running system forced

Recorded because each one changed the implementation or the claim.

1. **Symmetric concurrent denial livelocks.** The first implementation had both
   halves of a coupled pair observe each other and both withhold. Safe, and
   useless: nothing ever proceeds. "Serialize" requires someone to go first, so
   arbitration now assigns deterministic precedence (earliest `recordedAt`,
   correlation id breaking the tie) and admits exactly one member of a coupled
   set. The tie-break is load-bearing — millisecond collisions happen precisely
   under the contention this rule exists for, and two intents that each believed
   they led would compose the pair the decision just refused.

2. **Revision binding subsumes replay for a single-writer target.** A replayed
   receipt is refused, but by `RECEIPT_STALE_REVISION`, not by the nonce ledger:
   a successful first use advances the hash-chained revision, so any replay is
   necessarily stale too. The ledger becomes load-bearing exactly when the
   revision can repeat — a restored backup, a second target instance, a target
   whose revision is a counter rather than a chain. The packet therefore proves
   the ledger separately, with the revision held constant, which is the only
   condition that distinguishes the two checks.

3. **A NUL byte in a `.ts` file made it invisible to `git grep`.** The same defect
   HAC-330 hit in a `.mjs` file. CI's "Source files are text" check did not cover
   `*.ts`, so it caught nothing. The glob now includes it: the rule was not
   wrong, it was scoped to the one language that had already tripped it.

4. **A silently swallowed identity-token failure is undebuggable.** The proxy's
   metadata-server lookup returned `undefined` on failure without logging, which
   made an unauthenticated downstream call indistinguishable from a misconfigured
   one — the resulting 403 arrived with no explanation. It now emits a structured
   line on both the error and non-OK paths.

5. **IAM propagation lag looks exactly like a broken deployment.** The first
   deployed run failed every authorized request with `TARGET_UNREACHABLE` because
   the `run.invoker` binding granting the proxy access to the target had not
   propagated. Re-running after ~2 minutes passed with no code change. Worth
   knowing before someone debugs a correct system.

6. **`gcloud builds submit` will not read `--config` from stdin.** It reports
   `Unable to read file [-]`. The config is written to `.work/` instead.

## What this packet does not claim

- **Not the production broker.** HAC-317 owns that. This is the smallest real
  enforcement path that can freeze an architecture.
- **Not a distributed pending-intent store.** It is in-memory and scoped to one
  proxy instance; a second instance would not see the first's pending intents.
  Both Cloud Run services run with `--max-instances=1` for that reason, and the
  constraint is recorded rather than hidden.
- **Not restart-safe.** The replay ledger does not survive a restart. HAC-327
  owns that.
- **Not an observation.** A `200` establishes `MUTATION_EXECUTED` at most. Only an
  independent re-read produces `OBSERVED`, and no participant can assert it about
  its own work — enforced structurally, not by convention.
- **No cost figure.** Billing export lags, and canon forbids publishing an
  unmeasured number. The project was disposable and has been deleted.

## Teardown

`gcloud projects delete interlock-s2-gate` ran at the end of the deployed arm and
returned `DELETE_REQUESTED`. Deleting the project removes every resource, so no
residue check is needed and spend stopped there. Google retains it recoverably
for roughly 30 days.
