# Take 0.1 — the backup cut

A complete, submittable ≤4-minute film that exists **now**, so the final weekend
is spent improving a film rather than starting one.

**`exports/TAKE-0.1-interlock-backup-cut-1920x1080.mp4` — 03:37.0, 1920×1080,
30fps, 6510 frames, no audio track.**

`exports/TAKE-0-r01-picture-lock-1920x1080.mp4` (03:51.0) is the version that was
reviewed. Kept for comparison; not the deliverable.

## Status

Submittable as-is with captions burned from `captions/take-0.en.srt`.
Add the eight VO segments and it is finished.

## What r02 changed

| Edit | Effect |
| --- | --- |
| Cold open compressed 16.0s → 8.0s | The film opens on `140 > 130`. T01 and T02 were cut: the replay re-tells that setup in its own first eight seconds, so it was said twice. |
| 15 focus cues added | 4 `PUNCH` (16:9 crop), 11 `DIM` (matte bands). Coordinates measured off the frames. Three of the first sixteen were rendered, read back, and corrected because they truncated a command, a title and a receipt digest. |
| Bounds board (T16) cut | The three-column claim boundary at T17 carries the close. The corpus bound moved into VO-08 so it is still said out loud. |
| Replay out-point 30.000 → 29.000 | Drops the replay's own INTERLOCK card, which duplicated the end card. Timeline edit; the canonical file is untouched. See `review/replacement-map.md`. |

Runtime 03:51.0 → 03:37.0. Spoken 03:25.6 → 03:12.6, over a shorter picture.

## What this package is not

It is not evidence, and no gate reads it. Every frame it orders is produced and
gated elsewhere: `check:replay` for the forensic replay, `check:film` for the
board frames, `check:filmed-run` for the Google Cloud captures, `check:visuals`
for the claim-boundary board. This package adds ordering, duration, narration and
focus cues, and nothing else. It is deliberately outside every `evidence/`
directory and is not committed by default.

## Layout

| Path | What |
| --- | --- |
| `manifest/take-0-timeline.json` | The one authored file. Everything else derives from it. `take-0-timeline.r01.json` is the reviewed picture-lock. |
| `script/narration.md` | The locked narration and shot plan, generated. |
| `voice/` | Eight ElevenLabs-ready segments: `VO-0N.txt` to paste, `VO-0N.md` with timing, pronunciation and a safe shortening. |
| `captions/` | SRT and VTT aligned to beat starts. |
| `canva/` | `canva-timeline.csv` (the EDL, with a FOCUS_CUES column) and `CANVA-INSTRUCTIONS.md`. |
| `selects/` | The 16 beat assets, staged and named by beat, plus the `OPT-` selects that are deliberately not in the cut. |
| `deterministic/` | The canonical HAC-350 export, untouched, and the generated end card. |
| `exports/` | The assembled cut, and the r01 picture-lock. |
| `review/` | `claim-audit.md`, `replacement-map.md`, `montage.jpg`. |
| `raw/` | Empty. No screen recording was required. |

## Rebuild

```sh
node take-0/bin/build-end-card.mjs          # the provisional end card
node take-0/bin/build-take-0.mjs            # validate + emit voice/captions/canva
node take-0/bin/build-take-0.mjs --render   # + assemble the cut (needs ffmpeg)
```

`build-take-0.mjs` exits non-zero if an asset is missing, if a VO segment no
longer fits its window, if the total passes 4:00, if a `PUNCH` box is not 16:9 or
leaves the frame, if a cue lands past the end of its beat, if a beat's cues do not
return to `WIDE`, or if anything tries to put a cue on the forensic replay.

## The one thing to keep straight

The film contains two proof classes and they must never blur:

- **T03–T06** controlled, local, deterministic. No cloud, no receipt, no target.
- **T08–T15** one deployed Google Cloud run, `ilk-hac340-cloud-1787536029323`.

**T07 is the wall between them, hard-cut on both sides.** Neither is evidence for
the other, and the film says so out loud at T07 and again at T17.
