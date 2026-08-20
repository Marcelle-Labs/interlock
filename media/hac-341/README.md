# HAC-341 — The Run

One pinned, frozen evidence object, rendered so a judge can answer *what changed
because Interlock existed?* before reading any architecture.

Not an observability dashboard, not a fleet view, not a live console, not a
simulation. Nothing here executes; every value is a recorded result.

## Files

| File | Role |
| --- | --- |
| `cockpit.html` | The Run. Renders the view model; derives no meaning of its own. |
| `lib/arm-view.mjs` | What one *selected arm* shows. Pure, so the gate can assert it without a browser. |
| `lib/guide.mjs` | The guided walk: six beats, and what the ablation held constant versus changed. Pure, for the same reason. |
| `lib/comparison.mjs` | The coordination-strategy comparison, bound field-by-field to HAC-343. |
| `evidence/view-model.json` | Normalized view model, generated — not hand-written. |
| `bin/build-view-model.mjs` | Adapter. Derives the view model from frozen evidence. |
| `bin/verify-cockpit.mjs` | Mechanical gate. |

Serve the directory and open `cockpit.html`; it fetches the view model relative
to itself. `?static=1` forces the reduced-motion resolution.

## Where truth lives

Semantic truth is derived in **`bin/build-view-model.mjs`**, from artifacts the
repository already holds:

```
experiments/hac-330/evidence/arms.json          → arms, decisions, coupling, outcomes
experiments/hac-330/evidence/results.json       → checks, pinned upstream revisions
experiments/hac-342/evidence/cloud-run.public.json      → the cloud run
experiments/hac-342/evidence/publication-bindings.json  → immutable links
experiments/hac-342/evidence/redaction-manifest.json    → digests
experiments/hac-342/evidence/runtime-source-snapshot.json → runtime provenance
```

`140`, `120`, `130` and `24/24` are read out of the frozen invariant reports, not
typed in. The cockpit formats truth; it never invents it. Only public,
main-resident evidence is read — the private unredacted packet is never touched.

## Absence is a state

The contract that matters is what each run does **not** have. HAC-330 has no
receipt, no protected target and no observer; HAC-340 has no arms and no bounded
joint outcome. Neither gets a field because the other has one, and a missing key
is omitted rather than set to `null` — a `null` would claim the field was looked
for and found empty.

| | Class A · HAC-330 | Class B · HAC-340 |
| --- | --- | --- |
| arms, environment evidence, constraints, checks, outcome | present | **absent** |
| receipt, effect, observation, negative controls, runtime/transport provenance, publication refs | **absent** | present |

The gate fails if either side grows a field the other owns.

## Proof-class switching is atomic

Switching replaces run identity, actors, events, decision, outcome, provenance,
controls, claim boundary and available actions together. Verified in a browser:
switching to cloud and back leaves **zero** artifacts from the other class in the
DOM. The field inverts paper ↔ ink, carrying the HAC-333 SB-06 convention, and
the class is named in the header and in the switch — colour is never the only
channel.

There is no synthetic run in which `140 > 130 → WITHHOLD_SERIALIZE → 120 <= 130 →
ALLOW + receipt → alpha=45`. That did not happen.

## Layers

**L1 — what changed?** Default `run.local.treatment`. Both fold gates pass with
no scrolling at all: two locally valid intents converging on the shared
environment with `joint bound <= 130`, the deterministic decision, and
`140 > 130` beside `120 <= 130` as a direct comparison. The baseline stays on
screen in every arm *except its own*, so the delta is always visible and the
baseline is never compared against itself. Bracket connectors carry the
convergence and the decision's descent into the outcome; the decision token also
appears as the cause line on the outcome it produced, so the relationship
survives without vision and without colour.

**L2 — can I verify it?** An anchored drawer, so causal context survives. The
panel used to be *drawn over* the result column it exists to explain: at 1440 it
covered the outcome numerals outright, so "L1 stays readable" held only for the
left column. The run now yields exactly the panel's width instead of sitting
underneath it, and the numerals step down just far enough not to wrap in the
narrower frame. Verified at 1280x800, 1440x900 and 1920x1080: the run's right
edge meets the panel's left edge and never crosses it.
Question-shaped actions only: *Verify this decision*, *Show me the raw proof*,
*What is not claimed?* Class A gets evidence attribution, coupling support, the
recorded arms, pinned upstream revisions and a deterministic
`hac330VerifyCommand`. Class B gets immutable evidence links, transport
provenance and application provenance **kept separate**, and runtime source.

