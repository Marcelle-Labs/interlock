# Synthesis handoff — HAC-342, HAC-333, HAC-341

Written for whoever picks up HAC-334 and HAC-335. Three judge-facing issues have
landed. This records what they established, what a later issue must not break,
and the two things that are easy to get wrong because the evidence disagrees
with itself.

Read this before the design bundle. The bundle contains a superseded artifact
that looks canonical.

## 1. Status

| Issue | Status | Main integration |
| --- | --- | --- |
| HAC-342 · publish judge-resolvable evidence | **PASS** | `79c80a43768dc4b1a195700709caa156e6e9fbda` |
| HAC-333 · muted 30-second storyboard | **PASS** | `be9027799d6d809d74586a3d3f491acd77cb5d20` |
| HAC-341 · The Run cockpit | **PARTIAL** — implementation complete, human cold-read pending | `537de72fd00d4bb727a9bee8dc0955fb6c096e55` |

HAC-341 is not Done in Linear and should not be marked Done until three real
readers have run the protocol in `media/hac-341/README.md`. No cold-read result
has been produced, and none may be invented.

## 2. Publication identities

```text
evidencePublicationSha       75253e38791e69f7e2a4bb3a041044a9114c32f0   (P)
publicationBindingsSha       9da4cb95b6eec6030fe0c622b67a319eeaf20230   (B)
publicPacketSha256           ea1d6993ca937bb5ae14ad43954e48bd1a91ceb5e959719f8a99492b0b0dbf0d
sourcePacketSha256           794befb86b37d862dfbfa86070a2948cb7ddf53836fbb14748611126403188d0
runtimeSourceSha             ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a
runtimeSourceSnapshotSha256  9aaa4ad1661444fff50a0392785aa69cbfc8a54fecff1fc4a1c178aa7da22cd1
```

Each digest names different bytes. `publicPacketSha256` is the only one a
logged-out reader can recompute. `sourcePacketSha256` is a **commitment** to
bytes that are deliberately unpublished — never describe it as verifiable by a
judge.

`runtimeSourceSha` is **not publicly resolvable and must not be made so.** The
tree at that commit contains `experiments/hac-340/evidence/local-traversal.json`,
which hardcodes the Google Cloud project identifier. `runtimeSourceUrl` stays an
explicit unavailable state; the snapshot digest carries that provenance instead.
No revision link may be fabricated.

### Provenance anchors — do not move or delete

`main` requires linear history, so both PRs squash-merged and neither P nor B
survives with its SHA in main's history. Two annotated tags hold them:

- `hac-342-evidence-publication` → P
- `hac-342-publication-bindings` → B

Every judge-facing URL pins to P's **commit SHA**, never a branch, never a tag
name. Deleting either tag breaks every published evidence link. No tag
protection rule exists on this repository — that is a recorded gap, not a
safeguard.

## 3. The private/public evidence topology

This is the part most likely to be undone by accident.

```
private, local only          public
─────────────────────        ──────────────────────────────
hac/340-… branch             main
  ae6d0d3 runtime source     experiments/hac-342/**  (redacted derivative)
  afe1231 frozen packet      media/hac-333/**, media/hac-341/**
  evidence/cloud-run.json
  .work/ (pem, credentials)
```

**`afe1231` must never become reachable from any public ref.** It carries the
unredacted packet. It is currently unreachable from every branch and tag, and
`experiments/hac-340/` is absent from `main` entirely.

Consequences for later work:

- Anything on `main` that needs cloud evidence reads
  `experiments/hac-342/evidence/cloud-run.public.json`, never the private packet.
- `experiments/hac-330/evidence/**` **is** on main and is safe to read directly.
- Do not add `experiments/hac-340/` to a public branch to make a build work.
  `media/hac-341/bin/build-view-model.mjs` shows the supported pattern: derive
  from the public derivative.

### Redaction lesson worth not repeating

The first version of `verify-public-packet.mjs` detected leaks with a blocklist
containing the literal project identifier — publishing the secret in order to
look for it. Redaction is now asserted **positively**: every path the policy
redacts must carry a `[REDACTED:…]` marker. Structural patterns (service-account
shape, Cloud Run endpoint shape, project-scoped log names) catch the rest.

If HAC-334 writes a similar check, do not name the identifier.

## 4. Claim-boundary invariants

Four rules every later surface inherits. Each is enforced by at least one gate.

