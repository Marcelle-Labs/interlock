# Interlock Judge Experience + Semantic Motion Brief

## Purpose

Make a frozen Interlock run understandable, relevant, and independently inspectable to a competent professional without weakening technical rigor. This is not onboarding, a simulated run, or a cinematic demo. Every revealed or animated state must map to a recorded artifact, decision, relationship, or limitation.

## Grounded audit

### Scope

- Live cockpit: `https://interlock.marcellelabs.io/media/hac-341/cockpit`
- Controlled local causal proof: HAC-330
- Google Cloud participation proof: HAC-340
- Frozen utility and baseline comparison: HAC-343
- Existing charcoal shell, design system, motion grammar, and supplied cockpit mockup

### Current strengths

- The Local surface already contains a truthful four-stage spine: locally valid inputs, revision-bound evidence, coordination decision, bounded outcome.
- The selected arm is explicitly recorded rather than recomputed, and the browser disclaimer is visible.
- Original and perturbed arms prove a causal relationship: evidence changes, the decision flips, and the bounded outcome changes.
- Verification and raw proof open as secondary layers while preserving the cockpit.
- Local causal proof and Google Cloud participation remain separate atomic contexts.
- The Google surface clearly distinguishes decision, executed effect, independent observation, correlated logs, and negative controls.

### Primary risks

1. **The causal spine is present but not yet the dominant first-read experience.** A judge can see all four stages at once, but must assemble their relationship.
2. **Evidence ablation is discoverable rather than taught.** “Perturbed evidence” is technically accurate but does not guarantee the judge anticipates the decision and outcome flip.
3. **The initial protagonist competes with several candidates.** The evidence panel, decision, outcome, arm selector, and proof-class selector all request attention.
4. **Terminology arrives before motivation.** “Revision-bound,” “coupling support,” and `WITHHOLD_SERIALIZE` are credible but increase the first-exposure decoding cost.
5. **HAC-343 alternatives need a deliberate comparison path.** They should not become four equally weighted cards dumped onto the opening screen.
6. **Google Cloud is legible as participation proof, but it is a different argument.** It must never appear to extend or replace the controlled local causal claim.

### Audit verdict

Do not redesign the information architecture. Add an optional judge-first inspection layer over the existing cockpit. Its job is to control emphasis and sequence, not hide, summarize away, or recompute evidence.

## Three interaction models

### A. Guided proof walk

**First five seconds:** A binary choice appears inside the existing shell: “Walk the proof” and “Explore freely.” Choosing the walk focuses on two independently valid intents while the rest of the cockpit remains spatially present but quiet.

**First 30 seconds:** The experience advances through local validity, shared constraint, evidence, decision, outcome, alternatives, ablation, then verification.

**Motivation:** Each step resolves one question and creates the next: valid alone, unsafe together, how Interlock knows, what it decides, whether evidence caused the decision.

**Autonomy:** Optional at entry, skippable at every step, reversible, and never locks direct cockpit controls.

**Trust:** Strong if each step displays the exact recorded state and persistent frozen-state label.

**Verification:** Introduced after the causal thesis and ablation are understood.

**Failure modes:** Can feel like generic onboarding; risks excessive narration; may frustrate experts; sequential transitions could imply live computation.

**Accessibility:** Requires robust focus management, progress announcement, pause, back, skip, and reduced-motion alternatives.

**Deadline complexity:** High. More states, routing, focus behavior, QA paths, and copy.

### B. Contextual exploration

**First five seconds:** The complete cockpit appears immediately. Hover or focus on evidence highlights its supported decision and outcome. Short contextual prompts appear beside high-value controls.

**First 30 seconds:** The user explores evidence, arms, verification, and proof classes in any order.

**Motivation:** Curiosity and expert agency; no ceremony.

**Autonomy:** Maximum. The cockpit remains fully available.

**Trust:** High for experts because nothing is staged or withheld.

**Verification:** Always available and can be opened immediately.

**Failure modes:** Preserves the current assembly tax; hover discovery is unreliable; novices may miss ablation; tooltips can become scattered narration.

**Accessibility:** Every hover relationship needs a focus and touch equivalent. Highlighting cannot rely on color alone.

**Deadline complexity:** Low to medium.

### C. Hybrid

**First five seconds:** The full shell and frozen run identity are visible. A compact choice offers “Walk the proof” or “Explore freely.” The default remains non-blocking.

**First 30 seconds:** A short five-beat opening establishes the thesis, evidence-to-decision relationship, outcome, and causal ablation. It then hands control to the unchanged expert cockpit. HAC-343 comparison and verification become optional next moves.

