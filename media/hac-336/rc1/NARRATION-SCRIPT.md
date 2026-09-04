# Interlock — RC1 narration script

**Derived, not authored.** Regenerate with `node media/hac-336/rc1/bin/build-script-doc.mjs`.
Timestamps come from the measured narration in `narration-manifest.json`, not from an estimate.

Runtime **3:33 (213.938s)** against a 205–220s target and a 225s editorial ceiling. 147.202s spoken, 66.736s silent (68.8% speech density). Voice: ElevenLabs `eleven_multilingual_v2`, 140 wpm mean.

Proof-class reset at **1:28.6** (beat R05). Before it: EVAL, A. After it: B, bounds, close.

## PROBLEM

### R01 · 0:00.0–0:29.0 · `EVAL`

- **Source** `media/hac-336/rc1/inserts/IL-MOT-021-forensic-replay-1920x1080.mp4`
- **Origin** HAC-350 · sha256 `46ac324caa5e3a62…`
- **On-screen label** CONTROLLED EVALUATION — RECORDED EVIDENCE
- **Editorial trim** 30s → 29s
- **Muted read** Eight-scene deterministic replay: the anomaly, the forensic rewind, the credible per-target lock, the miss, the environmental coupling, the repository evidence, the changed coordination decision, and the ablation.

> **0:01.0** — Two autonomous agents can each be right, and still be wrong together.
>
> <sub>N01 · 4.483s</sub>

> **0:07.1** — Together they break a constraint that spans both targets.
>
> <sub>N02 · 2.976s</sub>

> **0:12.4** — Watch the lock. It sees one key, and it is right about that key.
>
> <sub>N03 · 2.976s</sub>

> **0:20.2** — The hazard crossed two keys. No single key represents the pair.
>
> <sub>N04 · 4.935s</sub>

## MECHANISM

### R02 · 0:28.6–0:46.3 · `A`

- **Source** `media/hac-334/exports/IL-DIAG-010-conceptual-causal-architecture-1920x1080.png`
- **Origin** HAC-334 · sha256 `4066ae08bb195e36…`

> **0:29.1** — Interlock isn't another agent. It's the deterministic boundary those actions pass through before shared state changes.
>
> <sub>N05 · 8.373s</sub>

> **0:38.7** — Revision-bound evidence about the environment enters that boundary before anything mutates.
>
> <sub>N06 · 5.898s</sub>

## COMPARISON

### R03 · 0:45.9–1:07.5 · `EVAL`

- **Source** `media/hac-336/frames/B07-IL-PROOF-021-comparison.png` (comparison)
- **Origin** HAC-343 via HAC-336 · sha256 `6543146ac6f33bce…`

> **0:46.5** — Four coordination strategies, one frozen corpus.
>
> <sub>N07 · 2.8s</sub>

> **0:51.9** — Global serialization avoided the unsafe outcomes, by making the independent work wait too.
>
> *Caption (more precise):* Global serialization avoided the invalid outcomes — by making the independent work wait too.
>
> <sub>N08 · 6.971s</sub>

> **1:00.1** — The per-target lock kept that work parallel, and missed both hazards.
>
> <sub>N09 · 3.948s</sub>

## ABLATION

### R04 · 1:07.1–1:29.0 · `EVAL`

- **Source** `media/hac-336/frames/B08-IL-PROOF-021-ablation.png` (ablation)
- **Origin** HAC-343 via HAC-336 · sha256 `c7af286394411cfb…`
- **Guardrail** HAC-343 media narration guardrail: the withheld result and its ablation control render on one board, so the 0/2 figure is never on screen without the control that produced it.

> **1:07.6** — Now hold everything constant except the evidence.
>
> <sub>N10 · 2.325s</sub>

> **1:12.4** — With the coupling evidence present, the hazardous compositions were withheld.
>
> <sub>N11 · 4.787s</sub>

> **1:18.5** — Remove it, and the decision flips to allow parallel. The unsafe outcomes return.
>
> *Caption (more precise):* Remove it, and the decision flips to ALLOW_PARALLEL. The invalid outcomes return.
>
> <sub>N12 · 7.162s</sub>

## RESET

### R05 · 1:28.6–1:36.4 · `transition`

- **Source** `media/hac-336/frames/B09-IL-SCAF-020-reset.png` (reset)
- **Origin** HAC-336 · sha256 `a14bd9217fa0351b…`
- **Muted read** The field inverts from paper to ink. The board states that the controlled evaluation and the Google Cloud run are two runs, and that neither is evidence for the other.

> **1:29.2** — That's the controlled evaluation.
>
> <sub>N13 · 1.773s</sub>

> **1:31.9** — Separately, here's the system running on Google Cloud.
>
> <sub>N14 · 3.16s</sub>

## PROOF OF ACTION

### R08L · 1:36.0–2:21.0 · `B`

