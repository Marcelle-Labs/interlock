# One-shot participation probe — TRUST-0

**Disposition context:** this probe exists because the disposition is
`RERUN_JUSTIFIED_AFTER_HAC316` (see `REPORT.md`). It is the **minimum**
cloud action that discriminates H1 / H2 / H3-ordering and screens H4. It is
not a Gateway rebuild: no extension, no custom `CONTENT_AUTHZ` policy, no
Cloud Run services, no load balancer, no model calls.

**Gate:** human-gated. Blocked until HAC-316 reaches a terminal result or the
founder explicitly reopens the gate (HAC-339 hard boundary). Everything below
is predeclared so the run cannot drift into exploratory provisioning.

## Why one shot is enough

Every missing discriminator in `hypothesis-matrix.md` is the same
observation: **the trust state inside the agent container after a verified
injection-eligible deployment**, plus the fingerprint of the chain the
gateway actually presents. The reference half of that comparison is already
preserved (`experiments/hac-325/evidence/agent-gateway-egress.json` →
`agentGatewayCard.rootCertificates`, SHA-256
`9A:9A:3A:F8:76:93:42:86:2F:A4:98:D9:15:3C:D8:D5:3D:53:35:88:83:C2:1B:81:A4:BE:EA:F0:26:45:31:20`).

## Predeclared setup (exactly this, nothing more)

1. Disposable project (undelete `interlock-s0-gate` if still inside Google's
   ~30-day recoverable window, i.e. before ~2026-09-12, else a fresh
   disposable project).
2. One `AGENT_TO_ANYWHERE` Agent Gateway with an Agent Registry reference
   (S5 YAML shape). No authorization policies.
3. Register in Agent Registry, **before** deploying the agent (S1 "Allowlist
   essential APIs", S6 codelab ordering): the Sessions endpoint hostnames in
   all documented variants (`us-central1-aiplatform.googleapis.com`,
   `us-central1-aiplatform.mtls.googleapis.com`,
   `aiplatform.us-central1.rep.googleapis.com`), plus
   `cloudresourcemanager(.mtls).googleapis.com` and
   `logging.googleapis.com`. Grant the agent identity `roles/iap.egressor`
   on each, plus the documented basic roles (S2). This keeps Layer P out of
   the trust measurement.
4. Deploy **one** source-based ADK agent with `agent_gateway_config` and
   `identity_type=AGENT_IDENTITY` **in the create call** (S1). Binding at
   creation removes the HAC-325 hop-4 ambiguity by construction: the first
   image is built already bound, which is the strongest injection-eligible
   configuration the docs describe.

## The probe itself

The agent package runs a trust self-audit at module import (or as a
registered custom class method invoked once via `:query` — either bypasses
the managed session path that failed in HAC-325; decide at execution, record
which was used) and writes one structured JSON result to stderr
(`reasoning_engine_stderr`):

1. `env`: values of `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`,
   `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` (present/absent/value).
2. `store`: whether `/etc/ssl/certs` (and the certifi bundle) contain a
   certificate whose SHA-256 fingerprint equals the preserved gateway root
   fingerprint above.
3. `presented_chain`: live TLS handshake to
   `us-central1-aiplatform.mtls.googleapis.com:443` (and one gRPC channel to
   `cloudresourcemanager.mtls.googleapis.com:443`) — capture the presented
   chain, record each cert's fingerprint, note whether the chain terminates
   in the preserved gateway root.
4. `session_probe`: exactly one managed session creation attempt; record
   success or the exact exception.

Then: one `gcloud logging read` of `reasoning_engine_stderr`, capture the
gateway's `agentGatewayCard.rootCertificates` again (rotation check against
the preserved fingerprint), teardown. No invocation beyond the one probe, no
model dependency, no MCP traffic.

## Decision table (predeclared)

| Observed | Conclusion |
| -- | -- |
| CA absent from image/store after binding-at-creation source deploy | **H1 confirmed** (platform injection defect); H3-ordering falsified |
| CA present in system store; env vars unset; both bundled-root clients (aiohttp/certifi, gRPC) still fail | **H2 confirmed** (consumption/env gap: injection without client-visible trust path) |
| CA present; env set; both clients verify; session succeeds | H1/H2/H3 all falsified for trust; HAC-325 failure attributed to the unverified redeploy (H3) — topology rehabilitated |
| CA present; both clients verify; session still fails | **H4 territory** — deeper platform/identity-layer (CAA/DPoP) defect; capture exact error and stop |
| Session fails with 403 `Egress request is not authorized` after trust verified | Layer P misconfigured despite step 3; fix registration/grants once, repeat session probe only |

## Cost and gain (both estimates, not measurements)

- **Estimated engineering effort:** ~1–2 hours including teardown; the agent
  package is ~100 lines.
- **Estimated cloud cost:** one reasoning engine deployed for minutes, one
  gateway, registry operations, log reads. No standing Cloud Run pair, no
  internal load balancer — the HAC-325 cost drivers are absent. Order of
  magnitude: low; bounded by same-day project teardown.
- **Information gain:** converts hops 4–9 from UNRESOLVED to OBSERVED;
  decides H1/H2/H3; screens H4; either rehabilitates the preferred
  `CONTENT_AUTHZ` enforcement topology for HAC-338/Vreko with a working
  recipe, or yields a verified, fingerprinted platform-defect report.
