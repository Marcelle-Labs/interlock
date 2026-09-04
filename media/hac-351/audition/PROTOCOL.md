# HAC-351 — the two human tests

Two separate blind tests live here. Both are **run by a person**. No result in
this file, and no result in any sheet derived from it, may be filled in by a
model. That rule is inherited from the RC1 audition kit for the same reason: a
model scoring its own output is not evidence, and the disposition of this issue
turns on these results.

Until a human runs them, both results are **NOT RUN**, and the HAC-351
disposition stays at its evidence-gated default. See `../README.md`.

---

## Test 1 — narrator A/B

### Materials

| Label | File | Do not reveal |
| --- | --- | --- |
| **VOICE A** | `VOICE-A-opening.mp3` | 41.9s |
| **VOICE B** | `VOICE-B-opening.mp3` | 46.6s |

Identical copy (`../evidence/opening-narration.json`), identical synthesis
settings, identical line breaks. The only variable is the voice.

Do not tell the reader which voice is male or female, which is the leading
candidate, or which is currently in RC1. Label them only A and B. Alternate
which one is played first between readers.

### Ask each reader, after hearing each track once

1. What is the problem being described? (unaided recall)
2. What does the product add? (unaided recall)
3. Did you follow it on first listen, or did you need to re-hear anything?
4. Does this person sound like they know the subject?
5. Would you keep watching?
6. Did it tire you before it ended?
7. Did it sound like it was selling something?
8. Did anything sound synthetic or distracting?

### Scoring

Record per reader, per voice, 1–5 for comprehension, credibility, continuation,
fatigue (low is good) and promotional affect (low is good), plus verbatim
answers to 1 and 2. Choose the winner from the answers, not from preference.

Known asymmetry to watch, recorded before the test so it cannot be discovered
conveniently afterwards: **B runs 4.7s longer than A on identical copy** (135 vs
150 wpm). If B loses on fatigue, that difference is a plausible cause and the
finding is "B at this pace", not "male voices are fatiguing". Do not retune
either voice to equalise it — HAC-351 §15 forbids tuning one voice to win.
Re-test at matched pace only if the pace, not the voice, is what separated them.

---

## Test 2 — earn-or-kill cold read

### What is being compared

| Variant | Opening |
| --- | --- |
| **Deterministic** | The HAC-350 Forensic Replay opening, as RC1 currently cuts it |
| **Veo-assisted** | `../edited/IL-VEO-001-cold-open-30fps.mp4` (6.000s), cut directly into the same deterministic material |

Everything after the opening beat is held constant.

### Blocking dependency

A full-film A/B cannot be assembled today: RC1's `R08L` live Proof-of-Action
slot is empty, `check:rc1` reports `AWAITING LIVE CAPTURE`, and the film is not
freezable until HAC-324 fills it. This test therefore runs either on the
assembled openings alone, or on the complete film once R08L lands. Say which was
used when recording the result.

### Use unfamiliar technical readers. No verbal preamble.

### Timed comprehension gates (HAC-349 / HAC-348 criteria)

| At | The reader should be able to say |
| --- | --- |
| ~5–8s | one person has several agent workstreams going at once |
| ~15–20s | separate targets can still share one consequence or environment |
| ~30s | roughly what Interlock adds — environment evidence changes the coordination decision |

### Trust questions — a "yes" to any of these rejects the generated opener

Did any part of the opening look like:

- execution evidence?
- system architecture?
- a Google Cloud recording?
- a simulated product run?
- generic AI marketing?
- a security or lock product?
- decoration that did not help you understand anything?

### Decision rule — fixed before the test

The Veo opener is **earned** only if it materially improves comprehension or
attention at the gates above, preserves conceptual correctness, creates no trust
or evidence confusion, and does not make the film feel more promotional or
synthetic.

Looking better is not sufficient.

- Neutral result → **ship deterministic.**
- Mixed result → **ship deterministic.**
- Any evidence confusion → **reject the generated opener.**

### Recording

Preserve anonymised responses and timings. Report at sample strength only — with
three readers, say "3 of 3", never a percentage.
