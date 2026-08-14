# REPORT — HAC-339: zero-cloud Agent Gateway viability forensics

**Date:** 2026-08-14.
**Investigation base:** `efea48013de626d5714c8c2c146c0e1b683cc615` (`main` at
lane start; all preserved HAC-325 evidence read at this SHA).
**Authority:** HAC-339. Zero-cloud, read-only lane; no `gcloud`, no Google
API calls, no live resources were touched. Supporting artifacts:
`sources.md`, `google-support-matrix.md`, `hac-325-participation-matrix.md`
(+ `.json`), `hypothesis-matrix.md` (+ `.json`), `one-shot-probe.md`,
`MANIFEST.json`.

## 1. Answer to the lane question

**Yes**, the original HAC-325 topology — source-based Agent Runtime bound to
an `AGENT_TO_ANYWHERE` Agent Gateway with a custom `CONTENT_AUTHZ`
authorization extension — **remains an officially supported, documented
Google topology as of 2026-08-14**, now under the Gemini Enterprise Agent
Platform doc set. The current documentation is *more* precise than what
HAC-325 worked from, and it documents exactly the operational prerequisites
the failed run did not perform.

**Yes**, the preserved evidence narrows the hypotheses enough to justify at
most one controlled rerun: every missing discriminator for the TLS root cause
is the same single observation (in-container trust state after a verified
injection-eligible deploy), and the reference gateway root CA needed for
comparison was preserved in the HAC-325 evidence and is fingerprinted in this
packet.

## 2. Current Google support matrix (summary of `google-support-matrix.md`)

| # | Contract item | Status (2026-08-14) | Effect on HAC-325 assumptions |
| -- | -- | -- | -- |
| 1 | Source-based Agent Runtime → Agent Gateway | Supported, documented (create-time config or PATCH) | Strengthens |
| 2 | Agent-to-Anywhere egress | Supported, documented, first-class | Strengthens |
| 3 | `AGENT_IDENTITY` / gateway-mediated policy | Documented; required at creation time; CAA on by default | Strengthens + explains receipt correction #6 |
| 4 | Automatic CA injection for non-BYOC | Documented verbatim ("during image creation"); silent on PATCH-bind re-injection | Strengthens contract; leaves the HAC-325 gap open |
| 5 | Python HTTP trust bundle | BYOC contract documented (`SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`); non-BYOC mechanism unpublished | Unchanged / partially silent |
| 6 | gRPC trust bundle | BYOC contract documented (`GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`); same caveat | Unchanged / partially silent |
| 7 | Official end-to-end examples | Codelab exists (ADK on Agent Runtime → egress gateway → MCP on Cloud Run); its `CONTENT_AUTHZ` is Model Armor — custom `ext_proc` is documented but not the flagship example | Strengthens topology; weakens "custom ext_proc is the happy path" |

Load-bearing additions from current docs: **default-deny egress includes
Google APIs** — Sessions/Memory Bank endpoints (all hostname variants,
including `REGION-aiplatform.mtls.googleapis.com`) must be registered in
Agent Registry and granted `roles/iap.egressor`; the documented
missing-registration signature is HTTP 403 `Egress request is not
authorized`, while TLS certificate-verification failure is documented **only
as a BYOC symptom**; the official codelab grants egress on registered
endpoints **before** deploying the agent.

## 3. HAC-325 participation matrix (summary of `hac-325-participation-matrix.md`)

| Hop | Class |
| -- | -- |
| Gateway resource existed | OBSERVED |
| Agent Runtime bound to it | OBSERVED |
| Source-based (non-BYOC) mode | OBSERVED |
| Binding existed before final image/build | **ASSUMED** — initial image (03:55:10Z) provably predates the gateway (04:05:51Z); the claimed post-binding source redeploy is receipt narrative only |
| CA material injected | **UNRESOLVED** — never inspected |
| CA fingerprint matched Gateway root | **UNRESOLVED** — no runtime chain captured; reference root preserved and fingerprinted (`9A:9A:3A:F8:…:31:20`) |
| System trust store contained CA | **UNRESOLVED** |
| `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` effective | **UNRESOLVED** |
| gRPC root bundle effective | **UNRESOLVED** |
| aiohttp / Google Auth consumed trust path | DERIVED (negative — consumed a path lacking the gateway CA) |
| Managed session traversed Gateway | DERIVED (strong — pre/post-binding behavioral contrast + non-GFE `240.0.0.2:443` interception signature) |
| Agent body began execution | OBSERVED (pre-binding yes; post-binding no — session creation gates it) |
| MCP request emitted | OBSERVED (negative) |
| Gateway observed MCP request | UNRESOLVED (vacuous — no request existed; no gateway-side logs) |
| `CONTENT_AUTHZ` / ext_proc participated | OBSERVED (negative — zero ext_proc events; presence without participation) |

## 4. H1–H5 attribution (summary of `hypothesis-matrix.md`)

