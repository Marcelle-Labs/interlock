# HAC-350 — the frozen Forensic Replay

The thirty-second cut, as deterministic coded motion. This package owns the
**rendering** of an argument that was settled elsewhere: the eight-scene
sequence, its geometry, and the motion that carries its meaning. It owns no
facts. Every figure on screen is read out of HAC-343 or HAC-330 by
`bin/build-bindings.mjs` and carries the JSON pointer it came from.

**30.000s, 1920 × 1080, 30fps, H.264, no audio track.**

## Files

| Path | Role |
| --- | --- |
| `evidence/bindings.json` | Derived. Every recorded figure the cut renders, each beside the frozen artifact pointer it was read from. Not hand-authored — `verify-replay.mjs` re-derives it and fails on a diff. |
| `evidence/still-manifest.json` | Derived. The canonical stills: entry and settled state of each scene, with digests. |
| `evidence/render-manifest.json` | Derived. What the encoder actually wrote, read back out of the file. |
| `bin/lib/world.mjs` | The one persistent geometry. Scale, baseline, target columns, boundary, gauge. |
| `bin/lib/replay.mjs` | The scenes, as authored semantic states and timed tracks. |
| `bin/lib/plate.mjs` | The production plate. Draws only what a judge may see. |
| `bin/lib/debug.mjs` | The review overlay. Never exported. |
| `bin/verify-replay.mjs` | The gate. Node builtins only. |
| `masters/*.svg`, `*.png` | The canonical stills, and their reduced-motion twins. |
| `exports/IL-MOT-021-…mp4` | The cut. |

## Build

```sh
pnpm run replay:build     # bindings -> canonical stills -> reduced-motion stills
pnpm run replay:render    # the encode; needs ffmpeg, and is not run in CI
pnpm run check:replay     # the gate
pnpm run replay:review    # the annotated plates, into review/ — never exported
```

## What is reused, and what is new

The display list, the HAC-332 tokens, the edge grammar, the geometric state
marks, the SVG backend and the rasteriser are all HAC-334's, imported directly.
Nothing here is a second drawing vocabulary.

What HAC-334's library did not have was a **time axis**, so this issue added one
at `media/hac-334/bin/lib/motion.mjs` rather than keeping a private copy:
semantic and presentation tracks, deterministic state-at-time, contiguous
sequences, frame sampling, and a reduced-motion equivalent. It is
Interlock-agnostic and travels under hac-334's `HARVEST_STUDIO` row.

It also fixed a defect that only a cut could find: `line`, `path` and `circle`
accepted no opacity, so a faded stroke rendered fully opaque. HAC-334 and
HAC-336 masters are byte-identical after the fix, because the backends emit the
attribute only when it is not 1.

## One persistent world

The cut is not eight slides. Alpha is at x=292 in S8 because it was at x=292 in
S1 — both read `world.mjs`, and the gate asserts the three target anchors are
identical across every scene that draws the strip. S7 and S8 are asserted to
draw the *same* boundary rectangle: the ablation changes the evidence, not the
scope.

`SCALE = 3` px per reservation unit governs bars and gauge alike, which is why
the ceiling rule lands where it does and the overflow band is the size it is.

## Semantic state is not presentation

`stepTrack` carries WAITING, WITHHELD, APPLIED, RELATIONSHIP_PRESENT,
RELATIONSHIP_ABSENT. It never interpolates, because there is no state half way
between withheld and applied. `numberTrack` carries bar fill, edge draw progress
and opacity, and nothing downstream reads a product fact off it.

The withheld peer in S7 is the clearest case: its bar is an outline held at 40
that never fills at any instant of the scene, regardless of how far the clock
has run, because the frozen record says it was not applied in that run.

## The ablation is a re-entry, not a continuation

At 25.5 the world snaps to the pre-state under the perturbed history and both
intents rise together, exactly as they did in S1. If beta had simply filled in
from its withheld outline, the plate would be animating the withheld peer
executing — the one thing S7 says did not happen. The coupling edge is drawn as
an explicitly unresolved span with end ticks rather than omitted, so an absent
relationship is as legible as a present one. Nothing is struck out and no switch
is thrown.

## Plate and annotation

`plate.mjs` has no annotation mode. The review layer lives in `debug.mjs`, is
imported only by `render-frames.mjs --debug`, writes to `review/`, and cannot
reach `masters/` or `exports/`. The gate also refuses annotation vocabulary,
readiness and guarantee claims, broken-lock imagery, live-execution language,
class-B Cloud material and receipt-level counts in any rendered master — two
controls rather than one convention.

## Determinism

The frame at *t* is a pure function of *t*. The gate renders all 900 frames
forwards, then re-renders each one by direct seek in reverse, and compares
digests: a canonical still is frame *n* of the export written to a different
filename, not a second rendering of the scene. It also composes every frame of
both the normal and the reduced-motion pass, which is how the safe-area and
label-collision assertions cover the transition frames that the stills miss.

## Reduced motion

Not "animation off". Disabling interpolation would leave every scene in its
pre-state — bars that never rise, an outcome that never resolves — and a viewer
who asked for less motion would be shown a cut that means something else. Each
presentation track instead adopts its destination the moment its segment opens,
so every scene is always in a settled, meaningful state. Semantic tracks pass
through untouched, which is what makes the equivalence assertable: concurrency,
waiting, withholding, relationship presence and absence, target scope, the
external ceiling and the recorded outcome all survive.

## What this package does not do

It does not run HAC-343, mine a repository, call the arbitration core, spawn the
verifier, reach a network, or recompute a coupling. The tests assert that the
composition imports nothing from `dist/` and mentions no network primitive.
Presentation arithmetic — how tall a bar is — is fine; a product decision is not
recomputed anywhere.
