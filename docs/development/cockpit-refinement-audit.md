# Cockpit visual-refinement audit

## Recommendation

No additional UI library is required to bring the Interlock cockpit to the
level of the previously designed DataHub cockpit.

The reference app uses React because it is a multi-route product application,
but its visual system is predominantly hand-authored CSS and tokens. Its
relevant dependencies are `@radix-ui/react-popover` for anchored proof
popovers, `lucide-react` for icons, and `motion` for motion configuration.
Interlock already has the primitives it needs for this judge-facing,
evidence-first surface: local Geist fonts, shared tokens, semantic state
grammar, native controls, and an anchored evidence drawer.

Reference material:

- [DataHub cockpit package](https://github.com/workspacejson/datahub-agent/blob/main/apps/cockpit/package.json)
- [DataHub cockpit shell](https://github.com/workspacejson/datahub-agent/blob/main/apps/cockpit/src/components/CockpitShell.tsx)

Use an optional browser View Transition for proof-class and arm changes if a
transition is wanted. Keep the existing reduced-motion behaviour. Do not add
React, Tailwind, Radix, or Motion solely to refine this HTML/CSS surface.

## What to carry over

| Reference strength | Interlock translation |
| --- | --- |
| Three-step review spine | A causal spine: intents → coupling evidence → decision and outcome. |
| Hero establishes subject and source | Header establishes run identity, frozen evidence basis, and proof class. |
| Narrative bands | Make the evidence delta a dedicated causal band, not helper copy. |
| Decision checkpoint | Give `WITHHOLD_SERIALIZE` a decision bar with its evidence basis beside it. |
| Separate receipts review | Retain the anchored drawer and make it a structured verification ledger. |

## Visual gaps to close

1. **Paced disclosure.** The current cockpit presents most facts as one compact
   panel. The reference earns its clarity through a sequence: orient the reader,
   show the decisive change, then let them inspect proof.

2. **A causal signature.** Intent cards and the shared-environment box are
   accurate but currently read as ordinary cards. The coupling boundary should
   be the memorable compositional element: two independent inputs visibly
   converge on one shared constraint before the decision.

3. **Selected-arm hierarchy.** The baseline is context; the selected arm is
   the argument. The selected decision and bounded outcome should dominate,
   while the baseline remains available as a calibrated comparison.

4. **Evidence delta.** On the default treatment arm, the revision-bound basis
   and coupling support are too quiet. This is Interlock's thesis: changing
   evidence changes the coordination decision. It should be stated in one
   dedicated, easily scannable band.

5. **Header composition.** Separate product/run identity, proof-class control,
   and frozen metadata into clear tiers. The header should orient rather than
   present all metadata at equal visual weight.

6. **Evidence inspection.** The drawer has the right information boundary, but
   should use a receipt/ledger rhythm: claim, basis, immutable reference,
   verification command, and explicit non-claims.

## Design-system constraints

- Keep the cockpit bounded to the Interlock layout grid rather than letting the
  content rail expand with wide viewports.
- Keep Interlock achromatic. Do not import the DataHub cockpit's emerald source
  axis; spend colour only on Interlock semantic states.
- Continue using Geist for interface copy and Geist Mono for evidence,
  identifiers, labels, measurements, and state tokens.
- Preserve the frozen state grammar: label, glyph, and border treatment carry
  meaning together.
- Use the existing near-zero radii, border ladder, surface hierarchy, 44px
  interactive targets, visible focus ring, and reduced-motion support.

## Target result

Build a bounded evidence-review surface with a causal rail, a dominant
selected-arm decision/outcome, and a structured proof drawer. The goal is not
a card grid with better typography; it is a review sequence that makes the
evidence-to-decision relationship immediately legible.

## JSON and raw-proof presentation

Use a specialised formatter for the raw-proof drawer. This is an appropriate,
narrow dependency, unlike adding a general component framework merely to
refine the cockpit shell.

**Recommendation: Shiki.** The previously designed DataHub cockpit already
includes it. Use it to pretty-print and syntax-highlight frozen JSON records
at build time, then render the generated HTML in the drawer.

- Show readable indentation and syntax treatment for keys, strings, numbers,
  and punctuation.
- Keep the source path or immutable reference and a copy action beside the
  formatted record.
- Use an Interlock-compatible light or dark theme.
- Do not rely on syntax colours to convey Interlock semantic state. State
  meaning remains the label, glyph, and stroke grammar.
- Prefer build-time highlighting so a judge-facing capture remains
  deterministic and avoids an unnecessary client-side highlighter payload.

## Visual-test and evidence backlog

Review date: 2026-08-17. The public `workspacejson/datahub-agent` cockpit is a
useful source for visual-test discipline, not for Interlock implementation or
visual identity. Its strongest practice is an executable first-frame contract:
it tests real committed evidence at 1440×900 and 1280×800, requires the next
action and all decision-critical regions to be wholly visible with 48px of
headroom, rejects horizontal overflow, and separately tests a deliberately
smaller mobile first-frame contract.

Reference:

- [First-frame Playwright contract](https://github.com/workspacejson/datahub-agent/blob/main/apps/cockpit/e2e/first-frame.spec.ts)
- [Evidence contract](https://github.com/workspacejson/datahub-agent/blob/main/docs/evidence.md)

### P0: replace the prose-only fold claim with executable geometry checks

`media/hac-341/README.md` currently says that both fold gates pass without
scrolling. The current 1440×900 local capture puts the action row at the bottom
of the frame with materially less than the reference's 48px safety margin, and
there is no browser assertion for the 1280×800 layout.

Add a browser-only `check:cockpit:visual` job that serves the repository root
and tests the real `view-model.json`, not placeholder data. At 1440×900 and
1280×800 it should assert:

- no page-level or non-scroll-container horizontal overflow;
- `window.scrollY === 0` after the initial route resolves;
- full visibility, including a defined headroom, for the run identity, proof
  class, both intents, revision-bound evidence, the selected decision, both
  local comparison outcomes, arm selector, and action row;
- no decision-critical value is merely intersecting the fold or clipped by a
  parent;
- the cloud overview has its required lane, decision/effect/observation and
  control information visible under its own explicit desktop contract.

The mobile contract should be intentionally different: assert run identity,
proof class, intent context and revision-bound evidence in the first frame;
allow the arm controls and verification actions to follow below it. This makes
the trade explicit rather than treating a compressed desktop contract as
responsive design.

### P0: bind Devpost screenshot references to current captures

`media/hac-335/devpost/screenshot-order.json` still points `IL-COCK-010` at
the older `1440x566` capture, while the current capture manifest records the
new `1440x900` frame. The package gate currently confirms that the Devpost file
exists and its asset ID is registered, but not that it is the capture currently
recorded for that asset.

Strengthen `verify-package.mjs` so every Devpost cockpit screenshot resolves to
the current `capture-manifest.json` record for the same asset ID and checksum.
Then decide deliberately whether the gallery should use a new, contract-checked
top crop or the full capture. Do not let an older crop remain by accident.

### P1: add adversarial layout data to browser checks

The DataHub suite grows the fields that can truly vary, then proves the primary
action remains in frame. Interlock should do the equivalent with evidence that
can grow:

- a longer basis revision/source path and coupled-file names;
- additional claim-boundary bullets in the drawer;
- long immutable URLs and digests in the cloud proof drawer;
- the three local arms and the cloud proof-class switch.

The test should assert a defined overflow strategy for each case: wrap,
truncate with accessible full value, or drawer scrolling. It should never
silently clip a value that supports a claim.

### P1: make the L2 drawer geometry a browser contract

The README documents the drawer's important property: it yields space from the
run instead of covering the causal context. This is currently a source-level
check, not a rendered geometry check. Add desktop checks at 1440×900 and
1280×800 that opening each drawer:

- leaves the named L1 evidence/decision region visible and not overlapped;
- keeps the drawer inside the viewport with no horizontal overflow;
- moves focus into the drawer and restores it to the invoking control;
- permits its raw-proof block to scroll without clipping its source path or
  copy control.

### P1: assert browser evidence has no unexpected network dependency

Interlock's capture provenance is already unusually strong: it hashes the
render source set, commits the capture manifest, and fails when pixels could
have changed without recapture. Add the complementary runtime assertion from
the DataHub approach: record browser requests during a capture/test and fail
on any off-origin request. This protects the deterministic local font, token,
and Shiki proof presentation claim at the rendered boundary.

### P2: execute the declared cold-read protocol

The Interlock cockpit README correctly says the human cold-read protocol is
not yet run. That is an evidence gap, not a defect to paper over. Once the
first-frame contract is stable, run the protocol against the assembled
experience, preserve anonymised responses and task timings, and report the
result only at the strength the sample supports.

### Keep, do not duplicate

Interlock already has strong evidentiary controls worth retaining: normalized
absence-correct view models; frozen proof-class separation; state/deep-link
consistency; source-digest-bound captures; a generated asset registry; and
package checks that prevent stale capture manifests. The needed additions are
rendered geometry and downstream-reference binding, not another evidence
format or a pixel-snapshot system.

## Implemented in this refinement pass

- Added `check:cockpit:visual`, a real-browser contract for both proof classes
  at 1440×900 and 1280×800, plus an intentional 390×844 mobile first frame.
  It measures rendered regions, 48px desktop headroom, horizontal overflow and
  initial scroll position instead of inferring visibility from source text.
- Added compact desktop density rules so the causal chain and verification
  controls meet that contract without hiding evidence.
- Added rendered drawer checks: focus enters the drawer, Escape returns it to
  the opener, the run reserves space rather than being overlaid, raw proof is
  Shiki-rendered, and adversarially long evidence values cannot create page
  overflow.
- Added an off-origin request audit to protect the local-only rendering claim.
- Bound each Devpost cockpit screenshot to the current capture manifest record
  and added a negative test for a still-present but stale historical capture.
- Added a dedicated browser job to CI. The browser runner is installed outside
  the repository dependency graph, keeping deterministic evidence checks free
  of a browser dependency.

Remaining evidence work is deliberately human: execute the declared cold-read
protocol and report only the anonymised result it supports.

## Brutal agentic UX/UI review prompt

Use this prompt with an agent that can drive a browser, inspect computed layout,
resize the viewport and operate controls. Give it the locally served repository
root (not a file URL), for example `http://127.0.0.1:4173`.

```text
You are an adversarial senior product designer, accessibility specialist and
front-end QA engineer. Your job is not to compliment this UI, explain its
intent, or review source code in the abstract. Try to break the experience a
time-constrained judge has when deciding whether Interlock's evidence is
credible.

Surface under review:
  <BASE_URL>/media/hac-341/cockpit.html

Review these routes separately. They are different proof classes and must not
be mentally merged:
  1. ?run=hac330-local&proof=local&state=run.local.treatment&static=1
  2. ?run=hac330-local&proof=local&state=run.local.perturbed&static=1
  3. ?run=hac340-cloud&proof=cloud&state=run.cloud.overview&static=1

Mission

Determine whether a skeptical first-time reviewer can understand, in under 30
seconds and without scrolling on desktop:
  - what claim this screen supports;
  - what evidence changed and why that changes the decision;
  - whether the outcome is recorded evidence or browser computation;
  - what belongs to the local experiment versus the Google Cloud run;
  - where to inspect proof and what Interlock explicitly does not claim.

Do real browser exploration; do not infer behavior from markup alone.

Test matrix

1. First-frame comprehension
   - Start each route cold at 1440×900 and 1280×800, at scroll position zero.
   - Record exactly what is fully visible, partially visible, clipped, or below
     the fold. Treat a control touching the fold as a failure.
   - At 390×844, assess only the intentional mobile promise: identity, proof
     class, local context and evidence should be legible before scrolling. Do
     not demand that the whole desktop proof fit on mobile.
   - State the first sentence you believe the UI is asking a judge to remember.
     If it is not obvious or differs by route, report that as a hierarchy defect.

2. Information hierarchy and cognitive load
   - Identify the visual element your eye lands on first, second and third.
   - Flag anything that looks equally important but is not decision-critical.
   - Flag evidence-bearing details that are visually too quiet, jargon that has
     no immediate meaning, labels that over-explain, and labels that hide the
     consequence.
   - Check whether the local causal sequence reads left-to-right/top-to-bottom:
     inputs → revision-bound evidence → decision → bounded outcome.
   - Check whether the cloud route makes the Google / Interlock / target /
     observer boundaries comprehensible without reading every row.
   - Be especially suspicious of any styling that makes an unverified editorial
     statement look like frozen evidence.

3. Interaction and proof exploration
   - Operate every proof-class toggle, local arm selector and drawer action.
   - Verify that a change has an intelligible consequence, not just a changed
     label or color.
   - Open Verify, Raw proof and Claim boundary drawers for both proof classes.
   - Check that the drawer explains the screen rather than obscuring it; that
     its close affordance is obvious; that Escape works; and that focus returns
     to the invoking control.
   - Inspect raw JSON at normal zoom and 200% zoom. Look for horizontal clipping,
     unreadable syntax colors, lost source attribution, non-obvious scrolling,
     and copy actions that are easy to miss or misinterpret.
   - Test browser Back/Forward after proof and arm changes. Report any state
     surprise, URL mismatch, or lost context.

4. Accessibility and resilience
   - Navigate the entire experience by keyboard only. Log focus order, focus
     visibility, inaccessible controls, focus loss and traps.
   - Test at 200% browser zoom and at 320 CSS-pixel width. Check for horizontal
     page scrolling, collisions, truncated labels and targets below 44×44px.
   - Test reduced-motion if available. No essential meaning may depend on an
     animation.
   - Inspect contrast in both light/local and dark/cloud surfaces, including
     muted mono labels, selected controls, disabled-looking states and code.
   - Temporarily block external network access if your tool permits it. The UI
     must retain identity, type and proof rendering without third-party assets.

5. Evidence integrity and trust cues
   - Identify every place a user could mistakenly infer a stronger claim than
     the screen supports (for example, treating separate runs as one run, or
     treating a recorded arm as a live execution).
   - Check that all prominent numerical comparisons explain their denominator,
     bound and recorded status.
   - Look for wording or affordances that imply success, authorization, cloud
     participation or security coverage beyond the displayed evidence.
   - Check the difference between “what proves this” and “what is not claimed”
     is discoverable before a skeptical reviewer is already confused.

Report format — do not produce generic design advice

Start with a hard verdict in this form:
  Verdict: SHIP / SHIP WITH FIXES / BLOCK
  Confidence: high / medium / low
  The one reason a skeptical judge could fail to trust it: <one sentence>

Then provide issues in descending severity. For each issue include:
  - Severity: Blocker / High / Medium / Low
  - Route, viewport, zoom and interaction path that reproduced it
  - Observed behavior (objective; quote visible text and give element location)
  - Why it harms comprehension, accessibility, trust or task completion
  - Specific recommendation, constrained to this product's evidence-first
    visual language; do not propose a generic dashboard, gradients, charts,
    decorative animation or a heavier component library
  - Acceptance test that a browser can verify

Finish with:
  - “Above-fold transcript”: the exact hierarchy visible at 1440×900 for the
    local treatment route and the cloud route.
  - “Three most valuable fixes”: ranked by trust/comprehension impact, not by
    implementation ease.
  - “Do not change”: elements that are unusual but correctly preserve evidence
    boundaries or avoid overclaiming.

Be harsh, concrete and falsifiable. If it is good, say why in terms of a
specific observed behavior. Never award points for intent, source code comments
or the existence of a test; judge the rendered experience only.
```
