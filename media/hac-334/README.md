# HAC-334 — the proof visual suite

Nine canonical visual masters, drawn only from frozen evidence, so a judge can
answer *what changed, what ran, and what is not claimed* before reading any
prose.

Nothing here is illustrative. Every number on every board is read out of a
frozen artifact by a committed adapter; none of them is typed.

## Files

| File | Role |
| --- | --- |
| `bin/build-visual-model.mjs` | Adapter. Derives the visual model from frozen evidence. |
| `bin/render-masters.mjs` | Renders the canonical SVG masters and the vector PDFs. |
| `bin/export-png.mjs` | Rasterises the masters to the declared PNG sizes. |
| `bin/lib/` | Display list, font metrics, and the SVG and PDF backends. |
| `evidence/visual-model.json` | Generated. What each board asserts and on whose authority. |
| `evidence/asset-registry.json` | Generated. One row per asset; the filename prefix is the row id. |
| `masters/*.svg` | The canonical masters. Everything else derives from these. |
| `exports/*.pdf`, `exports/*.png` | Derivatives. |
| `exports/render-manifest.json` | Which master each raster came from, and at what digest. |
| `bin/verify-visuals.mjs` | The gate. |

```sh
pnpm run visuals:build    # model + masters + PDFs, from frozen evidence
pnpm run visuals:export   # rasters, via the pinned rasteriser
pnpm run check:visuals    # the gate
```

## Where truth lives

Semantic truth is derived in `bin/build-visual-model.mjs`, from artifacts the
repository already holds:

```
media/hac-341/evidence/view-model.json           -> both runs, normalised, absence-correct
media/hac-333/scene-manifest.json                -> semantic states, global non-claims
experiments/hac-330/evidence/arms.json           -> arms, decisions, bounded outcomes
experiments/hac-330/evidence/results.json        -> the check list
experiments/hac-342/evidence/cloud-run.public.json      -> the cloud run
experiments/hac-342/evidence/publication-bindings.json  -> immutable links
```

`140`, `130`, `120`, `alpha=45` and `403/401/403` are read from those files.
`24/24` is **recomputed** from the check list, because it is not a literal
anywhere in the HAC-330 packet. Only public, main-resident evidence is read; the
private HAC-340 packet is never touched.

## One master, many derivatives

The boards emit a display list, not markup. `lib/svg.mjs` and `lib/pdf.mjs`
consume the same nodes, so the SVG and the PDF are two encodings of one drawing
rather than two drawings of the same facts. The PNGs are rasterisations of the
SVG. A factual label therefore cannot differ between a README image and a
Devpost upload — there is nothing for it to differ with.

The five-second boards are the one deliberate exception: they are separate,
simpler compositions, not shrunken masters, because a shrunken master is
unreadable at the size that variant exists for. They carry the same values.

Motion: none is produced here. The static masters are the factual authority, and
the reduced-motion equivalent of every board is the board itself. If an animated
derivative is ever built, it must be a guided reading of this geometry, with no
node, edge or label that is not already on the master.

## The two proof classes

They are separate runs on different days with different evidence, and the suite
never renders them as one chain.

| | Class A · HAC-330 | Class B · HAC-340 |
| --- | --- | --- |
| arms, environment evidence, constraints, checks, bounded outcome | present | **absent** |
| receipt, effect, observation, negative controls, runtime provenance | **absent** | present |
| theme | paper | ink |

`IL-PROOF-014` is the only board that carries both, and it labels them
separately and lets no claim cross between them. The gate fails if a class A
board grows cloud apparatus, if a class B board grows the counterfactual, or if
any single board renders both `140 > 130` and `alpha=45`.

## The hero, and what is not

`IL-PROOF-010` is the primary judge-facing visual — it, or its five-second
derivative, is what a README, a Devpost thumbnail, a social image or an opening
frame leads with. Behaviour change precedes architecture: the causal delta is the
proof, and the architecture boards verify it afterwards.

The HAC-341 cockpit is **not** the hero. It answers *can I verify this?* and
belongs after the causal visual, cropped and framed rather than pasted in as a
full-viewport screenshot. See `media/hac-341/README.md` for the permitted crops
and the attribution a composed asset has to carry.

## The assets

| Id | Board | Class | Answers |
| --- | --- | --- | --- |
| `IL-PROOF-010` | Controlled causal counterfactual | A | What changed because Interlock existed? |
| `IL-PROOF-011` | Perturbation / evidence load-bearing | A | Is the evidence load-bearing? |
| `IL-DIAG-010` | Conceptual causal architecture | conceptual | Where does Interlock intervene? |
| `IL-DIAG-011` | Real Google Cloud participation | B | Did this traverse Google infrastructure? |
| `IL-DIAG-012` | Exact deployment and trust boundaries | B | What was deployed, and where are the boundaries? |
| `IL-PROOF-012` | Receipt, effect, observation | B | What was decided, what happened, who checked? |
| `IL-PROOF-013` | Fail-closed / anti-bypass | B | What happens when the path is attacked? |
| `IL-PROOF-014` | Claim boundary | A + B | What is claimed, and what is not? |
| `IL-DIAG-013` | HAC-319 evaluation shell | conceptual | How will evaluation be reported when it exists? |