- **Source** `media/hac-336/rc1/inserts/IL-MOT-023-live-cloud-traversal-1920x1080.mp4`
- **Origin** HAC-324 re-capture · sha256 `31162e97ce8b94cb…`
- **On-screen label** LIVE UNEDITED · CLOUD RUN
- **Muted read** A continuous screen recording of one real Cloud Run traversal: invocation, the Interlock decision and receipt, the EXECUTED mutation, the independent OBSERVED read-back, and the correlated Cloud Logging entry.

> **1:38.5** — The deployed Cloud Run agent, reading back its own configuration: gemini 3.5 flash, through Google ADK, on Vertex AI.
>
> *Caption (more precise):* The deployed Cloud Run agent, reading back its own configuration: gemini-3.5-flash, through Google ADK, on Vertex AI.
>
> <sub>LV1 · 10.457s</sub>

> **1:50.2** — Three Cloud Run services carry it: the agent, the Interlock proxy, and the protected target.
>
> <sub>LV2 · 6.805s</sub>

> **1:58.0** — Now one run, start to finish, without a cut.
>
> <sub>LV3 · 2.514s</sub>

> **2:08.5** — Interlock returns allow, with a receipt.
>
> *Caption (more precise):* Interlock returns ALLOW, with a receipt.
>
> <sub>LV4 · 2.281s</sub>

> **2:11.5** — The mutation executes, a separately authenticated observer reads it back, and Cloud Logging carries the same run id.
>
> *Caption (more precise):* The mutation is EXECUTED, a separately authenticated observer OBSERVED it, and Cloud Logging carries the same run id.
>
> <sub>LV5 · 7.587s</sub>

## ARCHITECTURE

### R12 · 2:20.6–2:32.5 · `B`

- **Source** `media/hac-336/rc1/frames/R12-IL-DIAG-020-path.png` (path)
- **Origin** HAC-336 board, re-rendered for the RC1 live run · sha256 `c70cbd5f309393e5…`

> **2:21.2** — Identity answers who called.
>
> <sub>N23 · 1.543s</sub>

> **2:24.1** — Interlock answers a different question: whether these two actions may proceed together.
>
> <sub>N24 · 6.396s</sub>

### R13 · 2:32.1–2:43.9 · `B`

- **Source** `media/hac-336/rc1/frames/R13-IL-DIAG-020-boundary.png` (boundary)
- **Origin** HAC-336 board, re-rendered for the RC1 live run · sha256 `50caf8973dc2018b…`

> **2:32.7** — Three fail-closed controls were recorded on that run.
>
> <sub>N25 · 2.732s</sub>

> **2:36.3** — Three controls are three controls, not comprehensive security coverage.
>
> *Caption (more precise):* Three controls are three controls — not comprehensive security coverage.
>
> <sub>N26 · 5.746s</sub>

## BOUNDS

### R14 · 2:43.5–2:53.0 · `bounds`

- **Source** `media/hac-336/frames/B18-IL-PROOF-022-bounds.png` (bounds)
- **Origin** HAC-343 via HAC-336 · sha256 `5c5a0fc0268eddb8…`

> **2:44.0** — Sixteen frozen scenarios, enumerated exhaustively.
>
> <sub>N27 · 2.87s</sub>

> **2:47.8** — Exact counts. No interval, and no significance, is claimed.
>
> <sub>N28 · 3.429s</sub>

### R15 · 2:52.6–3:06.3 · `bounds`

- **Source** `media/hac-334/exports/IL-PROOF-014-claim-boundary-1920x1080.png`
- **Origin** HAC-334 · sha256 `11f1d61ee8445d1f…`

> **2:53.2** — Two runs, two proof classes. Neither is evidence for the other.
>
> <sub>N29 · 4.186s</sub>

> **2:58.2** — No exactly-once execution, no restart safety, no production readiness.
>
> <sub>N30 · 6.02s</sub>

## CLOSE

### R16 · 3:05.9–3:27.4 · `close`

- **Source** `media/hac-336/frames/B20-IL-SCAF-021-thesis.png` (thesis)
- **Origin** HAC-336 · sha256 `9983457402a8f77d…`

> **3:06.4** — If your effects and invariants all fit inside one transactional authority, enforce them there.
>
> <sub>N31 · 6.413s</sub>

> **3:14.1** — Interlock explores the harder boundary: independently proposed actions, different targets, coupled through shared environmental state.
>
> <sub>N32 · 11.453s</sub>

### R17 · 3:26.1–3:33.9 · `close`

- **Source** `media/hac-335/exports/IL-SCAF-011-video-end-card-1920x1080.png`
- **Origin** HAC-335 · sha256 `0fd186af922178a9…`

> **3:27.5** — Interlock. Evidence-bound coordination for AI-assisted change.
>
> <sub>N33 · 4.203s</sub>

