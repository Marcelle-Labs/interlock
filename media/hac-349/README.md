# HAC-349 — the consequence-first judge landing surface

`/` is now an explanation. `/cockpit` is the proof.

Before this issue the front door was the HAC-341 cockpit: a pinned run, four
numbered stages, `WITHHOLD_SERIALIZE`, `140 > 130`, an arm switcher and four
verification controls. All of it true, all of it excellent for a reader who
already knows what Interlock is, and none of it an answer to the question a
first-time judge actually arrives with. This surface answers that question and
then hands the reader to the cockpit.

Nothing about the cockpit's evidence integrity changed. It was reframed, not
replaced.

## What is here

| Path | What it is |
| -- | -- |
| `landing.html` | The surface. One static file, no build step, renders the model below. |
| `lib/story.mjs` | The derivation. Pure, dependency-free, shared by the build, the gate and the tests. |
| `bin/build-landing-model.mjs` | Binds frozen evidence into `evidence/landing-model.json`. |
| `bin/verify-landing.mjs` | The deterministic gate. 169 checks. `pnpm run check:landing`. |
| `bin/verify-landing-visual.mjs` | The browser gate. 278 checks. `pnpm run check:landing:visual`. |
| `evidence/landing-model.json` | Derived, not hand-edited. CI diffs a rebuild against it. |

## The judge path

```text
/  understand → lock baseline → four-way contrast → evidence ablation → verify
                                                                          ↓
                                                                      /cockpit
   ────────────────── hard proof-class reset ──────────────────
   separate Google Cloud deployment proof
```

Six sections, in that order, checked by the gate. The order is the argument: a
reader who meets the four-arm comparison before understanding the composition
problem has no way to tell why two of the four columns matter.

### L1 — the first frame

At 1440×900 and 1280×800, unscrolled, with 48px headroom:

- the thesis — *Different targets. Same environment.*;
- one bounded sentence;
- the recorded `budget/coupled/alpha-beta` scenario: two agents, two different
  target paths, one enclosing environment with one constraint, both actions
  valid alone at `120 ≤ 130`, and `140 > 130` when applied together;
- one continuation.

No HAC id, no decision enum, no digest, no arm id, no proof-class label. The
visual gate walks the rendered text above the fold and refuses each of those.

The scene is HTML boxes, not a drawn SVG. The relationship the first frame has
to carry is *containment* — two different targets inside one environment — and a
border is containment at every viewport, in every reflow, with the text still
selectable and still in the reading order.

### L2a — the lock, credible before it is limited

Three beats, and the lock keys are the argument:

1. same target → **one** key → the second intent waits (`2/2` serialised);
2. different targets → **two** keys → both proceed (`4/4` kept concurrent);
3. the hazard crosses both keys (`2/2` missed).

The keys printed on screen are the recorded `lockGroups` strings from the
experiment. Showing that the two keys really are two different strings is both
stronger than a padlock glyph and safer: no icon can be mistaken for a security
claim.

This is deliberate. `media/hac-341/lib/icons.mjs` refuses any `lock`, `shield`,
`key` or `gate` name entering the shared vocabulary, so the Interlock mechanism
can never be drawn as generic security. Adding a padlock for the baseline would
have meant either polluting that vocabulary or opening a second one.

The reading the section lands on is the one HAC-343 requires:

> The lock worked. It locked exactly what it could see — and the demonstrated
> hazard crossed two lock keys.

Not *locks do not work*. The gate refuses that phrasing absolutely.

### L2b — the four-way contrast

Small multiples, not a table. Four cards, each carrying both dimensions with
their polarity stated, drawn as discrete pips beside the exact fraction:

| | invalid coupled outcomes | safe parallel opportunities retained |
| -- | --: | --: |
| Uncoordinated | 2/2 | 2/2 |
| Global lock | 0/2 | 0/2 |
| Per-target lock | 2/2 | 2/2 |
| Interlock | 0/2 | 2/2 |

Both dimensions or neither. Either column alone ranks the arms wrongly: A1 wins
on parallelism and A2 wins on safety, and each is the worst available choice on
the axis it is not being read on. The visual gate asserts every arm shows two
dimensions, that each states which direction is better, and that the pips agree
with the fraction beside them.

The corpus bound sits directly under the cards, in the export's own words.

### L2c — the evidence ablation

Adjacent to the comparison, never behind a drawer. The gate refuses a page where
`#ablation` does not follow `#compare`.

Both conditions render **side by side**, not behind a selector. A control is the
thing most likely to be read as *run it again*; the comparison is the whole
point, so showing both at once costs nothing and removes the affordance. The
page has no `<button>` at all, which the gate and the tests both assert.

### L3 — verify

Four routes, three into the local proof and one into the cloud proof, each
addressed against the cockpit's own declared deep-link contract. The addresses
live in the model rather than in the page, so the gate checks them against
`view-model.json#deepLink` instead of parsing template literals. An address the
contract does not declare becomes an unresolved binding and the link is not
rendered.

Limitations, the `mustNotClaim` list and the negative refusal-reason finding are
one disclosure control away — one level down, not off the page.

