# HAC-348 — validation of the iconography and motion polish

Covers HAC-345 (semantic iconography), HAC-346 (semantic motion and hold
states) and HAC-347 (signature gate; dotLottie rejected).

## Status of the human cold read

```
HUMAN COLD READ: NOT RUN. No comprehension result is claimed here.
```

This is not a regression from a baseline, because there is no baseline. The
HAC-341 cold-read kit has been ready since it was written and its own first
line still reads *"Status: READY_FOR_HUMAN_TEST. Not run. No result is
claimed."* Three unfamiliar readers have never been run against this surface,
before the polish or after it.

HAC-348 asks for a measurable improvement in a cognitive-load proxy. That
requires readers. What is recorded below is everything else the issue asks for
— the full technical regression, the falsification checks that can be
mechanised, and the objective properties of the surface that the comprehension
questions will be asked about — plus an extended kit (pass 3) that tests what
this polish added.

**The submission dry-run gate should treat comprehension as unmeasured**, not
as passed. Nothing in this file may be cited as a cold-read result.

## What was measured

Instrument: Playwright 1.56.1 / Chromium 141, against a repository-root static
server, at commit recorded in the HAC-348 receipt. Sixteen checks, all passing.

### Regression — the committed gates

| gate | result |
| --- | --- |
| `pnpm run check` (11 gates: provenance, 4 evidence packets, filmed run, storyboard, cockpit, visuals, identity, judge package) | pass, exit 0 |
| `pnpm run check:cockpit:visual` at 1440x900, 1280x800, 390x844, 320x900 | pass — 5,686 text nodes over 46 scenarios, 0 contrast failures, minimum 5.15:1 |
| `npx vitest run` | 658/658 across 22 files |

The vitest count is 658, not the 686 seen on the `feature/meta-383` branch: that
branch carries `test/hac-336-film-gates.test.mjs` (28 tests), which is not on
`main`, which is what this branch is cut from. No test was removed or skipped.

Two negative tests and two fixture manifests were repaired rather than relaxed:
both fixtures now copy `docs/development/cockpit-motion-contract.md` (the gate
refuses an undocumented sequence, so a fixture without the contract is not a
copy of this repository), and two tests anchored on exact source strings the
polish changed.

### Regression — browser behaviour

| check | result |
| --- | --- |
| console + page errors across 13 judge-reachable addresses | 0 |
| off-origin requests | 0 — every request same-origin, no font, icon or runtime CDN |
| keyboard traversal, visible focus | 15 distinct tab stops, 0 without a focus ring |
| controls unreachable by keyboard | the 5 non-current step-rail buttons (roving `tabindex="-1"`, reached with arrow keys) and `Next` on the last step (`disabled`). Both intended |
| buttons without an accessible name | 0 |
| icons exposed to assistive technology | 0 of the 8 rendered on L1 — every glyph `aria-hidden`, no `<title>`, no `role="img"` |
| layout shift obscuring a proof value | none. CLS 0.0000. Steps 01–04 leave the bound, the decision token and the selected outcome exactly stationary; steps 05 and 06 move the spine by 44px and 34px, which is exactly the height of the control row each step adds to the panel being read. No value left the 900px frame |
| deep links, degraded states, refused addresses | 13 addresses render their declared state; unknown run, unknown guided beat and cross-class addresses all refuse rather than substitute |

### Regression — proof-class separation

Switching to the cloud class from mid-walk replaces the whole context:
`data-guide-state` becomes `none`, the arm switcher and the decision gate are
gone, and no `140 > 130`, `120 <= 130` or `WITHHOLD_SERIALIZE` appears. Switching
back carries no receipt, `EXECUTED` or `alpha=45`.

### Regression — evidence integrity

The frozen HAC-343 comparison renders 6 dimensions with 0 unbound cells and no
scaffold banner. Values are unchanged, e.g. `Safety result = 2/2 (100.0%)` and
`Concurrency cost = SPR 2/2 (100.0%) at unsafe-joint-state rate 2/2 (100.0%) —
UNSAFE, not safe parallelism`. The cockpit gate re-derives every HAC-330 arm
value from `experiments/hac-330/evidence/arms.json` on each run and still
reports `3 frozen arms, checks 24/24`.

