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
3. **IAP in dry-run mode.** Switch the gateway's IAP authorization layer to
   dry-run before any agent traffic, per S2: "Temporarily switch IAP to
   dry-run mode to see which connections are failing without blocking
   startup." In DRY_RUN, IAP "logs denials but does not enforce them" (S2),
   so a known registry/policy gap cannot confound the trust measurement.
   Verify the mode from the IAP egress-decision logs via
   `protoPayload.metadata.iamEnforcementMode="DRY_RUN"` (S2). The exact
   toggle surface (gcloud/API field) is confirmed against then-current docs
   when the gate opens — a docs lookup, not a design decision.
4. **No endpoint registrations, no egressor grants** beyond what platform
   deployment itself requires. Under DRY_RUN, unregistered destinations are
   logged-not-blocked, which lets one run capture both the trust measurement
   and the complete would-be-denied destination map from the IAP DRY_RUN
   logs (S2 query: `protoPayload.serviceName="iap.googleapis.com"`
   `protoPayload.authorizationInfo.permission="iap.webServiceVersions.egressViaIAP"`).
5. Deploy **one** source-based ADK agent with `agent_gateway_config` and
   `identity_type=AGENT_IDENTITY` **in the create call** (S1). Binding at
   creation removes the HAC-325 hop-4 ambiguity by construction: the first
   image is built already bound, which is the strongest injection-eligible
   configuration the docs describe.

## The probe itself (frozen execution path — no execution-time decisions)

The agent package registers a dedicated custom class method `trust_audit()`
on the engine. Execution is exactly:

```text
deploy → reasoningEngines:query(classMethod="trust_audit")
       → capture in-container trust evidence
       → exactly one sessions.create
       → stop
```

`reasoningEngines:query` is a distinct API operation whose request body
takes `classMethod` ("Class method to be used for the query", S7) — it
invokes the audit method directly, without touching the managed session path
that failed in HAC-325 (session creation is the separate
`reasoningEngines.sessions.create` operation, S7). There is **no**
module-import timing dependency and no alternative path.

`trust_audit()` returns (and logs to `reasoning_engine_stderr`) one
structured JSON document:

1. `env`: values of `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`,
   `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` (present/absent/value).
2. `store`: whether `/etc/ssl/certs` **and** the certifi bundle
   (`certifi.where()`) each contain a certificate whose SHA-256 fingerprint
   equals the preserved gateway root fingerprint above.
3. `presented_chain`: live TLS handshake to
   `us-central1-aiplatform.mtls.googleapis.com:443` (and one gRPC channel to
   `cloudresourcemanager.mtls.googleapis.com:443`) — record each presented
   certificate's fingerprint and whether the chain terminates in the
   preserved gateway root.
4. `session_probe`: exactly one managed session creation attempt
   (`sessions.create`); record success or the exact exception.

Then: one `gcloud logging read` of `reasoning_engine_stderr` **and** one IAP
DRY_RUN decision-log read (query in step 4), capture the gateway's
`agentGatewayCard.rootCertificates` again (rotation check against the
preserved fingerprint), teardown. No invocation beyond the one probe, no
model dependency, no MCP traffic.

## Decision table (predeclared)

| Observed | Conclusion |
| -- | -- |
| CA absent from image/store after binding-at-creation source deploy | **H1 confirmed for the current platform version** (injection defect); H3-ordering falsified for this deployment |
| CA present in system store; env vars unset; both bundled-root clients (aiohttp/certifi, gRPC) still fail | **H2 confirmed for this deployment** (consumption/env gap: injection without client-visible trust path) |
| CA present; env set; both clients verify; `sessions.create` succeeds | H1/H2/H4 **falsified for this deployment**; the current supported topology works under a verified binding-at-creation deployment. **Historical wording stays narrow:** HAC-325's root cause remains incompletely attributable — H3 becomes more plausible but is **not historically proven** (the old build/trust state was never captured and the platform itself may have changed). Topology rehabilitated today ≠ historical root cause proven |
| CA present; both clients verify; `sessions.create` still fails (non-403) | **H4 territory** — deeper platform/identity-layer (CAA/DPoP) defect; capture exact error and stop |
| Any request fails with 403 **under DRY_RUN** | Record and stop. Per S2, a 403 in dry-run mode points away from IAP policy enforcement toward the gateway's egress proxy or the destination — **no** registration/grant fixing and no repeat; tuning after observation is out of scope for a one-shot probe |

## Cost and gain (both estimates, not measurements)

- **Estimated engineering effort:** ~1–2 hours including teardown; the agent
  package is ~100 lines.
- **Estimated cloud cost:** one reasoning engine deployed for minutes, one
  gateway, log reads. No standing Cloud Run pair, no internal load balancer,
  no endpoint-registration fleet — the HAC-325 cost drivers are absent.
  Order of magnitude: low; bounded by same-day project teardown.
- **Information gain:** converts hops 4–9 from UNRESOLVED to OBSERVED for
  the current platform; decides H1/H2/H3 for a verified injection-eligible
  deployment; screens H4; produces the would-be-denied destination map as a
  byproduct (input to any later ENFORCE-mode work); either rehabilitates the
  preferred `CONTENT_AUTHZ` enforcement topology for HAC-338/Vreko with a
  working recipe, or yields a verified, fingerprinted platform-defect
  report.
