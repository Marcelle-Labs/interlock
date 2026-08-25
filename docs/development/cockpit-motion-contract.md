# HAC-346 — the cockpit motion contract

Every animation on the judge cockpit is listed here. If a transition is not in
this table it does not exist on the surface, and `media/hac-341/bin/verify-cockpit.mjs`
refuses a `data-il-motion` value the table does not carry.

The rule the table exists to keep: **motion represents state; it never produces
it.** Every value on screen is derived from the frozen view model before any
animation runs, and every sequence settles at a state the URL already names. A
reader who never sees a single frame of motion reaches the same interpretation.

## The named hold state

`document.documentElement.dataset.motion` is the capture contract:

| value | meaning |
| --- | --- |
| `stepping` | a one-shot sequence is running inside `#app` |
| `settled` | nothing inside `#app` is animating; the surface is at an inspectable state |

It is derived from `app.getAnimations({ subtree: true })` — the animations the
browser is actually running — not from a timer. A `setTimeout` would be a
second authority on a duration the stylesheet already owns, and the two would
drift the first time a token moved.

Under `?static=1`, under `prefers-reduced-motion: reduce`, and under the manual
**Reduce motion** control there is nothing to run, so the first paint is already
`settled`.

A capture harness should wait for:

```
[data-motion="settled"]
```

alongside the two state addresses it already selects on — `data-guide-state`
and `data-semantic-state`.

## Transitions

### 1 · Arm change

| | |
| --- | --- |
| Attribute | `data-il-motion="arm"` |
| Semantic purpose | Show which three regions an arm change moves, in the order the attribution runs: evidence → decision → outcome |
| Source state | The previously selected arm's evidence, decision and outcome |
| Destination state | The newly selected arm's evidence, decision and outcome |
| Trigger | Reader selects a recorded arm (`.arms` button, or the ablation control) |
| Duration | `--dur-base` 220ms per region; `--delay-step` 90ms between regions; 400ms total |
| Easing | `--ease-standard` |
| Keyframe | `il-step-in` (opacity 0→1, translateY 3px→0) |
| Evidence binding | `armView(run, armId)` — each region renders the selected arm's own frozen fields |
| Static equivalent | The three regions swap contents immediately; the `Evidence changed` block and the held/changed markers state the same delta in words |
| Reduced-motion equivalent | Identical to the static equivalent |
| Named hold state | `guide=<unchanged>`, `state=run.local.<armId>`, `data-motion="settled"` |

### 2 · Step progression

| | |
| --- | --- |
| Attribute | `data-il-motion="step"` |
| Semantic purpose | Move the reader's attention from the step copy to the stage that copy has just made current |
| Source state | The previous step's copy and focused stages |
| Destination state | The current step's copy and focused stages |
| Trigger | Reader presses Back / Next, a step-rail button, or arrives at a `guide=` address from another step |
| Duration | `--dur-base` 220ms; the stage follows the copy by `--delay-step` 90ms; 310ms total |
| Easing | `--ease-standard` |
| Keyframe | `il-stage-in` (opacity 0→1, translateY `--il-stage-rise` 6px→0) |
| Evidence binding | `guideView(...).focus` — the regions the step declares, from `GUIDE_STEPS` |
| Static equivalent | The copy and the emphasis change immediately; the step number, `Step NN of 06` and the filled stage number all state the position in text |
| Reduced-motion equivalent | Identical to the static equivalent |
| Named hold state | `guide=guide.local.<step>`, `data-motion="settled"` |

**A stage that was already current does not re-arrive.** Steps 02 and 03 both
include the evidence band; animating it again on 03 would say "here is a new
thing" about the one region the reader has not stopped looking at, and the
genuinely new region — the decision — would have to compete with it.

### 3 · Ablation marker staging

| | |
| --- | --- |
| Attribute | `data-il-motion="ablate"` on `.causal-layout` |
| Semantic purpose | Reveal the ablation's claim in the order it is made: what was held constant, then what changed, then what the change produced |
| Source state | No markers (the walk is not on step 05, or the perturbed arm is not selected) |
| Destination state | 4 held-constant markers, 3 changed markers, 1 changed-outcome marker |
| Trigger | Reader reaches step 05 with the perturbed arm selected, by either order of actions |
| Duration | `--dur-base` 220ms per marker; held at 0ms, changed at 90ms, the outcome marker at 180ms; 400ms total |
| Easing | `--ease-standard` |
| Keyframe | `il-appear` (opacity 0→1) |
| Evidence binding | `ablationDelta(run)` reads both frozen arms and reports what actually moved. A held marker on a field that moved, or a changed marker on one that did not, is dropped by `marker()` and refused by the gate |
| Static equivalent | All eight markers are present from the first frame |
| Reduced-motion equivalent | Identical to the static equivalent |
| Named hold state | `guide=guide.local.ablation`, `state=run.local.perturbed`, `data-motion="settled"` |