**L3 — raw proof.** Digests, negative-control detail, teardown, the reserved
evaluation surface. Never the first layer. The frozen-arms block was boxed into
a fixed 270px window inside a panel that did not scroll — about a fifth of it
was reachable while the space beneath sat empty — so the block now flows and the
panel scrolls. Digests, the correlation id, the runtime shas and the
reproduction command each carry a **Copy** control: `navigator.clipboard` where
the context allows it, a `textarea` + `execCommand` fallback where it does not,
no dependency either way, and the evidence text is read rather than altered.

## Arms are selected, not run

`Baseline arm` · `Treatment · original evidence` · `Perturbed evidence`. The rail
reads: *each arm is a recorded result; selecting an arm changes which recorded arm
is displayed; nothing is executed in the browser.* No "Run experiment", no
"Retry", no "Simulate".

The baseline arm shows *no decision — Interlock disabled*, because that arm has
no decision to show.

## The selected arm carries its own evidence

The correction this surface most needed. `renderLocal` read
`run.environmentEvidence[0]` for every arm, so selecting the perturbed arm
changed the decision and the outcome but left the *treatment's* basis revision
and `coupling support 8/10` on screen. About eighty pixels apart, the page
asserted a coupling and `NO_QUALIFYING_COUPLING` at the same time — and the
perturbation, which exists to show that the evidence is load-bearing, taught the
opposite: same evidence, different decision. Two prior browser inspections
missed it because each arm was checked against its own required tokens and never
against the other.

The shared environment and its bound are properties of the experiment and do not
move between arms. The *evidence instance* does, so `basis` and `couplings` now
come from the selected arm:

| Arm | Basis | Coupling | Environment reads |
| --- | --- | --- | --- |
| baseline | none | none | *not consulted — Interlock was disabled in this arm* |
| treatment | `eb67a6f5…` | support 8/10 | `COUPLED` |
| perturbed | `db8a63ec…` | none recorded | *no qualifying coupling*, and no `COUPLED` state is drawn |

The perturbed arm additionally renders an **Evidence changed** block naming the
basis that replaced which, the resulting `ALLOW_PARALLEL → 140 > 130` chain, and
the frozen `decisionDetail` verbatim. That lesson used to live in 9px helper
copy at 60% opacity.

The derivation lives in `lib/arm-view.mjs` rather than inside the HTML so the
gate can assert it without a browser. `verify-cockpit.mjs` calls the same
function the cockpit renders from and fails if a selected arm's rendered basis
or coupling count stops matching its frozen arm, if a disabled arm is drawn as
coupled, if the baseline is compared against itself, if the perturbed arm stops
reporting changed evidence, or if an arm records a coupling its own
`decisionReason` denies. Those are bindings, not strings: rewiring the
derivation fails them, and so does editing the frozen arms.

## Walk the proof — an attention layer, not a second cockpit

A judge arriving cold has to answer *what changed because Interlock existed?*
before they can decide whether to check it. The cockpit answers that in one
frame, but it answers it all at once. **Walk the proof** is an optional guided
pass over the same geometry: same shell, same four-stage spine, same controls in
the same places. It moves emphasis and adds two things — the entry choice, and
the ablation's held-constant / changed markers. It adds no run, no arm, no value
and no claim.

On local entry the reader is offered both paths and **neither is preselected**:

> **Inspect the run**
> Two actions can be valid alone and unsafe together. Follow the recorded proof,
> or inspect everything yourself.
>
> `Walk the proof`  ·  `Explore freely`

`Walk the proof` takes ordinary primary emphasis. `Explore freely` keeps a
full-weight border and the same tap target, because it is the expert path rather
than a decline. The module is not modal, and it does not sit over run identity,
frozen state, the checks or the proof-class switch.

The six beats:

