# HAC-347 — signature gate animation and the dotLottie dependency

## Disposition

```
DOTLOTTIE: REJECTED
```

No `@lottiefiles/dotlottie-web` dependency, no `.lottie` asset and no WASM
binary lands in this repository. `media/hac-341/bin/verify-cockpit.mjs` refuses
one entering the cockpit, so this does not reopen as a suggestion during
submission polish.

What ships instead is the SVG/CSS control described below: the Interlock gate,
drawn with the canonical mark geometry, in the position the recorded decision
determines.

---

## What HAC-347 asked to be tested

> Does a single signature Interlock gate animation communicate evidence →
> threshold → permission/refusal materially better than the best SVG/CSS
> implementation?

with a candidate sequence:

1. independently valid trajectories approach the shared boundary;
2. environment evidence / coupling becomes visible;
3. the Interlock gate evaluates the evidence-bound condition;
4. the gate state resolves to permit or refuse;
5. the UI settles at the named proof state.

## Finding 1 — the candidate sequence is not representable, in any runtime

Steps 1, 3 and 4 are a **deliberation**: an approach, an evaluation, a moment
of resolution. The frozen packets contain none of it. `arms.json` records, per
arm, a basis revision, a coupling finding, a decision token and a bounded
outcome. It records no approach, no evaluation interval and no instant at which
the decision was reached.

Animating that sequence would state, in the only channel a reader cannot opt
out of, that Interlock deliberated over time — and would invite the two
inferences HAC-348 fails the polish for: that animation timing is execution
timing, and that the animation produced the decision.

This is not a new finding. `assets/HARVEST.md` already records
`components/motion/phases.js` — the five-state stinger encoding
`JOINT REVIEW → AUTHORIZED` — as **classification D, rejected**, because the
frozen packets emit no such lifecycle. `media/hac-341/cockpit.html` carries the
same note against the gate-open transform it deleted. HAC-347's candidate
sequence is that same lifecycle, re-proposed.

**A runtime cannot fix this.** dotLottie would render the unrepresentable
sequence more smoothly than CSS. That is not the benefit the dependency gate
asks for.

So the question the issue frames — *is dotLottie better at this* — has no
admissible answer, because the thing to be communicated does not exist in the
evidence. The question that does have an answer is: **what part of
evidence → threshold → decision → permission/refusal is real, and what is the
cheapest honest way to draw it?**

## Finding 2 — what is real is three positions, and a position needs no runtime

The record contains three arms and, for each, a decision:

| arm | Interlock | recorded decision | gate position |
| --- | --- | --- | --- |
| `baseline` | disabled | none | leaves not drawn — there is no gate to be in a state |
| `treatment` | enabled | `WITHHOLD_SERIALIZE` | leaves interlocked |
| `perturbed` | enabled | `ALLOW_PARALLEL` | leaves apart by `GATE_TRAVEL` |

That is a **state diagram**, not a sequence. `gateState()` in
`media/hac-341/lib/arm-view.mjs` is a pure function from the recorded decision
to a position; `verify-cockpit.mjs` fails if any recorded decision has no
position, if a position contradicts its token, or if an arm that ran with
Interlock disabled draws an engaged gate.

Rendering it costs 6 `<path>` elements of geometry the page already carries for
the header lockup, plus a two-line caption. The state change between arms is
carried by the existing 220ms `arm` sequence, which steps the whole decision
region in the attribution order evidence → decision → outcome.

## Finding 3 — the measured cost of the rejected option

Measured against `@lottiefiles/dotlottie-web@0.79.2` (MIT, zero runtime
dependencies), installed into a throwaway directory and discarded. Figures are
the default CPU renderer — the smallest of the three builds the package ships.

| artifact | raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `dist/index.js` | 156,045 | 30,089 | 19,845 |
| `dist/dotlottie-player.wasm` | 1,222,210 | 489,619 | 383,386 |
| **runtime total** | **1,378,255** | **519,708** | **403,231** |

The WASM binary is not optional: the renderer *is* the WASM module, and
`setWasmUrl()` exists specifically because it has to be fetched from somewhere.
The `webgl` and `webgpu` builds are larger (1,350,459 and 1,379,913 raw).

Against what the cockpit ships today:

| | raw | gzip |
| --- | ---: | ---: |
| cockpit HTML, view model, three modules, all tokens | 304,128 | 65,941 |
| the two vendored Geist faces (already compressed) | 141,020 | — |
| **whole page** | **445,148** | **~207,000** |

So the runtime alone is **7.9× the entire current cockpit's gzipped payload**,
and roughly **2.5× the whole page including both typefaces** — before the
authored `.lottie` asset. For one 1.2-second animation of a state the page
already renders as two quadrilaterals.

## Finding 4 — four ways the runtime would make the surface worse

**Accessibility.** dotLottie renders to `<canvas>`. Nothing inside a canvas
appears in the accessibility tree, is selectable, or is findable with the
browser's own find-in-page. The gate's caption would have to exist in the DOM
regardless — at which point the DOM version is doing the whole job and the
canvas is drawing a decoration on top of it.

**Capture determinism.** `data-motion="settled"` is derived from
`app.getAnimations({ subtree: true })` — the animations the browser is running.
It cannot see frames a WASM player paints into a canvas. Capture would have to
wait on a third-party runtime's `complete` event instead of on the browser's own
animation state: strictly less deterministic than what is there now, and the
determinism of HAC-324 capture is not a thing to trade for smoothness.

**Failure behaviour.** A WASM fetch that fails leaves an empty canvas. The SVG
is inline in the document that is already parsed — there is no second fetch, so
there is nothing to fail. The cockpit's stated contract is that it renders
identically with networking disabled; adding a runtime whose renderer arrives
over the network contradicts it directly.

**State ownership.** dotLottie's state-machine features would put a second
authority on what the gate is doing beside the frozen arms. Even used only for
presentation, the temptation is structural, and this repository has a documented
history of exactly that failure — a design bundle whose motion module encoded a
lifecycle the evidence never produced.

## Finding 5 — what the SVG/CSS control does not do

Stated so the rejection is not read as a claim of perfection.

- **The closed/open difference is subtle at small sizes.** `GATE_TRAVEL` is 1.6
  units on a 48-unit grid, so at 52px the leaves separate by about 3.5px. The
  caption (`Gate closed` / `Gate open`) and the decision token beneath it are
  what carry the state; the geometry reinforces it. This is the frozen system's
  own rule — never ship a state on one channel — and it is why the picture is
  not left to speak alone. A larger travel would be a change to the mark, which
  is an identity decision and not a cockpit decision.
- **It does not animate the transition between positions.** Selecting another
  arm steps the whole decision region in once, along with the evidence and the
  outcome. The leaves do not travel across the screen, because a reader watching
  them travel is watching something that did not happen.
- **It adds no depiction of the two trajectories or of coupling.** Those are
  stages 01 and 02 of the spine, where they are already drawn with real values
  and real connectors. Repeating them inside the gate would be a second, less
  precise account of evidence the page has already shown properly.

## What would reopen this

A measured comprehension failure of the SVG/CSS control, from the HAC-341 cold
read, that a runtime could plausibly fix. Not a preference, not a demo, and not
a sequence step 1–5 above — those remain unrepresentable regardless of how they
would be rendered.

## Cleanup

The evaluation install was made outside this repository
(`/private/tmp/il-lottie-eval`) and removed. No dependency was added to
`package.json` or `pnpm-lock.yaml` at any point; `git log -p` for this branch
shows no manifest change. The cockpit gate refuses `lottie`, `dotlottie`,
`rive`, `gsap` and `framer-motion` appearing in the surface.
