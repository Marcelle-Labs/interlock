# HAC-351 → HAC-336 integration instruction

**Disposition: `VEO_REJECTED`. The deterministic opening is authoritative.**

HAC-336 should change nothing. This file exists so that decision is written
down rather than inferred from an absence.

## What HAC-336 does

Nothing. Keep the RC1 opening exactly as it stands:

| | |
| --- | --- |
| Opening beat | `R01`, 0.0–28.6s, proof class `EVAL` |
| Source | the HAC-350 Forensic Replay insert, trimmed to 29.0s |
| Narration | the RC1 lines already committed in `cut-rc1.json` |

Do not import `media/hac-351/edited/IL-VEO-001-cold-open-30fps.mp4` into the cut.
Do not add a `hac-351` row to the RC1 asset source map. `check:rc1` and
`check:film` both pass today without this directory, and removing
`media/hac-351/` entirely leaves the film byte-identical.

## Why, in one line

The generated shot is good; "earned" is defined by reader evidence that does not
exist yet, and HAC-351 §17 fixes the tie-break in advance: no evidence of
material gain → ship deterministic.

## RC1 is separately blocked, and not by this issue

`check:rc1` currently reports two things that HAC-351 does not own and has not
touched:

1. **`R08L` is an empty 30.0s slot** at 96.0–126.0s. The gate reports
   `AWAITING LIVE CAPTURE` and refuses to let RC1 freeze. This is HAC-324's
   authoritative Proof-of-Action capture.
2. **`CHAIN-no-unwaived-deictic` fails on line `N03`** — *"Watch the lock. It
   sees one key, and it is right about that key."* — a visual deictic that means
   nothing to an audio-only listener. It needs rewording, or a waiver with a
   reason in `cut-rc1.json`'s `audioOnlyDeicticWaivers`.

Both predate this issue. Neither is fixed here, and neither should be waived to
make a gate green.

## If the cold read later earns the shot

Run `audition/PROTOCOL.md` Test 2. If it passes its gates with zero readers
inferring evidence, architecture, cloud footage or a simulated run:

1. insert `edited/IL-VEO-001-cold-open-30fps.mp4` as a new beat `R00`,
   **0.0–6.0s**, proof class `EVAL`, source class `generated-metaphor`;
2. shift `R01`…`R17` later by 6.0s; the reset moves 88.6s → 94.6s and the total
   goes 211.9s → 217.9s, still inside the 240s ceiling and inside the 3:35–3:45
   target;
3. cut directly from the generated last frame into the deterministic Forensic
   Replay geometry. **No generative dissolve** across that join;
4. composite the title deterministically over the generated frames — the clip
   itself contains no text, and none may be generated into it;
5. add the beat to the RC1 asset source map with its original **and** derivative
   digests, and label the class so the gate can tell it apart from evidence;
6. re-run `pnpm run check:rc1`, `check:film` and `check:veo`.

The narrator selection is independent of this and applies either way: see
`evidence/audition-manifest.json` and Test 1.