**Motivation:** Fast comprehension followed by self-directed inspection.

**Autonomy:** The user can skip, reverse, jump to any visible stage, or exit to free exploration at all times.

**Trust:** Best balance. The experience teaches the argument using frozen states, then exposes the same states for inspection.

**Verification:** Offered after the core causal flip, while always reachable from the persistent cockpit.

**Failure modes:** The guided layer may still become too wordy; dimming could make content appear unavailable; the handoff may feel abrupt if geometry changes.

**Accessibility:** Manageable with a persistent progress control, descriptive headings, focus transfer, live-region restraint, and reduced-motion state swaps.

**Deadline complexity:** Medium. Reuses the existing cockpit and adds controlled emphasis rather than a parallel application.

## Recommendation

Choose **C. Hybrid**.

It most directly improves judge comprehension without sacrificing the expert surface. The full cockpit remains the canonical product. “Walk the proof” is a temporary attention layer using the same geometry and recorded arms. It should last roughly 25–40 seconds when advanced normally, but never auto-advance.

## Interaction architecture

### Entry

- Persistent shell, run identity, issue, frozen state, and proof-class selector remain visible.
- Add a compact judge-choice module near the causal claim:
  - Primary: **Walk the proof**
  - Secondary: **Explore freely**
  - Supporting text: “Inspect a recorded run step by step, or open the complete cockpit.”
- Do not use a modal. Do not obscure the run identity or imply setup.

### Guided mode

- Preserve complete cockpit geometry.
- Use focus, contrast, connector emphasis, short step copy, and controlled disclosure.
- Keep controls available. A visible bar provides Back, Next, Exit to cockpit, and step count.
- Never auto-advance or animate without a user action.

### Expert mode

- The current cockpit becomes fully active with no layout reflow.
- Keep a small “Walk the proof” re-entry action.
- Preserve arm selection, L2 verification, L3 raw proof, proof-class switch, and limitation disclosure.

## Flow and state map

1. `local.overview` → choose guided or free.
2. `guide.local-validity` → both actions independently valid.
3. `guide.shared-environment` → paths converge on a joint constraint.
4. `guide.evidence-decision` → revision-bound coupling supports `WITHHOLD_SERIALIZE`.
5. `guide.outcome` → serialized treatment satisfies the bound.
6. `guide.ablation` → perturbed evidence produces `ALLOW_PARALLEL` and invalid outcome.
7. `guide.handoff` → verify, compare alternatives, or explore freely.
8. `compare.hac343` → uncoordinated, global lock, credible per-target lock, Interlock.
9. `verify.local` → evidence by arm and reproduction command.
10. `raw.local` → packet-level proof.
11. `cloud.overview` → separate Google participation claim with stable macro geometry.
12. `verify.cloud` / `raw.cloud` → receipt, effect, independent observation, logs, controls, redactions, and limitations.

## Guided storyboard

### Frame 0: Choice

Headline: **Inspect the run**  
Copy: “Two actions can be valid alone and unsafe together. Follow the recorded proof, or inspect everything yourself.”  
Controls: Walk the proof / Explore freely.

### Frame 1: Each action is valid alone

- Emphasize Intent A and Intent B equally.
- Reveal their locally-valid marks independently, not simultaneously.
- Keep shared environment, decision, and outcome visible but quiet.
- Step copy: “Each reservation change passes its local rules.”

### Frame 2: But they share something

- Emphasize the existing paths into Shared environment.
- Bring the joint bound into the primary reading path.
- Step copy: “They touch one bounded environment. Local validity does not prove joint safety.”

### Frame 3: Interlock sees the composition

- Emphasize coupling evidence, then its connection to the decision.
- Reveal `WITHHOLD_SERIALIZE` as a recorded decision, not a computed animation.
- Step copy: “At this pinned revision, the frozen evidence establishes coupling, so Interlock withholds parallel execution.”

### Frame 4: The decision changes the bounded outcome

- Propagate emphasis from decision to treatment outcome.
- Contrast `120 <= 130` against the uncoordinated `140 > 130` baseline.
- Step copy: “The selected coordination keeps the joint state within its recorded bound.”

### Frame 5: Is the evidence causal?

- User activates “Remove or perturb the evidence.”
- The exact recorded perturbed arm replaces the original evidence state.
- Highlight what stays constant: intents, shared environment, and bound.
- Then highlight what changes: evidence basis, decision, outcome.
- Step copy: “With a different frozen evidence basis, the decision flips to `ALLOW_PARALLEL`, and the same joint bound fails.”

### Frame 6: Handoff

