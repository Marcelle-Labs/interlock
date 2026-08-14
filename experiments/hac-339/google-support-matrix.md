# Google support matrix — HAC-339 Phase A

Current-documentation check of the HAC-325 topology, from primary Google
sources only (see `sources.md`; retrieval date 2026-08-14). Documentation is
now published under **Gemini Enterprise Agent Platform**; Agent Runtime and
Agent Gateway remain the product names inside that doc set.

Effect legend: **strengthens** / **weakens** / **unchanged** — relative to the
assumptions the HAC-325 run was built on, as recorded in
`experiments/hac-325/README.md` and `docs/receipts/HAC-325-s0-receipt.md`.

## The seven contract items

| # | Contract item | Current docs say | Source | Effect on HAC-325 assumptions |
| -- | -- | -- | -- | -- |
| 1 | Source-based (non-BYOC) Agent Runtime routed through Agent Gateway | Supported and documented. `agent_gateway_config` in `agent_engines.create` for new agents; PATCH `spec.deploymentSpec.agentGatewayConfig` for existing agents. An engine can bind egress and ingress gateways simultaneously. | S1 | **Strengthens.** The exact binding HAC-325 used (`spec.deploymentSpec.agentGatewayConfig.agentToAnywhereConfig`) is the documented path. |
| 2 | Agent-to-Anywhere egress gateway | Supported and documented. `governedAccessPath: AGENT_TO_ANYWHERE`, `protocols: [MCP]`, registry-attached; cross-project egress supported, same region required. | S5, S1 | **Strengthens.** Egress mode is a first-class documented mode, not a preview corner. |
| 3 | `AGENT_IDENTITY` / gateway-mediated policy | Documented. `identity_type=AGENT_IDENTITY` is required at creation time for gateway-mediated features; patching `agentGatewayConfig` onto an existing engine does not change `identity_type` — the engine must be redeployed with both set. CAA (mTLS + certificate-bound tokens; DPoP after the gateway) is on by default for agent identities. | S1, S3 | **Strengthens and explains.** HAC-325's observed `FAILED_PRECONDITION` without `identityType: AGENT_IDENTITY` (receipt correction #6) is now documented behavior. |
| 4 | Automatic CA injection during image creation for source-based deployments | Documented verbatim: "non-BYOC (source-based) agent deployments automatically inject the CA's certificate during image creation." Gateway root CA is retrievable from `agentGatewayCard.rootCertificates`. BYOC must install it manually. | S1 | **Strengthens** the contract HAC-325 relied on. Critical gap: the docs describe injection at **image creation**; they do not state that PATCHing a gateway onto an existing engine rebuilds the image or re-injects the CA. |
| 5 | Python HTTP trust-bundle behavior | Documented for BYOC: install gateway CA into the system store (`update-ca-certificates`) and set `SSL_CERT_FILE` and `REQUESTS_CA_BUNDLE` to `/etc/ssl/certs/ca-certificates.crt`. For non-BYOC the docs assert injection but do not publish the mechanism (which bundle path, which env vars the platform sets). | S1 | **Unchanged for the contract; weakens the completeness assumption.** The documented trust contract exists, but non-BYOC consumption mechanics are not specified, so "injection happened" cannot be verified from docs alone. |
| 6 | gRPC trust-bundle behavior | Documented for BYOC: `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=/etc/ssl/certs/ca-certificates.crt`. Same non-BYOC mechanism gap as item 5. | S1 | **Unchanged / partially silent** (same caveat as item 5). |
| 7 | Official end-to-end examples: Agent Runtime → Agent Gateway → MCP/external | Exists: official codelab deploying an ADK agent on Agent Runtime through an `AGENT_TO_ANYWHERE` gateway to MCP servers on Cloud Run, with Agent Registry, IAP `REQUEST_AUTHZ`, Model Armor `CONTENT_AUTHZ`. Further codelabs cover Google Cloud MCP servers, external MCP servers, and VPC destinations. Note: the codelab's `CONTENT_AUTHZ` is **Model Armor**; the **custom** `ext_proc` extension path is documented separately. | S6, S4, S5 | **Strengthens** the topology; **weakens** the assumption that a custom `ext_proc` `CONTENT_AUTHZ` round trip is the demonstrated happy path — the flagship example delegates content authorization to Model Armor instead. |

## Additional current-contract findings that bear directly on the HAC-325 failure

These were not part of the seven items but materially change the hypothesis
landscape (used in Phase C):

1. **Default-deny egress is now explicit and includes Google APIs.** "Agent
   Gateway blocks all outbound traffic to hosts not registered in Agent
   Registry" (S5); "Agent Gateway adopts a default deny policy" and Sessions /
   Memory Bank endpoints must be explicitly allowlisted, **including all
   hostname variants**: `REGION-aiplatform.googleapis.com`,
   `REGION-aiplatform.mtls.googleapis.com`, `aiplatform.REGION.rep.googleapis.com`
   (S1). The agent identity needs `roles/iap.egressor` on those destinations
   (S1, S2). HAC-325's blocker hostname was exactly
   `us-central1-aiplatform.mtls.googleapis.com` (the Sessions path).
2. **The documented startup-failure signature for missing registration is
   HTTP 403** (`Egress request is not authorized`), not TLS errors (S2).
   TLS handshake/certificate-verification failure is documented **only** as a
   BYOC symptom (S2).
3. **The official codelab grants egress on registered endpoints before
   deploying the agent**, because deployment itself reaches github.com and
   Google APIs through the gateway (S6). Ordering of registration/grants
   relative to deployment is part of the working recipe.
4. **Gateway terminates mTLS; DPoP is used after the gateway** (S3, CAA
   doc). With CAA on by default, agent credentials use mTLS endpoints —
   consistent with the agent's session client dialing the `.mtls.googleapis.com`
   hostname.
5. **Custom `CONTENT_AUTHZ` extensions remain FQDN-only**, HTTP/2 + TLS on
   443, `ext_proc` `FULL_DUPLEX_STREAMED` (S4) — matching what HAC-325 had to
   discover empirically (receipt corrections #2 and #3 are now consistent
   with published docs).
6. **Gateway root CA is inspectable** via `agentGatewayCard.rootCertificates`
   (S1) — a fingerprint comparison the original run never captured is
   mechanically obtainable in any rerun.

## Phase A conclusion

The HAC-325 topology — source-based Agent Runtime bound to an
`AGENT_TO_ANYWHERE` Agent Gateway with a custom `CONTENT_AUTHZ` extension —
**remains an officially supported and documented Google topology as of
2026-08-14**, with more precise published contracts than at HAC-325 time
(default-deny registry allowlisting, egressor IAM, AGENT_IDENTITY-at-creation,
CA injection for non-BYOC). Current docs **do not** falsify the topology; they
add operational prerequisites the original run did not perform, and they
document the observed TLS failure mode only for BYOC deployments.
