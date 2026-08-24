# META-383 — Deviations, defects and preserved negatives

Everything here happened during execution and is recorded rather than corrected
in place, following the handling META-381 §6.3 and META-382 §4.2 established for
their own defects. No frozen choice in `PREREGISTRATION.md` was edited after the
freeze commit `032178b`.

---

## D1 — First Stage 2b execution aborted on ENOSPC. No verdict was recorded.

The first deep-screen execution ran on a host with **117 MB free** on
`/System/Volumes/Data`. Every candidate failed with `git` and `cargo` write
errors, and the runner recorded `SCREENING_ERROR` six times, producing an
apparent `NO_MECHANICAL_ADMISSION_IN_BUDGET`.

**That output was discarded, not reported.** A disk-exhaustion failure is an
infrastructure fact about the host and carries no information about whether a
composed tree holds. Reporting it as `BOUNDED_SEARCH_EXHAUSTED` would have
turned a machine limitation into a research result.

Actions taken, in order:

1. the failed run's scratch, logs and JSON were deleted;
2. `git worktree prune` was run on all three frozen clones;
3. finished Claude session scratch directories under `/private/tmp/claude-502`
   were removed — no repository, no user file, and no evidence directory was
   touched;
4. the runner was changed to create worktrees **lazily**, drop each one as soon
   as its verdict is recorded, and abort with
   `INFRASTRUCTURE_FAILURE_NOT_A_VERDICT` if free space falls below 700 MB.

The frozen protocol, universe, enumeration, budget, admission rules and
interpretation arithmetic were **not** touched. Only the harness's resource
behaviour changed.

## D2 — The composed probe was inert on two candidates. Found, then killed.

The second execution completed without error and returned `exit 0` on all six
composed trees. Two of those checks — candidates 4 and 6 — finished in **0.22 s
and 0.21 s** and their logs contained a single line:

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.22s
```

No `Checking syncpack` line. Cargo considered every unit fresh and **never
examined the composed source**. `exit 0` from that check is not evidence that
the composed tree holds, and the preregistration §13 rule — *exit 0 is never
evidence by itself* — is precisely what caught it.

That run was discarded and two guards were added:

* **`touchAll`** rewrites the mtime of every `*.rs` / `Cargo.toml` /
  `Cargo.lock` / `*.clj` / `*.edn` file before each check, forcing cargo to
  recompute fingerprints;
* **root-evidence assertion** — a check whose output contains no
  `Checking|Compiling syncpack v` line raises `PROBE_INERT`, and the screen
  **aborts** rather than recording any disposition.

After the guards, all fourteen checks in the final execution report
`rootChecked=true`.

## D3 — A positive control was added, because a green checker proves nothing.

Six consecutive `exit 0` composed results are exactly what a broken harness
also produces. Before any candidate verdict was accepted, the frozen surface was
required to demonstrate that it detects a delete-versus-reference break of the
**HAC-343 class** inside this harness:

| | |
| -- | -- |
| Worktree | candidate 1's `T0`, `cd79359fa810fd2bbfdfa69354f959b3bc11ed8c` |
| Mutation | `src/packages.rs`, `pub fn normalize_pattern` renamed so every call site dangles |
| Clean tree | `cargo check --workspace --locked` → **exit 0** |
| Mutated tree | → **exit 101**, `error[E0425]: cannot find value 'normalize_pattern' in this scope` |

`surfaceIsLive = true`. The surface detects the hazard class under test. The six
`NO_DETERMINISTIC_COMPOSED_CONSEQUENCE` verdicts are therefore verdicts, not
silence.

This control was **not** in the preregistration. It strengthens a probe rather
than weakening a checker, it was added before any verdict was accepted, and it
can only make admission harder — never easier.

## D4 — Defect in the frozen enumeration rule. Recorded, not corrected.

**This is the most important limitation of this result.**

PREREGISTRATION §4 Step 5 defines the referential-adjacency score over
"source-path diff hunks", where §4 Step 4's source-path rule excludes only
**lockfiles and vendored directories**. It does not exclude Markdown,
changelogs, JSON fixtures, `.gitignore` or agent-skill documentation.

The consequence, visible only after screening: five of the six highest-scoring
pairs are not code pairs at all.

| # | Score | Change A | Change B | Code pair? |
| --: | --: | -- | -- | :--: |
| 1 | 135 | `chore(ai): move skills` — `.claude/skills/**.md` | `refactor(groups): combine visitors and version groups` — `src/**.rs` | ✗ |
| 2 | 110 | `feat(groups): add full pnpm/bun catalogs support` — `src/**.rs` | `chore(ai): update write-[code\|tests] skills` — `.claude/skills/**.md` | ✗ |
| 3 | 69 | `refactor(specifier): extract into lib` — `crates/syncpack-specifier/**.rs` | `refactor(groups): combine visitors and version groups` — `src/**.rs` | **✓** |
| 4 | 68 | `chore(release): regenerate changelog` — `CHANGELOG.md` | `test(fixtures): update fluid-framework` — `fixtures/**/package.json` | ✗ |
| 5 | 55 | `refactor(core): move modules` — `src/**.rs` | `chore(ai): update write-[code\|tests] skills` — `.claude/skills/**.md` | ✗ |
| 6 | 51 | `chore(site): ignore artefact` — `.gitignore`, `.tsv` | `chore(ai): correct and update agent docs` — `**.md` | ✗ |

Prose files score highly because natural-language identifiers repeat densely
across unrelated documents. The score therefore ranked **documentation churn**
above the referential hazard it was written to target, and **only one** of the
six budget slots was spent on a Rust-versus-Rust pair.

The rule is not amended and the search is not widened. Two things follow, and
both are stated rather than buried:

1. `BOUNDED_SEARCH_EXHAUSTED` is a correct disposition under the frozen rule.
2. It is a **much weaker** statement about the world than it looks. It says that
   this scoring function, applied to these three repositories, did not surface an
   admissible composition hazard within six deep screens. It does **not** say
   that natural cross-worktree composition hazards are rare in real repositories.
   That question is untested here, and any successor must fix the source-path
   rule *before* freezing, not after.