### The cloud reset

A hard field inversion, the same one HAC-333 SB-06 and the cockpit's cloud proof
class already establish. The gate asserts the two blocks share no value in
either direction: no `WITHHOLD_SERIALIZE`, `140` or `130` below the reset, and no
`gemini`, `Cloud Run`, `ADK` or `receipt` above it.

## Evidence binding

Every judge-facing figure resolves to a pointer:

| What a judge reads | Where it comes from |
| -- | -- |
| the four-arm figures | `judge-export.json#panel1.rows[].{coupledUnsafe,safeParallelism}.display` |
| the A3 credibility strip | `judge-export.json#panel1.perTargetLockCredibility.*` |
| the ablation rows and decisions | `judge-export.json#panel2.rows[]` |
| the corpus bound, `mustNotClaim`, limitations | `judge-export.json#limitations.*`, `#mustNotClaim` |
| the first frame's paths, ceiling and totals | `raw-results.json#records[budget/coupled/alpha-beta]`, including the verifier's own stdout |
| the lock keys | `raw-results.json#records[…A3_per_target_lock].lockGroups` |
| the cloud actors, decision, controls and boundary | `view-model.json#runs.cloud.*` |

A pointer that stops resolving renders as a visible `[BIND: …]` marker and a
labelled scaffold banner, never as a plausible figure. Removing the export from
the tree is a covered test case, not a hypothetical.

## The claim gate

Seventeen patterns, transcribed from `judge-export.json#mustNotClaim`,
`#panel2.forbiddenRendering` and the simplifications HAC-349 names. Patterns
rather than sentences, because the failure mode is paraphrase.

Two mechanics matter:

**The negation window.** This surface has to be able to print its own
limitations — a gate that could not tell *"not production-ready"* from
*"production-ready"* would force the limitations off the page. A forbidden
phrase with a negator within 120 characters is a disclaimer.

**Absolute patterns.** Two phrases contain their own negation, so the window
would excuse them: *"Locks do not work"* disclaims itself, and *"Without
coordination the result is a catastrophic failure"* is negated by its opening
word. Both were passing until the negative tests caught it. Neither has a
legitimate disclaimed form here, so both are absolute.

**Declared disclaimer lists** are excluded from the phrase scan entirely —
`mustNotClaim` says *"Interlock is 0% unsafe"* precisely in order to forbid it.
They are covered by two stronger checks instead: byte-identical to their frozen
source, and rendered under a heading that negates them.

`test/hac-349-landing-gates.test.mjs` asserts the assertive form of every
forbidden phrase still fails, that the disclaimed form still passes, and that a
negation 400 characters away does not excuse a claim. A claim gate that has
never been shown to fail is a comment.

## Simplification is a hierarchy, not a discount

`WITHHOLD_SERIALIZE` is still `WITHHOLD_SERIALIZE` on screen, with
*"this intent is held back; the other one proceeds alone"* beside it. The gate
asserts both halves: the exact token must reach the surface, and its gloss must
travel with it. The forbidden direction is replacement — *"Paused for safety"*
converts a coordination decision into a safety verdict the evidence does not
support, and the gate refuses it by name.

## Motion

Exactly one sequence, on the first frame, doing three semantic jobs in order:
two independent actions exist, they sit inside one environment, and the joint
result is not what either action alone said. It plays once, settles at
`data-motion="settled"`, and nothing on the page moves again.

Everything below the fold is static. A reveal that fires while a section is off
screen has no reader to explain anything to.

`prefers-reduced-motion` and `?static=1` render the same text, character for
character, and the visual gate compares them that way rather than merely
checking that the page still works.

## Running it

```sh
pnpm run landing:build        # rebuild the model from frozen evidence
pnpm run check:landing        # deterministic gate, no browser needed

# browser gate — needs a repository-root server and an external Playwright
python3 -m http.server 4173 &
PLAYWRIGHT_MODULE=/path/to/playwright pnpm run check:landing:visual
```

Both run in CI as `Judge landing contract gate` and
`Judge landing visual contract gate`. The first also diffs a rebuild against the
committed model, so a hand-edited figure fails the build.

## What this issue did not do

- It did not modify HAC-343. Not one frozen byte moved.
- It did not weaken the cockpit. `check:cockpit` and `check:cockpit:visual` pass
  unchanged, and `/cockpit` renders exactly what it rendered before.
- It did not delete the storyboard. `/storyboard` still resolves and
  `check:storyboard` still passes; it is referenced once, from the footer, and
  the gate refuses a second reference or one offered as a verification route.
- **It did not run the human cold read.** See below.

## Human cold read

```
HUMAN COLD READ: NOT RUN. No comprehension result is claimed here.
```

Everything above is a mechanical property of the surface. None of it is
evidence that a human understood anything. `cold-read/HAC-349-assembled-path.md`
is the kit for measuring that, and it is unrun.

The submission dry-run gate should treat comprehension of this surface as
**unmeasured**, exactly as `media/hac-341/cold-read/HAC-348-validation.md`
already says for the cockpit. Nothing in this file may be cited as a cold-read
result.
