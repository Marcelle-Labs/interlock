# HAC-336 — final media assembly

The judge-facing cut, as a repository-native contract. This issue owns the
**edit**: which frozen artifact is on screen, for how long, under which proof
class, saying what. It owns no facts. Every number in the video was frozen by
HAC-330, HAC-343 or HAC-324 before this package existed, and every board here
reads those files rather than restating them.

**Runtime 3:49.5 against a 4:00 ceiling. 1920 × 1080, H.264, no audio track.**

## Files

| Path | Role |
| --- | --- |
| `evidence/cut.json` | **Authored.** The edit decision list: beats, holds, sources, proof classes, narration, claim citations. The only file here a human writes. |
| `evidence/filmed-run-claims.json` | **Authored.** Claim rows for the HAC-324 filmed run, each bound to JSON pointers into the frozen record. |
| `evidence/input-manifest.json` | Derived. Every artifact the cut consumes, with its content digest, plus every declared revision and whether it could be checked. |
| `evidence/scene-map.json` | Derived. Timestamp → scene → proof class → source artifact → claim. |
| `evidence/frame-manifest.json` | Derived. One row per beat: the frame, its digest, and the artifact it came from. |
| `evidence/render-manifest.json` | Derived. What the encoder actually wrote, read back out of the file. |
| `masters/*.svg` | The six film boards, in the HAC-334 display-list grammar. |
| `frames/*.png` | The composed holds. Also the reduced-motion equivalent — see below. |
| `captions/*.vtt`, `*.srt` | The narration track. |
| `exports/IL-MOT-020-…mp4` | The cut. |
| `bin/verify-film.mjs` | The gate. Node builtins only. |

## Build

```sh
pnpm run film:build     # boards -> frames -> captions -> manifests
pnpm run film:render    # the encode; needs ffmpeg, and is not run in CI
pnpm run check:film     # the gate
```

`film:derive` is the subset CI re-runs and diffs: boards, captions and the two
manifests are pure functions of the cut and the frozen evidence. Frames are not
— resvg's text rasterisation is not byte-identical across hosts — so they are
bound by source digest instead, exactly as HAC-334 established for its PNGs.

## Two proof classes, one reset, nothing crossing

The cut is built around a hard divide at **B09**, HAC-333's SB-06.

**Before it — controlled local.** HAC-330's counterfactual (`140 > 130`,
`WITHHOLD_SERIALIZE` → `120 <= 130`, perturbed evidence → `ALLOW_PARALLEL` →
`140 > 130`, checks 24/24) and HAC-343's bounded four-arm evaluation. Paper
field. Deterministic, local, no cloud runtime.

**After it — Google Cloud participation.** The HAC-324 **authoritative filmed
run**, correlation `ilk-hac340-cloud-1787536029323`: five frames captured while a
real `gemini-3.5-flash` agent traversed Google ADK 1.35.1 on Cloud Run through
the Interlock MCP proxy, producing `ALLOW` + receipt, an `EXECUTED` protected
mutation at `105 <= 130`, an independently authenticated `OBSERVED` read-back at
`alpha=45`, and Cloud Logging correlation. Ink field.

The gate refuses class-B material before the reset, class-A material after it, a
filmed capture presented under any class but B, and the frozen HAC-340 reference
run's correlation id anywhere in judge-facing copy.

### Why the architecture board is new

`IL-DIAG-011` and `IL-DIAG-012` already explain this topology, and they are
excellent. They also name `interlock-hac340-proxy-00002-wzf` and correlation
`…1786730369123`, which belong to the **frozen reference run**. Putting either
beside filmed footage would place two run identities in one act — the precise
collapse HAC-324 exists to prevent. `IL-DIAG-020` is bound to the filmed run and
to nothing else.

## What the cut does to filmed evidence

Exactly one thing: a **crop**. A rectangle of the original pixels, scaled
uniformly into a stage, with board chrome drawn around it. No recolouring, no
redaction, no compositing of two captures, no text inside the stage.

