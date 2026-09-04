repo: Marcelle-Labs/interlock
branch: main
path: media/hac-341

## Last sync
date: 2026-08-19T19:16:32Z

### Updated in this project
- Built `JudgeWalk.dc.html`: judge-first guided attention layer over the HAC-341 cockpit geometry (hybrid model C, Frames 0-6).
- Bound all class A facts to the frozen HAC-330 arms (baseline / treatment / perturbed) via the HAC-341 view model.
- HAC-343 has no artifact at this read; global-lock and per-target-lock comparison fields render as `[BIND: hac-343/...]`.
- Class B (HAC-340), L3 raw proof and degraded states deferred this turn; their entry points preserved.

## Screen map
| Screen | Built from |
| --- | --- |
| JudgeWalk 3a — cockpit shell, four-stage spine, arm switcher | media/hac-341/cockpit.html |
| JudgeWalk 3a — recorded arms, decision, outcome, evidence basis | experiments/hac-330/evidence/arms.json, media/hac-341/evidence/view-model.json |
| JudgeWalk 3a — L2 verify drawer (command, artifacts, pins, claim boundary) | media/hac-341/evidence/view-model.json (runs.local.verification, claimBoundary), experiments/hac-330/evidence/pins.json |
| JudgeWalk 3a — HAC-343 strategy comparison | unresolved; HAC-343 absent from repo at this read |
| JudgeWalk 3b — 320px entry / ablation / handoff | media/hac-341/cockpit.html (max-width:640 rules) |
