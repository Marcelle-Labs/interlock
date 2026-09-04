# HAC-351 — one bounded generated cold open, and a narrator A/B

An experiment with a disposition, not a deliverable that had to succeed.

**Current disposition: `VEO_REJECTED`.** Not because the shot is weak — it is
the strongest artefact here — but because "earned" is defined by reader
evidence that does not exist yet. See [Disposition](#disposition).

The deterministic opening remains authoritative for HAC-336. Nothing in this
directory is on the critical path, and removing all of it leaves the film intact.

## What is here

| Path | Role |
| --- | --- |
| `bin/build-frames.mjs` | **Authored.** Renders the two deterministic frames from one 3-D world. |
| `masters/`, `frames/` | The first/last frames: composition and continuity authority. |
| `bin/generate.mjs` | The one script that calls a generative video service. |
| `original/` | Service-returned MP4s, untranscoded. Never overwritten. |
| `edited/` | The trimmed, 30fps-conformed derivative. A separate file, always. |
| `evidence/` | Frame manifest, generation receipts, derivative manifest, narration, audition manifest. |
| `qc/` | Extracted frames and contact sheets at 0/2/4/6/8s. |
| `audition/` | The two voice tracks and `PROTOCOL.md`. Human-run. |
| `bin/verify-veo.mjs` | The gate. Node builtins plus ffprobe. |

```sh
node media/hac-351/bin/build-frames.mjs      # deterministic frames
node media/hac-351/bin/generate.mjs p2-velocity   # needs gcloud ADC; costs a generation
node media/hac-351/bin/build-derivative.mjs  # trim + fps conform
pnpm run check:veo                           # the gate
```

## The generated material claims nothing

The clip is **editorial metaphor**. It is not execution evidence, Google Cloud
footage, architecture, telemetry, product UI, a real agent run, or a simulated
Interlock decision. It contains no text, no logo, no label, no number and no
system state — those are deterministic and are composited in post, outside the
generated material.

Content Credentials (C2PA) are present in the originals and are recorded. They
speak to how the media was made. They are not evidence that the illustrated
scenario occurred, and the gate asserts that the manifest says so.

The shot deliberately does **not** show Interlock solving anything. It ends on
the observation that three separate paths were resting on one support. The
mechanism enters immediately afterwards, in deterministic footage.

## Two frames own the composition; the prompt owns only the motion

Veo was never asked to invent the brand. `build-frames.mjs` projects one 3-D
world from two camera stations on a single axis, so lane spacing, vanishing
point and support position are consequences of the projection rather than
numbers typed twice — which is what makes the motion between them a dolly and
not a cut. Colour comes from the HAC-334 draw layer's HAC-332 token
transcription, never from a hex value typed into this directory.

The support is not added by the camera move. At the first station it is below
the bottom edge of the frame; at the second the camera has descended and the
same unchanged geometry is in view. The move discloses it.

## What the API actually did

Preflight was run before spending the budget, and two findings changed the plan:

| Requested | Observed | Disposition |
| --- | --- | --- |
| `enhancePrompt: false` | **Rejected** — code 3, *"Veo 3 prompt enhancement cannot be disabled"* | Field omitted. Prompt rewriting is **not** under our control and is not claimed anywhere. The recorded positive prompt is what we submitted, not necessarily what the model was conditioned on. |
| `personGeneration: "dont_allow"` | Accepted — but **not enum-validated**: a deliberately bogus value was accepted too | Kept, but acceptance is not evidence it was honoured. The input frames contain no people, and any output introducing a person or face is rejected regardless. |
| `generateAudio: false` | Accepted | **Verified mechanically.** ffprobe confirms zero audio streams; the gate asserts it rather than trusting the request. |
| `compressionQuality` | Enum-validated | Not set. |
| `seed` | Accepted | Recorded. **No determinism claim** — the gate asserts the receipt says so. |

A first probe attempt used an invalid `resolution` as a tripwire to test field
acceptance for free. A bogus-field control returned the same error, which proved
the method could not distinguish an accepted field from an ignored one. The
method was discarded rather than reported. This is recorded because a preflight
that quietly keeps an invalidated method is worse than no preflight.

`@google/genai` is **not** pinned, because it is not in the request path. The
mandated Agent Platform route (`v1`, `:predictLongRunning`) is reachable
directly, and this repository has no runtime dependencies at all. Earning a
permanent SDK dependency to issue one HTTP POST was the worse trade. Recorded
deviation, not a silent one.

## Generation budget

Four Fast previews were authorised. **Two were consumed.**

| # | Change | Result |
| --- | --- | --- |
| p1 | baseline motion (canonical prompt) | **Structural fail.** Smooth creep to 3.7s, then a ~5× lurch in one second, then a long retreat. Not restrained, continuous or mechanically plausible. Not polished — HAC-351 §10. |
| p2 | camera velocity only | **Selected.** Max frame-to-frame change 0.0021; the reveal lands; the move stays gentle. |

The standard model (`veo-3.1-generate-001`) was **not** used. §7 permits it only
when the Fast candidate proves the concept *and* the standard model is likely to
be a material improvement. The shot is flat matte geometry on paper whose style
is already owned by the deterministic frames; there is no fidelity headroom for
a larger model to recover, so the request would have bought nothing.

p1 is retained as research rather than deleted. A rejected candidate is the
evidence that the selection was a choice.

## The edit

| | |
| --- | --- |
| Original | 8.000s, 1920×1080, 24/1 native, 192 frames, no audio |
| Derivative | 6.000s, 1920×1080, 30/1, 180 frames, no audio |

The trim ends before the slight backward drift in the last two seconds. The
fps conform duplicates and drops whole frames; optical flow, `minterpolate` and
every other way of synthesising intermediate frames are denylisted in the build
and asserted by the gate. No motion is manufactured that Veo did not output.

## Disposition

`VEO_EARNED` is not an aesthetic judgement. HAC-351 §17 defines it as a
*measured* improvement in judge-speed comprehension with no increase in trust
confusion, and fixes the tie-breaks in advance: neutral → deterministic, mixed →
deterministic, any evidence confusion → reject.

That evidence requires unfamiliar human readers. **No such test has been run**,
and a model may not stand in for one — the same rule the RC1 audition kit
already carries. With no reader evidence, the specified decision rule resolves
to the deterministic path, so the disposition is `VEO_REJECTED`.

This is a successful completion of the experiment, not a failure of it (§19):
the artefacts are preserved, the deterministic fallback is untouched, and no
unvalidated generated footage reaches the submission.

### How it flips

Run both tests in `audition/PROTOCOL.md`. If unfamiliar readers show a material
comprehension or attention gain at the 5–8s, 15–20s and 30s gates, with zero
readers inferring evidence, architecture, cloud footage or a simulated run, then
the disposition flips to `VEO_EARNED` and `edited/IL-VEO-001-cold-open-30fps.mp4`
replaces the first 6.0s of the opening. Nothing else in the cut moves.

Record the result in `audition/RESULTS.md` naming the human who ran it. The gate
checks that file is not model-filled.
