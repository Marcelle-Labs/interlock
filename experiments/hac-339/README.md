# HAC-339 — Zero-cloud Agent Gateway viability forensics

**Linear:** HAC-339 (parent HAC-338; parallel lane to HAC-316).
**Branch:** `hac/339-agent-gateway-forensics` (isolated worktree).
**Investigation base:** commit `efea48013de626d5714c8c2c146c0e1b683cc615` (`main` at lane start, 2026-08-14). All HAC-325 evidence was read at this SHA.
**Execution date:** 2026-08-14.

## Question

Is the original HAC-325 Agent Runtime → Agent Gateway (`AGENT_TO_ANYWHERE` +
`CONTENT_AUTHZ`) topology still an officially supported and technically
plausible Google path, and can the preserved HAC-325 evidence narrow the TLS
root-cause hypotheses enough to justify at most one later controlled rerun?

## Boundaries under which this packet was produced

- Zero cloud: no `gcloud`, no Google SDK/API calls, no live resources. Web
  access was limited to reading current public documentation.
- Read-only on all pre-existing repository content. No changes to the HAC-316
  worktree, the frozen fallback architecture, the HAC-325 receipt, or any
  Interlock source.
- `expected by documentation` is never upgraded to `observed in runtime`.
- Confidence is categorical: HIGH / MEDIUM / LOW / UNRESOLVED. Costs are
  labeled estimates, never measured figures.

## Contents

| File | Content |
| -- | -- |
| `sources.md` | every source relied on: URL, retrieval date, exact contract |
| `google-support-matrix.md` | Phase A — current Google support check, 7 contract items |
| `hac-325-participation-matrix.md` / `participation-matrix.json` | Phase B — 15-hop OBSERVED/DERIVED/ASSUMED/UNRESOLVED audit of the preserved HAC-325 evidence |
| `hypothesis-matrix.md` / `hypothesis-matrix.json` | Phase C — H1–H5 attribution |
| `one-shot-probe.md` | minimum one-shot participation probe (present only if the disposition is `RERUN_JUSTIFIED_AFTER_HAC316`) |
| `REPORT.md` | the assembled forensic report and disposition |
| `MANIFEST.json` | base SHA + SHA-256 of every final artifact |

## Method

1. Phase A captured the current Google contract from primary documentation
   (see `sources.md`), each item marked as strengthening, weakening, or
   leaving unchanged the HAC-325 assumptions.
2. Phase B reconstructed the original run hop-by-hop exclusively from the
   preserved artifacts under `experiments/hac-325/` and
   `docs/receipts/HAC-325-s0-receipt.md` at the base SHA above.
3. Phase C scored H1–H5 against the matrices.
4. Phase D emitted exactly one disposition.

Findings may be reinterpreted in review; the matrices and the original commit
of this packet are the preserved evidence and are not rewritten to conform.
