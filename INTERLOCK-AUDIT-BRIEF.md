# Interlock — UX Interaction & Visual Design Audit Brief

> **For an agentic browsing agent.** Untracked working document.
> Derived from Linear capabilities, not from the code. The point is to measure
> **specified vs. implemented** — the true delta.
>
> Delete with `rm INTERLOCK-AUDIT-BRIEF.md`.

---

## 0. READ THIS FIRST — three hard constraints

### 0.1 This audit is NOT a cold read and may never be reported as one

HAC-320, HAC-341 and HAC-335 all gate on a **real three-human-reader cold read**.
The HAC-341 receipt states verbatim: *"No synthetic or agent readers have been
run or counted."*

You are an agent. Your comprehension is **not** reader comprehension. You may
run the comprehension probes in **Part D** as a *defect-finding heuristic only*.

**Never** emit a 5s/30s/60s/120s pass-rate, never write "3/3", never imply a
cold-read threshold was met or missed. Doing so would corrupt an acceptance
criterion the project depends on. Report Part D findings as
*"comprehension risk"*, never as a score.

### 0.2 Read-only

Do not edit files, open PRs, change Linear, or "fix" anything. Produce findings.

### 0.3 Truth outranks aesthetics

This is an evidence-integrity product. A surface that looks worse but claims
less is **correct**. A surface that looks better but implies an unearned claim
is a **P0 defect**. When visual polish and claim boundaries conflict, the claim
boundary wins — always. Part C outranks Parts A and B.

---

## 1. Surfaces under audit

| Surface | URL | Notes |
| --- | --- | --- |
| **Cockpit** (primary) | `https://interlock.marcellelabs.io/media/hac-341/cockpit` | HAC-341 "The Run" |
| **Storyboard** | `https://interlock.marcellelabs.io/media/hac-333/storyboard` | HAC-333, 9 scenes, 30s muted |

**Known-broken, already fixed in an open PR — do not re-report as a finding:**
`/`, `/cockpit`, `/storyboard` currently 404 (`cleanUrls` + `.html` rewrite
destinations). Fix is in PR #27. If those paths work when you run, note it and
move on.

