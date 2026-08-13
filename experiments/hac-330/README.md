# HAC-330 / S-1 — evidence packet

**Result: PASS.** 24/24 acceptance checks, mechanically evaluated.

> green A + green B → red joint state; real mined evidence is load-bearing and perturbable.

Authoritative issue: [HAC-330](https://linear.app/marcelle-labs/issue/HAC-330).
Bootstrap contract: [HAC-328](https://linear.app/marcelle-labs/issue/HAC-328) and its
[receipt](../../docs/receipts/HAC-328-bootstrap-receipt.md).

No Google Cloud, ADK, Agent Runtime, Agent Gateway, Studio or production
infrastructure is involved. The only external dependency is the pinned
`workspacejson/cli` sibling checkout, executed in place.

---

## 1. Reproduce it

```sh
# Prerequisite: the pinned sibling checkouts, per docs/development/workspace.md
cd interlock-workspace/cli && pnpm install --frozen-lockfile && pnpm -r build

cd ../interlock
pnpm install --frozen-lockfile

pnpm run hac330        # full gate: rebuild fixtures, re-mine, run every arm  (needs ../cli)
pnpm run check:packet  # verify the committed packet against itself           (needs nothing)
pnpm test              # full test suite, including the decision function     (needs nothing)
```

`pnpm run hac330` **refuses to run** if `workspacejson/cli` is not at the manifest
pin or has local modifications. Evidence from a drifted or dirty checkout cannot
be recounted, and HAC-328 forbids changing the CLI to make a fixture pass.

Both the fixtures and the evidence are byte-reproducible: two runs produce an
identical packet, because fixture commit identity is pinned (fixed author,
committer, dates, branch, file modes) and the upstream serializer sorts keys.

---

## 2. Pinned revisions

Verified mechanically at the start of every run against `provenance/manifest.json`
(checks `PIN-CLI`, `PIN-STD`), including that the checkouts are clean.

| Repository | Pinned SHA | Disposition | Verified |
| -- | -- | -- | -- |
| `workspacejson/cli` | `defac1e5dce6fb692a48e775fb44854b371cbca4` | execute / read | matches, clean |
| `workspacejson/standard` | `a3caece60bde12c41105a9987f50afa9e33dcb7b` | read-only, pinned | matches, clean |

Neither was modified. `workspacejson/standard` was not touched at all — the
experiment reads no schema, and nothing here required a specification change.

| Producer | Value |
| -- | -- |
| Package | `@workspacejson/mining-core@0.0.0` (`private: true`, unpublished) |
| Entry point | `packages/mining-core/dist/index.js` |
| Bundle digest | `sha256 7aa5ae231d6713449d6c1790f0b19a509e82ec0c84d67a8a6a52ff492ec27bb8` |
| Pipeline | `mine → score → select` |
| L1 projection | **not used** — see §7.2 |

---

## 3. The fixture and the two intents

A reservation broker. Three services hold reservations against one shared pool.

**Target invariant** — [`verify.mjs`](bin/build-fixtures.mjs), materialized inside
the fixture and run as a separate process. Integer arithmetic over three files;
no clock, no network, no randomness, no judgement, no dependency. The verdict is
an exit code.

```
sum(services[].reserved) <= budget.totalReservable
```

Base state: `alpha 40`, `beta 40`, `gamma 20`, `totalReservable 130` — total 100,
headroom 30.

| Intent | Agent | Target | Change | Alone |
| -- | -- | -- | -- | -- |
| **A** | `capacity-planner` | `services/alpha/reservation.json` | 40 → 60 | total **120** ≤ 130 — `verify.mjs` exit 0 |
| **B** | `traffic-shaper` | `services/beta/reservation.json` | 40 → 60 | total **120** ≤ 130 — `verify.mjs` exit 0 |
| **A + B** | — | both | — | total **140** > 130 — `verify.mjs` exit **1** |

Each intent claims +20 against 30 of headroom. Either fits. Both do not. Neither
intent is malformed and neither is unreasonable; the hazard is in the
composition, and it is invisible to any check that examines one intent at a time.

### The coupling is not hand-authored

Nothing in this experiment writes a coupling into an evidence file. The coupling
is a **consequence of how the pool was maintained**: a fixed pool means one
service can only grow when another shrinks, so a rebalance necessarily edits two
reservation files in one commit. The co-change signal is the observable shadow of
the same invariant that A + B later breach. The miner discovers it from the
commit graph without being told what to look for.

### Two histories, one tree

| | baseline | perturbed |
| -- | -- | -- |
| HEAD | `eb67a6f56b3bf7e71846e7324d21af44565c0b70` | `db8a63ec9405191bdd40d0ed0fc69684fca5d17b` |
| Final tree | `fc015c39d48019fd8bb1b3e25ae97f70ebf5262e` | `fc015c39d48019fd8bb1b3e25ae97f70ebf5262e` |
| Commits | 17 | 17 |
| Counterparty | alpha ↔ beta rebalance each other | gamma is counterparty to **both**, at different times |

In the perturbed world alpha and beta are never edited in the same commit. Both
histories hold the invariant at every commit, use the same scaffold, docs and
test commits, and land on a **byte-identical tree**. So a downstream difference
cannot be the target state, the commit volume, or the commit sizes — only which
two files moved together.

---

## 4. The mined evidence

Produced by the pinned upstream pipeline. Artifacts: [`evidence/`](evidence/).

**baseline** — `sha256 2c021d0c593aac252c4f7f61d8d6bd03b3bfcccf7a2f647691a1a2b894eb21d6` (1212 bytes)
completeness `QUALIFYING_RELATIONSHIP_OBSERVED`, basis `eb67a6f5…`, 17/17 transitions, window not truncated

| Pair | support | occurrences |
| -- | -- | -- |
| `services/alpha/reservation.json` ↔ `services/beta/reservation.json` | **8** | 10 |
| `docs/runbook.md` ↔ `tests/smoke.test.mjs` | 6 | 6 |

**perturbed** — `sha256 ec9bd6736e951f1a03b89bd02da918f67c3fde6ff4f6dfca25b4dc48120d08d5` (1321 bytes)
completeness `QUALIFYING_RELATIONSHIP_OBSERVED`, basis `db8a63ec…`

| Pair | support | occurrences |
| -- | -- | -- |
| `docs/runbook.md` ↔ `tests/smoke.test.mjs` | 6 | 6 |
| `services/alpha/reservation.json` ↔ `services/gamma/reservation.json` | 4 | 10 |
| `services/beta/reservation.json` ↔ `services/gamma/reservation.json` | 4 | 10 |
| `services/alpha/reservation.json` ↔ `services/beta/reservation.json` | **absent** | — |

Three controls make the difference attributable:

- the **control pair** `docs/runbook.md ↔ tests/smoke.test.mjs` is identical in
  both artifacts — support 6, occurrences 6 — so the perturbation is surgical;
- **both** artifacts are `QUALIFYING_RELATIONSHIP_OBSERVED`, so the decision
  cannot turn on completeness degrading;
- the **trees are identical**, so it cannot turn on the target state.

Every provenance field is bound: producer SHA, package version, bundle digest,
source revision, history basis (a full 40-hex object name, equal to the fixture
HEAD), and artifact digest over the upstream `serializeSelection` bytes.

---

## 5. The three arms

One decision function, one broker, one apply path. The arms differ only in the
evidence handed in.

### Baseline — Interlock disabled

Both locally valid intents execute. Each precondition was true when it was
checked, and false by the time the last write landed.

```
A: PRECONDITION_OK_AT_BASE (120)   B: PRECONDITION_OK_AT_BASE (120)
A: APPLIED                          B: APPLIED
final: alpha 60, beta 60, gamma 20 → total 140 > 130 → verify.mjs exit 1
```

**RED.** This is the incident the product claims to prevent.

### Treatment — Interlock consumes the real baseline evidence

```
decision: WITHHOLD_SERIALIZE (COUPLING_OBSERVED)
  cites services/alpha/reservation.json ↔ services/beta/reservation.json
  support 8, occurrences 10, at basis eb67a6f56b3bf7e71846e7324d21af44565c0b70

A: ADMITTED  — revalidated against the current state (120)
B: REJECTED  — revalidation against the post-admission state breaches the
               target invariant (total 140 > 130)

final: alpha 60, beta 40, gamma 20 → total 120 ≤ 130 → verify.mjs exit 0
```

**GREEN.** The composition was withheld and the intents serialized with
revalidation, so B's stale precondition was caught before its write landed.

### Perturbed-evidence control — same code, evidence from the alternate history

```
decision: ALLOW_PARALLEL (NO_QUALIFYING_COUPLING)
final: alpha 60, beta 60, gamma 20 → total 140 > 130 → verify.mjs exit 1
```

**RED.** Same decision function, same intents, same policy, identical tree — and
the opposite decision, because the evidence changed. That is the whole point: the
evidence is **load-bearing, not decorative**. It also means the mechanism is only
as good as the evidence, which §7.1 takes seriously rather than burying.

---

## 6. Missing, refused and stale evidence is never green

Eleven degraded cases. **All eleven returned `INSUFFICIENT_EVIDENCE`; none
returned `ALLOW_PARALLEL`; none applied a mutation; the invariant held in every
one.** Five of the eleven are mined for real rather than simulated.

| Case | Real mine | Decision reason |
| -- | -- | -- |
| evidence absent / undefined | — | `EVIDENCE_ABSENT` |
| envelope without a selection | — | `EVIDENCE_MALFORMED` |
| selection truncated | — | `EVIDENCE_MALFORMED` |
| unknown selection version | — | `EVIDENCE_VERSION_UNSUPPORTED` |
| unpinned basis | — | `NO_BASIS_PIN` |
| history moved after mining | yes | `STALE_BASIS` |
| shallow clone (`--depth 1`) | yes | `HISTORY_NOT_MINED` (`NOT_MINED`/`SHALLOW_CLONE`) |
| repository with no commits | yes | `HISTORY_NOT_MINED` (`NOT_MINED`/`NO_COMMITS`) |
| directory outside any repository | yes | `HISTORY_NOT_MINED` (`NOT_MINED`/`NO_REPOSITORY`) |
| non-repository **inside** a repository | yes | `EVIDENCE_REPOSITORY_MISMATCH` — see §7.3 |

The decision function is structured so this is a property rather than a habit:
every early return is `INSUFFICIENT_EVIDENCE`, and `ALLOW_PARALLEL` is reachable
only from the bottom, after all six guards pass.

The distinction the upstream package exists to protect is preserved end to end:
`MINED_NO_QUALIFYING_RELATIONSHIP` ("we looked and found nothing") may permit a
composition; `NOT_MINED` ("we never looked") may not. Both produce zero pairs.

---

## 7. Negative findings and producer limitations

The parts most worth reading before deciding whether S0 is worth executing.

### 7.1 Co-change evidence is a proxy for coupling, and it can be wrong

**In the perturbed world, alpha and beta are still coupled — they still share the
pool, and A + B still breaks the invariant. History simply never showed it, so
Interlock allowed the composition and the target state went red.**

That is the honest reading of the control arm. It proves the evidence is
load-bearing, and it proves the failure mode: a coupling that has never been
exercised in commit history is invisible to this mechanism. Co-change evidence is
a *detector with false negatives*, not a proof of independence. Concretely, this
design will not see:

- a coupling in a young repository, or one below `minSupport` (default 3);
- a coupling between files whose joint maintenance has always been split across
  adjacent commits;
- a coupling introduced by a change more recent than the pinned basis — though
  the `STALE_BASIS` guard converts that into `INSUFFICIENT_EVIDENCE` rather than
  a false green.

**This does not sink the thesis, and it does bound the claim.** Interlock must be
positioned as *raising the floor* on detectable composition hazards, never as a
guarantee of joint safety, and any S0/S1 demo narration that implies the latter
is overclaiming. The mitigation available today is the fail-closed direction:
absence of evidence already yields `INSUFFICIENT_EVIDENCE`, so the dangerous
configuration is a *mined, current, low-support* history — which is exactly the
case that reads as clean.

### 7.2 The published producer emits no co-change, and offers no refresh

HAC-330 anticipated this, and it holds at the pinned revision. Running
`node packages/cli/dist/cli.js generate <fixture> --dry-run` yields
`generated` with keys `specVersion, generatedAt, by, frameworkManifest,
conventions, fileIndex, topology, hygiene` — **no `coChange`, no
`basisRevision`, and the string `coChange` appears nowhere in the output.**
`generate --help` exposes only `--dry-run`, `--check`, `--force`; there is no
history-refresh option. The output also carries a wall-clock `generatedAt`, so it
is not byte-deterministic.

Interlock therefore consumes `mine → score → select` directly and pins the basis
revision itself. It does **not** read `generated.coChange` from an artifact,
because at this revision there is nothing to read. Recorded in
[`evidence/producer-path.json`](evidence/producer-path.json).

### 7.3 Mining a non-repository silently mines its nearest ancestor

Found during this work, and the sharpest failure mode in the packet.

Git resolves a path by walking *up* until it finds a repository. Asking the miner
about a directory that is not itself a repository therefore succeeds against the
enclosing repository and returns a result that is **internally perfect** —
`QUALIFYING_RELATIONSHIP_OBSERVED`, a valid 40-hex basis pin, real pairs with
real support counts — and about **a different repository than the caller named**.

No completeness state describes this, and none should: from the miner's side the
analysis genuinely ran and genuinely succeeded. It is not a defect in the four
states; it is a question they were never asked. The first time this happened here
it was an accident — a probe directory created inside the Interlock worktree
returned evidence about Interlock — and nothing but the `STALE_BASIS` guard stood
between that artifact and a decision.

**Defended consumer-locally**, per HAC-330's allowance for a bounded adapter that
preserves truthful provenance: the adapter records whether the repository mined is
the repository requested, and the decision function refuses evidence that fails
it (`EVIDENCE_REPOSITORY_MISMATCH`). **No upstream change was made.** This is
written up here so a separately approved upstream issue can decide whether
`mine()` should reject a path that is not a repository root — that is
`workspacejson/cli`'s call, not Interlock's.

### 7.4 `project()` exists in a package whose README says L1 is not there

`@workspacejson/mining-core`'s README states "**No artifact projection.** L1 —
writing `generated.coChange` — is not here", while `src/project.ts` exports a
`project()` function that produces exactly that shape. The function is
well-behaved — it refuses on a non-mined completeness state or a missing basis
pin, rather than degrading — so this is a documentation/surface mismatch, not a
correctness problem.

It is recorded because the module docs are the authority an integrator reads when
deciding what is authorized, and here they disagree with the export list.
**Interlock does not call `project()`** and writes no `workspace.json`; no
committed artifact in this packet carries a `coChange` key, asserted in the test
suite.

### 7.5 Scale is not proven here

The fixture is 17 commits and produces 2–3 selected pairs. The bootstrap run
against `workspacejson/cli`'s own history produced 7,231 observed pairs and 41
selected. Nothing in this experiment shows how a support-3 threshold behaves
against that noise, or what the false-positive rate of `WITHHOLD_SERIALIZE` would
be on a real repository. **That is the first thing S0 or a follow-up should
measure**, because a broker that withholds too often is one that gets turned off.

### 7.6 Fixture histories are synthetic; the evidence is not

There is no way to run a controlled perturbation on a history someone else wrote.
The commit graphs are generated by
[`bin/build-fixtures.mjs`](bin/build-fixtures.mjs) and are labelled synthetic
everywhere they appear. What is **not** synthetic: the mining, the scoring, the
selection, the provenance, the digests, and the decision. No co-change datum in
this packet was authored by hand.

---

## 8. Kill conditions

HAC-330 lists five. None fired.

| Kill condition | Status |
| -- | -- |
| A + B does not reliably produce the intended joint failure | **did not fire** — deterministic, arithmetic, reproducible; `verify.mjs` exit 1 every run |
| coupling evidence must be manually invented to make treatment work | **did not fire** — no evidence is hand-authored; the coupling is mined from the commit graph |
| the current producer/miner cannot produce honest evidence for the fixture | **did not fire** — `QUALIFYING_RELATIONSHIP_OBSERVED`, pinned basis, deterministic bytes. §7.2 is a real limitation of the *published producer*, worked around by using the authorized pipeline directly, not by changing anything upstream |
| perturbing the source history does not perturb the evidence | **did not fire** — digest changes, the pair disappears, the control pair does not move |
| Interlock's decision does not actually depend on that evidence | **did not fire** — identical tree, identical code, opposite decisions |

No WorkspaceJSON Standard change was made or needed. No CLI change was made.

---

## 9. Acceptance

All 24 checks are evaluated by [`bin/run-experiment.mjs`](bin/run-experiment.mjs),
which exits non-zero if any fails. Full record: [`evidence/results.json`](evidence/results.json).

| HAC-330 acceptance criterion | Check | Result |
| -- | -- | -- |
| `green A + green B -> red joint state` is deterministic and repeatable | `ACC-1`, `ACC-2`, `ACC-8` | PASS |
| real commit-graph-derived evidence identifies the relevant coupling | `ACC-3` | PASS |
| evidence is revision/provenance bound for this experiment | `ACC-4`, `ACC-5` | PASS |
| controlled history perturbation changes the evidence | `ACC-6`, `ACC-7`, `CTL-PAIR`, `CTL-STATE`, `CTL-TREE`, `CTL-SHAPE` | PASS |
| the Interlock decision changes because the evidence changes | `ACC-9`, `ACC-10`, `ACC-11` | PASS |
| missing / refused / stale evidence is never empty-green | `ACC-12`, `ACC-13`, `ACC-14`, `ACC-16`, `ACC-17` | PASS |
| the exact producer/miner path is proven, not assumed | `ACC-18`, `PIN-CLI`, `PIN-STD` | PASS |
| no Google Cloud dependency is required | `ACC-15` | PASS |

### Is HAC-325 / S0 worth executing?

On this evidence, **yes, with the claim bounded by §7.1 and the scale question in
§7.5 scheduled early.** The concept is not contrived: two individually valid
mutations reliably produce an invalid joint state, real mined evidence detects
the coupling, and the decision provably depends on that evidence rather than
decorating it. What remains unproven locally is behaviour at repository scale and
the false-positive cost of withholding — neither of which is a reason to delay
S0, and both of which are reasons not to narrate Interlock as a safety guarantee.

---

## 10. Layout

```
experiments/hac-330/
  bin/build-fixtures.mjs    deterministic fixture history generator
  bin/run-experiment.mjs    the gate — all arms, all guards, all acceptance checks
  bin/verify-packet.mjs     re-verify the committed packet without the sibling checkout
  lib/decide.mjs            the Interlock decision function (pure)
  lib/broker.mjs            protected mutation broker; intents A and B
  lib/evidence.mjs          evidence adapter over the pinned miner
  lib/exec.mjs              one absolutely-resolved git binary, one place that spawns it
  test/decide.test.mjs      decision-function tests, run by the repository's vitest suite
  evidence/                 the committed packet
  .work/                    generated fixtures — gitignored, never a nested history
```

`.work/` is gitignored deliberately: the fixtures are regenerated
deterministically, and committing them would nest Git histories inside this
repository, which `docs/development/workspace.md` forbids.

## 11. Which gate runs where

| Gate | Runs in CI | Proves |
| -- | -- | -- |
| `test` (vitest) | yes | the decision function behaves as specified, alongside the rest of the suite |
| `S-1 concept gate` | yes | the committed packet is internally consistent — no artifact, digest or claim was edited |
| `pnpm run hac330` | **no** | the artifacts actually came from the pinned miner, re-mined from real histories |

The full mining run is deliberately not in CI: it needs the `workspacejson/cli`
sibling checkout, and cloning another repository inside a merge gate would make
this repository's ability to merge depend on that repository's availability. The
tradeoff is stated rather than hidden — CI cannot prove provenance here, only
integrity, and the local gate is where provenance is established.