The HAC-342 band (`IL-DIAG-002..004`, `IL-PROOF-001..005`) is reused, never
renumbered and never redrawn. No derivative is promoted into a master id.

## Corrections applied to the design handoff

Two design-source claims are not supported by the frozen evidence and were
removed rather than reproduced.

**Three deployment revisions.** The design bundle renders
`interlock-hac340-agent-00002-s5d` and `interlock-hac340-target-00002-t85`
alongside the proxy revision. Neither appears in any frozen artifact or in git
history — `20-cloud-run.mjs` recorded service URLs, not revision names. Only
`interlock-hac340-proxy-00002-wzf` is evidenced, and only it appears. The gate
fails if either of the others surfaces.

**The observer's authority.** HAC-332's `OBSERVED` state carries the note
*"Independently witnessed by a party that cannot authorize"*, rendered as the
state chip's tooltip, and the shipped HAC-342 deck asserts the same in prose.
The frozen packet establishes independent *authentication*, not inability to
authorize. No board imports that note; the observation is captioned with the
frozen language, and the gate fails on authority-strengthening copy.

## The HAC-319 shell

`IL-DIAG-013` is a reserved surface and must stay obviously empty. Three regime
labels, each marked `NOT BOUND`, with the metrics named as withheld. No value,
no mark, no proportional geometry — a bar or a dot would state a comparison that
has not been run. It exports as an editable master only while unbound.

The regime labels are the ones the repository froze (`Regime 1..3`). HAC-319's
issue text names them descriptively, but that text is not a frozen repository
artifact, so the shell uses the vocabulary the repository actually holds.

## The one dependency

`@resvg/resvg-js`, pinned at `2.6.2`, MPL-2.0. It is used by `bin/export-png.mjs`
and nowhere else.

It is earned narrowly: PNG is a required deliverable, an SVG cannot rasterise
itself, and a manual browser screenshot is neither reproducible nor reviewable.
It is a **devDependency**: nothing under `src/` imports it, nothing at runtime
needs it, and the deterministic core stays usable without it. This is not a
precedent for presentation dependencies elsewhere.

Byte-identical rasterisation across hosts is **not** claimed — font
rasterisation differs between machines. Correspondence is asserted instead
through `exports/render-manifest.json`, which records the SHA-256 of the master
each raster came from, plus the real pixel geometry read back out of the PNG
header. A master edited without re-exporting is a gate failure. The model, the
masters and the PDFs *are* byte-deterministic and CI diffs them directly.

`bin/export-png.mjs` refuses to rasterise anything that is not a declared
master, refuses an undeclared size, refuses output whose real pixels disagree
with the request, and probes the host for a usable face first — a missing font
otherwise yields a valid PNG with every label silently absent.

## Recorded contract discrepancies

Carried in `evidence/visual-model.json` under `contractDiscrepancies`, and not
resolved here because they belong to another issue's contract.

1. **The five-second variant has no filename token.** The visual manifest asks
   for a five-second presentation role; the frozen HAC-332 grammar accepts only
   `light`, `dark`, `mono` and `static`, none of which means "simplified".
   HAC-332 was **not** modified. The five-second boards carry their own
   conformant slug and record `presentationRole: "5s"` as metadata. A filename
   token, if genuinely wanted, is a HAC-332 amendment.
2. **Builder and parser disagree about families.** `buildExportName` checks the
   id's shape; `validateExportName` checks membership in `FAMILIES`. Ported
   faithfully rather than repaired; every export path round-trips its own output
   through the validator, so the asymmetry cannot ship a file.
3. **Three deployment revisions** — corrected, above.
4. **The observer note** — corrected, above.

## Verify

```sh
pnpm run check:visuals
pnpm vitest run test/hac-334-gate-perturbation.test.mjs
```

The gate fails on: an arm total, decision or check count drifting from the
frozen record; treatment and perturbation swapped; the baseline gaining a
decision; `alpha` or a negative control drifting; wrong-audience labelled as a
cloud control; `EXECUTED` and `OBSERVED` collapsing; either proof class growing
the other's apparatus; one board rendering both runs; `AUTHORIZED` or
observer-cannot-authorize or exactly-once copy in a claim-bearing position; an
unevidenced deployment revision; a fabricated `runtimeSourceUrl`; an evidence
link on a mutable branch; the source packet claimed as published; a mark or a
metric on the HAC-319 shell; a raster stale against its master; a derivative
without a master; an export name outside the frozen grammar; an undeclared file
beside the masters; a lost title, description or non-claim rail.

**31 negative cases** are proven to fire, each by injecting the defect it
targets into a throwaway copy.
