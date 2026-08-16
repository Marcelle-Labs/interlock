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

## Three digests, three referents

```text
sourcePacketSha256     794befb86b37d862dfbfa86070a2948cb7ddf53836fbb14748611126403188d0
publicPacketSha256     5c181ae6474f25d2418558012f883df5d34212294d66a4224875743fddd47f13
evidencePublicationSha [BIND: evidencePublicationSha]
```

`sourcePacketSha256` identifies the original frozen packet at
`experiments/hac-340/evidence/cloud-run.json`, byte-exact.

`publicPacketSha256` identifies `evidence/cloud-run.public.json` — the redacted
derivative published here, byte-exact.

`evidencePublicationSha` identifies the immutable commit that publishes this
package. It cannot exist until that commit does, and is never substituted with
the frozen evidence commit.

**The public packet is not byte-identical to the source packet, and its digest
is not the source digest.** Each digest matches only the bytes it labels.

## Verify it yourself

```sh
node experiments/hac-342/bin/verify-public-packet.mjs
```

This recomputes both digests over the actual bytes, refuses a public packet
whose digest claims to be the source digest, asserts that 21 material evidence
fields survived redaction unredacted, re-checks the frozen claims the packet is
published to support, and scans for identifiers the redaction removed.

To confirm the source packet was never mutated:

```sh
shasum -a 256 experiments/hac-340/evidence/cloud-run.json
node experiments/hac-340/bin/verify-packet.mjs
```

## What was redacted, and what was kept

`evidence/redaction-manifest.json` records every redacted path, its category and
reason, the digests, and the material fields that had to survive. It does not
restate a single removed value.

Removed: the Google Cloud project identifier, the three Cloud Run endpoints,
Artifact Registry paths, the operator's personal identifier, and ephemeral
runtime instance identifiers.

Kept, because the claims rest on them: the decision, receipt id and digest,
correlation id, model and framework, runtime source commit, the protected
mutation with its before/after revisions and invariant, the independently
observed `alpha=45`, all three negative-control status codes, the Cloud Run
region and Vertex location, and the proxy revision name in the Cloud Logging
entry.

Service accounts and the observer principal are partially redacted rather than
removed: the account name and the principal *kind* are the transport-provenance
and independence claims themselves, so the local part is kept and only the
hosting project is removed.

## Redaction review

`redactionReviewStatus`: **completed 2026-08-16** — automated pattern scan for
credentials, keys, tokens, personal identifiers and deployment endpoints, plus
manual field-by-field review of the packet. Re-run automatically by
`verify-public-packet.mjs`.

This is a redaction review. It is not a security audit, a penetration test, or a
compliance review, and it is not described as one.

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
   mutated. Completion is sourced to `experiments/hac-340/evidence/teardown.json`.

## Bindings still unresolved

These require the immutable public commit and cannot be bound here:

- `[BIND: evidencePublicationSha]`
- `[BIND: cloudEvidenceUrl]`
- `[BIND: verifierUrl]` — namespaced `hac340VerifierUrl`; HAC-330 uses
  `hac330VerifyCommand` and has no verifier URL
- `[BIND: runtimeSourceUrl]` — `ae6d0d3` is currently unreachable from any
  published branch. It becomes resolvable if that history is published; until
  then the surface must show the explicit unavailable state and must not
  fabricate a revision link.

An unbound token on a judge-facing surface is a release blocker.