| Step | State | What it emphasises |
| --- | --- | --- |
| 01 | `guide.local.validity` | both intents, equally |
| 02 | `guide.local.shared-environment` | the intents and the bounded environment they converge on |
| 03 | `guide.local.evidence-decision` | the frozen coupling evidence and the decision it produced |
| 04 | `guide.local.outcome` | the decision beside the baseline and treatment outcomes |
| 05 | `guide.local.ablation` | evidence, decision, outcome, and the arm control |
| 06 | `guide.local.handoff` | nothing — the run returns to full emphasis |

### Emphasis is positive, and it is not paid for out of legibility

The first implementation receded non-current stages with `opacity: 0.62`. It was
wrong twice over, and only measurement showed it. `opacity` composites *text*
toward whatever is behind it, and it **multiplies through every ancestor that
also sets it** — this surface already muted small labels at `.6`, inside rows at
`.7`. Composed, `Baseline · no coordination` rendered at an effective 0.26 and
measured **1.81:1** against a 4.5:1 floor, on text that is still content. Twelve
labels that passed AA in the free cockpit failed inside the walk.

No opacity floor fixes that. Measured across the range, `0.95` still introduced a
failure and only `1.0` — no recession at all — reached zero, because the worst
affected label sits at 4.60:1 unrecessed and any multiplier pushes it under.

So the mechanism was replaced rather than tuned. The current stage is marked
**up**; the others are simply unmarked:

| Channel | Current stage | Other stages |
| --- | --- | --- |
| Accent edge | 3px inset shadow in the coupled hue | none |
| Surface | card | sunken |
| Border | left edge in the coupled hue | `--border-default` |
| Stage number | filled chip | plain numeral |
| Lift | `0 1px 3px` | none |
| Connector | full stroke, coupled hue, only when *both* joined stages are current | grammar default |

Every one of those is colour, background or `box-shadow`. None participates in
layout, so **no step moves anything** — asserted in a browser by comparing the
box of all five stages across all six steps. Text colour is untouched at every
step, so a non-current stage reads exactly as well as the current one.

The gate refuses the whole mechanism, not a particular value of it: no `opacity`
and no `filter` may appear in any `[data-guide-em]` rule, at any value; nothing
may be hidden or made unreachable; and nothing may change a layout property.

### One floor for the whole surface

Hierarchy is carried by two measured colour tiers rather than by opacity, which
cannot be measured once and trusted because it depends on every ancestor:

| Tier | Light field | Dark field |
| --- | --- | --- |
| `--text-body` | `--ink` | `--paper` |
| `--text-muted` | `--n60` — **6.84:1** on sunken, 7.27:1 on card | `--n40` — **6.89:1** on sunken, 7.25:1 on card |

There is deliberately no third tier: `--n50` was the natural next step down and
measures **4.07:1** on the sunken surface, under the floor. The gate fails if it
colours text again.

The audit that produced those numbers found eight failures already present in the
free cockpit before any of this work — down to 2.81:1 — and one more in a place
nobody had measured: **the Google Cloud raw-proof panel rendered paper text on
`--surface-code`, a light surface, at 1.03:1.** The L3 packet was on screen and
could not be read. The code surface now follows its field.

Resolving colour by string was itself a defect in the audit harness: `fillStyle`
round-trips `oklch()` unchanged and this design is oklch throughout, so the first
run silently mis-measured every semantic state colour. Colour is now resolved by
painting a pixel and reading it back.

Current state, measured across **13,344 text nodes in 136 scenarios** — both
modes, every step, every arm, both proof classes, every panel, the degraded
states, 1440px and 320px, and both reduced-motion resolutions:

```
muted by opacity   0
AA failures        0
min ratio          5.15 : 1
```

### The step owns its action

While the walk runs, the persistent verification row is **demoted** — 1px chrome
and normal weight instead of 2px and semibold — so the step's own action leads.
Its text colour, tap target and tab position are unchanged: a demoted control is
quieter, never less readable.

On the handoff step the two actions the step panel itself offers are dropped from
that row outright; the same control twice, eighty pixels apart, reads as two
different things. The row is never emptied — `Show me the raw proof` and `What is
not claimed?` appear in no step panel, and no step may take away the expert path.

