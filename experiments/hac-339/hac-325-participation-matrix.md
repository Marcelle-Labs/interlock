# HAC-325 participation matrix — HAC-339 Phase B

Hop-by-hop audit of the original run (2026-08-13, 03:22–04:35 UTC), built
**only** from preserved artifacts at base SHA
`efea48013de626d5714c8c2c146c0e1b683cc615` plus the receipt narrative.
Classifications: **OBSERVED** (preserved runtime/API evidence shows it),
**DERIVED** (mechanical inference from preserved evidence), **ASSUMED**
(receipt narrative or documentation expectation, not directly evidenced),
**UNRESOLVED** (preserved evidence cannot decide).

Evidence key (all under `experiments/hac-325/` unless noted):

- `RE` = `evidence/reasoning-engine.json`
- `GWE` = `evidence/agent-gateway-egress.json`
- `REG` = `evidence/registry-mcp-servers.json`
- `POL` = `evidence/authz-policy-egress.json`; `EXT` = `evidence/authz-extension.json`
- `BLK` = `evidence/blocker-tls-interception.json` (40 `reasoning_engine_stderr` entries, 04:02–04:34)
- `XLOG` = `evidence/extension-logs.json` (50 entries)
- `CMD` = `evidence/commands.log` (**gitignored**; present only in the original
  working copy at `/Users/user1/dev/interlock`; read-only inspected there)
- `RCPT` = `docs/receipts/HAC-325-s0-receipt.md`

## Preserved timeline (all UTC 2026-08-13, all from structured evidence)

| Time | Event | Source |
| -- | -- | -- |
| 03:40:40–03:40:52 | ext_proc extension Cloud Run revisions start (`server.start` only, ever) | XLOG |
| 03:41:17 | `AuthzExtension` `interlock-s0-authz-ext` imported (`service: ext.s0.interlock.internal`, `EXT_PROC_GRPC`, `timeout: 1s`) | EXT |
| 03:43:46 | MCP server `interlock-s0-mcp` registered in Agent Registry (the **only** registration) | REG |
| 03:55:10 | Reasoning engine `6822295377757077504` **created** (before the gateway existed) | RE `createTime` |
| 04:02:02 | Pre-binding invocation: CRM `get_project` 403 — API not yet enabled | BLK[0–1] |
| 04:02:24–04:02:25 | Pre-binding: agent body executes; model `predict` 403 `PERMISSION_DENIED`; ADK `DynamicNodeFailError` | BLK[2–8] |
| 04:05:51 | Egress gateway `interlock-s0-gw-egress` created (`AGENT_TO_ANYWHERE`, `MCP`) | GWE `createTime` |
| 04:09:55 | Gateway updated (registries + PSC/DNS network config present) | GWE `updateTime` |
| 04:12:56–04:15:18 | `CONTENT_AUTHZ` egress policy created/updated, targeting the gateway, `action: CUSTOM` | POL |
| ≤04:23 | Engine bound to gateway (first post-binding interception failure at 04:23:22) | BLK[14–17], RE final state |
| 04:22:42 | CRM gRPC call → real Google IPv6: `Network is unreachable` 503 | BLK[11–13] |
| 04:23:22 | First session failure: aiohttp `CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain` to `us-central1-aiplatform.mtls.googleapis.com:443` → `TransportError` on `/v1beta1/.../sessions` → 04:23:32 `RuntimeError: Failed to create session` | BLK[14–17] |
| 04:28:26 | CRM gRPC call → `ipv4:240.0.0.2:443`: TLS handshake `TSI_PROTOCOL_FAILURE … CERTIFICATE_VERIFY_FAILED: self signed certificate in certificate chain` | BLK[26–28] |
| 04:33:09 | CRM gRPC → Google IPv6 `Network is unreachable` again | BLK[33–35] |
| 04:33:36 | Engine final `updateTime` (RCPT: source redeploy after binding) | RE `updateTime`, RCPT §"The blocker" |
| 04:34:03–04:34:13 | Session TLS failure **persists after** the 04:33:36 update | BLK[36–39] |
| 04:41 | Project `interlock-s0-gate` deleted (exhaustive teardown) | RCPT |

## The 15 hops