| H | Hypothesis | Confidence | One-line basis |
| -- | -- | -- | -- |
| H1 | platform CA-injection defect | LOW | rests solely on the unverified "redeployed after binding" narrative |
| H2 | client-consumption defect | LOW | consistent with observations (aiohttp/certifi + gRPC both use bundled roots; system-store-only injection fails both); premise "CA present" unevidenced |
| H3 | experiment/deployment defect | **MEDIUM** for the TLS layer; **HIGH** that the run was independently misconfigured at the policy layer | initial image provably unbound; registry held only the MCP server — no Sessions/CRM/Logging endpoints, no egressor grants |
| H4 | deeper platform defect | UNRESOLVED | premise (working trust) was never met in this run |
| H5 | unresolved | HIGH | for TLS-layer discrimination: hops 5–9 all UNRESOLVED by preservation gaps |

Note on the HAC-325 receipt's characterization: it calls the blocker "a
platform interaction, not a configuration defect in this experiment." Under
current documentation that is not supported for the run as a whole — the
missing registry/egressor configuration is a documented configuration
defect, and the trust-layer ordering defect (initial image provably predates
the gateway) is unexcluded. The receipt is preserved unmodified per the lane
boundary; this reinterpretation lives here only.

## 5. Disposition

**`RERUN_JUSTIFIED_AFTER_HAC316`**

- `NO_RERUN_NEEDED` does not apply: current docs do not falsify or obsolete
  the topology; they support it more precisely than before.
- `UNRESOLVED_NO_DISCRIMINATING_RERUN` does not apply: one predeclared probe
  cleanly discriminates the surviving hypotheses (decision table in
  `one-shot-probe.md`) without a Gateway rebuild.
- The rerun remains **human-gated** behind HAC-316 per the HAC-339 boundary;
  nothing here reopens the frozen fallback architecture, and HAC-316's
  fallback work is correct regardless of this outcome.

The minimum probe (`one-shot-probe.md`): one source-based agent deployed with
**binding at creation time**, Layer P pre-configured per current docs
(registry + egressor for platform endpoints), a container-side trust
self-audit (env, trust store, presented-chain fingerprints vs the preserved
gateway root), and exactly one session creation attempt. No extension, no
policy, no model calls.

## 6. Exact evidence still missing

1. Build provenance for the final engine update (04:33:36Z): image rebuild vs
   config-only. Did not survive; project deleted.
2. Container trust-store content and CA-bundle env vars at runtime. Never
   captured.
3. The certificate chain presented to clients at runtime. Never captured;
   the reference root CA *was* preserved and is fingerprinted here, so any
   future capture is comparable.
4. Gateway-side request/observation logs. Never captured.
5. The hand-run deploy/patch/registry commands — absent from
   `commands.log`, which itself is gitignored and exists only in the
   original working copy (`/Users/user1/dev/interlock`); a preservation gap
   in its own right.

## 7. Information gain vs cost (estimates, not measurements)

- **Estimated cost:** ~1–2 engineering hours; one disposable reasoning
  engine for minutes, one gateway, registry operations, log reads; no Cloud
  Run pair or internal load balancer (the HAC-325 spend drivers); same-day
  project teardown. Low.
- **Information gain:** hops 4–9 move from UNRESOLVED/ASSUMED to OBSERVED;
  H1/H2/H3 decided by a predeclared table; H4 screened; outcome is either a
  rehabilitated preferred enforcement topology with a working recipe (feeds
  HAC-338/Vreko) or a verified, fingerprinted platform-defect report. High
  relative to cost.

## 8. `presence != participation` lessons for HAC-338 / Vreko

1. Every resource in the HAC-325 graph *existed* — gateway, binding, policy,
   extension — and the extension still recorded zero `ext_proc` events.
   Existence proofs must be paired with a participation proof at the data
   path.
2. Interception was only ever proven by its failure signature. Capture
   presented chains and fingerprints *during* a run; after teardown only the
   reference half survives.
3. Binding an egress gateway reroutes the platform's **own** control traffic
   (Sessions, Resource Manager, Logging). The agent's ability to manage
   itself is on the governed path — trust and default-deny policy both apply
   to it first.
4. Default-deny makes ordering contractual: register destinations and grant
   egressor **before** deploy/bind. The official codelab does this; HAC-325
   did not, and its receipt could not see it.
5. Narrative claims ("redeployed after binding") are not discriminating
   evidence. Receipts need machine anchors: image digests, build IDs,
   resource `updateTime` correlations.
6. Preserve reference material deliberately: the gateway root CA sitting in
   `agent-gateway-egress.json` is what makes any future fingerprint
   comparison possible.
7. Gitignored evidence is one lost laptop away from nonexistence. Logs that
   gate decisions need to be committed or hash-anchored at capture time.

## Stop rule compliance

No fixes implemented, no HAC-316 artifacts touched, nothing provisioned, no
cloud API contacted. This lane produced information only.
