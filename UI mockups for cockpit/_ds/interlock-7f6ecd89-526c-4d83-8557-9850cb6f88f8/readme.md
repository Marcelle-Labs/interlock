# Interlock — Design System

The production design system for **Interlock**: controlled coordination for safe,
reliable AI-assisted change. Independent paths, shared constraint, authorized
execution.

This repository is the canonical, source-editable implementation of the identity
frozen in **HAC-332**. Downstream surfaces — README, cockpit, architecture
boards, Devpost, demo video, social — consume these assets. They do not redraw
them and they do not invent visual rules.

> **Namespace:** components are exposed at `window.WorkspaceJsonDesignSystem_b8d83c`.
> (The namespace string is the compiler's stable project identifier, inherited when this
> project was re-pointed from the workspace.json kit. It is a build detail, not a brand claim.)
> **Entry stylesheet:** consumers link `styles.css` (imports every token file).

---

## Relationship to workspace.json

workspace.json is the parent **standard**. Interlock is a **product** built on it.
The two belong to one engineering culture and must not read as one brand.

**Inherited (structure, not appearance):** repository layout, token architecture,
component + `.d.ts` + specimen-card convention, deterministic SVG sources,
evidence-first writing, RFC-plain register, no emoji, no decorative complexity.

**Deliberately different:** Interlock is **achromatic**. The mark is ink on paper
or paper on ink, with no brand hue at all; colour is spent only on semantic
state. workspace.json is dark-first with an emerald accent, Interlock is
light-first with none. Radii are near-zero where workspace.json is pill-and-14px.
The sans is Geist, not Plus Jakarta Sans. **Geist Mono is shared** — that is the
one intentional family resemblance.

`reference/` holds the workspace.json material this system was studied against.
It is reference, not inheritance: nothing in `reference/` is part of Interlock.

**GTM-38 applies.** The workspace.json kit still names the bare `.json` mark as
primary while the lockup in circulation is the full `workspace.json` wordmark.
That defect was not propagated here: Interlock's primary mark is the **horizontal
lockup** (symbol + wordmark), and every placement rule in this system is stated
in terms of the symbol's own `x` unit, so it stays satisfiable at any aspect
ratio. Symbol-only use is a named variant with its own rule, never a fallback
for the primary.

---

## Content fundamentals

- **Register:** technical, precise, consequential. Short declarative sentences.
- **Casing:** the product name is capitalised — `Interlock`. `workspace.json`
  stays lowercase. State names are set in mono caps: `AUTHORIZED`, not "authorized".
- **Punctuation:** no em dashes. Colons, commas, parentheses.
- **Framing:** causal, not promotional. Say what fails, what intervenes, what is
  recorded. Never claim an outcome that has no receipt behind it.
- **Emoji:** none.
- **Numbers:** always mono, always sourced. A number with no source renders in
  the unbound specimen style, by design (`MetricCard`, `Caption`).

---

## Identity

The mark is a frozen geometry family: four independent trajectories converging
on a single central gate with a controlled aperture. The gate is one mechanism
made of two precision leaves. It is **closed by default** and opens only when
something has been authorized.

**Do not** redraw the paths, re-angle the trajectories, round the terminals, add
a hue to the mark, or open the gate decoratively.

One secondary lockup was tested and **rejected**: `Inter [mark] lock`, with the
symbol substituted for the letter. Set between two lowercase runs the mark takes a
letter's position and reads as *Inter × lock*, breaking a one-word name into two, and
below 18px the gate collapses into the letterforms. The sequence survives as a
**motion device for the video opener only** — the two halves separated, the gate
arriving, the gate opening, the word closing into the canonical lockup — because it
resolves to the canonical lockup and never rests in the substituted state. See the
**Secondary lockup test** card.

### Lockups

| Variant | File | Use |
| --- | --- | --- |
| Primary (horizontal) | `assets/logo/interlock-lockup-horizontal.svg` | Default everywhere the name is needed |
| Compact (stacked) | `assets/logo/interlock-lockup-compact.svg` | Narrow columns, square crops, end cards |
| Symbol | `assets/logo/interlock-symbol.svg` | Favicon, avatar, nav at ≥16px |
| Micro | `assets/logo/interlock-micro.svg` | **12px and below only** |
| Gate open | `assets/logo/interlock-symbol-open.svg` | Authorized-state moments only |
| Favicon / app icon | `assets/logo/interlock-favicon-*.svg`, `-appicon-*.svg` | Tabs, installed icons |
| Motion states | `assets/logo/interlock-state-1..5.svg` | The five-state strip, and the reduced-motion fallback |

Monochrome black and white files exist for every lockup. The mark never appears
in a colour other than ink, paper, or pure black/white.

### Sizing and clear space

`x` is the height of the central gate: **0.325 × the symbol height**. Clear space
on all four sides is `x`. Nothing crosses it.

