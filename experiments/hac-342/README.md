# HAC-342 — judge-resolvable HAC-340 evidence

This directory publishes the frozen HAC-340 Google Cloud evidence in a form a
logged-out judge can check. It does not rerun the experiment, and it does not
change what HAC-340 proved.

## What HAC-340 proved, and what it did not

A `gemini-3.5-flash` agent on Google ADK 1.35.1, hosted on Cloud Run with Vertex
AI global model access, called the Interlock MCP proxy. Interlock returned
`ALLOW` and issued an authorization receipt. The protected target executed the
receipt-bound mutation. A separately authenticated principal read the target
back and observed `alpha=45`. Cloud Logging recorded the same correlation
identifier at the proxy.

`ALLOW` is a decision, not a verification. `OBSERVED` is an observation, not a
safety property. A receipt is not an exactly-once guarantee. Three negative
controls are not a security result. One traversal is not production readiness.

Not on the recorded path: Agent Runtime, Agent Gateway, CONTENT_AUTHZ.

This is a separate run from the HAC-330 controlled local causal experiment. The
two are never combined into one run, and HAC-340 does not reproduce the HAC-330
counterfactual in Google Cloud.

## Three identifiers, three referents

```text
sourcePacketSha256     794befb86b37d862dfbfa86070a2948cb7ddf53836fbb14748611126403188d0
publicPacketSha256     ea1d6993ca937bb5ae14ad43954e48bd1a91ceb5e959719f8a99492b0b0dbf0d
evidencePublicationSha [BIND: evidencePublicationSha]
```

`publicPacketSha256` verifies `evidence/cloud-run.public.json` — the bytes
published here. **This is the digest you can check.**

`sourcePacketSha256` is a cryptographic **commitment** to the frozen source
packet. Those bytes are deliberately not published, because they carry the
identifiers this publication exists to remove. You cannot recompute this digest
from public material, and nothing here claims you can. It exists so the source
packet cannot later be altered without detection.

`evidencePublicationSha` identifies the immutable commit publishing this
package.

**The public packet is a redacted derivative. It is not byte-identical to the
frozen source packet, and its digest is not the source digest.** Each identifier
matches only what it labels.

## Verify it yourself

```sh
node experiments/hac-342/bin/verify-public-packet.mjs
```

This recomputes `publicPacketSha256` over the actual published bytes, refuses a
packet whose digest claims to be the source digest, asserts that 21 material
evidence fields survived redaction unredacted, re-checks the frozen claims the
packet supports, enforces the principal relations below, and scans for
identifiers the redaction removed.

It reports whether the private source packet was present. In a public checkout
it is not, and the tool says so rather than implying the source digest was
re-verified.

## What was redacted, and what was kept

`evidence/redaction-manifest.json` records every redacted path, its category and
reason, and the material fields that had to survive. It does not restate a
single removed value.

Removed: the Google Cloud project identifier, the three Cloud Run endpoints,
Artifact Registry paths, every principal identifier, and ephemeral runtime
instance identifiers.

Kept, because the claims rest on them: the decision, receipt id and digest,
correlation id, model and framework, runtime source commit, the protected
mutation with its before/after revisions and invariant, the independently
observed `alpha=45`, all three negative-control status codes, the Cloud Run
region and Vertex location, and the proxy revision name in the Cloud Logging
entry.

### Principals: identifiers removed, relations kept

No principal's local part is published. Each distinct principal maps to a stable
ordinal token, keeping the `user:` / `serviceAccount:` kind:

```text
resources.agentServiceAccount    serviceAccount:[REDACTED:principal-1]
resources.proxyServiceAccount    serviceAccount:[REDACTED:principal-2]
resources.targetServiceAccount   serviceAccount:[REDACTED:principal-3]
resources.observerPrincipal      user:[REDACTED:principal-4]
proxy log jsonPayload.identity   [REDACTED:principal-1]
```

