# Take 0 — authoritative-replacement map

What in this cut is final, what is provisional, and what must be swapped when
the authoritative work lands.

## FINAL — do not re-shoot

| Beats | Asset | Why it is final |
| --- | --- | --- |
| T04 | `media/hac-350/exports/IL-MOT-021-forensic-replay-1920x1080.mp4` | Canonical deterministic export. 900 frames, 30.000s, sha256 `46ac324c…`. `check:replay` re-renders every frame forwards and by reverse seek and compares digests. There is nothing to improve by re-shooting; re-recording it would strictly degrade it. **r02 plays it to 29.000s** — a timeline out-point, not an asset edit; the file is byte-identical and the gate still passes. |
| T03, T05–T06, T18 | HAC-336 board frames | Derived from frozen HAC-330 / HAC-343 evidence by `film:derive`, gated by `check:film`. A change to the evidence rebuilds them; a change to the film does not. |
| T08–T13 | HAC-324 filmed-run captures | Live captures from the authoritative filmed run. The Google Cloud project `interlock-film-260823` is deleted, so these are not reproducible — and do not need to be. |
| T14–T15 | HAC-336 architecture boards | Derived from the same filmed run record. |
| T17 | `media/hac-334/exports/IL-PROOF-014-claim-boundary-1920x1080.png` | Gated by `check:visuals`. |

## PROVISIONAL — replace when the authoritative version exists

| Beat | Asset | Replace with | Trigger |
| --- | --- | --- | --- |
| T19 | `take-0/deterministic/TAKE0-end-card-1920x1080.png` | An HAC-335-authored end card under an `IL-SCAF-0xx` id, carrying the same two lines and no result | HAC-335 recording-authority pass. Generated here by `take-0/bin/build-end-card.mjs` because the shipped `IL-SCAF-011` recaps figures, and HAC-349's close specifies a card that asserts nothing. Delete the generator when it is superseded. |
| VO-01…VO-08 | ElevenLabs synthesis (not yet generated) | The real human cold read | HAC-341 `cold-read/` protocol. The written segments stand; only the voice is replaced. Segment boundaries are chosen so a per-segment re-record needs no re-edit. |
| whole cut | `take-0/exports/TAKE-0.1-…mp4` | The Canva assembly with crossfades, captions and mixed VO | Take 1. This file is the fallback if Canva work does not finish. `TAKE-0-r01-picture-lock-…mp4` is kept beside it as the reviewed version. |

## THE ONE DECISION THAT NEEDS YOUR EYE

The review asked for two things that cannot both hold: *"do not trim the replay"*
and *"cut the one-second Interlock bumper around 0:45"*. The bumper is scene END
of the canonical export, frames 870–899. It is inside the replay.

**r02 trims it.** Three reasons: the bumper shows the same wordmark and the same
tagline as the film's actual end card, 2m50s later; S8 ends on the red 140
returning, and cutting from that straight into the four-arm table is a harder,
better join than fading through a logo; and the canonical file is untouched, so
nothing about determinism or `check:replay` changes.

To revert: delete `trimOut` on T04 in the manifest and rebuild. Costs 1.0s.

## AVAILABLE BUT DELIBERATELY NOT IN THE CUT

| Asset | Why it is out |
| --- | --- |
| `selects/OPT-cockpit-cloud-evidence-…png`, `OPT-cockpit-cloud-overview-…png` | The cockpit view-model publishes the **frozen** run `ilk-hac340-cloud-1786730369123`; every cloud beat in this cut is the **filmed** run `…1787536029323`. Cutting them together would put two run ids on screen inside one proof class and imply one run. Including them needs either an on-screen run-identity label or an HAC-341 view-model row for the filmed run. Neither is Take 0 work. |
| `selects/OPT-alt-end-card-IL-SCAF-011.png` | Recaps figures. HAC-349's close asks for no new result in the end card. |
| `selects/OPT-prior-cut-IL-MOT-020-3m49s.mp4` | The pre-HAC-349 assembly: brand-first open, 56s of HAC-330 boards where the forensic replay now sits. Kept only as a fallback if this cut is rejected wholesale. |
| `selects/OPT-r01-cut-T01-intents.png`, `OPT-r01-cut-T02-coupled.png` | The 8.5s of causal setup r02 cut from the cold open. The replay re-tells it in its own first eight seconds, so the film said it twice. Restore only if a cold reader cannot follow the open. |
| `selects/OPT-r01-cut-T16-bounds.png` | The bounds board r02 cut. Its corpus bound moved into VO-08; its 6/8 refusal-reason disclosure now lives only in the repo. Restore if a reader asks what the evaluation's limits were. |
| Authorization / gate GIF | Not present in this worktree. HAC-349 permits ~0.5–1s of it as punctuation only; the cold open is stronger without a logo beat, and none is used. |

## NOT DONE, AND WHY

**A fresh HAC-324-class Google Cloud filmed run was not executed.** Three
independent reasons, any one of which is sufficient:

1. **It is not needed.** The authorisation was bounded by "if current footage is
   insufficient". It is not. `ilk-hac340-cloud-1787536029323` is already a
   distinct, non-frozen filmed run, recorded live, and
   `experiments/hac-324/bin/verify-filmed-run.mjs` passes. Its own record states
   it is claim-equivalent to the frozen HAC-340 participation claim on 16 of 16
   material parity fields, and it is never substituted into the frozen packet.
2. **It is not executable from this worktree.** `experiments/hac-340/` does not
   exist here. There are no deployment scripts, no agent image source and no
   Dockerfiles; `experiments/hac-324/bin/` holds only `build-filmed-run.mjs` and
   `verify-filmed-run.mjs`. A fresh run would mean reconstructing the whole
   HAC-340 deployment first.
3. **The environment is gone.** `capture-package.json` records teardown
   completed at 2026-08-24T01:50:43Z with `projectLifecycleState:
   DELETE_REQUESTED`. The authenticated `gcloud` session on this machine points
   at an unrelated project (`nimble-octagon-505403-n3`).

No parity check was therefore run, and no new run identity, receipt or
correlation id was minted. Nothing was written into the frozen HAC-340 packet.