- ≥16px: symbol. Below 16px: switch to the micro variant, which fuses the gate
  to the trajectories and widens the aperture so the mechanism survives.
- Navbar 24px, README 64px, hero 96px (`--logo-nav`, `--logo-readme`, `--logo-hero`).

---

## Foundations

| File | Contains |
| --- | --- |
| `tokens/fonts.css` | Geist, Geist Mono |
| `tokens/colors.css` | Neutral ramp, light + dark themes, eight state hues |
| `tokens/typography.css` | Families, weights, scale, line-height, tracking |
| `tokens/spacing.css` | 4px spacing scale, radii, stroke widths, grid, logo sizing |
| `tokens/effects.css` | Elevation (four steps, used sparingly), focus ring, engineering grid |
| `tokens/motion.css` | Durations, easings, stage delays, keyframes, reduced-motion |
| `tokens/grammar.css` | State, edge, and node grammar as tokens |

### Layout grid

Twelve columns, 32px margins, 24px gutters, 1216px maximum. Column width is always
derived, never authored:

```
col = (min(viewport, --width-wide) - 2 × margin - (n - 1) × gutter) / n
```

Columns halve at the breakpoints rather than reflowing: 12 above 1024px, 8 from 640
to 1023, 4 below 640, with margins 32 / 24 / 16 and gutters 24 / 16 / 16. Every
authored value is a step on the 4px scale, so horizontal and vertical rhythm cannot
drift apart. Column width is derived from the available geometry and is not expected
to land on the scale: at the 1216px maximum it is 74px. Spans are stated in columns,
never in pixels. The **Layout grid** card
carries the live grid, the breakpoint table, and the span patterns for the README
hero, OG, Devpost, architecture, and proof-card layouts.

Light is the default theme; set `data-theme="dark"` on `<html>` for the peer.
Both are full citizens: every specimen card in this system is checked in both.

---

## Semantic states

Eight states, each carried by **three channels** — colour, glyph, and stroke
behaviour — so the system survives greyscale, projection, and colour-vision
deficiency. The table lives in `components/_util/states.js` and must not be
extended locally.

| State | Glyph | Stroke | Means |
| --- | --- | --- | --- |
| `LOCALLY VALID` | ∙ | dashed hairline | Valid in its own scope. Nothing coordinated yet. |
| `COUPLED` | ⧉ | solid 1.5 | Two or more actions now share a constraint. |
| `BLOCKED` | ‖ | solid 2 | Passage refused. The gate is closed. |
| `JOINT REVIEW` | ⚇ | dashed 2 | Held pending a decision no single party can make. |
| `AUTHORIZED` | ⫼ | solid 2 | The gate opened. Passage permitted, not yet taken. |
| `EXECUTED` | ⦿ | double 3 | The mutation was committed. |
| `OBSERVED` | ◎ | dotted 1.5 | Independently witnessed by a party that cannot authorize. |
| `FAILED` | ✕ | solid 2 | Terminal. No further passage. |

---

## Relationship grammar

Eight edge types (`components/_util/edges.js`). Pattern carries the meaning;
colour is optional emphasis. A reader should name the relationship from the line
before reading its label.

`intent` dashed → open chevron · `evidence` dotted → dot · `coupling` solid,
bar at both ends, no direction · `authorization` heaviest solid → gate terminal ·
`mutation` solid → filled arrow · `observation` sparse dotted → hollow ring ·
`refusal` solid → stop bar · `bypass rejected` dashed → cross.

## Node grammar

Eight node classes (`components/_util/nodes.js`), each owning one border
treatment and one glyph: agent, workspace.json evidence, Interlock core,
receipt, protected target, independent verifier, Google runtime, external
infrastructure. The visual class is fixed here; **the facts inside a node must
come from evidence-bound architecture**, never from this system.

---

## Motion

The logo's primary motion primitive preserves the five-state causal model:
independent trajectories → shared constraint detected → coupling at the boundary
→ authorization pause with a visible gate state change → synchronized passage.

One cadence table drives every animated asset: `tokens/motion.css` holds the
durations and easings, `components/motion/phases.js` repeats them in ms because a
timer cannot read a custom property, and `MotionSpec` renders the table so a
reviewer can check a video against the spec instead of against taste. A full pass
is 3.46s.

Three rules follow from the model and are not negotiable. **The pause is felt:**
phase 04 holds 700ms (`--dur-hold`) with nothing moving, and is never shortened to
tighten a cut. **The gate changes state before anything crosses:** passage never
begins in the frame the aperture opens, or the asset is claiming that
authorization is a formality. **Rest is closed:** the gate re-arms after passage
and no asset rests opened or substituted, the end card excepted, where something
has demonstrably been authorized and executed.

