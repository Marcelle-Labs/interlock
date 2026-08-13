# HAC-326 / S2 receipt — bounded MCP/API proxy enforcement gate

**Result: PASS.** Every load-bearing acceptance item in the HAC-326 contract is
proven mechanically, locally and on a managed runtime. The architecture is
frozen; see [`docs/architecture/enforcement-topology.md`](../architecture/enforcement-topology.md).

Executed 2026-08-13. Authority: Linear HAC-326, and the corrected enforcement
topology record above.

## Entry conditions

| Gate | State | Evidence |
| -- | -- | -- |
| HAC-328 | Done | `docs/receipts/HAC-328-bootstrap-receipt.md`; `main` protected |
| HAC-330 | PASS | `experiments/hac-330/evidence/results.json`; evidence consumed verbatim here |
| HAC-325 | **FAILED / PIVOTED** | `docs/receipts/HAC-325-s0-receipt.md`; preferred insertion point falsified |

This issue begins from `preferred Gateway insertion = unavailable`, and reuses no
unproven S0 claim.

## Environment

| Item | Value |
| -- | -- |
| Project | `interlock-s2-gate` (project number `46045882887`) — created for this spike, deleted at teardown |
| Region | `us-central1` |
| Services | `interlock-s2-proxy`, `interlock-s2-target`, both Cloud Run, both `--no-allow-unauthenticated`, `--max-instances=1` |
| Runtime | Node 22.19.0; image digest-pinned `node@sha256:5539840c…`, non-root uid 10001 |
| Signature | Ed25519 (`node:crypto`), key pair minted per deployment, never committed |
| Evidence | `@workspacejson/mining-core` 0.0.0 @ `defac1e5`, basis `eb67a6f5…`, artifact sha256 `2c021d0c…` |
| Caller | `qwynn@marcellelabs.io`, platform-verified ID token |

Environment variable **names** are recorded in `src/config.ts`; no value appears
in this repository.

## Pass contract

| # | Acceptance item | Result | Evidence |
| -- | -- | -- | -- |
| 1 | exact proxy request shape frozen | PASS | `request-envelope.json` (MCP + HTTP, captured from a running service) |
| 2 | caller identity shape frozen or limitation recorded | PASS | `identity.json`; `oidc-id-token/platform-verified:email` observed on Cloud Run; **no agent identity — recorded as a limitation** |
| 3 | unsafe composed pair denied before execution | PASS | `decision-deny.json`; `UNSAFE-1`, `CR-UNSAFE` |
| 4 | safe independent request allowed | PASS | `decision-allow.json`; `SAFE-1`, `SAFE-2`, `CR-ALLOW` |
| 5 | structured rationale reaches the caller | PASS | `UNSAFE-2`; `{decision, reasonCode, correlationId, message, evidenceRefs, couplings}` |
| 6 | valid receipt enables the protected operation | PASS | `SAFE-1`, `CR-ALLOW` |
| 7 | no receipt rejected | PASS | `TGT-1`, `CR-BYPASS` |
| 8 | stale receipt rejected | PASS | `TGT-5` (`RECEIPT_STALE_REVISION`) |
| 9 | expired receipt rejected | PASS | `TGT-4` |
| 10 | replay/duplicate rejected | PASS | `TGT-10`, plus the isolated ledger proof — see *Finding 2* |
| 11 | wrong target rejected | PASS | `TGT-6` |
| 12 | wrong intent/arguments rejected | PASS | `TGT-8` |
| 13 | wrong revision rejected | PASS | `TGT-5` |
| 14 | outage fails closed | PASS | chaos arm A |
| 15 | decision/store timeout fails closed | PASS | chaos arms B, C, C2 |
| 16 | missing/malformed evidence is not green | PASS | chaos arms D, D2, E |
| 17 | correlation survives caller → proxy → target | PASS | `correlation-trace.json`; `CORR-1` |
| 18 | latency distribution measured | PASS | `latency.json`, `cloud-run.json` |
| 19 | argument modification proven or removed | **REMOVED, deliberately** | contract frozen `ALLOW \| DENY`; rationale below |
| 20 | acknowledgement remains distinct from OBSERVED | PASS | `observation.json`; `OBS-1..3` |
| 21 | exact rerun documented | PASS | `experiments/hac-326/README.md` |
| 22 | no WorkspaceJSON upstream mutation required | PASS | `check:provenance`; pins unchanged, nothing copied |
| 23 | fallback remains bounded | PASS | one tool, one protected operation, two services, zero runtime dependencies |

22 local checks and 7 deployed checks, all passing:
`experiments/hac-326/evidence/results.json`, `evidence/cloud-run.json`.

## What was proven, and how

**The target is the enforcement boundary, not the proxy.** Ten attacks were made
*directly* against the protected target, bypassing the proxy entirely. All ten
returned HTTP 403 with `stateUnchanged` and `revisionUnchanged` true — the
refusal happens before the side effect, which is the only version of "rejected"
worth anything. This is what makes the fallback defensible despite the proxy not
sitting in an unavoidable data path: routing around the proxy degrades to calling
the target without a receipt, which is already refused.

**The decision is deterministic and evidence-driven.** No model output can
authorize a mutation; a model may propose or explain only. The permissive answer
is reachable only from the last line of the arbitration function, after every
guard has passed — structurally, not by convention.

**Failure never became permission.** Seven chaos arms, no ALLOW, no receipt
issued, no state moved.

### Red/green proofs