### Motion — determinism and equivalence

| property | measurement |
| --- | --- |
| named hold state | `data-motion="settled"` reached after every sequence: steps 02→06 in 387/365/367/367/284ms and an arm change in 410ms, against a 700ms `--dur-hold` budget |
| capture determinism | 3 addresses, captured twice each at `data-motion="settled"`, identical sha256 both times |
| first paint under `?static=1`, OS `prefers-reduced-motion`, and the manual control | already `settled`, 0 animations running |
| staged children under the manual control | 0 animating — the descendant kill works where zeroing the duration tokens does not |
| semantic equivalence, motion vs `?static=1` | rendered text identical, character for character |
| semantic equivalence, motion vs OS reduced motion | identical except the motion control itself: `REDUCE MOTION` is replaced by the status `REDUCED MOTION · SYSTEM PREFERENCE` plus its screen-reader explanation. Every evidence value, marker, decision token, gate caption and outcome is the same |

### Iconography — the properties the comprehension questions will test

| property | measurement |
| --- | --- |
| vocabulary | 12 concepts, 12 vendored glyphs, bijective; gate refuses a concept drawn two ways or a glyph meaning two things |
| drift | every inlined path body byte-compared against `assets/icons/lucide/*.svg`; the bytes themselves digest-gated as `IL-ICON-001` |
| generic stand-in for the mechanism | none — the gate refuses any `lock`, `shield`, `key` or `gate` name entering the generic set |
| persistent action row | 4 controls, 4 distinct glyphs, every one keeping a 3–5 word visible label |
| state without colour | under `filter: grayscale(1)`, the two outcome states remain two different closed forms (`circle-x` / `circle-check-big`) each with its own verdict sentence |
| runtime dependency added | none |

### The gate — position matches the record on every arm

| arm | recorded decision | gate | leaves drawn | caption |
| --- | --- | --- | ---: | --- |
| `baseline` | none (Interlock disabled) | `absent` | 0 | Gate not engaged / Interlock disabled in this arm |
| `treatment` | `WITHHOLD_SERIALIZE` | `closed` | 2 | Gate closed / parallel execution withheld |
| `perturbed` | `ALLOW_PARALLEL` | `open` | 2 | Gate open / parallel execution permitted |

## Falsification checks

HAC-348 fails the polish if a reader infers any of eight things. Four can be
checked mechanically and are; four require readers and are not claimed.

| inference | checkable? | status |
| --- | --- | --- |
| HAC-330 and HAC-340 are one experiment | yes | refuted mechanically — no artifact of either class appears in the other, gated on every run |
| unevidenced Agent Runtime / Gateway participation | yes | refuted — `Not on the recorded path` names both, and the gate refuses the `AUTHORIZED` lifecycle vocabulary |
| pass/fail from colour alone | yes | refuted — greyscale check above |
| a generic security icon represents the mechanism | yes | refuted — the vocabulary cannot contain one |
| animation timing equals execution timing | no | **unmeasured.** Mitigated by design: no sequence exceeds 400ms, none is on a timeline, and `FROZEN ARM · NOT RECOMPUTED` sits under every decision |
| the animation produced the decision | no | **unmeasured.** Mitigated: the gate has no animation of its own, and HAC-347's deliberation sequence was rejected outright |
| the gate is a padlock rather than evidence-bound authorization | no | **unmeasured.** Pass 3 Q7 exists to catch it |
| an icon is ambiguous or carries meaning alone | no | **unmeasured.** Pass 3 Q9 exists to catch it |

## What would fail this polish

Run the kit. If pass 3 shows a reader taking an icon for a different concept,
reading the gate as a padlock, or attributing the decision to the animation,
remove the offending treatment. Do not explain it to the next reader, and do
not keep it because a later reader got it right.

The three commits are separable — `HAC-345` (iconography), `HAC-346` (motion),
`HAC-347` (gate) — so a single failed hypothesis can be reverted without taking
the other two with it.