Headline: **You have the causal claim. Inspect the proof.**  
Actions:
- Verify this decision
- Compare coordination strategies
- Explore the complete cockpit
- Optional: switch to Google Cloud participation

Do not automatically open Google Cloud. It is a separate proof class.

## Semantic animation matrix

| Interaction | Trigger | Question answered | Frozen source | Motion and hierarchy | Timing / implementation | Accessibility and prohibition |
|---|---|---|---|---|---|---|
| Independent validity | Next or direct stage activation | Are both actions individually valid? | HAC-330 intent states | Intent A border/label resolves, then Intent B; equal final weight | 160–220 ms each, 60–100 ms stagger; CSS/Motion | Focus announces each state. Reduced motion uses immediate state swap. Never imply validation is running. |
| Shared convergence | Next or focus on Shared environment | What connects the intents? | HAC-330 shared-environment relationship | Existing connectors gain contrast from intents toward the shared card; joint bound becomes primary | 240–320 ms, ease-out; SVG/CSS stroke emphasis | Provide text relationship in reading order. Never animate particles, data flow, or scanning. |
| Coupling revealed | Next or evidence focus | What does the evidence establish? | HAC-330 original evidence arm | Evidence finding and basis become salient; supporting files remain secondary | 180–260 ms; CSS/Motion | Do not rely on blue alone. Never animate evidence as newly discovered. |
| Evidence attribution | Next or evidence hover/focus | Which decision does this evidence support? | Evidence → decision relationship | One connector and the destination decision highlight together; unrelated regions soften slightly | 200–280 ms; SVG/CSS | Focus equivalent required. Softening must retain readable contrast. Never imply probabilistic confidence beyond recorded support. |
| Gate state | Arm selection or guided Next | What did Interlock decide? | Recorded `WITHHOLD_SERIALIZE` or `ALLOW_PARALLEL` | Decision text crossfades or flips by semantic state; gate indicator changes state after evidence is shown | 180–240 ms; Motion | Announce full decision text. Never depict a machine deliberating, thinking, or computing. |
| Decision to outcome | Next or decision focus | What consequence follows from the decision? | Selected arm outcome | Emphasis travels once from decision to selected outcome; numeric inequality resolves last | 220–320 ms; SVG/CSS + Motion | Reading order already states cause before result. Never imply temporal runtime execution. |
| Evidence ablation | User selects perturbed evidence | Did evidence cause the decision difference? | Original and perturbed HAC-330 arms | Hold intents, environment, and bound fixed; replace evidence basis; then decision; then outcome. Persistent labels mark changed vs unchanged | 450–700 ms total, interruptible and reversible; Motion | Reduced motion uses an immediate before/after state with a changed-fields list. Never morph hashes or interpolate numeric facts. |
| Baseline comparison | User opens comparison and advances | Why are simpler approaches insufficient? | HAC-343 frozen baselines | Reveal one strategy at a time in the same frame; keep comparison dimensions fixed | 180–240 ms per strategy; Motion | Tabs/segmented controls with arrow-key support. Never animate winner celebration or invent relative scale. |
| Evidence downstream highlight | Hover/focus evidence | What depends on this evidence? | Recorded support graph | Evidence, decision, and outcome share a temporary outline/connector emphasis | 120–180 ms in/out; CSS/SVG | Focus and touch toggle equivalent. Never make unrelated proof disappear. |
| Open verification | Verify action | Can I independently inspect this decision? | L2 recorded-arm evidence | Drawer enters from the side while L1 scales only if necessary and remains visible | 220–300 ms; Motion | Focus moves to drawer heading; Escape and Close return focus. Reduced motion opens instantly. Never detach verification from selected arm. |
| Open raw proof | Raw-proof action | What are the underlying bytes and fields? | L3 packet | Same contextual drawer pattern; code appears without character-by-character animation | 180–260 ms; Motion/CSS | Code region labelled and keyboard scrollable. Never type JSON onto screen or imply streaming. |
| Proof-class switch | User selects Local or Google | Which claim am I inspecting? | HAC-330 vs HAC-340 | Macro shell remains fixed; content changes as one atomic context; title and theme accents update together | 180–260 ms crossfade; Motion | Announce new proof class and claim. Never visually connect Local causality to Google participation as one causal chain. |
| Google execution path | Guided focus or row focus | What actually ran, and where is independent observation? | HAC-340 recorded path | Sequential emphasis only: Gemini → ADK/Vertex → Cloud Run → Interlock receipt → mutation → observer → logs | 140–200 ms per user-advanced step; CSS/Motion | Full ordered list exists statically. Never animate network packets, live calls, or agent thought. |
| Negative controls | Focus or expand controls | What failed closed? | HAC-340 recorded 403/401/403 controls | Each refusal gains contrast with its exact label; no shake or alarm | 120–180 ms; CSS | Status text and semantics required. Never call them a comprehensive security proof. |
| Degraded/unavailable/unbound | Bound state change | What evidence is missing or limited? | Frozen unavailable/unbound states | Neutral state transition to labelled limitation; preserve reserved geometry | 120–180 ms; CSS | Do not use color alone. Never animate placeholder values or proportional geometry. |
| Guided-to-free handoff | Exit or final guided action | Can I inspect everything now? | Existing cockpit | Guidance bar retracts; all cockpit regions return to equal interactivity without reflow | 180–240 ms; Motion | Focus moves to cockpit heading or chosen destination. Never auto-scroll the user away from evidence. |