**1. Two proof classes, never one run.** HAC-330 is the controlled local causal
experiment; HAC-340 is Google Cloud participation. They are different runs on
different days with different evidence. No surface may render
`140 > 130 → WITHHOLD_SERIALIZE → 120 <= 130 → ALLOW + receipt → alpha=45` as one
chain. That never happened. HAC-340 does not reproduce the counterfactual in
Google Cloud.

**2. Absence is a state.** HAC-330 has no receipt, protected target, observer,
cloud runtime or Cloud Logging. HAC-340 has no arms, no bounded joint outcome and
no checks total. Neither gets a field because the other has one. Omit the key;
do not set it to `null`.

**3. No lifecycle state the frozen packets do not emit.** Forbidden across all
surfaces: `AUTHORIZED`, joint review, human approval, exactly-once,
"both withheld", "observer cannot authorize". The evidenced chain is
`ALLOW + receipt` → `EXECUTED` → `OBSERVED`, and those three never collapse into
each other. `ALLOW` is a decision, not a verification. `OBSERVED` is an
observation, not a safety property.

**4. Non-claims must stay sayable.** Every vocabulary check reads *claim-bearing*
fields only. `explicitNonClaims` has to be able to say "wrong-audience rejection
is local parity, not shown here" — that sentence is the disclaimer, not the
claim. A check that scans whole objects will fail on correct content.

## 5. Evidence discrepancies already adjudicated

Do not re-litigate these. Each is recorded in-repo with both values preserved.

| Discrepancy | Resolution | Recorded in |
| --- | --- | --- |
| Design bindings name three deployed revisions; frozen evidence names one | Only `interlock-hac340-proxy-00002-wzf` is evidenced, via the Cloud Logging resource label. `20-cloud-run.mjs` writes `observedConfiguration` as service **URLs**, not revision names, so the agent and target names exist nowhere in evidence or git history. They appear on no factual surface. | `redaction-manifest.json` → `sourceDiscrepancies`; gates in HAC-333 and HAC-341 |
| `controls.wrongAudienceStatus` | The cloud control at `20-cloud-run.mjs:34` sends `Bearer invalid.wrong.token` to the real proxy — an **invalid-token** control. The signed wrong-audience token is exercised only by the local parity run. Field name unmutated; judge surfaces say "invalid bearer token". Genuine wrong-audience stays controlled local parity. | same |
| Packet says `teardown: "pending"` | The runtime packet is never mutated. Completion sources to the private `teardown.json`. | same |
| Pre-existing personal identifiers on public `main` | `qwynn@marcellelabs.io` appears 38 times across already-merged HAC-325 evidence and receipts. Not introduced by HAC-342, not remediated, no history rewritten. The redaction claim is scoped to `experiments/hac-342/**` only. | `publication-bindings.json` → `redactionReviewScope` |

## 6. Design bundle — which artifact is canonical

`DESIGN_HANDOFF_ROOT` is `/Users/user1/Downloads/interlock-handoff/` (external
intake, not committed). It contains **two** projects, and both ship a
`storyboard/scene-manifest.json` with **different timing maps that both sum to
30.00**.

```
project/storyboard/scene-manifest.json                       ← CANONICAL (r02)
hac-342-judge-evidence-deck/project/storyboard/…json         ← superseded, unversioned
```

The canonical one self-declares `revision: r02`,
`supersedes: "r01 (pre-HAC-316-pivot storyboard model)"` and
`designAuthority: "HAC-333 current issue contract"`. The other carries no version
metadata. **Check `revision` before trusting a manifest from this bundle.**

The implemented storyboard is `r03` in `media/hac-333/scene-manifest.json`,
generated from r02 rather than transcribed.

Also note: `uploads/HAC-333_Interlock_Storyboard.pptx` is pre-pivot historical
provenance. It is not a second authority and was deliberately not committed.

Linear comments on HAC-333 describe the **pre-pivot** story (joint review,
authorization pause, HAC-316/317/318 bindings). They are historical. The issue
description supersedes them.

## 7. What HAC-334 must reuse rather than redraw

The HAC-342 design band is the canonical factual master; HAC-334's band derives
from it. Recorded in `docs/hac-334-architecture.md` §14 and
`docs/hac-341-cockpit.md` §12 of the bundle.

