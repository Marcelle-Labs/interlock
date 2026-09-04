# Canva assembly — Take 0.1

Canva is the final editor. `canva-timeline.csv` is the edit decision list:
one row per beat with IN / OUT / SECONDS / ASSET / NARRATION / ON_SCREEN_COPY /
**FOCUS_CUES** / TRANSITION_OUT / PROOF_CLASS / SOURCE / STATE.

**16 beats, 03:37.0.** Cap is 04:00, so there is 23s of headroom for a slower read.

## Import

1. Upload everything in `../selects/` (16 files, T03…T19, named by beat and block).
2. Upload the eight `../voice/VO-0*.mp3` once generated.
3. Upload `../captions/take-0.en.srt`.

**For T04, upload `../deterministic/IL-MOT-021-forensic-replay-1920x1080.mp4`**,
not the copy inside the assembled cut — the backup cut re-encoded it at the
concat stage. Place the canonical file and let Canva encode it once, at export.

**T04 plays 0.000 → 29.000, not to 30.000.** The last second is the replay's own
INTERLOCK card, which is the same wordmark and tagline as the end card at T19.
See `../review/replacement-map.md` before changing this.

## Focus cues — the whole point of this pass

The evidence frames hold the right facts but too much small text for an embedded
player. Each cue makes the narrated referent temporarily dominate. The full frame
is on screen before and after every cue, so provenance is never the last thing
removed.

Two treatments only:

- **`PUNCH [x y w h]`** — crop the 1920×1080 source to that 16:9 box and fill the
  frame. Hard in, hard out. No ease, no drift, no ambient motion. Canva may use a
  0.3s ease if a join reads abruptly. **4 in the film.**
- **`DIM keep y1-y2`** — no scale change. Two black bands at 55% opacity cover
  everything above `y1` and below `y2`. The narrated band stays at full
  brightness; the rest stays legible behind the matte. **11 in the film.**

**Never PUNCH a line that runs full-bleed.** Where a receipt digest or a revision
hash extends past a crop edge, the cue is DIM instead — a half-hash on screen
reads as a rendering error and costs more credibility than the zoom buys.
Three of the first sixteen cues were rendered, read back, and corrected for
exactly this. Do not re-aim a box without re-rendering it.

T04 takes no cue of any kind. T07, T14, T15, T18 and T19 are deliberately plain.

## Canva may

cut · crop · caption · set type · mix audio · apply the transitions and focus
cues named in the CSV.

## Canva must not

manufacture product states, metrics, receipts, evidence relationships or Cloud
telemetry. Every number on screen is already burned into its frame. If a figure
seems to be missing, it is missing from the evidence and must stay missing.

## Transitions

- `CROSSFADE_0.4` — 0.4s crossfade, matching the HAC-336 cut contract.
- `HARD_CUT` — no transition.
- `HARD_CUT_REQUIRED` — **not a style choice.** Two of them, either side of the
  proof-class reset: T06→T07 and T07→T08. A crossfade there dissolves a
  controlled evaluation into a deployed Cloud run and asserts something the
  evidence does not support.

## Two ordering rules

1. **T05 and T06 are one contiguous unit.** The four-arm comparison and the
   evidence ablation may not be separated, reordered, or interrupted. HAC-343's
   own export says the 0/2 in Panel 1 "means nothing without Panel 2 beside it".
2. **T04 is a fixed block.** Do not loop, speed-ramp or time-remap it. Its frame
   at time *t* is a pure function of *t*; changing the clock changes what it says.
   The out-point is the only permitted edit.

## Audio

Drop each VO file at the IN of the first beat carrying its id:

| | | | |
|---|---|---|---|
| VO-01 `0:00.0` | VO-02 `0:08.0` | VO-03 `0:37.0` | VO-04 `1:03.5` |
| VO-05 `1:09.0` | VO-06 `1:57.5` | VO-07 `2:36.0` | VO-08 `3:00.5` |

Every segment has 1.3–5.5s of slack in its window. Let the tail breathe rather
than stretching the picture.

No music bed. If one is added it must not play under T07 — the reset reads as a
full stop, and a continuous bed re-joins what the hard cut separates.

## Captions

`../captions/take-0.en.srt` is **60 cards**, 1.3–6.0s each, median 3.1s, split at
sentence and clause boundaries and wrapped to at most two lines of 46 characters.
It is not one card per beat — a paragraph held for the length of a beat covers the
evidence it is describing, which is the one thing a caption on this film must not
do.

Sit them in the bottom 190px. HAC-333 froze a 1680×200 caption-safe foot for
exactly this. On the Google Cloud beats the frame carries its own paragraph
restating the same sentence, so keep the caption hard to the bottom edge or drop
it on those beats and let the frame's own text serve.

`../review/TAKE-0.1-REVIEW-captions-burned-in.mp4` is the same cut with these
cards burned in. It is a **review copy** — it exists so the read can be judged
against picture before any voice is recorded. Do not ship it; Canva should
consume the clean export plus the SRT.