Nothing loops. Every animated asset ships a reduced-motion equivalent:
`GateSequence` is the static strip that shows all five stages at once,
`assets/logo/interlock-state-1..5.svg` are its file-level counterparts, and every
video export has a `-static` counterpart on the same registry ID.

| Asset | Component | ID |
| --- | --- | --- |
| Logo stinger, and the `Inter [mark] lock` opener device | `GateStinger` | `IL-MOT-002` |
| Title-card transition (staged in, gate wipe out) | `TitleCardMotion` | `IL-MOT-003` |
| End-card motion (held, then opened) | `EndCardMotion` | `IL-MOT-004` |
| README animation, 1280 × 400 | `GateStinger` | `IL-MOT-005` |
| Square social cut, 1080 × 1080 | `GateStinger` | `IL-SOC-001` |

Motion components animate the canonical paths, published as `LOGO_GEOMETRY` in
`components/brand/Logo.jsx`. The mark is never redrawn to move. Capture geometry,
formats, and the review checklist are in `docs/motion.md`; the capture stage is
`templates/motion/`.

---

## Components

Twenty-two, in seven directories. Consume via `const { X } = window.WorkspaceJsonDesignSystem_b8d83c`.

**Brand** — `Logo`, `GateSequence`
**Motion** — `GateStinger`, `TitleCardMotion`, `EndCardMotion`, `MotionSpec`
**Actions** — `Button`
**Data display** — `StateChip`, `StateCard`, `ReceiptCard`, `MetricCard`, `Badge`, `Card`
**Diagram** — `ArchNode`, `Edge` (+ `EdgeDefs`), `Legend`, `Timeline`
**Content** — `CodeBlock`, `ComparisonPanel`, `Caption`
**Feedback** — `Callout`
**Scaffolds** — `Scaffold` (README hero, OG, Devpost, video title, video end, social)

Two components refuse to launder a claim: `MetricCard` and `Caption` render in
an unbound specimen style whenever `source` is absent, so an illustrative figure
cannot pass for evidence.

---

## Templates

`templates/readme/`, `templates/architecture/`, `templates/exports/`,
`templates/motion/`, `templates/shell/`, `templates/slide-masters/`, `templates/deck/`
are starting folders a consuming project copies. Each loads the system through `ds-base.js`.

### Architecture and proof shells

Four shells implement design-now, bind-later: the container is drawn once and
accepts factual output without being redrawn. Unresolved fields are written as
`[bind: key]` in mono, which is a visible defect, not a placeholder that can pass
review.

| Folder | Carries | Classification |
| --- | --- | --- |
| `templates/arch-conceptual/` | The four-band causal model: independent paths, shared constraint, authorization pause, controlled passage. Concept language only. | brand-only |
| `templates/arch-production/` | Deployment topology: four trust zones, boundary-crossing table, unbound service slots. | evidence-bound once filled |
| `templates/proof-cards/` | Receipts (authorized, refused, executed, empty), metric rows unbound and bound, mechanism comparison, run trace, state cards. | specimen |
| `templates/diagram-primitives/` | All eight states, relationships and node classes, the unbound node slot, and the three legends. | brand-only |

A slot keeps its node class while unbound, so a board reads correctly on trust
boundaries before any fact arrives. Only the label and sub-label change on binding.

### Judge cockpit

`templates/judge-cockpit/` carries **The Run**, the pinned-run judge verification surface for
HAC-341: one frozen evidence object at a time, in three progressive-disclosure layers (what
changed, can I verify it, show me the raw proof). Proof class A (the HAC-330 controlled local
experiment, on paper) and proof class B (the HAC-340 Google Cloud participation record, on ink)
are **atomic contexts**: switching class replaces run identity, lanes, facts, evidence and claim
boundary, and nothing crosses. Nineteen named states, typed degraded states, and unresolved
`[BIND: …]` values rendered as visible defects. Design authority is `docs/hac-341-cockpit.md`;
the machine-readable state, deep-link and capture contract is `cockpit/state-manifest.json`.

### Proof visual suite

`templates/proof-suite/` carries the nine canonical **evidence-bound architecture and proof
masters** for HAC-334, at 1920 × 1080, plus three fast-read variants. Proof class A (the HAC-330
controlled local experiment) renders on paper, proof class B (the HAC-340 Google Cloud
participation record) on ink, and the two never share a run identity, timeline, revision or
receipt. Each board states its judge question, its evidence classification and its non-claims on
the board itself. Platform/transport provenance is drawn dashed and application/receipt
provenance solid, and the two never collapse. Design authority is `docs/hac-334-architecture.md`;
the machine-readable handoff manifest is `architecture/visual-manifest.json`. There is one
canonical static master per visual: motion, crops and simplifications are derivatives that may
not add a node, change the causal structure, or move the claim boundary.

## Judge-facing shell

