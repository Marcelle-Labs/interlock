# HAC-341 BOUNDED FINAL PRODUCT RECEIPT

> **Untracked working note.** Not committed, not part of the judge package.
> Delete with `rm HAC-341-RECEIPT.md` when no longer needed.
> Canonical copy lives as a comment on
> [HAC-341](https://linear.app/marcelle-labs/issue/HAC-341).

**Status: PASS** · Completed 2026-08-17

---

## 1. Where we are

Two things happened, in order:

1. **A read-only rendered audit** of merged `main` at `fa4ce75`. It found the
   cockpit factually correct and structurally sound — but with one genuine
   P0 comprehension defect nobody had caught, plus a bounded set of P1 product
   defects. The originally proposed full 18-phase redesign was **declined as
   unjustified**.
2. **A bounded corrective pass** implementing exactly the audit's findings.
   Merged.

**Next operation is the real human three-reader cold-read.** Nothing else is
blocked on me.

| | |
| --- | --- |
| Baseline SHA | `fa4ce75e0d4aacff01832313676872442fd458be` |
| Branch | `hac/341-final-product-surface` |
| Commits | `64b0142` corrective pass · `b6c7915` review findings |
| PR | [#25](https://github.com/Marcelle-Labs/interlock/pull/25) — merged watched-green |
| **Merge SHA** | **`b8fffbd27ab2be0333d4be402699b0dc9ff3be4a`** |
| Files changed | 22 (16 modified, 2 added, 4 capture renames) |
| Linear | HAC-341 merge receipt posted · HAC-335 *COCKPIT CAPTURE REFRESH ONLY* posted |
| HAC-341 state | **In Progress** (correct — cold-read outstanding) |
| HAC-336 | Not begun |

---

## 2. The P0 — what was actually wrong

`renderLocal()` read `run.environmentEvidence[0]` for **every** arm. Selecting
the perturbed arm changed the decision and the outcome but left the
*treatment's* evidence on screen. About eighty pixels apart, the page asserted:

> `SHARED ENVIRONMENT` · **COUPLED** · `coupling support 8/10` · basis `eb67a6f5…`
>
> `INTERLOCK DECISION` · `ALLOW_PARALLEL` · **`NO_QUALIFYING_COUPLING`**

The perturbed arm's real basis `db8a63ec…` appeared **nowhere** in L1.

So the arm that exists to prove *the evidence is load-bearing* taught the
opposite — *same evidence, different decision* — which reads as an inconsistent
engine rather than a deterministic one. This is the single most damaging thing
a judge could have taken from the surface.

**Why two prior inspections missed it**, including the HAC-335 pre-capture pass
that recorded *"No cockpit defect was found"*: both verified each arm against
its own `requires`/`forbids` tokens, and neither compared `IL-COCK-010` against
`IL-COCK-011`. The environment strip was byte-identical between them while the
decision differed — visible only in the comparison, which nothing was doing.

---

## 3. Selected-arm evidence binding — the fix

| Arm | Basis | Coupling | Environment now reads |
| --- | --- | --- | --- |
| baseline | none | none | *not consulted — Interlock was disabled in this arm* |
| treatment | `eb67a6f5…` | support 8/10 | `COUPLED` |
| perturbed | `db8a63ec…` | none recorded | *no qualifying coupling*, no `COUPLED` state drawn |

The shared environment and its bound stay shared — they are properties of the
experiment. Only the **evidence instance** moves with the arm.

Derivation extracted to **`media/hac-341/lib/arm-view.mjs`** — pure,
dependency-free. `verify-cockpit.mjs` calls the *same function the cockpit
renders from*, so the negative proof is a **binding, not a grep**: rewiring the
derivation fails it, and so does editing the frozen arms.

---

## 4. Everything else closed

| # | Audit finding | Closed by |
| --- | --- | --- |
| 1 | **P0** arm switch did not rebind evidence | `lib/arm-view.mjs` + 12 negative proofs |
| 2 | Baseline rendered an identical card twice | single row when baseline is selected |
| 3 | L3 clipped to 270px of 1323 in a non-scrolling panel | block flows, panel scrolls |
| 4 | Zero copy affordances | Copy on digests, ids, command |
| 5 | Panel covered the outcome column it explains | run yields the panel's width |
| 6 | Decision competed with numerals (26 vs 32) | 18 vs 40 |
| 7 | Perturbation lesson in 9px / 0.6 opacity | **Evidence changed** block |
| 8 | No connector; intents converged on nothing | bracket connectors + cause line |
| 9 | Cloud read as rows, not a traversal | spine, node markers, lanes on change |
| 10 | Switch said "Controlled **causal**", heading "**LOCAL**" | both read `proofLabel` |
| 11 | Proof class did not lead metadata | h1 15px vs pin 11px |
| 12 | Dead `[data-gate="open"]` CSS | removed |
| 15 | `INDEPENDENT OBSER…` truncated | lane column widened, wraps |
| 16 | Degraded states sparse | labelled next-action section |

### Perturbation treatment

An **Evidence changed** block naming the basis that replaced which, the
`ALLOW_PARALLEL → 140 > 130` chain, and the frozen `decisionDetail` verbatim.
Grounded entirely in recorded data; no browser recomputation implied.

### Motion

Arm switching only. Steps the three regions that actually change — evidence,
decision, outcome — using `il-step-in` and the `--dur-*` / `--delay-step`
tokens **already in** `assets/tokens/motion.css`. Plays once, settles,
re-entrant (each arm change re-renders). `prefers-reduced-motion` zeroes it from
the same token file; `?static=1` disables it independently, so a capture cannot
catch a mid-transition frame.

### GateSequence: **NONE**

`interlock-state-1..5.svg` encodes a review-then-open progression the frozen
packets never emitted — the same reason `phases.js` was rejected during the
identity port. Driving it from `WITHHOLD_SERIALIZE`, which *withholds*, would
imply a lifecycle this run does not have.

### Dependency additions: **ZERO**

No React, no Motion, no CDN, no new npm package.

---

## 5. Capture freshness — the mechanical hole, closed

`capturedFromSha` was recorded and **never compared to anything**. Editing the
cockpit left stale screenshots in the judge package with no signal at all.

A commit SHA also *cannot* close it: the capture is committed in the very commit
it would have to name. So freshness uses a content digest, and the commit SHA
stays as provenance.

**`captureSourceDigest`** — sha256 over path + contents of the **13 files** that
can change a captured pixel: `cockpit.html`, the view model, `arm-view.mjs`,
`assets/styles.css`, every token file, every vendored font face. Implemented in
`media/hac-335/bin/lib/capture-source.mjs`. Token and lib directories are swept
by extension, so a newly added file is covered without anyone remembering.
`check:package` recomputes and fails on drift, naming the recapture command.

```
digest        5e2a63451972b58bd787fb6360e32361da0246de45f14fa223e38a1fd5db61a8
covered       13 files
capturedFrom  64b01426a3fc4e12b4639139f64d21bab888a3c3   (provenance only)
```

> It caught my own second commit mid-pass. That is what it is for.

### Captures regenerated

| Asset | State | Was | Now |
| --- | --- | --- | --- |
| `IL-COCK-010` | `run.local.treatment` | 1440×507 | 1440×566 |
| `IL-COCK-011` | `run.local.perturbed` | 1440×507 | 1440×702 |
| `IL-COCK-012` | `run.cloud.overview` | 1440×619 | 1440×645 |
| `IL-COCK-013` | cloud + *Verify this run* | 1440×640 | 1440×808 |

Metadata touched and **only** this: `capture-manifest.json` (regenerated),
`asset-registry.json` (via `package:build`), `screenshot-order.json` (3 filename
refs), root `README.md` (**1 line** — the image path). Filenames encode
dimensions, so a height change is a mechanical rename.

`IL-COCK-013` now supports its own `supportedClaim` better than before: the
panel no longer covers the run, so `ALLOW + receipt`, `EXECUTED`, `alpha=45` and
`403/401/403` are all readable beside it.

---

## 6. Factual invariants — confirmed on merged main

| File | Change |
| --- | --- |
| `media/hac-341/evidence/view-model.json` | **0 lines** |
| `media/hac-333/scene-manifest.json` | **0 lines** |
| `media/hac-334/**` | **0 files** |
| `experiments/**` | **0 files** |
| root `README.md` | **1 line** (capture filename) |

`140 > 130` · `WITHHOLD_SERIALIZE → 120 <= 130` · `ALLOW_PARALLEL → 140 > 130` ·
`24/24` · `ALLOW + receipt` · `EXECUTED` · `OBSERVED alpha=45` · `403/401/403`
— all unchanged. Proof classes remain isolated. No `AUTHORIZED`, no Agent
Runtime/Gateway success, no fabricated `runtimeSourceUrl`.

**NO EVIDENCE SEMANTICS CHANGED.**

HAC-335 narrative boundary respected: judge sequence, claim ledger, Devpost
copy, thumbnail and architecture selection all untouched. **Hero remains
`IL-PROOF-010`.**

---

## 7. Measured before / after

### Typography (1440×900)

| Element | Before | After |
| --- | --- | --- |
| Outcome numerals | 32px | **40px** |
| Decision token | 26px | **18px** |
| Proof-class `h1` | 12px | **15px** |
| Run metadata | 11.5px | 11px |
| Arm note | 9px | 10px |

Ratio numerals : decision moved from **1.23:1** to **2.2:1**.

### Viewport fill

| State | 1440×900 | 2560×1440 |
| --- | --- | --- |
| local treatment | 55.0% → **61.6%** | 34.4% → 38.5% |
| local baseline | 55.0% → 55.4% | 34.4% → 34.7% |
| local perturbed | 55.0% → **76.7%** | 34.4% → **47.9%** |
| cloud overview | 67.4% → **70.2%** | 42.2% → 43.9% |

Gains come from real content (evidence block, connectors, larger numerals), not
filler. Ultrawide fill was explicitly out of scope.

### Behaviour

| Check | Before | After |
| --- | --- | --- |
| L3 `<pre>` visible | 270px of 1323 | **full 1323, panel scrolls** |
| Copy controls | 0 | present, clipboard + `execCommand` fallback |
| Drawer overlaps run | yes | **no** — edge meets edge at 1280/1440/1920 |
| Cloud lane truncated | yes | **no** |

---

## 8. Verification

**Merged main: 9 gates PASS · 429 tests · typecheck · build · CI 19/19**
(including SonarCloud).

- **429 tests**, up from 405 — **24 new negative proofs**, all confirmed to fire
- **Responsive**: 1280×800, 1440×900, 1920×1080, 2560×1440 — no horizontal
  scroll at any viewport, no console errors, both proof classes
- **Accessibility**: tab order complete and logical, focus returns to opener,
  Escape closes, `aria-pressed` / `aria-live` intact, state carries glyph + text
  + colour, no horizontal scroll at 200% zoom. Decision→outcome relationship is
  carried by the **cause line** (real text), not only by connector lines
- **Reduced motion**: `animationName: none`, state replacement immediate, same
  semantic result; `?static=1` parity holds
- **Copy**: verified functional against a real clipboard

### Negative proofs added (24)

*Cockpit (17):* arm/basis mismatch · arm/coupling mismatch · disabled arm drawn
as coupled · baseline self-comparison · perturbed arm sharing the default basis
· perturbed arm losing its changed-evidence report · arm recording a coupling
its own `decisionReason` denies · arm claiming an observed coupling it does not
record · cockpit bypassing the shared derivation · cockpit reading a basis off
the environment again · switch label drift (local + cloud) · raw-proof clipping
regression · run no longer yielding space to the panel · copy control removed ·
offline fallback removed · looping animation.

*Capture freshness (7):* cockpit changed without recapture · view model changed
· shared token changed · arm derivation changed · digest removed · digest
hand-edited to agree with itself · declared coverage narrowed.

### SonarCloud

Six findings, **fixed rather than suppressed**. Note the sort comparator
deliberately does **not** use `localeCompare` — the rule's usual advice — because
that ordering feeds a digest CI and a laptop must agree on, and locale-aware
collation is not guaranteed identical across ICU builds. Comparing code units
is. The rest were structural: an assignment lifted out of a template expression,
a three-level template and its nested ternary extracted into `armEvidenceRow`, a
deprecated `word-break` keyword, and `resolve()` split into `route` /
`renderRoute`.

---

## 9. Deliberately left (P2/P3)

- **`DECISION` and `EFFECT` share the executed hue.** The frozen vocabulary has
  no ALLOW hue, and green is the forbidden authorization state. Documented as a
  limitation rather than invented away — per scope, *do not create a new
  semantic hue for ALLOW merely for visual variety*.
- **Ultrawide fill.** Out of scope; `media/hac-341/README.md` declares emptiness
  below the fold expected ("this surface is read, not framed"). Improved anyway.
- **Radius / grid / border pixel parity.** Out of scope, previously deferred.
- **Full-frame L3 and full-frame claim-boundary modes.** Out of scope,
  previously deferred as non-blocking.
- **Detail truncation** in cloud hop rows (`interlock-hac340-proxy-…`) —
  pre-existing, full value reachable in L2.

---

## 10. What happens next

**READY FOR REAL HUMAN HAC-341 COLD-READ: YES**

**READY FOR HAC-336: NO** — blocked on the cold-read, per the sequencing
amendment.

Protocol and deterministic tester URLs are in `media/hac-341/README.md`:

```
L1 default      ?run=hac330-local&proof=local&state=run.local.treatment
baseline arm    ?run=hac330-local&proof=local&state=run.local.baseline
perturbed arm   ?run=hac330-local&proof=local&state=run.local.perturbed
cloud overview  ?run=hac340-cloud&proof=cloud&state=run.cloud.overview
missing run     ?run=nope&proof=local&state=run.local.treatment
```

Serve the repository root (identity resolves from `/assets`):

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# http://127.0.0.1:4173/media/hac-341/cockpit.html?run=hac330-local&proof=local&state=run.local.treatment
```

### ⚠️ One thing worth your judgement

The latest HAC-341 amendment points the cold-read at the **assembled HAC-335
judge path**, where the cockpit appears cropped to roughly its top 570px.

The perturbation fix lands **inside** that crop. But the L2 drawer reflow, the
L3 scrolling and the copy affordances sit **below** it — a reader following the
assembled sequence will not exercise them unless they open the live cockpit.
If you want the cold-read to cover that work, use the tester URLs above rather
than the assembled path alone.

---

## Appendix — where the artifacts are

| Artifact | Path |
| --- | --- |
| Cockpit | `media/hac-341/cockpit.html` |
| Arm derivation | `media/hac-341/lib/arm-view.mjs` |
| Cockpit gate | `media/hac-341/bin/verify-cockpit.mjs` |
| Capture source digest | `media/hac-335/bin/lib/capture-source.mjs` |
| Package gate | `media/hac-335/bin/verify-package.mjs` |
| Captures | `media/hac-335/captures/` |
| Negative proofs | `test/hac-341-identity-gates.test.mjs`, `test/hac-335-package-gates.test.mjs` |

Audit and verification screenshots were written to the session scratchpad
(`shots/` before, `shots-after/` after, `shots-merged/` merged main). That
directory is session-scoped and may already have been cleaned up; the committed
captures in `media/hac-335/captures/` are the durable record.

```sh
# re-verify everything from a clean clone
pnpm install --frozen-lockfile
pnpm run check && pnpm run typecheck && pnpm run build && pnpm test
```