The claims never rested on anyone's account name — they rest on *relations*,
which survive and are enforced by the verifier: the logged caller is the agent's
service account; the observer is a `user:` principal, not a service account, and
is distinct from the agent; the three service accounts are pairwise distinct.

The mapping is assigned by order of first appearance and is not reversible.

## Runtime source

`runtimeSourceSha` is `ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a` and remains the
recorded identity of the source that executed.

**That commit is not published, and `runtimeSourceUrl` is not bound.** Its tree
contains `experiments/hac-340/evidence/local-traversal.json`, which hardcodes
the Google Cloud project identifier; publishing a ref to it would leak exactly
what this publication removes. Rewriting it to drop that file would change its
SHA, and a rewritten commit presented as `runtimeSourceSha` would misstate which
bytes ran. No revision link is fabricated.

Instead, `evidence/runtime-source-snapshot.json` records the SHA-256 of each of
the 36 executed source files as they existed at that commit, and a single digest
over the canonical listing:

```text
runtimeSourceSnapshotSha256  9aaa4ad1661444fff50a0392785aa69cbfc8a54fecff1fc4a1c178aa7da22cd1
```

This corresponds to the source recorded at `runtimeSourceSha` but is **not** that
Git commit object and is never renamed to it. Evidence artifacts are excluded —
they are the run's output, not its source.

## Redaction review

`redactionReviewStatus`: **completed 2026-08-16** — automated pattern scan for
credentials, keys, tokens, personal identifiers, deployment endpoints and
service-account local parts, plus manual field-by-field review. Re-run
automatically by `verify-public-packet.mjs`.

This is a redaction review. It is not a security audit, a penetration test, or a
compliance review, and it is not described as one.

## Local generation vs public verification

`bin/redact-packet.mjs` and `bin/runtime-source-snapshot.mjs` read the private
frozen evidence and the private runtime commit. They are **local generation**
tools; they are published for auditability but cannot run in a public checkout
and are not wired into public CI.

`bin/verify-public-packet.mjs` is **public verification**. It needs nothing
private and is what CI runs. Determinism of regeneration is a local gate,
asserted where the private source exists.

## Evidence discrepancies carried forward

Recorded in `redaction-manifest.json` under `sourceDiscrepancies`, preserving
both values rather than resolving silently:

1. **Agent and target revision names.** The HAC-342 design bindings name
   `interlock-hac340-agent-00002-s5d` and `interlock-hac340-target-00002-t85`.
   Neither appears anywhere in the frozen evidence or in git history:
   `bin/20-cloud-run.mjs` records `observedConfiguration` as service URLs rather
   than revision names, so only the proxy revision survives, via the Cloud
   Logging resource label. Only `interlock-hac340-proxy-00002-wzf` is evidenced
   and only it may appear on a factual surface.

2. **`controls.wrongAudienceStatus`.** The cloud control at
   `bin/20-cloud-run.mjs:34` sends `Bearer invalid.wrong.token` to the real
   Cloud Run proxy — an **invalid bearer token** control returning 401. The
   signed wrong-audience token is exercised only by the local parity run. The
   field name is kept unmutated in the packet; judge-facing surfaces say
   "invalid bearer token". Genuine wrong-audience rejection remains controlled
   local parity, not a cloud result.

3. **Teardown.** The runtime packet records `teardown: "pending"` and is not
   mutated. Completion is sourced to the private `teardown.json`.

## Bindings still unresolved

- `[BIND: evidencePublicationSha]` — needs this commit to exist
- `[BIND: cloudEvidenceUrl]` — needs the immutable published commit URL
- `[BIND: verifierUrl]` — namespaced `hac340VerifierUrl`; HAC-330 uses
  `hac330VerifyCommand` and has no verifier URL
- `[BIND: runtimeSourceUrl]` — **will not be bound.** Use the runtime source
  snapshot model above; surfaces must show the explicit unavailable state.

An unbound token on a judge-facing surface is a release blocker.