The surfaces a judge meets before anyone explains anything are composed in
`templates/shell/Shell.dc.html` at true export geometry, and the presentation
layouts in `templates/slide-masters/SlideMasters.dc.html`.

| Surface | Row | Class |
| --- | --- | --- |
| README hero, 1280 × 400 | `IL-SCAF-001` | brand-only |
| OG / social card, 1200 × 630 | `IL-SCAF-002` | brand-only |
| Devpost thumbnail, 1200 × 675 | `IL-SCAF-003` | specimen |
| Video title card, 1920 × 1080 | `IL-SCAF-004` | brand-only |
| Video end card, 1920 × 1080 | `IL-SCAF-004` | **evidence-bound** |
| Square social, 1080 × 1080 | `IL-SCAF-005` | brand-only |
| Slide masters, 1920 × 1080 × 8 | `IL-SCAF-006` | brand-only; diagram, receipt and closing masters evidence-bound |

Copy on these surfaces is either product-thesis language with no measured
outcome behind it, or visibly labelled specimen. No metric, screenshot or
architecture fact appears on any of them. The end card and the closing master
rest with the gate open, which asserts that something was authorized and
executed: they are blocked until the run is recorded in their registry row.

---

## Export naming

```
IL-{FAMILY}-{NNN}-{slug}[-{variant}][-{W}x{H}][-r{NN}][-run{ID}].{ext}
```

Frozen. Filenames are **built from the registry**, not typed: `buildExportName()` in
`assets/naming.js` composes them, `validateExportName()` parses them from the right,
and `auditExports(names, registry)` checks a whole export folder against
`assets/registry.json` in one pass. The prefix `IL-{FAMILY}-{NNN}` is the registry ID
verbatim, so an export that is not a registry row fails the audit no matter how well
formed it looks. Full rules and the family codes are in `docs/export-naming.md`; the
**Export naming** card shows the validator accepting and refusing real candidates.

## Asset registry

`assets/registry.json` is the auditable inventory: asset ID, purpose and the
judge question it answers, source, formats, target surfaces, dimensions,
reduced-motion equivalent, proof dependency, run/revision, **classification**,
supported claim, status, provenance, and IP/licence notes. Anything shipped to a
judge-facing surface must have a row.

Classification is one of three values, defined in `schema.classification`:
**brand-only** (identity and product-thesis language, ships without a run),
**specimen** (visibly labelled placeholder copy, replaced before it reaches a
judge), **evidence-bound** (carries or asserts something that happened, blocked
until the run is recorded). The **Surface classification** card reads the current
values straight out of the registry.

---

## Validation

`validation/hostile-contexts.html` renders the mark and the state system in the contexts that
actually break identities: browser tab at 16px and 12px, docs sidebar, GitHub header, application
navbar, mobile tab bar, dark mode, 16:9 video frame, Devpost tile, and a greyscale state read.
Every size in it is a true raster size, not a scaled mockup.

`docs/collision-check.md` records the similarity reconnaissance, its limits, and the accessibility
findings.

## Guardrail

Generated imagery is permitted for atmosphere and illustrative metaphor only.
Factual architecture, metrics, system state, execution evidence, product labels,
screenshots, and proof stay deterministic and evidence-bound. Where they
conflict, factual truth wins and the image is cut.

---

## Index

```
styles.css              Entry point — @imports all tokens (link THIS)
tokens/                 fonts · colors · typography · spacing · effects · motion · grammar
assets/logo/            Canonical vector family (20 files) + _proof.html
assets/registry.json    Auditable asset registry
components/
  brand/                Logo, GateSequence
  motion/               GateStinger, TitleCardMotion, EndCardMotion, MotionSpec, phases.js
  data-display/         StateChip, StateCard, ReceiptCard, MetricCard, Badge, Card
  diagram/              ArchNode, Edge, Legend, Timeline
  content/              CodeBlock, ComparisonPanel, Caption
  feedback/             Callout
  scaffolds/            Scaffold
  _util/                states.js · edges.js · nodes.js · styles.js
assets/naming.js        Export filename builder, validator, and registry audit
guidelines/             Specimen cards (identity, colour, type, space, grid, grammar, classification)
cockpit/                HAC-341 cockpit state, deep-link and capture manifest
architecture/           HAC-334 proof-visual handoff manifest
docs/hac-341-cockpit.md The judge cockpit design authority (The Run)
docs/hac-334-architecture.md  The proof visual suite design authority (nine masters)
docs/export-naming.md   The frozen export filename convention
docs/motion.md          The motion system: cadence, assets, reduced motion, capture
validation/             Hostile-context harness: tab, sidebar, GitHub, navbar, mobile, greyscale
docs/collision-check.md Similarity reconnaissance and accessibility findings
templates/              Copyable starting folders
reference/              workspace.json material studied against. Not part of Interlock.
```
