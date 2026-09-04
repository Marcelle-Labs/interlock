# HAC-336 rc1 — the narrated release candidate

Release candidate 1 of the judge-facing cut: **3:31.9, 1920 × 1080, H.264,
with an ElevenLabs narration track and a caption track.**

> **RC1 is not freezable.** `R08L`, the live Proof-of-Action segment, is a
> reserved 30.0s slot at 1:49–2:19 with no footage in it yet. `check:rc1`
> reports `AWAITING LIVE CAPTURE` until it is filled. See
> [`CAPTURE-RUNBOOK.md`](./CAPTURE-RUNBOOK.md).

It reuses HAC-336's editorial contract and adds three things the silent cut did
not have: a voice, a derived timing model that the picture is cut to, and the
HAC-350 forensic replay as the opening act.

It owns no facts. Every visual is a frozen artifact from HAC-324, HAC-330,
HAC-334, HAC-335, HAC-343 or HAC-350, bound here by content digest.

## Files

| Path | Role |
| --- | --- |
| `evidence/cut-rc1.json` | **Authored.** The only file here a human writes: beat order, sources, and the spoken/caption text of every line. |
| `evidence/narration-manifest.json` | Derived. One row per line: the audio, its digest, and its **measured** duration. |
| `evidence/scene-manifest.json` | Derived. Timestamp → beat → proof class → source → narration. |
| `evidence/asset-source-map.json` | Derived. Every visual, with its digest recomputed from disk. |
| `evidence/render-manifest.json` | Derived. What the encoder actually wrote, read back out of the file. |
| `narration/L*.mp3`, `L*.wav` | The synthesised lines, and their head/tail-trimmed twins. |
| `captions/interlock-rc1.en.vtt`, `.srt` | The caption track. |
| `inserts/` | The HAC-350 replay, and the proof-class label drawn over it. |
| `exports/IL-MOT-022-…mp4` | The cut. |
| `NARRATION-SCRIPT.md` | Derived. The script, with timestamps, generated from the manifests. |
| `bin/verify-rc1.mjs` | The gate. Node builtins only. |

## Build

```sh
pnpm run rc1:narrate   # ElevenLabs, via doppler; regenerates only changed lines
pnpm run rc1:derive    # label -> captions -> manifests
pnpm run rc1:render    # the encode; needs ffmpeg, and is not run in CI
pnpm run check:rc1     # the gate
```

The API key is never read from or written to a file. `rc1:narrate` takes it from
`doppler run` and uses it only as a request header.

## What the Take 0.1 cold read changed

The cold read found the silent cut imposed too much simultaneous reading load: a
non-technical viewer could not survey the visuals while reading fast-changing
subtitles, and lost the argument at the four-strategy section.

The response was **temporal hierarchy**, not more words. Narration now leads
attention and the screen keeps the evidence.

| | Take 0.1 | RC1 |
| --- | --- | --- |
| Speech density | 86.2% | **66.5%** |
| Caption turnover | 12.8 cues/min | **10.4 cues/min** |
| Mean cue on screen | 4.02s | **5.11s** |
| Cues under 3s | 20% | **0%** |
| Narration words | 407 | **325** |
| Narration lines | 20 long | **33 short** |

Four devices, all authored in `cut-rc1.json` and derived by the timeline:

1. **Lead-in.** A beat opens with silence before its first line, so the frame
   arrives before the voice does.
2. **Gap.** A negative `atSeconds` is a *gap after the previous line*. Between
   waves of narration the caption track is empty, so explanatory text is not
   changing while the viewer inspects a table or a JSON body.
3. **Settle.** `tailSecondsOverride` holds the frame after the last line with
   nothing new to read, long enough for the narrated proposition to resolve.
   R03 (four-strategy) and R04 (ablation) — where the cold read lost the
   argument — settle for 3.4s; R09 (the `EXECUTED` JSON) 4.4s and R11 (Cloud
   Logging) 4.2s, because those are frames a viewer must actually read. The gate
   requires every beat to settle at least 1.2s.
4. **Dwell.** The last cue of a line stays up into the silent gap that follows,
   bounded so it clears 0.5s before the next line and never lingers more than
   2.5s past the audio. Shortening the lines had cut the mean cue to 3.86s —
   less frequent flashing, but still flashing. What competed for attention was
   text *changing*, not text being present.