| HAC-342 master | HAC-334 derivative |
| --- | --- |
| `IL-DIAG-002` Google Cloud participation | `IL-DIAG-011`; `IL-DIAG-012` is the precise variant |
| `IL-PROOF-001` receipt / effect / observation | `IL-PROOF-012` |
| `IL-PROOF-002` negative controls | `IL-PROOF-013` |
| `IL-PROOF-003` claim boundary | `IL-PROOF-014` |
| `IL-DIAG-003` two-SHA provenance | provenance line on `IL-DIAG-011` |
| `IL-PROOF-005` raw proof | truncated digests defer to it |
| `IL-DIAG-004` publication flow | not reused |

Do not renumber the reserved band and do not promote a derivative into a master
ID. One factual family, one authority.

Shared factual primitives already implemented and safe to consume:

- `media/hac-341/evidence/view-model.json` — both runs, normalized, absence-correct
- `media/hac-333/scene-manifest.json` — nine scenes, proof classes, non-claims
- `experiments/hac-342/evidence/*.json` — the public cloud evidence

## 8. Shared semantic vocabulary

One identifier serves URL, cockpit view and HAC-324 capture. HAC-333 and HAC-341
already converge; a gate fails if they diverge.

```
story.identity                 run.local.perturbed
run.local.intents              transition.proof-class-reset
run.local.coupled              run.cloud.overview
run.local.baseline             run.claim-boundary
run.local.treatment
```

Cockpit-only additions: `run.missing`, `run.unavailable`, `run.cloud.partial`,
`run.evidence.invalid-link`, `evaluation.unbound`.

Hold states are `hold.<state>`; capture states are `capture.<state>`.

## 9. Repository conventions in use

- **Branch per issue** from current `origin/main`, named `<team>/<number>-<slug>`,
  via `git worktree`. Never push to `main`.
- **`main` requires linear history** — squash or rebase only. If a commit's exact
  SHA must survive, anchor it with an annotated tag *before* merging.
- **Every judge-facing artifact gets a deterministic gate**: a `check:*` script in
  `package.json`, wired into the aggregate `check`, plus a CI job that follows the
  house pattern — the assertion, then an `Explain the failure` step writing
  invariant / why it matters / authority / evidence required / do not weaken to
  `$GITHUB_STEP_SUMMARY`.
- **Gates must perturb.** Prove each one fails by injecting the defect it
  targets. Where an outer gate can mask an inner one (a digest check in front of
  a content check), regenerate the outer value so the inner gate is proven
  independently.
- **Derive, don't transcribe.** Generated artifacts are built by a committed
  adapter and CI re-runs it and diffs against the committed bytes, so a hand-edit
  cannot survive. See `cockpit:build` and the HAC-341 CI job.
- **Zero runtime dependencies.** Nothing added so far. The deterministic core in
  `src/` stays usable without any presentation code. HAC-341 deliberately did not
  adopt React/Motion despite the issue comment naming it as the default — there is
  no presentation boundary to host it, and a build step between frozen evidence
  and the rendered frame works against HAC-324 capture. Reopen only if a concrete
  failure earns it.
- **Inspect artifacts, not exit codes.** Render in a browser, read the generated
  JSON, fetch published URLs logged out. Several real defects were found this way
  that every test suite passed over.

Current gates: `check:provenance`, `check:packet`, `check:packet:s2`,
`check:packet:public`, `check:storyboard`, `check:cockpit`, plus `typecheck`,
`build`, `test` (295 tests).

## 10. Open items

Deferred deliberately. None blocks HAC-334.

1. **HAC-341 human cold-read.** Protocol and deterministic tester URLs are in
   `media/hac-341/README.md`. Three readers, verbatim answers, no invented scores.
2. **HAC-325 identifier remediation.** Pre-existing, already public, no history
   rewritten. Needs its own issue and an explicit decision about rewriting public
   history.
3. **Tag protection.** No ruleset protects the two provenance tags. Recorded as a
   gap.
4. **Sanitized HAC-340 product-source PR.** `ae6d0d3` minus
   `evidence/local-traversal.json` could land as a **new** commit for source
   inspection. It would not be `runtimeSourceSha` and must never be labelled as
   such. Optional.
5. **HAC-335 must not freeze** until HAC-342's links are confirmed still
   resolving logged out.

## 11. Bootstrap order for a fresh session

1. This file.
2. `AGENTS.md`, then the Linear issue being executed and its latest comments.
3. `media/hac-341/README.md` — the fullest statement of the evidence model.
4. `experiments/hac-342/README.md` — the digest and redaction contract.
5. `media/hac-333/README.md` — story, timing, motion and capture contract.
6. Only then the design bundle, honouring §6 above.

Current `main` at the time of writing: `537de72fd00d4bb727a9bee8dc0955fb6c096e55`.
