# Take 0 — claim audit

Every narration line and every on-screen proposition in `manifest/take-0-timeline.json`,
checked against the HAC-349 claim boundary and the HAC-343 `mustNotClaim` list.

## Proof classes as used in this cut

| Class | Where | Statement |
| --- | --- | --- |
| PROBLEM | T03 | Controlled local experiment (HAC-330). States the hazard. Frames carry their own non-claim footer. |
| PROVEN IN CONTROLLED EVALUATION | T05–T06 | HAC-343, sixteen frozen scenarios, exhaustively enumerated. |
| REPLAY | T04 | Deterministic rendering of recorded HAC-343 / HAC-330 results. Renders facts, owns none. |
| RESET | T07 | Carries no evidence. Hard cut on both sides. |
| PROVEN ON GOOGLE CLOUD | T08–T15 | HAC-324 authoritative filmed run `ilk-hac340-cloud-1787536029323`. |
| NOT CLAIMED | T17 | The boundary itself. |
| CLOSE | T18–T19 | Bounded restatement. No new result. |

## Forbidden claims — line-by-line result

| Forbidden claim | Result | Where the cut protects it |
| --- | --- | --- |
| Interlock is 0% unsafe | NOT MADE | T06 shows evidence-removed 2/2 invalid on the same board as 0/2. VO-03 says "the decision flipped, and both invariants failed". |
| Interlock universally prevents composition hazards | NOT MADE | Every count is stated as n/2, never a rate. VO-08 at T17: "Sixteen frozen scenarios, exhaustively enumerated - exact counts, not estimates." The T05 and T06 board footers carry the same bound in print. |
| Interlock is categorically safer than locking | NOT MADE | VO-03 credits the per-target lock: "A credible per-target lock preserves concurrency". T05 board carries the A3 credibility row (2/2 serialized, 4/4 parallelized). |
| HAC-343 ran on Google Cloud | NOT MADE | T07 is a hard-cut proof-class reset with hard cuts on both sides. VO-04: "That was controlled evaluation. What follows is a separate deployed run." |
| The filmed run is the frozen HAC-340 run | NOT MADE | Every cloud beat names `ilk-hac340-cloud-1787536029323`. The frozen run `...1786730369123` appears nowhere in the cut. |
| ALLOW = VERIFIED | NOT MADE | T17 VO: "ALLOW is a decision, not a verification." |
| OBSERVED = SAFE | NOT MADE | T12 VO: "EXECUTED is not OBSERVED ... Two records, not one: the model's own output declares nothing." |
| WITHHOLD_SERIALIZE = human approval | NOT MADE | T17 board lists "no joint human authorization" under NOT CLAIMED. |
| Agent Runtime participated | NOT MADE | T15 VO names it as not on the path. |
| Agent Gateway participated | NOT MADE | T15 VO names it as not on the path. |
| CONTENT_AUTHZ participated | NOT MADE | T15 VO names it as not on the path. |
| Exactly-once | NOT MADE | T17 VO and board. |
| Restart safety | NOT MADE | T17 VO and board. |
| Fleet-scale proof | NOT MADE | No fleet language anywhere; one run, one corpus. |
| Production readiness | NOT MADE | T17 VO and board. |
| Comprehensive security proof | NOT MADE | T10 says "three fail-closed controls", never "secure". The B12 frame's own caption reads "Three recorded refusals. Not a security claim." |

## Counts spoken or shown, and their source

| Figure | Beat | Source |
| --- | --- | --- |
| 140 > 130, 120 <= 130 | T03, T04 | `experiments/hac-343/evidence/raw-results.json` via `media/hac-350/evidence/bindings.json` |
| 2/2, 0/2, 2/2, 0/2 / 2/2, 0/2, 2/2, 2/2 | T05 | `experiments/hac-343/evidence/judge-export.json#/panel1/rows` |
| serialized 2/2, parallelized 4/4, missed 2/2 | T05 | `judge-export.json#/panel1/perTargetLockCredibility` |
| evidence present 0/2, evidence removed 2/2 | T06 | `judge-export.json#/panel2/rows` |
| ~~8/8 failed closed, 6/8 reason agreement~~ | cut in r02 | Was T16. The film no longer states it; `experiments/hac-343/evidence/judge-export.json#/limitations` still does, and the repo is the record. Removing a disclosure that made Interlock look *worse* narrows no claim. |
| gemini-3.5-flash, ADK 1.35.1, us-central1 | T08–T09 | `experiments/hac-324/evidence/capture-package.json` |
| ALLOW, receipt digest, correlation id | T10 | `experiments/hac-324/evidence/filmed-run.json` |
| 403 / 401 / 403 | T10 | `filmed-run.json#/controls` |
| total 105 <= 130 | T11 | `filmed-run.json#/protectedMutation/invariant` |
| alpha = 45 | T12 | `filmed-run.json#/observation/state/services/alpha` |

## What r02 changed, and what it did not

Three beats were cut (T01, T02 intents/coupled; T16 bounds) and 15 focus cues
were added. **No claim moved.** The cues change which part of an already-frozen
frame dominates at a given second; they add no text, no figure and no emphasis
that the frame did not already carry. Every count in the table below is still on
screen, still in its own frame, still with its denominator.

The one disclosure that left the picture is the T16 refusal-reason mismatch
(6/8). It is a fact against Interlock, so its removal cannot inflate a claim, and
it remains in the frozen evidence and in `DISCLOSURE.md`.

## Deliberate wording decisions

- **"A credible per-target lock"** is kept in VO-03 because HAC-343's whole
  Panel 1 reading depends on A3 being a real lock rather than a strawman. Its
  credibility row is on the same frame.
- **"Three fail-closed controls"**, never "three security tests". The frame
  itself says "Not a security claim."
- **"reads revision-bound composition evidence"**, never "understands" or
  "detects". The decision core reads a mined relationship; it infers nothing.
- **Percentages are never spoken.** Every figure is a fraction with its
  denominator audible, per HAC-343's `forbiddenRendering`.
- **"Rewind."** opens VO-02 rather than a second causal setup. The cold open
  states the failure; the replay is then an investigation of it, not a retelling.
- **No focus cue ever truncates a hash.** Enforced by review, not by convention:
  every cue was rendered and read back at full size before it was kept.