**Local alternative** if the domain is unavailable — serve the repo root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# http://127.0.0.1:4173/media/hac-341/cockpit.html
```

### 1.1 Deterministic deep links

Query strings survive the redirect. Append to the cockpit URL:

```
?run=hac330-local&proof=local&state=run.local.treatment    # default
?run=hac330-local&proof=local&state=run.local.baseline
?run=hac330-local&proof=local&state=run.local.perturbed
?run=hac340-cloud&proof=cloud&state=run.cloud.overview
?run=nope&proof=local&state=run.local.treatment            # refusal path
&static=1                                                  # settle motion
```

Eight degraded states via `?degraded=<id>`:
`run.loading` · `run.unavailable` · `run.missing` · `run.cloud.partial` ·
`run.evidence.invalid-link` · `pending-binding` · `evaluation.unbound` ·
`run.error`

### 1.2 Required viewports

`1280×800` · `1440×900` (primary) · `1920×1080` · `2560×1440`
Plus: **200% zoom**, **`prefers-reduced-motion: reduce`**, **keyboard-only**.

---

## 2. Capability register — the specification side

Every check traces to a capability. Cite the CAP id in every finding.

### From HAC-320 — judge experience

| ID | Capability |
| --- | --- |
| CAP-01 | The primary object is **one pinned frozen run**, not a dashboard or architecture diagram |
| CAP-02 | Proof-class switch **replaces the full run context**; never merges HAC-330 + HAC-340 into one synthetic timeline |
| CAP-03 | L1 answers *what changed because Interlock existed?* before any architecture |
| CAP-04 | L1 order: two independently valid intents → shared-environment coupling becomes **load-bearing** → Interlock's decision changes the outcome → baseline/treatment/perturbation bound to frozen arms |
| CAP-05 | Perturbation **switches among existing frozen arms**; never recomputes or invents state |
| CAP-06 | L2 exposes evidence bindings, decision attribution, run/proof class, receipt/action/observation **only where the selected run contains them**, negative controls, correlation, immutable links |
| CAP-07 | L3 exposes packet, receipt/log JSON, hashes, immutable links, architecture, limitations via progressive disclosure |
| CAP-08 | Every visible factual state comes from the selected run's machine-readable artifacts; **editorial framing is distinguishable from observed evidence** |
| CAP-09 | Motion never carries a claim absent from the static state; honours reduced motion; settles into inspectable hold states |
| CAP-10 | No visible claim exceeds the selected frozen run |

### From HAC-341 — cockpit specifics

| ID | Capability |
| --- | --- |
| CAP-11 | Question-shaped labels with strong information scent (`Verify this decision`), not generic `Learn more` |
| CAP-12 | Precise vocabulary with bounded glosses: coupling, withheld, receipt, observed, transport vs application provenance. **`EXECUTED` and `OBSERVED` never collapse** |
| CAP-13 | Overview + side-drawer detail so evidence drilldown **does not destroy causal context** |
| CAP-14 | Typed degraded states; judge mode never silently falls back to placeholder/design data |
| CAP-15 | Deep links: every address maps to a real state; invalid/missing IDs give an explicit unavailable state, **never a silent substitution** |
| CAP-16 | HAC-319 surface reserved but **no SPR or benchmark number rendered** |
| CAP-17 | Timeline lanes only where the artifact supplies actors/events; absent roles stay absent, never fabricated |

### From HAC-332 — identity, visual grammar, design system

| ID | Capability |
| --- | --- |
| CAP-18 | Distinct Interlock identity, visibly of the WorkspaceJSON ecosystem but **not** the workspace.json standard brand |
| CAP-19 | Avoids: shields, padlocks, robot heads, neural networks, cyberpunk, decorative network graphs, generic AI gradients |
| CAP-20 | Mark survives favicon and 16:9/video use; small-size legibility |
| CAP-21 | Design tokens govern typography, spacing, grid, radius, border/stroke, elevation, motion timing |
| CAP-22 | Semantic states **distinguishable without relying on colour alone** — three channels: label, glyph, stroke |
| CAP-23 | Edge/relationship grammar: intent, evidence, coupling, authorization, mutation, observation, refusal, bypass |
| CAP-24 | Node grammar: agents, evidence, Interlock core, receipt, protected target, verifier, Google runtime, external infra |
| CAP-25 | Reads as coordination-under-constraint at judge speed |

### From HAC-331 / HAC-334 — visual system & proof visuals

| ID | Capability |
| --- | --- |
| CAP-26 | **Behaviour change precedes architecture.** The causal result is the hero; architecture verifies after comprehension |
| CAP-27 | Cockpit is a first-class **proof surface**, not a generic dashboard; one evidence spine |
| CAP-28 | Quality floor: exceed the prior Tally/DataHub submission — typed proof, immutable links, explicit unavailable/failed states, cold-reader legibility. Improve by making **the run itself the visual object** rather than prose around a proof |
| CAP-29 | Every state legible with motion disabled |
| CAP-30 | Transport provenance (Cloud Run service accounts) never depicted as independent Google-managed identities for internal roles |

### From HAC-333 — storyboard

| ID | Capability |
| --- | --- |
| CAP-31 | Story order: intents → coupling → invalid joint state → Interlock decision → perturbation → **explicit proof-class transition** → cloud participation → architecture last |
| CAP-32 | No receipt/target/observer states inside HAC-330 scenes; no visual stitching of HAC-330 and HAC-340 into one continuous run |
| CAP-33 | Captions + reduced-motion equivalents; named semantic hold states |

---

## 3. Frozen facts — memorise these

Any deviation is a **P0**.

**Proof class A — controlled local experiment (HAC-330)**
- baseline `140 > 130` → invalid joint state
- treatment `WITHHOLD_SERIALIZE` → `120 <= 130`
- perturbed `ALLOW_PARALLEL` → `140 > 130`
- `24/24` checks
- treatment basis `eb67a6f5…`, coupling support `8/10`
- perturbed basis `db8a63ec…`, **no qualifying coupling**
- **owns no** receipt, protected target, observer, cloud runtime or Cloud Logging

**Proof class B — Google Cloud participation (HAC-340)**
- `gemini-3.5-flash` → Google ADK 1.35.1 / Vertex AI → Cloud Run (us-central1)
  → Interlock MCP proxy → `ALLOW` + receipt → protected mutation `EXECUTED`
  → independently authenticated read-back `OBSERVED alpha=45`
  → Cloud Logging correlation
- controls: forged identity header `403` · invalid bearer token `401` ·
  direct target bypass `403`
- revision `interlock-hac340-proxy-00002-wzf` is the **only** evidenced one
- **owns no** arms, environment evidence, constraints, checks or bounded outcome

**Never claimed anywhere:** `AUTHORIZED` as an evidenced state · Agent Runtime
or Agent Gateway success · `CONTENT_AUTHZ` on the path · cloud reproduction of
the HAC-330 counterfactual · wrong-audience as a *cloud* result (it is local
parity) · exactly-once · production readiness · fleet scale · any HAC-319 metric.

---

## 4. PART A — UX interaction audit

For each check: **procedure → observed → expected (CAP) → verdict → severity**.

### A1. First-object read (CAP-01, CAP-03, CAP-26, CAP-27)
Load default cockpit at 1440×900. Before scrolling or interacting, record: what
is the largest element? What does the eye land on first, second, third? Is the
primary object recognisably *one run*, or a dashboard of cards?
**Flag** if architecture, metadata or chrome outranks the causal result.

### A2. Causal chain legibility (CAP-04)
Can the chain *intents → shared coupling → decision → outcome* be traced
visually without reading every label? Record the eye path. Note where it breaks,
reverses or jumps.

### A3. Arm switching as causal interaction (CAP-05)
Cycle baseline → treatment → perturbed. For **each** arm capture: environment
evidence text, presence/absence of a `COUPLED` state, decision token, outcome
card(s).
**Critical:** confirm the environment evidence *changes with the arm*. If any
two arms show identical evidence while decisions differ, that is a **P0**.
Confirm nothing implies browser recomputation.

### A4. Perturbation teaches falsification (CAP-05, CAP-04)
On the perturbed arm: is it obvious that *the evidence changed* and that the
evidence is load-bearing? Is that lesson prominent, or buried in small
low-opacity text? Record type size and opacity of wherever the lesson lives.

### A5. Baseline arm coherence
Select baseline. Is anything compared against itself? Is the absence of a
coordinated result explained? Is access to other arms preserved?

### A6. Proof-class switch (CAP-02)
Switch local ↔ cloud ↔ local. Verify: the entire run context is replaced; the
field inverts; **zero** artifacts of the other class remain in the DOM. Search
the DOM after switching for `140 > 130`, `WITHHOLD_SERIALIZE`, `24/24`,
`alpha=45`, `EXECUTED`, `gemini`. Any cross-class leak is **P0**.
Is it unmistakable these are two different runs, not one continuous one?

### A7. L2 preserves causal context (CAP-13)
Open each of the three L2 actions in both classes. While open, measure whether
the L1 result region is still visible and readable. Record the geometry: does
the panel overlap the run? Test at 1280×800, 1440×900, 1920×1080.
Confirm **non-modal**: no backdrop, no focus trap, Escape closes, explicit close
control, focus returns to the opener, the run stays keyboard-reachable behind.

### A8. L3 raw proof usability (CAP-07)
Open raw proof in both classes. Is the full content reachable? Is any code block
clipped while empty panel space sits below it? Do copy controls exist, work, and
show a copied state? Does copy alter the evidence text? (It must not.)

### A9. Information scent (CAP-11)
List every actionable label. Are they question-shaped with strong scent, or
generic? Flag any `Learn more`-class label.

### A10. Deep links and refusal (CAP-15)
Test each address in §1.1 including `?run=nope`. Confirm: every valid address
renders its state; every invalid one renders an explicit unavailable state that
**echoes what was requested** and refuses substitution. Confirm the canonical
run is never silently shown instead.

### A11. Degraded states (CAP-14)
Visit all eight. For each: is the condition named? Is a forbidden inference
stated? Is identity preserved? Is a next verification action offered? Does any
of them imply success?

### A12. Motion contract (CAP-09, CAP-29)
Trigger every transition. Does motion settle into an inspectable state? Any
looping, ambient movement, particles, typewriter, fake telemetry, or
"agent thinking" cues? Then set `prefers-reduced-motion: reduce` and repeat —
**the semantic result must be identical**. Then `&static=1` and confirm the same.

### A13. Keyboard-only path
Complete every task with the keyboard alone: switch proof class, switch all
arms, open and close all three panels, reach every link. Record tab order,
focus visibility, focus return, any trap, any unreachable control.

### A14. Responsive integrity
All four viewports. Record: horizontal scroll (must be none), clipping,
truncation, overlap, whether the causal order survives, whether large numerals
stay legible, and whether any factual element disappears purely for space.

### A15. Storyboard interaction (CAP-31, CAP-33)
Load the storyboard. Verify the nine-scene order, the explicit proof-class
transition at SB-06, captions present, reduced-motion equivalents, and named
hold states. Confirm no HAC-330 scene shows receipt/target/observer states.

---

## 5. PART B — visual design audit

### B1. Identity (CAP-18, CAP-19, CAP-20)
Is the mark present, canonical, and legible at header size? Does it read as
WorkspaceJSON-ecosystem-adjacent without being the standard's brand? Screenshot
the mark at 100% and downscaled to 16px. Check the favicon. Flag **any** of the
forbidden motifs (CAP-19).

### B2. Typographic hierarchy (CAP-21)
At 1440×900, record computed `font-size`/`weight` for: brand wordmark, proof
class heading, run metadata, editorial verdict, section headings, intent
headings, constraint/bound, decision token, outcome numerals, helper text.
Build the actual type scale. Then judge: does the hierarchy encode
**mechanism vs consequence** correctly? The outcome numerals must dominate the
decision token. Report the measured ratio.

### B3. Semantic state system (CAP-22)
Enumerate every state rendered on both surfaces. For each, confirm **three
channels**: text label, glyph, and stroke/border treatment — not colour alone.
Then re-render in greyscale (or simulate achromatopsia) and confirm every state
is still distinguishable. Any colour-only state is a **P1 accessibility defect**.

Grammar declares: `local` `coupled` `blocked` `review` `authorized` `executed`
`observed` `failed`. **`authorized` and `review` must NOT appear** on the
cockpit — the frozen packets never emitted them. Their presence is **P0**.

### B4. Edge & node grammar (CAP-23, CAP-24)
Are relationships drawn with a consistent edge vocabulary (intent, evidence,
coupling, authorization, mutation, observation, refusal, bypass)? Are node
classes visually distinct? Or are relationships conveyed by proximity alone?

### B5. Colour semantics
Record every semantic hue and what it denotes. Confirm no hue is used merely to
mean "good". Specifically check whether `DECISION` and `EFFECT` share a hue —
if so, confirm it is **documented as a limitation** rather than asserting that
a decision equals an effect. Confirm green (`authorized`) appears nowhere.

### B6. Layout, density, composition (CAP-27, CAP-28)
At each viewport record content height vs viewport height and the resulting
empty field. Judge whether the composition reads as authored or unfinished.
**Note:** the project explicitly declares emptiness below the fold *expected*
("this surface is read, not framed"). Do not report it as a defect on its own —
report only whether the composition reads as *deliberate*.

### B7. Evidence density (CAP-28)
Does the surface read as a designed product or as a debug/forensic harness?
Be specific: name the elements that push it either way.

### B8. Dark/light parity
Local class is light, cloud class is dark. Check contrast ratios for text and
semantic hues in **both** fields. Flag any hue under-lit on the dark ground.

### B9. Font loading
Confirm Geist and Geist Mono actually render (not a fallback). Check
`document.fonts.check()`. Confirm **zero** external font requests — block the
network and confirm the page still renders correctly. Any CDN font is **P0**.

### B10. Storyboard visual system parity
Does the storyboard use the same tokens, grammar and identity as the cockpit, or
has it drifted into a second visual language?

---

## 6. PART C — truth & claim-boundary audit *(highest stakes)*

Run this **adversarially**. You are trying to find a way to read the surface
that claims more than the evidence supports.

### C1. Cross-class contamination
Per §4/A6. Any HAC-330 artifact in a cloud view, or any HAC-340 artifact in a
local view, is **P0**.

### C2. Forbidden vocabulary sweep
Search all rendered text on every state for: `AUTHORIZED`, `VERIFIED`,
`exactly-once`, `Agent Runtime`, `Agent Gateway`, `CONTENT_AUTHZ`, `SAFE`,
`guaranteed`, `production-ready`, `secure`. For each hit, confirm it appears
**only** inside an explicit negation or claim-boundary list.

### C3. Frozen-value drift
Verify every value in §3 renders exactly. Any drift is **P0**.

### C4. Editorial vs evidence (CAP-08)
Is editorial framing visibly marked and distinguishable from observed evidence?
Could a reader mistake an editorial sentence for a machine-read fact?

### C5. Absence handling (CAP-06, CAP-17)
Confirm HAC-330 shows **no** receipt/target/observer/cloud fields, and HAC-340
shows **no** arms/outcome/checks. Confirm absent fields are stated as *absent*,
not rendered empty or zero.

### C6. HAC-319 reserved surface (CAP-16)
Confirm the evaluation surface renders labels only — no SPR, precision, recall,
false-block rate, useful-concurrency, no value, no mark, no proportional
geometry.

### C7. Link integrity
Every evidence link: confirm it is pinned to a 40-hex commit SHA, **never** a
branch/`main`/`HEAD`. Fetch each **logged out** and confirm it resolves.
Confirm `runtimeSourceUrl` renders as unavailable/non-public and no URL is
fabricated for it.

### C8. Provenance separation (CAP-30)
Confirm transport provenance and application provenance are visibly separate.
Confirm internal Interlock roles are not depicted as Google-managed identities.

### C9. Offline integrity
Disable the network after load. Reload from cache / re-render. Confirm the
surface still renders correctly with **zero** external runtime dependencies.

---

## 7. PART D — comprehension risk probes *(NOT a cold read — see §0.1)*

Approach each fresh, without reading the code. Record your *first* reading and
where it was ambiguous. Output **risk observations**, never scores.

1. At a glance: what problem is this about?
2. Within a short read: what changed, and why?
3. How would you verify it yourself?
4. After switching proof class: is this one experiment or two?
5. **Falsification probe:** is there any reading under which you would conclude
   Agent Runtime/Gateway participated, or that the counterfactual ran on Google
   Cloud? Describe the path to that misreading if one exists.

Probe 5 is the most valuable output of Part D. A single plausible path to that
misreading is a **P0 comprehension risk**.

---

## 8. Severity model

| | |
| --- | --- |
| **P0** | Factual/claim-boundary violation, cross-class contamination, frozen-value drift, or a comprehension failure that could mislead a judge about what was proven |
| **P1** | Materially degrades comprehension, accessibility, or product credibility |
| **P2** | Polish; limited comprehension impact |
| **P3** | Taste |

Also tag each finding: **effort** SMALL/MEDIUM/LARGE, and **risk**
LOW (presentation-only) / MEDIUM (interaction, a11y, responsive) /
HIGH (touches evidence semantics, view model, or proof boundaries).

**Never recommend a HIGH-risk change casually.**

---

## 9. Required output — the delta

### 9.1 Capability delta table (the headline)

One row per CAP-01…CAP-33:

| CAP | Capability | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| CAP-04 | L1 causal order | MET / PARTIAL / NOT MET / NOT VERIFIABLE | screenshot + measurement | what's missing |

`NOT VERIFIABLE` is a legitimate verdict — use it rather than guessing.

### 9.2 Findings

Ranked P0 → P3. Each must carry: CAP reference, surface + URL + viewport,
**procedure to reproduce**, observed vs expected, screenshot, severity, effort,
risk. **No finding without evidence.** If you cannot reproduce it, drop it.

### 9.3 Required sections
- Executive delta: how far implementation sits from specification, per capability family
- UX interaction findings (Part A)
- Visual design findings (Part B)
- Truth & claim-boundary findings (Part C) — **lead with these if any exist**
- Comprehension risks (Part D) — clearly labelled as risks, not scores
- What is genuinely strong (be specific; do not pad)
- Recommended bounded next pass: the minimum set worth doing

### 9.4 Explicitly out of scope — do not report
- The `/` `/cockpit` `/storyboard` 404 (fixed in PR #27)
- Empty field below the fold as a defect in itself (declared expected)
- Requests to add frameworks, dashboards, widgets, or decorative animation
- Anything requiring new evidence to exist

---

## 10. Anti-patterns for the auditing agent

- **Do not trust the surface's own prose.** It says it is evidence-bound; your
  job is to test that, not to repeat it.
- **Do not confuse "documented" with "correct."** A documented limitation is
  still a limitation — report it, and note that it is disclosed.
- **Do not propose the fix as the finding.** Report the defect; a one-line
  suggested direction is fine, a redesign is not.
- **Do not reward density.** More evidence on screen is not better if it buries
  the causal claim.
- **Do not penalise restraint.** Absent fields, refusals and "not claimed" lists
  are features here, not gaps.
- **Do not score the cold read.** See §0.1.