Nothing auto-advances: the gate fails on a timer that moves a step. No step
change scrolls — focus is restored with `preventScroll`, and `scrollIntoView` is
refused outright.

### The ablation is a claim, so it is derived

Step 5 states that four things were held constant and four changed. That is the
load-bearing sentence of the whole walk, and it is the one a reader cannot check
by eye across a state change. So it is not a sentence: `ablationDelta` in
`lib/guide.mjs` reads **both frozen arms** and reports what actually moved.

| Held constant | Read from |
| --- | --- |
| Intent A, Intent B | `run.actors` — properties of the experiment |
| Shared environment | `environmentEvidence[0].source` |
| Joint bound `130` | each arm's own `outcome.bound` |

| Changed | Treatment | Perturbed |
| --- | --- | --- |
| Evidence basis | `eb67a6f5…` | `db8a63ec…` |
| Evidence finding | `COUPLED` | `NO QUALIFYING COUPLING` |
| Coordination decision | `WITHHOLD_SERIALIZE` | `ALLOW_PARALLEL` |
| Bounded outcome | `120 <= 130` | `140 > 130` |

The bound is deliberately read off each arm rather than off the shared
constraint. Read off the constraint it is held constant by construction and the
marker proves nothing; read off the arms it is a claim that both arms were
judged against the same bound, and editing one arm's `outcome.bound` fails the
gate. A marker whose claim stops matching the record is **dropped rather than
drawn**, and refused by `verify-cockpit.mjs`.

`Remove or perturb the evidence` selects the recorded perturbed arm. It does not
edit, delete or recompute anything, and `Restore the original evidence` names
the action it will perform in the other direction. The rail's own disclaimer —
*each arm is a recorded result … nothing is executed in the browser* — stays on
screen throughout.

### Motion

The walk reuses the one explanatory transition this surface already had:
switching arms steps evidence → decision → outcome so a reader sees which parts
moved together. `--dur-base` at delays `0`, `--delay-step`, `2 × --delay-step` is
**400ms**, and the gate derives that from `assets/tokens/motion.css` and fails if
it passes the `--dur-hold` 700ms budget. No new keyframe, no new dependency, no
Lottie, nothing pre-rendered.

Reduced motion is resolved, not toggled:

- **The system asks for it** → the manual control is *withdrawn* and replaced by
  a non-interactive `Reduced motion · system preference` status. Offering an
  `Enable motion` button the preference would immediately override is a lie
  about who is in charge, and the gate fails on one.
- **The system does not** → the control names the action available:
  `Reduce motion`, or `Enable motion` once manually reduced, with `aria-pressed`.

Either way the substitution is transitions for immediate state changes. The step
sequence, the copy, the changed and held-constant markers, the selected arm and
the announcements are identical — asserted by comparing the two derivations
field for field. The preference is **not persisted**: this repository has no
preference-storage pattern, and inventing one would put a second invisible
authority beside the OS setting.

### Keyboard

Tab and Shift+Tab reach everything; Enter and Space activate. **Back and Next are
the universal path and never depend on an arrow key.** Escape is the only key
bound globally, because closing the open panel is the only action that makes
sense wherever focus is.

Left/Right/Home/End are scoped to two roving-tabindex groups — the step rail and
the strategy control — by asking where the event came from *first*. They do not
move a step from inside a scrollable proof block, a code sample or any other
control. The gate fails if that guard is removed.

## Deep links

```
?run=<hac330-local|hac340-cloud>&proof=<local|cloud>&state=<semanticStateId>[&guide=<guideStateId>]
```

`run.local.overview` aliases to `run.local.treatment` and is the default. Rules,
all verified in a browser: an unknown run renders `run.missing`; a `proof`/`state`
mismatch renders `run.missing` rather than being silently corrected; an unknown
state renders `run.missing`. **The canonical run is never substituted**, and the
degraded page says so and echoes the address that was requested.

## Shared vocabulary

The semantic state ids are HAC-333's, not a parallel invention:
`run.local.baseline`, `run.local.treatment`, `run.local.perturbed`,
`run.cloud.overview`. The gate fails if the storyboard and cockpit diverge. Each
state is a URL, a cockpit view and a HAC-324 capture target — one identifier, not
three.