Lines are authored short enough that one line is one or two cues, not four. The
turnover ceiling is 11.0 cues/min rather than something lower because 33 lines
across 3:39 put a hard floor of 9.1 cues/min at one cue per line; a stricter
number could only be met by deleting propositions.

## The muted-survival gate is unchanged, and now mechanical

Narration directs attention; it does not carry claims. The gate asserts both
halves:

- **No measured result is narrated.** `105`, `130`, `140`, `120`, `45`, `24`,
  `403`, `401` appear nowhere in the spoken track. They are on the frame, where
  a muted viewer still recovers them. The only numbers spoken at all are `3.5`
  and `1.35.1`, and each must exist in frozen evidence.
- **The frames are untouched.** Every board and capture is the same frozen
  artifact, bound by digest. Nothing was redrawn to suit the voice.

So the film still survives with the sound off — the boards carry every canonical
claim exactly as HAC-336 froze them — but the claims no longer all compete for
attention at once.

## Holds are derived, never authored

`cut-rc1.json` carries no `holdSeconds`. A beat's hold is
`lead-in + measured narration + tail`, computed in `bin/lib/rc1-timeline.mjs`
from the duration ffprobe reads back out of the encoded line. A hand-set hold is
a hold nobody re-checked: the first re-recorded line leaves it stale and still
green. The gate asserts the absence.

Head and tail silence is trimmed off each line before measuring, so a hold does
not buy the synthesiser's padding twice. Pauses *inside* a line are kept — an
earlier pass stripped those too and pushed the read to 161 wpm.

## Two proof classes, one reset

The reset is at **1:15.8** (R05). Everything before it is controlled and local;
everything after it is the HAC-324 filmed run on Google Cloud. The gate refuses
class-B material before the reset, controlled material after it, more than one
reset, and any filmed capture before it.

**This reorders the brief.** Section 5 of the RC1 brief placed Proof of Action at
0:45 and the four-strategy result at 2:00, which crosses the proof-class boundary
three times. Section 2 of the same brief fixes the transition line as *"That's
the controlled evaluation. Separately, here's the system running on Google
Cloud"* — which reads controlled-first — and section 12 asks whether a judge
could conclude the controlled experiment ran on Google Cloud. One reset is the
stronger answer to that question, and HAC-336's film gate already refuses the
crossing ordering; AGENTS.md forbids weakening a gate to recover green. So the
acts run controlled → reset → cloud.

## What the cut does to its sources

Two things, both recorded:

1. **A trim.** The HAC-350 replay runs 30.000s and ends on its own INTERLOCK end
   card. Inside that package the card closes a standalone piece; dropped into
   this film it lands a brand card at 0:29 — a premature ending beat, and a
   duplicate of RC1's own closing card. The insert is cut to 29.0s. Scene S8
   settles at 29.0, so no evidence, figure or scene is shortened.
2. **A label.** `CONTROLLED EVALUATION — RECORDED EVIDENCE` is composited into
   the band at y=1012–1064, measured empty across every paper scene of the replay
   (darkest pixel 249/255 at fourteen sampled times). It fades out before the
   final ink card. It recolours nothing and covers no measured value.

Nothing else. No recolouring, no redaction, no compositing of two captures, no
text inside a filmed stage.

## Captions

Cues are derived from the same timeline as the picture, so a caption cannot
drift from the line it transcribes. A long line becomes several cues, partitioned
by a small exact search that keeps them near-equal and prefers to break where a
sentence ends — greedy filling stranded a 0.9s cue reading *"was removed."*

Where the spoken and captioned forms differ, the caption is the **more precise**
record, never a simplification: it prints `ALLOW_PARALLEL`, `EXECUTED`,
`OBSERVED` and `gemini-3.5-flash` exactly, where the voice reads the same tokens
as natural language. The gate asserts that direction, on normalised tokens.

## Proof of Action: a live take, not a slideshow of a real run

Devpost weights **Demo & Production Readiness at 30% of Stage Two**, and its
Proof of Action criterion asks whether the video shows an **unedited, live
execution of the agent performing its task**. The rules separately require the
video to demonstrate the backend running on Google Cloud.

RC1 through 0.2 answered that with six frozen captures. They are real evidence
of a real run and digest-bound to HAC-324 — but they are stills, and a still
asks a judge to trust that it came from something that happened.

