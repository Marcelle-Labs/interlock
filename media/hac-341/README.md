# HAC-341 — The Run

One pinned, frozen evidence object, rendered so a judge can answer *what changed
because Interlock existed?* before reading any architecture.

Not an observability dashboard, not a fleet view, not a live console, not a
simulation. Nothing here executes; every value is a recorded result.

## Files

| File | Role |
| --- | --- |
| `cockpit.html` | The Run. Renders the view model; derives no meaning of its own. |
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
no scrolling at all: two locally valid intents, the coupled shared environment
with `joint bound <= 130`, the deterministic decision, and `140 > 130` beside
`120 <= 130` as a direct comparison. The baseline stays on screen in every arm so
the delta is always visible.

**L2 — can I verify it?** An anchored drawer, so causal context survives.
Question-shaped actions only: *Verify this decision*, *Show me the raw proof*,
*What is not claimed?* Class A gets evidence attribution, coupling support, the
recorded arms, pinned upstream revisions and a deterministic
`hac330VerifyCommand`. Class B gets immutable evidence links, transport
provenance and application provenance **kept separate**, and runtime source.

**L3 — raw proof.** Digests, negative-control detail, teardown, the reserved
evaluation surface. Never the first layer.

## Arms are selected, not run

`Baseline arm` · `Treatment · original evidence` · `Perturbed evidence`. The rail
reads: *each arm is a recorded result; selecting an arm changes which recorded arm
is displayed; nothing is executed in the browser.* No "Run experiment", no
"Retry", no "Simulate".

The baseline arm shows *no decision — Interlock disabled*, because that arm has
no decision to show.

## Deep links

```
?run=<hac330-local|hac340-cloud>&proof=<local|cloud>&state=<semanticStateId>
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

**20 negative cases** were confirmed to fire on the original gate; the identity
and evidence-panel invariants add **16 more**, in
`test/hac-341-identity-gates.test.mjs`.

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
| A · local | header through the actions row, ~top 500px | lockup, `CONTROLLED LOCAL EXPERIMENT`, checks 24/24, both intents, `COUPLED` with `joint bound <= 130`, `WITHHOLD_SERIALIZE`, and `140 > 130` beside `120 <= 130` |
| B · cloud | header through the controls row, ~top 600px | the lane-attributed path from Google to Interlock to protected target to independent observer, `ALLOW + receipt`, `EXECUTED`, `alpha=45`, `403 / 401 / 403`, and the not-on-the-recorded-path strip |

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