Cockpit-specific additions: `run.missing`, `run.unavailable`,
`run.cloud.partial`, `run.evidence.invalid-link`, `evaluation.unbound`.

The guided layer is a **second axis on the same address**, not a second address
space: `state` still names the recorded arm and `guide` names which beat is
emphasised, so the two compose. `guide.local.choice` is the default, and
`guide.local.free` is the expert path — declared rather than left implicit, so
an unknown value can be refused instead of resolving to something. An unknown
guided state renders `run.missing`; so does a guided state asked for under the
cloud proof class. Both echo the address that earned the refusal, and neither is
corrected to step one.

## Coordination strategies — bound to HAC-343, not transcribed

The judge's next question after *what changed?* is *compared with what?*. The
approved prototype rendered that panel as a scaffold, because HAC-343 had no
frozen artifact when it was drawn. **It does now**, so the panel binds rather
than scaffolds — every cell reads a named field out of a frozen HAC-343 artifact
and renders the path it came from beside the value.

Six dimensions × four strategies. Strategy labels come from
`judge-export.json#panel1.rows[].label` rather than being written here.

| Dimension | Bound to |
| --- | --- |
| Safety result | `results.json#report.aggregate.<arm>.unsafeJointState.display` |
| Concurrency cost | `results.json#report.aggregate.<arm>.spr.rendering` |
| Scope of coordination | `execution-semantics.json#arms.<arm>.note` |
| Evidence sensitivity | `results.json#report.aggregate.<arm>.evidenceSensitivity.display` |
| Recorded outcome | `results.json#report.aggregate.<arm>.permit.display` |
| Limitation | per arm — see below |

`Limitation` is the one asymmetric row, because HAC-343 records each arm's
limitation under the key that fits that arm: `canFail` for the arms that could
have falsified the thesis, `knownWeakness` where the weakness is structural,
`namingRule` for the arm most likely to be mis-described, and the export's own
`forbiddenRendering` for Interlock. Flattening them to one key would have meant
writing three sentences HAC-343 never wrote.

| Arm | Limitation field |
| --- | --- |
| `A1_uncoordinated` | `metric-definitions.json#arms.A1_uncoordinated.canFail` |
| `A2_global_lock` | `metric-definitions.json#arms.A2_global_lock.knownWeakness` |
| `A3_per_target_lock` | `metric-definitions.json#arms.A3_per_target_lock.namingRule` |
| `A4_interlock` | `judge-export.json#panel2.forbiddenRendering` |

Each dimension also carries the question it answers, bound to
`metric-definitions.json#metrics.*.question` — a bare `2/2 (100.0%)` does not say
whether two out of two is good.

**A3 is not renamed "credible".** HAC-343's own `namingRule` forbids describing
that arm loosely, so the panel shows the frozen figure that earns the word
instead: same-target contention serialized
`judge-export.json#panel1.perTargetLockCredibility.serializedSameTargetContention`.
A skeptical judge can see the lock was real before reading what it missed.

**Two experiments, two panels.** HAC-343 evaluates four strategies over its own
sixteen-scenario corpus; HAC-330 is the single bounded counterfactual on screen
beside it. No value crosses. The gate fails if `140 > 130`, `120 <= 130`,
`WITHHOLD_SERIALIZE` or `hac330` appears inside the comparison — the same
refusal that keeps the two proof classes apart, applied to a third experiment.

### When it cannot bind

The adapter reads the HAC-343 artifacts optionally, so this surface builds
without them. Absent, every cell they fed renders as
`[BIND: experiments/hac-343/evidence/<file>.json#<path>]`, the panel labels
itself `Unresolved binding scaffold · not evidence`, and no substitute value is
derived from HAC-330 or anywhere else. The banner is conditional in both
directions: it may not appear over bound evidence, and it may not be missing
when something is genuinely unbound. `verify-cockpit.mjs` rebuilds the
comparison from the artifacts it cites and fails if the committed one is not
what they produce — so a hand-edited cell fails whether it was edited toward a
plausible value or away from one.

## Public evidence