So `R08L` replaces the four captures that duplicated it (`R08` traversal, `R09`
`EXECUTED`, `R10` `OBSERVED`, `R11` Cloud Logging — 38.8s) with **one continuous
30.0s live take**. The act now runs:

| | Beats | Role |
| --- | --- | --- |
| see it happen | **R08L** | one unedited take: invocation → agent action → Interlock decision → `EXECUTED` → independent `OBSERVED` → correlated Cloud Logging |
| understand the receipt | R06, R07 | the configuration read-back and the Cloud Run topology that set it up |
| inspect the evidence | R12, R13 | the path and the trust boundary that explain what was just seen |

Net runtime **falls** from 3:39.5 to 3:31.9, so none of the pacing bought with
the Take 0.1 cold read was traded to make room.

The gate enforces the shape: exactly one `live-capture` beat, class B, after the
proof-class reset, declaring what its single take must show continuously — and
`POA-not-pending` fails while the slot is empty, so RC1 cannot freeze by
accident. The timeline treats `live-capture` as a **fixed-duration** source:
narration is fitted into the take, never the take trimmed to suit a voice-over.

## Audition kit

`pnpm run rc1:render` also writes the two derivatives the cold-view audition
needs, so all three modes are guaranteed to be the same master:

| Mode | File | Reader sees | Reader hears |
| --- | --- | --- | --- |
| A · normal | `exports/IL-MOT-022-…mp4` | picture + captions | narration |
| B · muted | `audition/RC1-muted.mp4` | picture + captions | nothing |
| C · audio-only | `audition/RC1-audio-only.m4a` | nothing | narration |

`audition/AUDITION-PROTOCOL.md` is the script. **It is run by a human**, and no
result in it may be filled in by a model. Both derivatives are gitignored — one
stream copy away from the master, 12M for no new information.

## Measured outcomes may be narrated; evidence must be on screen

An earlier revision of this gate banned every measured outcome from the
narration. That was over-broad and self-imposed: muted survivability requires
the evidence to stay **on screen**, where a viewer with no sound recovers it. It
does not require the audio to omit the outcome, and a listener with no picture is
a real reviewer too.

The rule is now two-sided, and the audio-only criterion is mechanical:

- the frames stay untouched and digest-bound, which is what actually keeps the
  measured values recoverable in silence;
- narration may state an outcome, but may not state a **number** absent from
  every frozen evidence file — which is what stops the voice inventing one;
- four `CHAIN-*` checks require the spoken track **alone** to establish the
  causal chain: the lock is right about the contention it sees, it misses the
  demonstrated cross-target hazard, revision-bound evidence changes the
  decision, and ablating that evidence restores the failures. A later edit
  cannot delete a load-bearing line and still pass.
- one `CHAIN-no-unwaived-deictic` check flags spoken lines that point at
  something a listener cannot see. A deictic may be waived in
  `audioOnlyDeicticWaivers` with a reason; it may not pass unnoticed.

`Google ADK 1.35.1` is deliberately **not** spoken. The pinned version is on the
R06 evidence frame and in the caption; the voice says "Google ADK", which removes
a pronunciation risk that bought no judge value.

## Remaining replacement slots

Only these three. Everything else is final editorial intent.

| Slot | State | What replaces it |
| --- | --- | --- |
| **HAC-324 authoritative Proof of Action** | **Already satisfied.** `check:filmed-run` passes: 5 frames digest-matched and quality-PASS, teardown complete, bound to run `ilk-hac340-cloud-1787536029323`. R06–R11 are the authoritative footage, not a stand-in. | Nothing pending, unless HAC-324 re-films. |
| **HAC-348 human-earned copy** | Open. Film language is not rewritten proactively. | Only a concrete comprehension failure found by the three-reader run, and only in the lines it names. |
| **HAC-335 freshness assets** | Open. `IL-SCAF-011` (end card, R17) is the one judge-facing capture-derived asset in the cut. | Re-export after the public surface freezes, then `pnpm run rc1:render`. |

A fourth substitution is possible but not required: one final ElevenLabs
regeneration after HAC-348 lands. Because holds are derived, re-running
`rc1:narrate` and `rc1:render` re-cuts the picture to the new audio on its own.
