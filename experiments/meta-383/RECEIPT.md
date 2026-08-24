# RECEIPT — META-383

**Disposition:** `BOUNDED_SEARCH_EXHAUSTED`

No authentic natural worktree-composition fixture passed admission within the
frozen universe and budget. **Stages 3, 4 and 5 were never entered.** No baseline
headroom was measured, no treatment arm was run, no model was invoked, and no
claim about committed-evidence decision value is made in either direction.

## Freeze chain

| Stage | Revision | Carries outcome data? |
| -- | -- | -- |
| Preregistration (binding) | `032178b` | no — frozen before any candidate was enumerated, inspected or screened |
| Stage 1 — HAC-343 as live worktrees | `5508ea0` | yes (mechanism only) |
| Stage 2a — mechanical enumeration of 40 | `320bfd2` | no — frozen before any pair was deep-screened |
| Stage 2b — deep screen, deviations, this receipt | this commit | yes |

## Stage 1 — `MECHANISM_TRANSFER_ONLY`

The frozen HAC-343 `registry/coupled/retire-vs-route` cross-target case was
instantiated as two real Git worktrees from base `50c48393`, verified by the
fixture's own `verify.mjs`:

| Tree | Invariant holds | Evidence |
| -- | :--: | -- |
| worktree A (`remove-service legacy-pricing`) | ✅ | `declared: [checkout, inventory]`, `dangling: []` |
| worktree B (`add-route /pricing → legacy-pricing`) | ✅ | `declared: [checkout, inventory, legacy-pricing]`, `dangling: []` |
| disposable integration tree | ❌ exit 1 | `dangling: [{route /pricing → legacy-pricing}]` |

Path-disjoint, no textual merge conflict, candidate worktrees unmutated by
composition. **This is a mechanism check and is never reported as workspace.json
usefulness evidence.**

## Stage 2a — enumeration, frozen before screening

| Repository | Window | Pairs considered | Passing mechanical filters | Enumerated (quota) | Max score |
| -- | --: | --: | --: | --: | --: |
| `polyfy/polylith` | 150 | 3,425 | 1,402 | 14 | 35 |
| `JamieMason/syncpack` | 150 | 3,425 | 2,657 | 13 | 135 |
| `formatjs/formatjs` | 150 | 3,425 | 1,074 | 13 | 11 |
| **total** | | **10,275** | **5,133** | **40** | |

40 = the hard ceiling META-383 sets. Every rejection reason is preserved in
`evidence/candidates.json`, including 64 pairs rejected
`PATCH_B_DOES_NOT_APPLY_TO_T0` while filling quota.

Deep-screen order is `score DESC`; the top six are all `JamieMason/syncpack`
because syncpack's scores dominate (135, 110, 69, 68, 55, 51 against polylith's
best of 35 and formatjs's best of 11).

## Positive control — the frozen surface is live

| | |
| -- | -- |
| Question | does `cargo check --workspace --locked` detect a delete-versus-reference break of the HAC-343 class in this harness? |
| Worktree | candidate 1's `T0` = `cd79359fa810fd2bbfdfa69354f959b3bc11ed8c` |
| Mutation | `src/packages.rs`, `pub fn normalize_pattern` renamed |
| Clean | **exit 0** |
| Mutated | **exit 101** — `error[E0425]: cannot find value 'normalize_pattern' in this scope` |
| Verdict | `surfaceIsLive = true` |

## Stage 2b — deep screen of the frozen top 6

Budget: 6. Evaluated: 6. Admitted: **0**.

| # | Score | `T0` | Rule 2 real | Rule 4 no textual conflict | Rule 3a base clean | Rule 5 composed consequence | Verdict |
| --: | --: | -- | :--: | :--: | :--: | :--: | -- |
| 1 | 135 | `cd79359f` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |
| 2 | 110 | `be883f5d` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |
| 3 | 69 | `e1dea165` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |
| 4 | 68 | `7153e42d` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |
| 5 | 55 | `f49a8957` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |
| 6 | 51 | `c826fe7b` | ✅ | ✅ | ✅ exit 0 | ❌ composed **holds**, exit 0 | `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` |

All fourteen surface invocations report `rootActuallyChecked = true`. Full
compiler output for every invocation is preserved verbatim under
`evidence/stage2b-logs/`.

Per PREREGISTRATION §4 Step 8 and §11, six deep screens without an admission
closes **`BOUNDED_SEARCH_EXHAUSTED`**.

## Controls actually exercised

| Control | Status | Note |
| -- | :--: | -- |
| Preregistration frozen before any pair was enumerated | ✅ | `032178b`, before `stage2-enumerate.mjs` first ran |
| Enumeration frozen before deep screening | ✅ | `320bfd2`, before any composed tree was built |
| No repository added after outcomes | ✅ | universe unchanged from META-373/375 |
| No candidate replaced by an easier or harder pair | ✅ | screening followed frozen score order exactly |
| No fixture manufactured | ✅ | every patch is a real historical commit diff |
| No hand-authored oracle | ✅ | gold would have come from the repository's own compiler |
| Composition only in disposable trees | ✅ | rule 8; candidate trees never mutated by verification |
| Exit 0 never treated as evidence | ✅ | caught a genuinely inert probe — see `DEVIATIONS.md` D2 |
| Failing checker never weakened | ✅ | probe strengthened twice; positive control added |
| Infrastructure failure never recorded as a verdict | ✅ | ENOSPC run discarded — `DEVIATIONS.md` D1 |
| Preregistration defect recorded, not corrected | ✅ | `DEVIATIONS.md` D4 |
| No model run | ✅ | Stage 3 was never entered |
| No schema or standard change | ✅ | none made, none authorized |
| No `@marcelle-labs/*` import into a workspace-json repository | ✅ | evidence flows `cli → interlock` only |
| No standard-representation issue created | ✅ | correct — `COMMITTED_EVIDENCE_CONSEQUENCE_ESTABLISHED` was not achieved |
| Unrelated local work preserved | ✅ | untracked files outside `experiments/meta-383/` left untouched |

## Honest limits

1. **`BOUNDED_SEARCH_EXHAUSTED` is a statement about this search, not about the
   world.** It does not establish that natural cross-worktree composition
   hazards are rare, or that committed repository evidence lacks decision value.
2. **The enumeration rule mis-targeted its own hazard class.** Five of six budget
   slots went to documentation and fixture pairs because the frozen source-path
   filter excluded only lockfiles and vendored directories. Only candidate 3 was
   a Rust-versus-Rust pair. See `DEVIATIONS.md` D4. This is the single largest
   limitation of this result.
3. **Only one repository was actually reached.** All six deep screens landed on
   syncpack; polylith and formatjs were enumerated but never deep-screened,
   because their scores never entered the top six.
4. **The frozen surface is compile-level.** A composition hazard that manifests
   only at runtime, only in tests not run by `cargo check`, or only in
   syncpack's TypeScript surface would be invisible to it and would have been
   scored `NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` here.
5. **Path-disjointness plus independent local validity is a demanding
   conjunction.** Requiring two real commits to touch disjoint paths, each
   compile-clean alone, and jointly compile-broken selects for a narrow hazard
   shape. Its rarity in this sample is consistent with the shape being rare, with
   the score failing to find it, or with both.
6. Nothing here revises META-362, 363, 372, 373, 374, 375, 377, 378, 379, 380,
   381 or 382, and nothing here bears on HAC-330 or HAC-343, whose bounded
   results stand unchanged.