**No value is staged — only the markers that qualify values.** Every number,
decision token and basis revision is on screen from the first frame. Nothing a
reader is looking for is withheld behind a delay.

### 4 · Stage emphasis

| | |
| --- | --- |
| Attribute | `data-guide-em="focus" \| "quiet" \| "full"` |
| Semantic purpose | Mark the stage the current step is about |
| Source / destination state | Surface, border colour, accent edge, stage-number fill, connector stroke |
| Trigger | Step change |
| Duration | `--dur-base` 220ms (CSS transition, not an animation) |
| Easing | `--ease-standard` |
| Evidence binding | `guideView(...).focus` |
| Static / reduced-motion equivalent | The same end state, applied immediately |
| Named hold state | `guide=guide.local.<step>` |

Emphasis is **positive only**: the current stage is marked up, a non-current
stage simply stops being marked. It never touches text colour, text opacity, a
filter or anything that participates in layout — the gate refuses all four, and
the reason is measured: the first implementation receded stages with `opacity`
and drove already-muted labels to 1.81:1.

### 5 · Evidence panel

| | |
| --- | --- |
| Property | `transform: translateX(100%) → none` on `.drawer`, and `max-width` on `main.frame` |
| Semantic purpose | Show that the panel takes space beside the run rather than covering it |
| Trigger | Reader opens or closes a verification / comparison panel |
| Duration | 220ms |
| Easing | `cubic-bezier(.2,.7,.3,1)` |
| Static / reduced-motion equivalent | The panel and the reflow apply immediately |
| Named hold state | `body[data-drawer="open"\|"closed"]`, `.drawer[data-panel]` |

## The signature gate

The Interlock gate in stage 03 is a **position**, not a sequence. It is drawn
with the canonical mark geometry and shows the state the recorded decision
determines — leaves absent, interlocked, or apart. It has no animation of its
own: an arm change steps the whole decision region once, with the rest of the
attribution order.

Why it is not animated, and why no animation runtime was added to make it
smoother, is recorded in
[`hac-347-lottie-decision.md`](./hac-347-lottie-decision.md). The short version:
the sequence HAC-347 proposed is a deliberation the frozen packets never
recorded, so it is unrepresentable in any runtime — and the runtime measured
7.9x the entire cockpit's gzipped payload.

## Deliberately not animated

### The threshold

HAC-346 lists a threshold-resolution beat. It is **rejected**, and the reason is
in the evidence rather than in taste: `ablationDelta` reports the joint bound as
a **held-constant** row across every recorded arm. The bound is 130 in the
baseline, in the treatment and in the perturbed arm. Giving a value that never
moves a resolution beat would contradict the `= Held constant` marker standing
beside it, and would teach exactly the thing the ablation exists to deny — that
the threshold, rather than the evidence, is what moved.

The threshold's job on this surface is to stay still while the evidence around
it changes. That is what it does, and the `gauge` glyph beside it is what makes
it findable without motion.

### Everything on the prohibition list

No perpetual motion, particles, animated gradients, typewriter effects,
bouncing icons, ambient pulses, fake telemetry, scrolling numerals, or
agent-thinking cues. Nothing loops: the gate refuses `animation: … infinite`
anywhere in the file. Nothing auto-advances: the gate refuses `setInterval`, and
`setTimeout`/`requestAnimationFrame` anywhere near `goStep` or `guideView`.

Autoplay does not exist, so the five-second pause/stop requirement is not
reached — but a **Reduce motion** control ships anyway, and it withdraws itself
in favour of a status line when the OS has already asked for reduced motion,
because offering an override the preference would immediately reverse is a lie
about who is in charge.

## Presentation timing is not execution timing

None of the durations above corresponds to anything that was measured. The
frozen packets carry a recorded event sequence; they do not carry wall-clock
durations for the cockpit to render, and the cockpit does not imply any. Every
sequence here is between two states of the *presentation*, triggered by a
reader action that happened just now.