| Property | RED | GREEN |
| -- | -- | -- |
| target receipt validation | unguarded apply executes the unauthorized call (isolated test fixture) | real target refuses the identical call |
| revision binding | verifying against the receipt's own `expectedRevision` accepts a stale receipt | verifying against the revision the target holds rejects it |
| bypass | — | direct call with no receipt → `RECEIPT_ABSENT`, state unchanged |
| pending-intent store | — | store unavailable → `STORE_WRITE_FAILED`, never an empty-and-therefore-safe read |
| replay | — | second admission at constant revision → `RECEIPT_REPLAYED` |
| the packet gate itself | flipping one chaos arm to `ALLOW` → `verify-packet` exits 1 | restored → exits 0 |

Defects were introduced only inside isolated test fixtures or by constructing
inputs differently. **No production code path can disable enforcement** — there
is no flag to do so, deliberately.

## Latency, and the budget it supports

| Path | median | p95 | max | n |
| -- | -- | -- | -- | -- |
| authorized, loopback | 1.23 ms | 1.77 ms | 3.28 ms | 200 |
| denied, loopback | 0.51 ms | 0.79 ms | 9.51 ms | 200 |
| two concurrent, loopback | 1.44 ms | 2.59 ms | 3.35 ms | 50 |
| receipt signing only | 0.033 ms | 0.04 ms | 0.13 ms | 500 |
| authorized, Cloud Run from a workstation | 104.8 ms | 191.7 ms | 194.8 ms | 40 |

The enforcement path costs single-digit milliseconds; receipt signing is ~33 µs
and is not a factor. The Cloud Run figure is dominated by workstation-to-region
internet latency, which is not attributable to Interlock.

**Frozen budget: p95 < 5 ms for the in-region decision path.** Comfortably met.
This does not destroy the interaction model.

## Argument modification: excluded, not skipped

It is mechanically available — the receipt binds whatever was signed, so a proxy
that rewrote arguments before signing would produce a receipt the target accepts.
That is the objection rather than the feature: the caller believes it sent X, the
target executes Y, and no receipt records the divergence. Supporting it needs a
second binding carrying the original intent, which S2 produced no evidence to
justify. The portable contract is frozen as `ALLOW | DENY`.

## Findings the running system forced

1. **Symmetric concurrent denial livelocks.** Both halves of a coupled pair
   observed each other and both withheld — safe, and nothing ever proceeds.
   Arbitration now assigns deterministic precedence (earliest `recordedAt`,
   correlation id breaking the tie) and admits exactly one member of a coupled
   set. The tie-break is load-bearing: millisecond collisions happen precisely
   under contention, and two intents each believing they led would compose the
   pair the decision just refused.

2. **Revision binding subsumes replay for a single-writer target.** A replayed
   receipt is refused by `RECEIPT_STALE_REVISION`, not by the nonce ledger,
   because a successful first use advances the hash-chained revision. The ledger
   is load-bearing only where the revision can repeat — restored backup, second
   instance, counter-based revision — so the packet proves it separately with the
   revision held constant.

3. **A NUL byte in a `.ts` file made it invisible to `git grep`** — the HAC-330
   defect, recurring in a language CI's text check did not cover. The glob now
   includes `*.ts`.

4. **A silently swallowed identity-token failure is undebuggable.** The metadata
   lookup returned `undefined` without logging, making an unauthenticated
   downstream call indistinguishable from a misconfigured one. Now logged
   structurally on both failure paths.

5. **IAM propagation lag looks exactly like a broken deployment.** The first
   deployed run failed every authorized request with `TARGET_UNREACHABLE`; a
   re-run ~2 minutes later passed with no code change.

6. **`gcloud builds submit` will not read `--config` from stdin** — reports
   `Unable to read file [-]`.

## Recorded limitations

Not defects; boundaries of what this packet claims.

- **In-memory pending-intent store**, scoped to one proxy instance. Both services
  run `--max-instances=1` for that reason. A distributed store is HAC-317's.
- **Replay ledger does not survive restart.** HAC-327 owns restart safety.
- **No Agent Runtime agent identity** is bound — never observed, so never claimed.
- **No cost figure.** Billing export lags and canon forbids an unmeasured number.

## Quality gates

`pnpm run typecheck`, `pnpm run build`, `pnpm run test:coverage` (289 tests,
97.0% statements), `pnpm run check:provenance`, `pnpm run check:packet`,
`pnpm run check:packet:s2` all pass locally.

The new enforcement code lands in the `src/authorization/**`, `src/broker/**` and
`src/observation/**` paths that `codecov.yml` already reserved as components at
100% patch coverage — those component definitions were written by META-337
against components that "match zero files" until this work landed. They now
match, and are covered.

A new non-required CI context, `S2 enforcement gate`, verifies the committed
packet and re-runs the local experiment on every pull request. No existing
required context was renamed, removed, or weakened.

## Reproduction and teardown

```sh
pnpm install --frozen-lockfile
pnpm run hac326            # local arms + packet
pnpm run check:packet:s2   # packet integrity

export PROJECT_ID=<billing-enabled project>
experiments/hac-326/bin/10-deploy.sh
PROXY_SERVICE=interlock-s2-proxy node experiments/hac-326/bin/20-cloud-run.mjs
DELETE_PROJECT=true experiments/hac-326/bin/99-teardown.sh
```

### Teardown executed

`gcloud projects delete interlock-s2-gate` ran at the end of the deployed arm and
returned `DELETE_REQUESTED`. Deleting the project removes every resource, so no
residue check is needed and spend stopped there. Google retains it recoverably
for roughly 30 days.

## Disposition

**ARCHITECTURE FREEZE PASSED.** The topology is frozen as

```
ADK / Agent Runtime → bounded Interlock MCP/API proxy →
deterministic Interlock core + receipt → protected target validates receipt →
independent verifier
```

HAC-316 and HAC-317 may fan out against the contracts listed in
[`docs/architecture/enforcement-topology.md`](../architecture/enforcement-topology.md),
once META-337 reports QUALITY FAN-OUT READY.