All links pin to commit `75253e38791e69f7e2a4bb3a041044a9114c32f0` — never a
branch, never `main`. `sourcePacketSha256` is shown as a **private commitment**
with the note that it is not reader-recomputable.

`runtimeSourceUrl` is rendered as **unavailable / non-public**, in the panel
rather than in fine print, with the reason and the
`runtimeSourceSnapshotSha256` that carries that provenance instead. No revision
link is fabricated.

Only `interlock-hac340-proxy-00002-wzf` appears. The agent and target revision
names are unevidenced and the gate fails if either surfaces.

## Degraded states

Eight typed states, each with the inference it forbids: `run.loading`,
`run.unavailable`, `run.missing`, `run.cloud.partial`,
`run.evidence.invalid-link`, `pending-binding`, `evaluation.unbound`,
`run.error`. If the view model cannot be read, the cockpit renders
`run.unavailable` — **it never falls back to sample data.** Absence is absence,
not success.

## HAC-319 reserved surface

Three regimes drawn as labels, each marked `NOT BOUND`, with the metrics named as
withheld: SPR, precision, recall, false-block rate, useful-concurrency. No value,
no mark, no proportional geometry.

## Motion dependency decision

**No React, no Motion, no new dependency.** The HAC-341 comment names Motion for
React as the default, on the strength of the Tally precedent. That default is
conditional on a presentation boundary existing to host it, and this repository
has none — `src/` is the deterministic core and the only judge surface so far is
HAC-333's dependency-free storyboard.

Everything this cockpit needs — drawer transition, proof-class field inversion,
state changes — is expressible in deterministic CSS. Adding React, Motion and a
bundler would introduce a build step between frozen evidence and the rendered
frame, which works against HAC-324's deterministic capture. Nothing here recorded
a failure that earns the dependency.

The boundary the comment protects is satisfied by construction: **zero
dependencies were added**, and the deterministic core remains testable without
any of this. Reopen if a concrete capture or comprehension failure earns it.

A comprehension failure was later found — the arm/evidence binding above — and
it did **not** earn the dependency, because it was a binding defect and the fix
was to bind correctly. Motion is used in exactly one place: switching between
frozen arms steps the three regions that actually change (evidence, decision,
outcome) so a reader sees which parts moved together. It uses the `il-step-in`
keyframe and the `--dur-*`/`--delay-step` tokens already in
`assets/tokens/motion.css`, plays once, settles, and is re-entrant because each
arm change re-renders. `prefers-reduced-motion` zeroes the durations and
hard-stops `[data-il-motion]` from the same token file, and `?static=1` disables
it independently, so a capture cannot catch a frame mid-transition.

The five-state gate sequence (`assets/logo/interlock-state-1..5.svg`) is
deliberately **not** used here. It encodes a review-then-open progression the
frozen packets never emitted — the same reason `phases.js` was rejected during
the identity port — and driving it from `WITHHOLD_SERIALIZE`, which withholds,
would imply a lifecycle this run does not have. The unreachable
`[data-gate="open"]` rule it left behind has been removed.

## Two documented colour limitations

**Decision and Effect share the executed hue** in the cloud class. The frozen
grammar has no ALLOW hue, and the only unused candidate is the authorization
green — which would assert a lifecycle these packets never emitted, and which
`verify-cockpit.mjs` refuses outright. The label, the glyph and the card order
carry the distinction instead. This is a limitation, recorded here rather than
resolved by inventing a semantic colour; `EXECUTED` and `OBSERVED` remain
separate fields and separate states regardless.

**The light COUPLED state was under the text contrast floor.** At L 0.58 it
measured **4.01:1** against the sunken light surface, below the 4.5:1 floor for
the 8.5–10px label and chip text that carries it. It is now L 0.52, measuring
**5.15:1** on sunken and **5.48:1** on card, with hue and chroma unchanged so
the state still reads as the same blue. The dark peer was already ~8.6:1 and was
left alone. `check-identity.mjs` pins the lightness and fails if hue or chroma
move without a fresh browser measurement, and fails if the cockpit's own
re-declaration drifts from the token.

Redundant glyph and stroke channels do not excuse insufficient text contrast —
the three-channel rule exists so state survives greyscale, not so colour can be
unreadable.