## HAC-343 comparison design

Use one fixed comparison frame with consistent rows:

- Safety result
- Concurrency cost
- Scope of coordination
- Evidence sensitivity
- Recorded outcome
- Limitation

Reveal in this order:

1. **Uncoordinated:** maximum concurrency, invalid joint outcome.
2. **Global lock:** safe but over-coordinates unrelated work.
3. **Credible per-target lock:** narrower, but target identity alone cannot account for hidden composition where HAC-343 proves that limitation.
4. **Interlock:** evidence-sensitive coordination at the relevant boundary.

Do not use podiums, scores, checkmark totals, or victory animation. Keep every claim bound to HAC-343 fields. If a field is absent, show “not established by this frozen run.”

## Microinteraction inventory

- Guided/free choice
- Persistent step indicator
- Back, Next, Exit, and direct stage activation
- Evidence support highlighting on hover, focus, and touch toggle
- Arm comparison with explicit recorded-state labels
- “Changed” and “Held constant” markers during ablation
- Selected-arm persistence inside verification and raw proof
- Copy affordances with short non-disruptive confirmation
- Proof-class atomic switch
- Limitation disclosure
- Reduced-motion preference detection and manual motion toggle

## Tooltip and gloss strategy

Use tooltips only for short term definitions that do not carry the causal story.

Good tooltip candidates:

- revision-bound
- coupling support 8/10
- frozen arm
- receipt
- independently authenticated read-back
- publication digest

Use guided sequencing or inline explanation for:

- why local validity does not imply joint safety
- why a shared environment matters
- how evidence changes the decision
- why the perturbed arm is causal evidence
- why Local and Google are different proof classes

Rules:

- Every tooltip opens on hover and focus, remains hoverable, dismisses with Escape, and never contains an essential action.
- On touch, use a labelled disclosure rather than hover emulation.
- Keep definitions to one or two sentences and avoid nesting tooltips.

## Attention hierarchy

### Local guided mode

1. Current claim/question
2. Current frozen state or relationship
3. Decision and selected outcome
4. What stayed constant / what changed
5. Run identity and provenance
6. Verification actions
7. Raw implementation detail

### Google mode

1. Editorial participation claim
2. Recorded execution path
3. Decision, effect, independent observation
4. Receipt and correlated logs
5. Negative controls and limitations
6. Raw packet and redaction detail

## Motion principles

- User-triggered, never auto-advancing.
- One semantic change per beat.
- Most transitions: 120–320 ms.
- Multi-field ablation sequence: no more than 700 ms total.
- Ease-out for reveals, ease-in-out for reversible state changes, linear only for progress indicators.
- No bounce, elastic, spring overshoot, parallax, ambient pulsing, particle flows, or celebratory motion.
- Interactions must remain interruptible and reversible.
- Motion must clarify adjacency, dependency, change, continuity, or state.

## Reduced-motion behavior

- Replace movement with immediate state changes and persistent changed-field markers.
- Preserve the guided sequence, copy, step count, and causal order.
- Do not fade essential content through low-opacity intermediate states.
- Draw connectors immediately rather than animating strokes.
- Open drawers instantly and transfer focus correctly.
- Show before/after evidence, decision, and outcome as a static comparison during ablation.

## Accessibility constraints

- Target WCAG 2.2 AA for contrast, focus visibility, reflow, control names, and keyboard operation.
- Guided mode must be fully operable with Tab, Shift+Tab, Enter/Space, Escape, and arrow keys where appropriate.
- Do not use color, position, or animation alone to convey state.
- Maintain DOM reading order as evidence → decision → outcome even when layout is two-column.
- Use restrained live-region announcements only for selected arm, decision, outcome, and proof-class changes.
- Drawers must trap focus appropriately without removing the visible causal context from assistive technology.
- Validate at 200% zoom and 320 CSS px reflow.
- Touch targets should be at least 24×24 CSS px, preferably 44×44 for primary guided controls.
- Tooltips must meet hover/focus persistence and dismissal requirements.

