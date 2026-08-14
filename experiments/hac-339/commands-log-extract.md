# Durable evidence extract — HAC-325 `commands.log`

Purpose: the forensic packet cites `experiments/hac-325/evidence/commands.log`,
which is **gitignored** (see `experiments/hac-325/.gitignore`) and exists only
in the original working copy. This extract makes every claim that depends on
that file durable: the file's hash, its location, the exact cited lines or
sanitized excerpts, and which participation-matrix rows depend on each one.
If the original file disappears, this extract plus the hash is the surviving
evidence; if it survives, the hash proves the excerpts came from it unmodified.

## Provenance

- **Repo-relative path:** `experiments/hac-325/evidence/commands.log`
- **Original working copy:** `/Users/user1/dev/interlock/experiments/hac-325/evidence/commands.log`
- **Git state:** gitignored; never committed in any branch examined
- **Size/shape:** 9,141 lines; 120 executed commands (lines beginning with `$`)
- **SHA-256 (whole file, computed 2026-08-14):**
  `7760a1e647882e1322047041bc9f52e7d0645d5386bd31c1be9b148646e1ddba`
- **Extraction method:** read-only `grep`/`shasum` against the original
  working copy; no mutation of the source file.

## Redaction statement

The excerpts below are verbatim except: the operator's absolute home path is
shortened to `~/`, and no bearer tokens, API keys, or credentials of any kind
appear in the excerpted lines (verified by reading each excerpted line in
full). Project IDs (`708527487974`, `interlock-s0-gate`) are retained because
they are already committed throughout `experiments/hac-325/evidence/`. The
caller identity recorded in the log (`qwynn@marcellelabs.io`) is already
committed in `experiments/hac-325/evidence/identities.json` and is not
repeated here. The full log is **not** committed because its 9,141 lines were
not line-by-line reviewed for secrets; only the excerpts below were.

## Cited excerpts

### E1 — Cloud Build was used only for the extension and target images

Five `builds submit` pairs, all targeting `experiments/hac-325/extension` or
`experiments/hac-325/target` (representative pair shown; the other four pairs
are identical in shape at lines 7266/7399, 7774/7910, 8453/8589):

```text
line 6610: $ ~/google-cloud-sdk/bin/gcloud builds submit …/experiments/hac-325/extension --tag=us-central1-docker.pkg.dev/interlock-s0-gate/interlock-s0-images/interlock-s0-ext:s0 …
line 6745: $ ~/google-cloud-sdk/bin/gcloud builds submit …/experiments/hac-325/target --tag=us-central1-docker.pkg.dev/interlock-s0-gate/interlock-s0-images/interlock-s0-target:s0 …
```

No `builds submit`, `docker build`, or Artifact Registry push in the entire
log references the agent (`experiments/hac-325/agent`) — consistent with the
agent being deployed from source by Agent Runtime, not as a prebuilt image.

**Matrix rows depending on E1:** hop 3 (source-based vs BYOC mode).

### E2 — Gateway imports recorded in the log are the ingress gateway only

```text
line 7153: $ ~/google-cloud-sdk/bin/gcloud network-services agent-gateways import interlock-s0-gw --source=agent-gateway.yaml --location=us-central1 --project=interlock-s0-gate
line 8328: (same command, second run)
line 9005: (same command, third run)
```

No `agent-gateways import` (or any `agent-gateways` mutation) for
`interlock-s0-gw-egress` appears anywhere in the log — consistent with the
receipt's statement that the egress gateway was created by hand.

**Matrix rows depending on E2:** timeline (gateway creation record), hop 4
(binding sequencing context).

### E3 — Authorization extension and policy import records

```text
line 8379: $ ~/google-cloud-sdk/bin/gcloud service-extensions authz-extensions import interlock-s0-authz-ext --source=authz-extension.yaml --location=us-central1 --project=interlock-s0-gate
line 8411: ERROR: (gcloud.network-security.authz-policies.import) INVALID_ARGUMENT: The request was invalid: authz extension load balancing scheme INTERNAL_MANAGED must match the authz policy load balancing scheme LOAD_BALANCING_SCHEME_UNSPECIFIED
```

**Matrix rows depending on E3:** timeline (extension/policy creation record).

### E4 — Absence claims (whole-log greps, verified 2026-08-14)

| Grep pattern (case-insensitive where noted) | Matches | Supports |
| -- | -- | -- |
| `reasoning-engines (create\|update\|patch)`, `agent_engines\.(create\|update)` | **0** | hop 4: no agent deploy/redeploy/patch command was script-recorded |
| `SSL_CERT`, `REQUESTS_CA_BUNDLE`, `GRPC_DEFAULT_SSL`, `update-ca-certificates`, `rootCertificates` | **0** | hops 5–9: no trust-store or CA-env inspection was ever run |
| `\biap\b`, `enforce`, `dry.?run` | **0 command lines** (2 hits are `vm_extensions/extension/enforcement_*` metric descriptor names in a `monitoring` list output) | hop 16: no IAP enforcement-mode setting or inspection was ever run |

**Matrix rows depending on E4:** hops 4, 5, 6, 7, 8, 9, 16.

## Caveat

Absence-of-command claims are claims about this file (verified by hash +
grep), not about the run as a whole: hand-run commands were not captured by
the `run` helper (per the HAC-325 receipt), so hand-executed deploys, IAM
grants, or mode changes would be invisible here. That limitation is itself
recorded in the participation matrix (hop 4, hop 16).