A 1920 × 1080 terminal capture with its content in the top third is unreadable at
video bitrates. Cropping to that content changes what a judge can read, not what
the evidence says. Every crop rectangle is declared in the cut, recorded on the
frame, and compared by the gate — so a crop that quietly excluded an
inconvenient line is visible as a rectangle that moved.

All five promoted scenes appear. The gate fails if one is dropped.

## Audio, captions, and reduced motion

**There is no audio track**, and the gate fails if one appears. HAC-333 froze
this cut as muted: every claim has to survive with the sound off. The captions
carry the narration text — the words a voice-over would speak, written so that
recording one later is a matter of reading them aloud rather than re-authoring
them. Synthetic speech was not generated: a channel no gate can check and no
human spoke is not an accessibility feature.

**Reduced motion.** The only motion in 3:49 is a 0.4 s crossfade between two
still holds. It carries a state change and nothing else — every proposition is
legible on the frame at either end. `frames/` is therefore a complete static
equivalent of the cut, not an approximation of one: the frame set and the video
say the same thing, and the scene map orders them.

Nothing on screen implies a frozen result is being recomputed while the viewer
watches. There are no counters, no typewriter effects, no particles, and no
agent-thinking cues.

## The first thirty seconds

`B01`–`B05` establish, with the sound off: two intents each valid alone, one
shared environment carrying one joint bound, and `140 > 130` at display size
marked `INVALID JOINT STATE`. The gate requires every beat that starts before
0:30 either to be a frozen board that carries its own copy or to record what a
muted reader takes from it, so the thesis can never come to depend on the caption
track.

## The HAC-343 scene

The media guardrail requires Panel 1 and Panel 2 to be one contiguous visual
unit, so the `0/2` Interlock figure never stands alone as a broader safety claim.
`IL-PROOF-021` satisfies that literally: the `ablation` state is the `comparison`
state with the control panel added, on the same board. The per-target lock
credibility strip (`2/2` serialized, `4/4` parallelized, `2/2` missed) stays
visible on both, so A3 never reads as a straw man.

The gate checks all four arms, both ablation rows and the credibility strip are
present on the ablation board, and that the ablation beat immediately follows the
comparison beat.

## What the cut does not claim

Carried by `IL-PROOF-014` at B19 and `IL-PROOF-022` at B18, and enforced by the
gate's phrase list: Interlock is not universally safe and not safer than locking;
no `0%`/`100%` headline over a heterogeneous corpus; no interval or statistical
significance; no exactly-once, restart safety, target-side atomicity or
production readiness; Agent Runtime, Agent Gateway, Memory Bank and
`CONTENT_AUTHZ` did not participate; `ALLOW` is a decision, not a verification or
an authorization; Cloud Run IAM establishes transport provenance only; the two
runs are two runs.

Several of those phrases are ones the cut is *required* to say, in the negative —
a limitations board that could not print "exactly-once" could not disclaim it
either. The phrase check therefore flags a hit only when nothing nearby negates
it, and `test/hac-336-film-gates.test.mjs` separately proves the bare assertive
form of each still fails.

## Cold read

**Not run. No result is claimed.**

`media/hac-341/cold-read/` is the moderator kit and it is the protocol for this
cut too: three technically competent readers unfamiliar with the build, tested
one at a time, no pre-explanation. Until three real readers have completed it,
this package stays `READY_FOR_HUMAN_TEST` and nothing here may describe the media
as frozen. LLM judges, agent review and automated browser tests are not
substitutes.

## Verify

```sh
pnpm run check:film
pnpm vitest run test/hac-336-film-gates.test.mjs
```

The gate fails on: a cut over four minutes; an encoded duration that disagrees
with the derived one; a frame that changed after the encode; a filmed frame whose
bytes do not hash to the digest the capture manifest promoted; a promoted scene
dropped without record; a crop that moved; a claim citation with no ledger row; a
filmed-run row whose pointer stopped resolving; a forbidden phrasing asserted
without negation; a missing boundary statement; the ablation control separated
from its comparison; a beat in the opening thirty seconds with no muted reading;
a caption that drifted from its narration; an audio track; a declared input whose
bytes moved; and a declared revision the evidence no longer carries.
