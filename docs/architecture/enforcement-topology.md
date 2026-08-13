# Interlock enforcement topology — corrected after HAC-325

**Status: FROZEN** as of HAC-326 (2026-08-13).

This record supersedes the Gateway-extension enforcement decision for the
purposes of the contest submission. It does not delete that decision — it
records what falsified it, because a topology that was tried and failed is
evidence, and hiding it would leave the next reader to rediscover it.

## The decision

Interlock enforces at a **bounded MCP/API proxy that the caller talks to on
purpose**, with the protected target independently validating a signed
authorization receipt.

```
ADK / Agent Runtime caller
      │
      ▼
bounded Interlock MCP/API proxy
      │   pending-intent coordination
      │   deterministic decision over pinned co-change evidence
      ▼
deterministic Interlock core → signed authorization receipt
      │
      ▼
protected target — validates the receipt itself, then mutates
      │
      ▼
independent verifier — re-reads state; the only producer of OBSERVED
```

## What was decided before, and what falsified it

The preferred insertion point was an Agent Gateway `AGENT_TO_ANYWHERE` egress
gateway with a `CONTENT_AUTHZ` authorization extension, so that enforcement sat
in the platform's data path and no agent could route around it by declining to
call a proxy. That is a better property than the fallback has, which is why it
was preferred.

HAC-325 executed it on real infrastructure and it did not work:

- the extension imports with **no allowlist gating** — the availability question
  is answered, positively;
- the gateway provisions with PSC `networkAttachment` and DNS peering; the
  `CONTENT_AUTHZ` policy binds; the Cloud Run `ext_proc` service runs behind an
  internal load balancer;
- and the extension received **zero** `ext_proc` events.

Binding an `AGENT_TO_ANYWHERE` gateway routes *all* agent egress through a
TLS-decrypting proxy, and Agent Runtime's own managed session service is on that
path. Session creation failed certificate verification for both aiohttp and gRPC,
the agent body never executed, and it therefore never emitted the MCP call the
extension would have inspected. Redeploying from source after the binding
existed — which the documentation says injects the gateway CA at image creation —
did not resolve it.

Nothing about payload shape, identity, latency or fail-closed behaviour was
established there, and none of it is reused.

## Why the fallback is acceptable, and where it is genuinely weaker

Weaker, stated plainly: **the proxy is not in a data path the caller cannot
avoid.** An agent that simply does not call the proxy is not intercepted by it.
The Gateway design would not have had that gap.

What makes the fallback defensible anyway is that the proxy was never the
enforcement boundary. The **target** is:

- it validates the receipt from the bytes in front of it, with no dependency on
  how the request was routed;
- a call that skips the proxy arrives with no receipt and is refused;
- a call that replays, edits, misdirects, or outlives a receipt is refused;
- a receipt authorizes exactly one intent against exactly one target revision.

So "route around the proxy" degrades to "call the target without a receipt",
which is the case the target already refuses. HAC-326 proved that mechanically,
by attacking the target directly rather than by asserting that the proxy behaves.

## What HAC-326 froze

| Contract | Frozen as |
| -- | -- |
| Caller decision | `ALLOW \| DENY`. Argument modification is excluded — see below. |
| Denial shape | `{ decision, reasonCode, correlationId, message, evidenceRefs, couplings? }` |
| Correlation | application-propagated `interlock-correlation-id`; no platform field is assumed |
| Receipt transport | `interlock-receipt`, base64url JSON, proxy → target |
| Receipt bindings | receipt id, correlation id, caller identity + source, operation, intent digest, target id, expected target revision, evidence basis + artifact digest + producer revision, decision, issued-at, expiry, nonce |
| Caller identity | `oidc-id-token/platform-verified:email` on Cloud Run with IAM; explicit `unavailable` otherwise |
| Signature | Ed25519 over canonically serialized claims |

**Argument modification is excluded deliberately.** It is mechanically available
— the receipt binds whatever was signed, so a proxy could rewrite arguments and
the target would accept them. That is the objection, not the feature: the caller
would believe it sent X while the target executed Y, with no receipt recording
the divergence. Supporting it needs a second binding carrying the original
intent, and S2 produced no evidence justifying that schema commitment.

## Consequences

**HAC-316 and HAC-317 may now depend on:** the receipt bindings and their
verification order; the `ALLOW | DENY` contract and denial shape; the correlation
header and its propagation rule; the header names above; the rule that the target
validates independently and that no participant may assert `OBSERVED`.

**They may not assume:** a distributed pending-intent store, restart-safe replay
state, an Agent Runtime agent identity in the receipt, or any Agent Gateway
field. Each is either recorded as a limitation in the HAC-326 packet or owned by
a later issue (HAC-327 for restart safety, HAC-317 for the production broker and
verifier).

## Revisiting this

The Gateway path is not dead, it is unfunded on the critical path. A BYOC
container with the gateway CA installed remains the documented remedy for the TLS
blocker and would restore the stronger property. If it is ever taken up, the
enforcement contracts above are what it must satisfy — the insertion point would
change; the receipt semantics would not.
