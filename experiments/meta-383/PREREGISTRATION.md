# META-383 — Preregistration (binding)

**Status:** `FROZEN_BEFORE_SCREENING`
**Frozen:** 2026-08-24, in this commit.
**Issue:** [META-383] Test committed repository evidence in live parallel-worktree composition.
**Execution counterpart of:** Fibery Open Question #17.

This document is frozen **before any candidate pair in the external repository
universe has been enumerated, inspected, or screened**. Everything preceding
this commit is infrastructure discovery — which repositories are on disk, which
toolchains exist, which host binary runs a decision — and none of it involved
looking at a candidate change pair.

No post-outcome widening. No fixture hardening. No prompt edit after any result.

---

## 0. The question

> Does revision-bound committed repository evidence add causal decision value in
> a live parallel-worktree composition problem **after both sibling pending
> intents/diffs are already visible to the decision-maker**?

The design must separate two effects the Interlock framing can otherwise
confound:

1. **Sibling-intent visibility** — ephemeral, cannot exist in the committed
   repository at T0.
2. **Committed environment evidence** — revision-bound descriptive repository
   evidence derivable from state/history at T0.

Every arm in this experiment shows the decision-maker **both** pending diffs.
A win that comes from seeing two worktrees is therefore not attributable to
committed evidence, by construction: it is already in the baseline.

## 1. Experiment host and authority

| Item | Value |
| -- | -- |
| Experiment host repository | `Marcelle-Labs/interlock` |
| Experiment path | `experiments/meta-383/` |
| Rationale | META-383 authorizes Interlock to host experiment-local machinery/receipts. Stage 1 instantiates a frozen HAC-343 fixture, which is Interlock-local. Hosting in a workspace-json repository would make an Apache repository depend on Interlock fixtures — the prohibited direction. |

Boundaries held by this experiment:

* Linear owns execution state only; truth is in the pinned receipts here.
* `workspacejson/standard` remains the normative arbiter. **No schema or
  semantics change is authorized or made.**
* Worktree state is ephemeral execution-layer input and is **never** written
  into `workspace.json`.
* No `@marcelle-labs/*` import or requirement is added to any workspace-json
  repository. Evidence flows **cli → interlock** only.
* VR-661 / VR-662 are provenance only. Their claim that co-change is "the moat"
  is **not assumed**. Co-change is treated strictly as a descriptive
  observation, never as dependency, causality, blast radius or required change.

## 2. Frozen external repository universe

Reused verbatim from META-373 / META-375. No fourth repository may be added,
before or after seeing outcomes.

| # | Repository | Pinned revision |
| -- | -- | -- |
| 1 | `polyfy/polylith` | `68dab9868274c8044817983c2424fbdbd616a456` |
| 2 | `JamieMason/syncpack` | `958d30689ac24b60623258630242330bd6d0264b` |
| 3 | `formatjs/formatjs` | `27c29bf9a40a50dac232a159b8790dbd14732c57` |

Repository order above is the frozen tie-break order.

## 3. Validation surfaces, and their availability at freeze time

Admission rules 3 and 5 require a **deterministic, objectively checkable**
surface. A surface that does not exist on this host cannot be conjured after
seeing a candidate, so each repository's surface and its availability are frozen
here, before screening. Probe output is pinned in `evidence/host-profile.json`.