## Must-not-animate and must-not-imply rules

- No fake agent thinking, typing, planning, token streaming, or progress.
- No browser recomputation or animation suggesting evidence is being mined live.
- No morphing one hash, receipt, count, or recorded fact into another.
- No animated network packets or simulated Google Cloud calls.
- No mixing Local causal proof and Google participation into one continuous causal chain.
- No proportional bars, scores, or geometry unless backed by a frozen quantitative field.
- No animation that implies `ALLOW` caused independent observation without preserving the distinct effect and observation steps.
- No security-theater language. Negative controls remain recorded refusals, not a comprehensive security claim.
- No hiding limitations, unavailable evidence, redactions, or unbound evaluation states.
- No motion that prevents direct inspection, selection, copying, or verification.

## Exact frames Claude Design should mock up

Create desktop frames at the current cockpit reference viewport and responsive variants where noted:

1. Local cockpit, untouched expert overview.
2. Judge-choice state: Walk the proof vs Explore freely.
3. Guided Step 1: independently valid intents.
4. Guided Step 2: shared environment and joint bound.
5. Guided Step 3: coupling evidence attributed to `WITHHOLD_SERIALIZE`.
6. Guided Step 4: decision propagated to bounded treatment outcome.
7. Guided Step 5A: original-evidence state with held-constant markers.
8. Guided Step 5B: perturbed-evidence state with changed-field markers and invalid outcome.
9. Guided completion/handoff state.
10. HAC-343 comparison: uncoordinated.
11. HAC-343 comparison: global lock.
12. HAC-343 comparison: credible per-target lock.
13. HAC-343 comparison: Interlock.
14. Local verification drawer with L1 causal context visible.
15. Local raw-proof drawer with selected-arm context visible.
16. Google Cloud overview in the same macro shell.
17. Google execution-path guided emphasis states, supplied as editable keyframes.
18. Google decision/effect/observation emphasis state.
19. Google negative controls and explicit “not a security claim” state.
20. Google raw-proof drawer with redaction and digest limitations visible.
21. Degraded/unavailable/unbound evidence state.
22. Keyboard-focus examples for all new controls.
23. Reduced-motion equivalents for Steps 2, 3, 5, drawer opening, and proof-class switch.
24. Responsive 320 CSS px versions of entry, guided ablation, verification, and Google overview.

For each animated interaction, supply editable start, midpoint only when semantically necessary, and end frames; component/state names; duration; easing; trigger; reversal behavior; reduced-motion frame; and the exact frozen fields displayed.

## Cold-reader acceptance criteria

Test with competent professionals who have not seen Interlock. Without facilitator help:

1. Within 5 seconds, at least 80% can identify that the page shows a frozen recorded run rather than a live dashboard.
2. Within 15 seconds of guided mode, at least 80% can state that both actions are individually valid but share a joint constraint.
3. Within 30 seconds, at least 80% can correctly describe evidence → decision → outcome.
4. After ablation, at least 80% can identify what stayed constant and what changed.
5. At least 80% explain that the perturbed arm is causal evidence rather than a decorative comparison.
6. At least 80% distinguish Local causal proof from Google Cloud participation proof.
7. At least 80% can open verification and identify the selected arm's basis without losing their place.
8. No participant reports that the browser is recomputing, mining, invoking Gemini, or executing mutations.
9. Keyboard-only users can complete the walk, reverse a step, exit to the cockpit, switch proof classes, and open/close L2 and L3.
10. Reduced-motion users receive the same causal sequence and distinctions without animated movement.

## Implementation recommendation

- Use Motion for React for guided emphasis, reversible state transitions, drawer choreography, and handoff.
- Use CSS/SVG for connector emphasis, borders, focus states, and simple semantic highlights.
- Avoid Lottie and pre-rendered animation for all core proof interactions because the states must remain selectable, inspectable, accessible, and bound to live DOM content.
- A pre-rendered asset is acceptable only for a non-interactive explanatory illustration outside the cockpit, never as proof.

## Definition of done

The work is ready for implementation when Claude Design delivers all required frames, every animation maps to named frozen fields or relationships, reduced-motion and keyboard states are explicit, Local and Google remain separate proof contexts, the expert cockpit remains directly accessible, and the cold-reader criteria can be tested without interpretation.