## Accessibility

Skip link; focusables in reading order, each with an accessible name; H1 → H2 →
H3 hierarchy, where the H1 is the proof class — the thing this page is about and
the thing that changes when you switch; `aria-pressed` on both toggles;
`aria-live` announces state changes; state carries a glyph and a text verdict,
never colour alone. Verified in a browser.

The evidence panel is **non-modal, by contract**. It was briefly implemented with
`showModal()` and a dimming backdrop, which made L1 inert and darkened the causal
column the panel exists to explain — the opposite of the intent stated under
Layers above. It is now an anchored `aside`: no backdrop, no focus trap, focus
moves in on open and **returns to the trigger** on close, Escape closes, an
explicit close control exists, and the run stays reachable by keyboard behind it.
The panel is `inert` only while closed.

## Verify

```sh
node media/hac-341/bin/build-view-model.mjs   # rebuild from frozen evidence
node media/hac-341/bin/verify-cockpit.mjs     # gate
```

This surface now binds twenty-four comparison cells into HAC-343, so the packet
those cells come from is verified in the same pass — `check:packet:eval` was
added to `pnpm run check`, ahead of `check:cockpit`, so the evidence is checked
before the surface that renders it. That gate builds first: unlike the other
packet verifiers, `experiments/hac-343/lib/arms.mjs` loads the compiled decision
core from `dist/`, so it cannot assume a clean checkout has one.

```sh
pnpm run check:packet:eval                    # HAC-343 packet, then the cockpit gate
```

The seam is proved in both directions in `test/hac-343-check-wiring.test.mjs`:
an invalid HAC-343 packet fails `check:packet:eval`, and a HAC-343 field moving
*underneath* the committed view model fails `check:cockpit`. One boundary is
pinned rather than assumed there — `check:packet:eval` reports an absent
`results.json` as *machinery verified; the experiment has not been executed* and
exits zero, which is correct for HAC-343 alone and insufficient for anything
binding to it. The cockpit gate is what refuses that case, and both run in
`check`.

The browser-level visual contract is separate because the deterministic package
does not carry a browser dependency. It measures both proof classes at
**1440×900** and **1280×800**: the local run must show its identity, causal
claim, all four stages, arm selector and verification actions; the cloud run
must show its lane-attributed path, decision/effect/observation, controls and
verification actions. Both retain 48px headroom. It also checks the purposeful
390×844 mobile first frame, horizontal overflow, drawer focus/escape behavior,
syntax-rendered raw proof, long recorded values and same-origin requests.

```sh
PLAYWRIGHT_MODULE=/tmp/il-capture/node_modules/playwright \
  pnpm run check:cockpit:visual -- --base http://127.0.0.1:4173
```

The gate fails on: either run gaining the other's fields; an arm total or
decision drifting from the frozen record; the baseline gaining a decision;
`EXECUTED` and `OBSERVED` collapsing; a changed negative control; wrong-audience
labelled as a cloud control; an evidence link on a branch; a fabricated
`runtimeSourceUrl` or `hac330VerifierUrl`; the source packet claimed as
published; silent substitution enabled; a missing degraded state; a HAC-319
metric; an unevidenced revision; a lost reduced-motion rule or substitution
refusal; storyboard/cockpit vocabulary divergence; and the evidence panel
becoming modal, acquiring a backdrop, losing Escape or its close control, or
making the run inert while open.

`scripts/check-identity.mjs` covers the identity half: the canonical mark
approximated in CSS, geometry drift, a font CDN appearing, a vendored face
failing its digest, the two surfaces resolving different identity authorities,
or a manifest citing an identity asset the repository lacks.

It also fails on: a selected arm rendering another arm's basis or coupling
count; a disabled arm drawn as coupled; the baseline compared against itself; an
arm whose recorded couplings contradict its own `decisionReason`; the perturbed
arm losing its changed-evidence report or sharing the default arm's basis; the
cockpit bypassing `lib/arm-view.mjs` or reading a basis off the environment
again; the proof switch naming a class from anything but its own `proofLabel`;
raw proof reacquiring a fixed `max-height`; the run no longer yielding space to
the panel; the copy control or its offline fallback disappearing; and any
looping animation.