| Repository | Frozen validation surface (repository-native) | Probed at pin |
| -- | -- | -- |
| `JamieMason/syncpack` | `cargo check --workspace --locked`, toolchain from the repo's own `rust-toolchain.toml` (1.97) | **available — PASS** |
| `formatjs/formatjs` | `cargo check --workspace --locked --exclude formatjs_icu_messageformat_parser_integration_tests` | **available — PASS** |
| `polyfy/polylith` | `clojure -M:poly check` (Polylith's own component/interface reference checker) | **available — PASS** |

The formatjs exclusion is a **pre-existing property of the repository at the
pin**: that crate depends on the Bazel-provided `runfiles` crate, which is not
in the Cargo graph, so it fails independently of any candidate. It is excluded
here, before screening, and never in response to a candidate.

formatjs's frozen surface covers its **Rust crates only**. A full pnpm install
of a Bazel monorepo is not part of the frozen surface, so a formatjs candidate
whose consequence is observable only in TypeScript is rejected
`VALIDATION_SURFACE_UNAVAILABLE`.

Two toolchains — rustup 1.97 and openjdk + Clojure CLI — were installed
**before screening**, specifically so that no repository in the frozen universe
would be silently unable to admit a candidate. All three repositories therefore
enter Stage 2 with a working surface; none is excluded by infrastructure.

**Frozen consequence rule.** If a candidate pair's repository has no available
validation surface, that candidate **cannot satisfy admission rule 3 or 5** and
is rejected with reason `VALIDATION_SURFACE_UNAVAILABLE`. This is recorded as a
preserved negative, not silently skipped, and it is frozen **now** rather than
discovered conveniently later.

**No hand-authored oracle.** The composed-tree gold must come from a
repository-native checker (a compiler or the repository's own test/verification
surface). An invariant script written by this experiment to make a particular
pair fail is not admissible evidence and is explicitly barred by admission rule
5 and rule 7.

## 4. Candidate-pair enumeration rule (deterministic, frozen)

Applied mechanically. No human judgement selects a pair.

**Step 1 — window.** For each repository R, let `W_R` be the **150** most recent
**non-merge** commits reachable by `git rev-list --first-parent <pin>`, ordered
newest first, indexed `0..149`.

**Step 2 — pair domain.** Consider ordered pairs `(Ca, Cb)` from `W_R` with
`Ca` strictly older than `Cb` in first-parent order and window distance
`|i - j| <= 25`. The distance bound exists so that `Cb`'s patch has a realistic
chance of applying to `Ca`'s base; it is not a relevance filter.

**Step 3 — replay definition.** For a pair `(Ca, Cb)`:

* `T0 = Ca^` (the first-parent parent of the older commit);
* patch A = `diff(Ca^, Ca)`, which applies to `T0` by construction;
* patch B = `diff(Cb^, Cb)`, which must apply cleanly to `T0`.

**Step 4 — mechanical filters.** A pair is retained only if:

* the changed-path sets of patch A and patch B are **disjoint** (this is the
  no-textual-merge-conflict condition, enforced mechanically rather than
  asserted);
* both patches touch at least one non-vendored, non-lockfile source path;
* neither commit is a merge.

**Step 5 — referential-adjacency score.** For each retained pair compute:

```
tok(x)   = identifiers matching /[A-Za-z_][A-Za-z0-9_]{3,}/ in x
REM(C)   = tok(removed lines of C) \ tok(added lines of C)
ADD(C)   = tok(added lines of C)
score    = |REM(Ca) ∩ ADD(Cb)| + |REM(Cb) ∩ ADD(Ca)|
```

This targets the hazard class HAC-343 already proved — *one intent removes a
referent the other starts pointing at* — and it is computed from the diffs
alone, with no knowledge of whether the composition actually breaks. It is a
**prioritization** rule, frozen before screening, not an outcome filter.

**Step 6 — budget.** Per-repository quota, taken by `score DESC`, tie-break
`(newer commit date DESC, Ca SHA ASC, Cb SHA ASC)`:

| Repository | Quota |
| -- | --: |
| `polyfy/polylith` | 14 |
| `JamieMason/syncpack` | 13 |
| `formatjs/formatjs` | 13 |
| **Total mechanically enumerated** | **40** |

40 is the hard ceiling required by META-383.

**Step 7 — deep-screen order.** Sort the 40 by `score DESC`, tie-break by
repository order in §2 then by quota rank. Deep-screen **at most the first 6**.

**Step 8 — stopping rule.** Stop at the **first** candidate that passes all
eight admission rules. If none of the 6 passes, close
`BOUNDED_SEARCH_EXHAUSTED`. A rejected candidate is **never** replaced by an
intuitively easier or harder pair from outside this enumeration.

Every enumerated pair and every rejection reason is preserved in
`evidence/candidates.json`.

## 5. Fixture admission rules (all eight required, frozen)

1. **T0 availability** — the committed-evidence treatment derives only from
   repository state/history at the common pre-change base `T0`.
2. **Real changes** — both patches come from real historical commits. No edit is
   invented to manufacture a collision.
3. **Independent local validity** — each patch applies to `T0` and passes the
   repository's frozen validation surface **in isolation**.
4. **No ordinary merge-conflict solution** — path-disjoint; `git merge`/apply of
   both produces no textual conflict.
5. **Deterministic composed consequence** — the ephemeral composed tree fails or
   violates an objectively checkable, repository-native invariant, for a reason
   attributable to the **interaction** of the two changes. No LLM-only gold.
6. **Evidence honesty** — the candidate committed evidence is a descriptive
   observation present at `T0` with exact basis revision and provenance.
   Symmetric co-change is **not** reinterpreted as dependency or causality.
7. **No trivial current-tree oracle** — the gold is not stated in prose by an
   instruction, comment or test expectation in the tree.
8. **Replay integrity** — candidate worktrees are never mutated by composition
   verification; composition happens only in disposable integration worktrees.

## 6. Host, model and configuration (frozen)

| Item | Value |
| -- | -- |
| Decision host | `claude` CLI, `--print`, non-interactive |
| Host version | pinned in `evidence/host-profile.json` |
| Model | `claude-sonnet-5` |
| Allowed tools (**all arms identically**) | `Read`, `Grep`, `Glob`, `Bash` |
| Working directory per run | the run's `T0` checkout |
| Timeout | 600 s per run |
| Concurrency | 5 |
| Runs per fixture per arm | **n = 5** |

`Bash` is granted to **every** arm, including the treatment arms. META-383
requires the baseline to hold "the strongest obvious native repository/Git
tools … including history inspection if normally available". Giving treatment
arms a tool the baseline lacks would confound information with capability, and
giving the baseline less than full Git access would manufacture headroom. The
tool set is therefore constant and information is the only treatment.

## 7. Exact decision prompt (frozen, identical across arms and fixtures)

Arm-specific payload, when present, is prepended verbatim, separated by one
blank line. Nothing else differs between arms.

```
Two changes are in progress against this repository at the same base revision.
Each is being developed in its own separate working tree. Neither has been
integrated, and neither is visible to the other.

Base revision: <T0_SHA>

Change A — working tree A
Changed paths:
<paths>

Diff:
<diff A>

Change B — working tree B
Changed paths:
<paths>

Diff:
<diff B>

Each change has already been verified to be valid on its own against the base
revision.

Decide how these two changes should proceed toward integration:

- ALLOW_PARALLEL_TO_INTEGRATION — the two changes may proceed to integration
  independently of each other.
- REQUIRE_COMPOSED_VERIFICATION_BEFORE_INTEGRATION — the combined result of both
  changes must be verified before either is integrated.

End your reply with exactly this line and nothing after it:
DECISION: ALLOW_PARALLEL_TO_INTEGRATION or REQUIRE_COMPOSED_VERIFICATION_BEFORE_INTEGRATION
```

Both options are stated in neutral, parallel form; neither is presented as the
safe or the expected answer.

**Gold.** Hazard fixture → `REQUIRE_COMPOSED_VERIFICATION_BEFORE_INTEGRATION`.
Matched safe fixture → `ALLOW_PARALLEL_TO_INTEGRATION`. Gold comes from the
disposable composed-tree verification, never from historical evidence and never
from a model.

## 8. Treatment payload shapes (frozen)

### Arm A — both-intents raw/native baseline
No prepended payload. `T0` checkout, both diffs, full native tool set.
Also serves as the Stage 3 headroom gate. **The five hazard runs are reused,
not rerun, in Stage 5.**

### Arm B — exact direct descriptive fact
Arm A plus the exact `T0` revision-bound descriptive fact in neutral prose.

Constraints, enforced by a mechanical leakage check before any run:

* no `workspace.json` branding, no Interlock branding, no tool identity;
* none of the words: *important, risky, coupled, dangerous, review, verify,
  block, serialize, recommend, recommendation, caution, careful, warning, hazard,
  conflict, break, fail*;
* exact provenance retained: basis revision, window, support, occurrences;
* it states an observation, never advice, never a conclusion about these two
  changes.

### Arm C — explicit workspace.json carrier
The **same semantic information** as B, carried in the exact
workspace.json-compatible L0 selection projection available at `T0`, produced by
`@workspacejson/mining-core` (`mine → score → select`, `serializeSelection`),
preloaded into the prompt. Autonomous tool routing and artifact discovery are
**not** under test here.

### Arm D — matched irrelevant-evidence control
Same envelope shape and comparable evidence density as B/C, but describing a
**preregistered unrelated path pair** taken from the same `T0` artifact, which
does not encode the hazard relationship.

**Frozen selection rule for D's path pair:** from the same `T0` selection
projection, the qualifying pair of **highest support** whose two paths are both
disjoint from the four paths touched by patch A and patch B. Ties broken by
`occurrences ASC`, then `files[0]` then `files[1]` ASC by UTF-8 bytes. Chosen
mechanically, before any arm is run.

### Optional diagnostic I — isolated workers
May be recorded. **Diagnostic only.** Never used as the baseline for
workspace.json usefulness.

## 9. Matched safe-parallel control (Stage 4, frozen selection rule)

Selected **before** treatment runs, from the **same repository** as the admitted
hazard fixture, by the same enumeration of §4, taking the **highest-scoring pair
that satisfies**:

* both changes representable as sibling worktrees from a common `T0`;
* each independently valid on the frozen validation surface;
* the composed tree **remains valid** under the same verification class;
* no textual merge conflict.

Never selected on the basis of model behaviour.

## 10. Metrics

**Primary**, reported as exact `X/Y`, separately for hazard and safe control:

1. correct composition decision;
2. false-block — unnecessary `REQUIRE_COMPOSED_VERIFICATION` on the safe pair.

**Primary causal comparisons:**

* **Fact value:** B vs A on the hazard fixture.
* **Carrier fidelity:** C vs B.
* **Specificity:** B/C vs D.

**Secondary only** (never substituted for correctness): tool calls,
files/history inspected, tokens/latency where available, whether the evidence
was explicitly cited in reasoning, composed-verification cost.

## 11. Outcome interpretation (frozen)

### `COMMITTED_EVIDENCE_CONSEQUENCE_ESTABLISHED`
All of:

* Stage 3 admitted real baseline headroom;
* B correct on the hazard in **≥ 4/5**;
* B improves over A by **≥ 2/5**;
* C within **1 run** of B on the hazard;
* D does **not** reproduce the B/C improvement;
* B and C each false-block the matched safe pair in **≤ 1/5**.

One bounded transfer result only. **Not** a standard field, not general product
value.

### `DIRECT_FACT_VALUE_CARRIER_GAP`
B meets the fact-value criterion; C trails B by `> 1/5`. Evidence about the
carrier/projection — not permission to change the standard.

### `NONSPECIFIC_CAUTION_CONFOUND`
D improves similarly to B/C, **or** B/C over-block the safe control. Not
evidence value.

### `NO_DECISION_CONSEQUENCE`
Natural fixture and baseline headroom exist, but B/C do not materially improve
the hazard decision.

### `NO_MEASURABLE_HEADROOM`
Stage 3 baseline is **≥ 3/5** correct. Stop. Do not hunt a harder fixture.

### `BOUNDED_SEARCH_EXHAUSTED`
No authentic natural worktree-composition fixture passes admission within the
frozen universe and budget.

### `WORKTREE_TRANSFER_FAILED`
The HAC-343 mechanism cannot be faithfully reproduced as real Git worktree state
without changing its semantics.

**Stop immediately at the first terminal disposition reached.**

## 12. Stage order (binding)

| Stage | Gate | Terminal failure |
| -- | -- | -- |
| 0 | Freeze this document | — |
| 1 | HAC-343 cross-target case as two real Git worktrees; reproduce composed gold | `WORKTREE_TRANSFER_FAILED` |
| 2 | Enumerate ≤40, deep-screen ≤6, admit first passing all 8 rules | `BOUNDED_SEARCH_EXHAUSTED` |
| 3 | Baseline headroom, n=5; admit only on 0/5, 1/5, 2/5 | `NO_MEASURABLE_HEADROOM` |
| 4 | Freeze matched safe control | — |
| 5 | Arms A/B/C/D, n=5 per fixture per arm | — |

Stage 1 passing is **`MECHANISM_TRANSFER_ONLY`**, never workspace.json
usefulness evidence.

## 13. Evidence package

Pinned in this experiment directory: this preregistration (committed before
screening); frozen external revisions and acquisition receipts; the full
candidate enumeration with **every rejection reason**; worktree manifests and
base SHAs; independent-local validation receipts; composed-tree gold
verification; exact treatment payloads; all raw transcripts; aggregation code;
exact run counts; negative findings; environment/host/model identity; final
disposition.

**Exit 0 is never evidence by itself.** The watched invariant/compiler output
that establishes each local and composed state is preserved verbatim.

## 14. What this experiment may not do

Not tested, not claimed: general agent performance; provider routing or tool
recruitment; automatic workspace.json invocation; worktree state as standard
material; universal collision prevention; Interlock production readiness; that
historical co-change is causality, dependency, blast radius, risk or required
change; that a positive result earns a field.

No standard-representation issue is created unless
`COMMITTED_EVIDENCE_CONSEQUENCE_ESTABLISHED` is actually achieved. No
routing/provider experiment follows automatically.
