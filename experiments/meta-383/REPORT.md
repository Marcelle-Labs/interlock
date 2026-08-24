# META-383 — Report

**Disposition: `BOUNDED_SEARCH_EXHAUSTED`.**

No authentic natural worktree-composition fixture passed admission within the
frozen universe and budget. Stages 3, 4 and 5 were never reached, **no arm was
run, and no model decision was measured.**

The question META-383 exists to answer —

> does revision-bound committed repository evidence add causal decision value in
> a live parallel-worktree composition problem after both sibling pending
> intents are already visible?

— is therefore **unanswered**. This report says what was actually established,
what was not, and why the search failed, which is the useful part.

---

## 1. What passed

### Stage 1 — `MECHANISM_TRANSFER_ONLY`

The frozen HAC-343 cross-target case `registry/coupled/retire-vs-route`
instantiates faithfully as live Git worktree state.

| Fact | Value |
| -- | -- |
| Base revision | `50c48393ef0df2d1a31abf71a45b5ac3127fb8bf` |
| Worktree A | `registry/services.json` — retire `legacy-pricing` |
| Worktree B | `routing/routes.json` — route `/pricing` at `legacy-pricing` |
| Path-disjoint | yes — no textual merge conflict available |
| A alone | `verify.mjs` exit 0 |
| B alone | `verify.mjs` exit 0 |
| Composed | exit 1, `dangling: [{kind: route, from: /pricing, to: legacy-pricing}]` |
| Candidate worktrees after composition | byte-identical |

Fidelity is structural: intents are read from HAC-343's frozen corpus and
applied through HAC-343's own executor, and the oracle is the fixture's own
verifier. HAC-343 semantics are unchanged.

This means the failure at Stage 2 is **not** an ingestion or plumbing failure.
The worktree representation works. `WORKTREE_TRANSFER_FAILED` is ruled out.

**This is a mechanism check and nothing more.** It is not evidence that
workspace.json is useful, and it is not reported as if it were.

---

## 2. What failed

### Stage 2 — no candidate satisfied all eight admission rules

Enumeration hit the ceiling exactly:

| Repository | Window | Pairs considered | Passed mechanical filters | Enumerated (quota) | Max score |
| -- | --: | --: | --: | --: | --: |
| `polyfy/polylith` | 150 | 3,425 | 1,402 | 14 | 35 |
| `JamieMason/syncpack` | 150 | 3,425 | 2,657 | 13 | 135 |
| `formatjs/formatjs` | 150 | 3,425 | 1,074 | 13 | 11 |
| **Total** | | **10,275** | **5,133** | **40** | |

Six deep-screened, the frozen maximum. Every one was rejected for the same
reason.

| # | Repo | Score | T0 valid | A alone | B alone | Composed | Rejection |
| --: | -- | --: | -- | -- | -- | -- | -- |
| 1 | syncpack | 135 | pass | pass | pass | **pass** | `COMPOSITION_IS_VALID_NO_DETERMINISTIC_CONSEQUENCE` |
| 2 | syncpack | 110 | pass | pass | pass | **pass** | same |
| 3 | syncpack | 69 | pass | pass | pass | **pass** | same |
| 4 | syncpack | 68 | pass | pass | pass | **pass** | same |
| 5 | syncpack | 55 | pass | pass | pass | **pass** | same |
| 6 | syncpack | 51 | pass | pass | pass | **pass** | same |

Each verdict rests on four preserved `cargo check --workspace --locked` runs,
not on an exit code alone. Admission rule 5 requires the composed tree to
*fail*; all six composed trees compiled.

---

## 3. Why the search failed — the finding worth keeping

The frozen enumeration did not fail randomly. It failed structurally, in two
ways that are properties of real repository history rather than of this run.

### 3.1 The referential-adjacency score is a lexical proxy, and lexical overlap
is dominated by prose

The score was defined as identifiers removed by one change and added by the
other. In HAC-343's synthetic fixture that isolates the delete-versus-reference
hazard cleanly. In a real repository it does not, because documentation, agent
skill files, changelogs and test fixtures **share vocabulary with source code**
without participating in the compile graph at all.

Look at what the top six actually were:

| # | Side A | Side B |
| --: | -- | -- |
| 1 | 13 × `.claude/skills/*.md` + 1 bench file | 37 Rust source files |
| 2 | 81 paths incl. Rust source, docs, `Cargo.lock` | 3 × `.claude/skills/*.md` |
| 3 | 41 files, mostly `crates/syncpack-specifier` | 37 Rust source files |
| 4 | `CHANGELOG.md` | 231 × `fixtures/fluid-framework/**/package.json` |
| 5 | 4 Rust source files | 3 × `.claude/skills/*.md` |
| 6 | `.gitignore`, a link-checker TSV | 4 × `skills/*.md`, `.notes/*.md` |

Four of the six have at least one side that is **entirely** documentation,
skills prose, config or JSON fixtures. Those pairs cannot produce a
compile-level composed consequence *even in principle* — there is no
construction of them that fails `cargo check`. The budget was largely spent on
pairs that were disqualified before they were screened, by their own content.

Candidate #4 is the clearest case: a `CHANGELOG.md` edit scored 68 against a
231-file fixture update purely because release notes and package manifests
share package names.

### 3.2 Whole-commit path disjointness selects *against* source-versus-source pairs

Admission rule 4 requires no textual merge conflict, which the enumeration
enforced as complete path disjointness between the two commits. Real commits are
large — candidate #2's side A touched 81 paths. The more source a commit
touches, the likelier it collides with any other source commit, so the
disjointness filter systematically **promotes pairs where one side avoids source
entirely**.

HAC-343's fixture is one path against one path. Real history is not shaped like
that, and the frozen rule inherited an assumption from the synthetic fixture
that the external universe does not satisfy.

Across syncpack, 718 of 3,425 considered pairs were dropped for path overlap;
across polylith, 1,936 of 3,425. The pairs most likely to carry a referential
hazard are exactly the ones most likely to be dropped.

---

## 4. What this does and does not license

**Established:**

* the HAC-343 composition mechanism transfers to live Git worktrees
  (`MECHANISM_TRANSFER_ONLY`);
* within this frozen universe, enumeration rule and budget, no authentic natural
  fixture was found;
* the failure is attributable to the candidate *generator*, not to the ingestion
  path, the validation surfaces, or the host.

**Not established, and not claimed:**

* that cross-target composition hazards are rare in real repositories — 40
  mechanically ranked pairs out of 10,275 considered is not a prevalence
  estimate, and no claim about the phenomenon's frequency is supported;
* anything at all about whether committed evidence adds decision value — no arm
  ran, so `NO_DECISION_CONSEQUENCE` is **not** the outcome and must not be
  recorded as one;
* that co-change is or is not load-bearing. VR-661/VR-662's "co-change is the
  moat" claim was not assumed and was not tested;
* any support for a schema field, a standard change, or a routing experiment.

**A negative on the search is not a negative on the question.** The distinction
matters, because recording this as "committed evidence showed no value" would be
a false negative that later work would inherit.

---

## 5. Honest note on the enumeration rule

The rule was frozen before screening and was applied exactly as frozen; nothing
was tuned after seeing a result. But it was designed against HAC-343's synthetic
topology, and section 3 above is the cost of that.

A generator that could actually probe this question would need to select on
**compile-graph adjacency** — a symbol defined in one change's files and
referenced from the other's — rather than on token overlap, and would need to
allow partial path overlap with a real merge rather than requiring whole-commit
disjointness.

That is a different experiment. META-383 grants one attempt and explicitly
forbids widening to find a positive, so it is recorded here as a finding and
**not acted on**. Whether it is worth a successor issue is a decision for
whoever owns Open Question #17, not a conclusion this issue may reach.

---

## 6. Routing performed

1. Receipt pinned in `Marcelle-Labs/interlock` — this directory.
2. Linear META-383 updated with the exact disposition and counts.
3. Fibery OQ-17 updated with the negative and the structural finding.
4. **No standard-representation issue created** — correct;
   `COMMITTED_EVIDENCE_CONSEQUENCE_ESTABLISHED` was not achieved.
5. No schema or semantics change made or proposed.
6. No routing/provider experiment started.