| # | Hop | Class | Evidence and reasoning |
| -- | -- | -- | -- |
| 1 | Gateway resource existed | **OBSERVED** | GWE: full resource with `agentGatewayCard` (mtlsEndpoint, rootCertificates), `AGENT_TO_ANYWHERE`, `protocols: [MCP]`, registry ref, PSC/DNS networkConfig. Ingress gateway also preserved (`agent-gateway.json`). |
| 2 | Agent Runtime was bound to it | **OBSERVED** | RE `spec.deploymentSpec.agentGatewayConfig.agentToAnywhereConfig.agentGateway = …/agentGateways/interlock-s0-gw-egress`; `identityType: AGENT_IDENTITY`; `effectiveIdentity` populated. Corroborated behaviorally by hop 11. |
| 3 | Source-based vs BYOC mode | **OBSERVED** (source-based) | RE `sourceCodeSpec` present, no container spec; BLK tracebacks run from the managed image (`/home/myuser/.local/lib/python3.11/…`); CMD shows Cloud Build only for the extension and target images, never an agent image. RCPT environment section: ADK deploy from source. |
| 4 | Binding existed before the final image/build | **ASSUMED** (bounded by OBSERVED times) | RE `createTime` 03:55:10 precedes gateway creation 04:05:51 — the **initial** image was necessarily built unbound. RCPT asserts a source redeploy after binding ("The agent was redeployed from source after the egress binding existed"); RE `updateTime` 04:33:36 is consistent with one final update, and `service.version=6` labels in BLK indicate multiple revisions. But no preserved artifact records whether the 04:33:36 update rebuilt the image from source (an injection opportunity) or was config-only. CMD does not contain the hand-run deploy/patch commands. |
| 5 | Expected CA material was actually injected into the image | **UNRESOLVED** | No trust-store listing, no image inspection, no build log for the agent image exists in the preserved evidence. Documentation (S1) says source-based deployments inject the CA "during image creation" — that is an expectation, not an observation, and hop 4's ambiguity propagates here. |
| 6 | Injected CA fingerprint matched the Gateway root | **UNRESOLVED** (reference material now preserved) | No runtime-presented certificate chain was captured, so no comparison was ever made. The gateway root CA itself **is** preserved in GWE `agentGatewayCard.rootCertificates`: subject=issuer `O=Google Cloud Managed Service, CN=Agent Gateway TLS Inspection CA (us-central1)`, self-signed, valid 2026-08-12→2036-08-09, SHA-256 `9A:9A:3A:F8:76:93:42:86:2F:A4:98:D9:15:3C:D8:D5:3D:53:35:88:83:C2:1B:81:A4:BE:EA:F0:26:45:31:20` (computed offline 2026-08-14 from the preserved PEM). |
| 7 | System trust store contained the CA | **UNRESOLVED** | Never inspected. No `update-ca-certificates` evidence, no `/etc/ssl/certs` listing, no container shell output anywhere in CMD or BLK. |
| 8 | `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` effective | **UNRESOLVED** | No env capture. BLK shows aiohttp verifying against *some* bundle that lacked the gateway CA; which bundle path/env was in effect is not recorded. |
| 9 | gRPC root bundle effective | **UNRESOLVED** | gRPC TLS verification ran and failed (BLK[26–28]) against a bundle lacking the gateway CA; `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` state never captured. |
| 10 | aiohttp / Google Auth consumed the trust path | **DERIVED (negative)** | BLK[14–16, 18–20, 22–24, 29–31, 36–38]: aiohttp's connector performed TLS verification via `ssl.py` and raised `SSLCertVerificationError: self-signed certificate in certificate chain`; `google.auth` aiohttp transport wrapped it as `TransportError` on the sessions URL. The client consumed *a* trust path — and that path did not contain the gateway CA. Whether the injected CA existed but was not consumed (H2) or was never present (H1/H3) is exactly what hops 5–9 leave open. |
| 11 | Managed session traffic traversed the Gateway | **DERIVED (strong)** | Pre-binding (04:02) session creation succeeded and the agent body executed. Post-binding, session calls to `us-central1-aiplatform.mtls.googleapis.com:443` complete TCP+TLS handshake against a chain terminating in a self-signed CA (BLK[15] vs BLK pre-binding behavior). Independently, a CRM gRPC call dialed `ipv4:240.0.0.2:443` — a non-Google-front-end address — and met the same self-signed-in-chain failure (BLK[26–28]). Both signatures are consistent with in-path TLS interception by the gateway and with nothing else on the path. Not byte-proven (no captured chain to fingerprint against hop 6's reference), hence DERIVED, not OBSERVED. |
| 12 | Agent body began execution | **OBSERVED** (pre-binding: yes; post-binding: no) | Pre-binding: BLK[2–8] show the ADK app executing (`DynamicNodeFailError` on node `interlock_s0_probe`, model `predict` 403). Post-binding: every invocation dies at session creation before user code (`RuntimeError: Failed to create session`, BLK[17,21,25,32,39]); per RE `classMethods`, all query entry points create a session first. |
| 13 | MCP request was emitted | **OBSERVED (negative)** | The agent's MCP call (`_mcp_call` in `agent/s0_agent/agent.py`) lives in the agent body, which never ran post-binding (hop 12). No MCP outbound attempt appears anywhere in BLK. (Pre-binding runs at 04:02 show an earlier agent revision attempting a model call instead; no MCP emission is recorded there either.) |
| 14 | Gateway observed MCP request | **UNRESOLVED (vacuous)** | No MCP request existed to observe (hop 13). No gateway-side logs were captured in the preserved evidence, so even incidental observation cannot be checked. |
| 15 | `CONTENT_AUTHZ` / ext_proc participated | **OBSERVED (negative)** | XLOG: 50 entries, all `server.start`/startup probes/shutdowns; **zero** `ext_proc` streams across the whole run. POL+EXT prove the policy and extension existed and were correctly targeted — presence without participation. |

## Asymmetry worth recording

Post-binding, two different Google API clients failed **differently**:
aiohttp→`aiplatform.mtls` and gRPC→CRM via `240.0.0.2` were TLS-intercepted
(cert-chain failures), while gRPC→CRM via real Google IPv6 addresses failed at
TCP connect (`Network is unreachable`). Which hostnames were steered into the
gateway dataplane versus attempted direct is not derivable from the preserved
evidence (no DNS captures) — but both failure families are inconsistent with a
healthy source-based CA-injected deployment.

## What this matrix cannot decide (feeds Phase C)

- Whether the final 04:33:36 update rebuilt the agent image (injection
  opportunity) — hop 4.
- Whether the gateway CA was present anywhere in the container (image, system
  store, env-pointed bundles) — hops 5–9.
- Whether the chain presented to clients was signed by the preserved gateway
  root — hop 6 (no runtime chain capture exists to compare).