**20 negative cases** were confirmed to fire on the original gate; the identity
and evidence-panel invariants add **16 more**, and the corrective pass adds
**17 more**, in `test/hac-341-identity-gates.test.mjs`.

The guided layer adds **71 tests** in `test/hac-341-guided-walk.test.mjs`: the
derivations directly, and **31 negative cases** proving each new gate bites —
emphasis paid for out of text opacity or a filter, emphasis that starts moving
the run between steps, a label returning to opacity or to the sub-floor grey, the
cloud field losing its muted tier, the cloud raw-proof surface un-following its
field, the walk failing to demote the persistent row, the handoff duplicating its
own actions, demotion dimming control text —
a held-constant marker that stops matching the arms, a perturbation that stops
perturbing, an entry that preselects a path, a step that hides the cockpit or
advances on its own, an arrow key that escapes its group, a second side panel,
a motion control that survives the system preference, an unbound cell dressed up
as a value, and a binding placeholder escaping the comparison scaffold.

The browser gate adds the guided walk, the ablation, the side panels, both
reduced-motion resolutions and a **320 CSS px** frame to the viewports it
measures.

## Downstream use — this is a verification surface, not the hero

The cockpit answers one judge question: *can I verify this?* It is not the
opening artifact, and a full-viewport screenshot of it is not a hero image.

**Do not** use an uncropped full-page cockpit capture as the primary README
image, the Devpost thumbnail, a social image, or the first thing a judge sees.
The hero is HAC-334's causal master `IL-PROOF-010`, or its five-second
derivative. The preferred order is:

```
causal visual  ->  concise explanatory copy  ->  cropped cockpit verification frame
```

A composed asset **may** crop the capture or place it inside a branded
deterministic frame. The cockpit pixels and content inside that frame must stay
unmodified, and the asset must identify it as a real capture rather than a
diagram — the run identity and the deep-link address it was captured from, so a
crop cannot drift into reading as a rendered claim.

Strongest crops, measured at 1440x900:

| Class | Region | Must survive the crop |
| --- | --- | --- |
| A · local | header through the actions row, first 852px | lockup, `CONTROLLED LOCAL EXPERIMENT`, checks 24/24, both intents, `COUPLED` with `joint bound <= 130`, `WITHHOLD_SERIALIZE`, and `140 > 130` beside `120 <= 130` |
| B · cloud | header through the controls row, ~top 650px | the lane-attributed path from Google to Interlock to protected target to independent observer, `ALLOW + receipt`, `EXECUTED`, `alpha=45`, `403 / 401 / 403`, and the not-on-the-recorded-path strip |

Both crops drop only unused canvas. The lane column in the cloud view is what
lets that crop stand alone: it answers *where does Google end and Interlock
begin* without the surrounding page.

The complete uncropped surface remains the underlying verification target and
the reproducible HAC-324 capture target. Emptiness below the fold is expected
there and is not a defect — this surface is read, not framed.

## Cold-read protocol — NOT YET RUN

The issue's acceptance requires real human falsification. **No human cold-read
has been performed and none is claimed.** The protocol below is prepared; the
results are not.

Deterministic URLs for testers:

```
L1 default      ?run=hac330-local&proof=local&state=run.local.treatment
baseline arm    ?run=hac330-local&proof=local&state=run.local.baseline
perturbed arm   ?run=hac330-local&proof=local&state=run.local.perturbed
cloud overview  ?run=hac340-cloud&proof=cloud&state=run.cloud.overview
missing run     ?run=nope&proof=local&state=run.local.treatment
```

Ask three readers, unprompted, no narration:

1. **5 s** — what problem is this about? *(target 3/3)*
2. **30 s** — what changed, and why? *(target 3/3)*
3. **60 s** — how would you check it yourself? *(target ≥2/3)*
4. **120 s** — after switching proof classes: is this one experiment or two? *(target ≥2/3)*
5. Any reader inferring Agent Runtime, Agent Gateway, or one combined experiment
   is a **failure**, regardless of the other scores.
6. Repeat 1–4 with `?static=1` and keyboard only; the semantic result must match.

Record verbatim answers. Do not summarise into a score without them.
