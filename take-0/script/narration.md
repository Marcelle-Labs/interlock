# Take 0.1 — locked narration and shot plan

**Runtime 03:37.0 · spoken 03:12.6 · cap 04:00 · 16 beats**

Generated from `manifest/take-0-timeline.json`. Edit the manifest, not this file.

Causal ordering is fixed. Durations may move a second or two to fit a real read; the order may not move at all.


## COLD_OPEN — 00:00.0 → 00:08.0  (VO-01)

### T03 · 00:00.0–00:08.0 · 8.0s · PROBLEM

**Picture** `media/hac-336/frames/B04-IL-PROOF-020-baseline.png`

**On screen** 140 > 130 at display size, marked INVALID JOINT STATE.

**Narration** Two changes. Each valid on its own. Together, 140 against a bound of 130.

**Focus** none

**Out** HARD_CUT

> Opens the film. T01 (intents) and T02 (coupled) were cut in r02: the replay re-tells that setup in its first eight seconds.


## FORENSIC_REPLAY — 00:08.0 → 00:37.0  (VO-02)

### T04 · 00:08.0–00:37.0 · 29.0s · REPLAY

**Picture** `media/hac-350/exports/IL-MOT-021-forensic-replay-1920x1080.mp4` — plays to 29.0s

**On screen** S1 joint invalid 140 / S2 either alone 120 / S3 same-target serialized / S4 two locks, hazard spans both / S5 environmental ceiling / S6 repository relationship / S7 withheld, 120 / S8 evidence removed, 140 returns.

**Narration** Rewind. Locking the same target serializes correctly. Two different targets, two different locks - both correct, and the hazard spans them. The bound is a property of the environment; no per-key lock takes it as input. The hazard lives in the relationship between the files, and that relationship is in the repository history. Interlock reads it before the mutation, and withholds. Remove the evidence, and the invalid result returns.

**Focus** none

**Out** HARD_CUT

> CONSUME THE CANONICAL EXPORT. Do not screen-record, re-render, reconstruct from stills, or apply any focus cue. The only permitted edit is the out-point at 29.000s.


## COMPARISON_ABLATION — 00:37.0 → 01:03.5  (VO-03)

### T05 · 00:37.0–00:49.5 · 12.5s · EVAL

**Picture** `media/hac-336/frames/B07-IL-PROOF-021-comparison.png`

**On screen** Uncoordinated 2/2, 2/2. Global lock 0/2, 0/2. Per-target lock 2/2, 2/2. Interlock 0/2, 2/2. A3 credibility: serialized 2/2, parallelized 4/4, missed 2/2.

**Narration** A global lock stays safe by serializing everything. A credible per-target lock preserves concurrency, but still misses both hazards, because they span different targets.

**Focus** 

- `00:37.0` **WIDE**
- `00:41.5` **DIM** keep `y280–610` — the four strategy rows and both count columns
- `00:45.5` **DIM** keep `y630–785` — is the per-target lock a real lock? 2/2, 4/4, 2/2
- `00:48.2` **WIDE**

**Out** CROSSFADE_0.4

> T05 and T06 are one contiguous visual unit. Do not separate them, do not put anything between them.

### T06 · 00:49.5–01:03.5 · 14.0s · EVAL

**Picture** `media/hac-336/frames/B08-IL-PROOF-021-ablation.png`

**On screen** Panel 1 retained above; ablation panel immediately below. Evidence present 0/2 invalid, ALLOW_SERIALIZED / WITHHOLD_SERIALIZE. Evidence removed 2/2 invalid, ALLOW_PARALLEL.

**Narration** Interlock uses composition evidence instead: it withheld both hazardous pairs while keeping both independent pairs parallel. Then we removed the coupling signal from the frozen evidence. Same actions, same core - the decision flipped, and both invariants failed. The evidence is load-bearing.

**Focus** 

- `00:49.5` **WIDE**
- `00:52.5` **DIM** keep `y280–635` — the table, ending on the Interlock row
- `00:56.5` **DIM** keep `y650–850` — evidence present 0/2 invalid vs evidence removed 2/2 invalid
- `01:02.0` **WIDE**

**Out** HARD_CUT_REQUIRED


## PROOF_CLASS_RESET — 01:03.5 → 01:09.0  (VO-04)

### T07 · 01:03.5–01:09.0 · 5.5s · RESET

**Picture** `media/hac-336/frames/B09-IL-SCAF-020-reset.png`

**On screen** Field inverts paper to ink. Different run. Different evidence. Nothing crosses.

**Narration** That was controlled evaluation. What follows is a separate deployed run.

**Focus** none

**Out** HARD_CUT_REQUIRED

> Hard cut in and out. No crossfade may bridge a proof class.


## CLOUD_TRAVERSAL — 01:09.0 → 01:57.5  (VO-05)

### T08 · 01:09.0–01:25.0 · 16.0s · CLOUD

**Picture** `media/hac-336/frames/B10-scene-gemini-adk-attribution.png`

**On screen** gemini-3.5-flash - Google ADK 1.35.1 / Vertex AI - image pinned at runtimeSourceSha ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a

**Narration** The deployed Cloud Run agent reads back its own configuration: gemini-3.5-flash, through Google ADK 1.35.1 with Vertex AI access, from an image pinned to the runtime source commit.

**Focus** 

- `01:09.0` **WIDE**
- `01:13.5` **PUNCH** `[x380 y302 w960 h540]` — INTERLOCK_GEMINI_MODEL gemini-3.5-flash, GOOGLE_GENAI_USE_VERTEXAI, and the pinned image interlock-adk:ae6d0d3
- `01:22.5` **WIDE**

**Out** CROSSFADE_0.4

### T09 · 01:25.0–01:36.5 · 11.5s · CLOUD

**Picture** `media/hac-336/frames/B11-scene-cloud-run-topology.png`

**On screen** interlock-hac340-agent-00001-hbk / interlock-hac340-proxy-00001-s76 / interlock-hac340-target-00001-sng, us-central1

**Narration** Three Cloud Run services carried the run in us-central1: the ADK agent, the Interlock MCP proxy, and the protected target.

**Focus** 

- `01:25.0` **WIDE**
- `01:28.5` **DIM** keep `y475–645` — the three revisions, ACTIVE yes, and their deploy times
- `01:34.5` **WIDE**

**Out** CROSSFADE_0.4

### T10 · 01:36.5–01:57.5 · 21.0s · CLOUD

**Picture** `media/hac-336/frames/B12-scene-agent-traversal.png`

**On screen** $ node experiments/hac-340/bin/20-cloud-run.mjs - correlationId ilk-hac340-cloud-1787536029323 - decision ALLOW - receiptDigest sha256:7fb65efe... - controls 403 / 401 / 403

**Narration** The traversal executed while this frame was captured. Interlock returned ALLOW with a receipt digest under one correlation id. Three fail-closed controls on the same run: a forged identity header returned 403, an invalid bearer token 401, a direct call with no receipt, 403.

**Focus** 

- `01:36.5` **WIDE**
- `01:45.5` **DIM** keep `y375–500` — correlationId, decision ALLOW, receiptDigest - DIM not PUNCH so the digest is never truncated
- `01:50.0` **PUNCH** `[x200 y495 w800 h450]` — forgedHeaderStatus 403, wrongAudienceStatus 401, directBypassStatus 403
- `01:55.5` **WIDE**

**Out** CROSSFADE_0.4


## RECEIPT_EFFECT_OBSERVATION — 01:57.5 → 02:36.0  (VO-06)

### T11 · 01:57.5–02:10.0 · 12.5s · CLOUD

**Picture** `media/hac-336/frames/B13-scene-receipt-mutation-observation-executed.png`

**On screen** status EXECUTED - revisionBefore -> revisionAfter - total 105 <= 130

**Narration** The protected mutation is EXECUTED against that receipt. The resulting invariant on the target is 105 against a bound of 130.

**Focus** 

- `01:57.5` **WIDE**
- `02:01.0` **DIM** keep `y455–560` — status EXECUTED, revisionBefore, revisionAfter - full-bleed hashes, so DIM
- `02:05.0` **DIM** keep `y570–760` — invariant holds true, total 105, detail total 105 <= 130
- `02:08.5` **WIDE**

**Out** CROSSFADE_0.4

### T12 · 02:10.0–02:24.5 · 14.5s · CLOUD

**Picture** `media/hac-336/frames/B14-scene-receipt-mutation-observation-observed.png`

**On screen** OBSERVED alpha=45 - observer serviceAccount:interlock-hac340-observer@... distinct from the provisioning operator

**Narration** EXECUTED is not OBSERVED. A separately authenticated, keyless observer service account read the target back at the post-mutation revision and observed alpha at 45. Two records, not one: the model's own output declares nothing.

**Focus** 

- `02:10.0` **WIDE**
- `02:14.0` **DIM** keep `y325–370` — revision - the post-mutation revision the observer read at
- `02:17.5` **PUNCH** `[x0 y380 w800 h450]` — alpha 45, beta 40, gamma 20
- `02:23.0` **WIDE**

**Out** CROSSFADE_0.4

### T13 · 02:24.5–02:36.0 · 11.5s · CLOUD

**Picture** `media/hac-336/frames/B15-scene-cloud-logging-correlation.png`

**On screen** correlationId ilk-hac340-cloud-1787536029323 - identitySource platform-verified - revision_name interlock-hac340-proxy-00001-s76

**Narration** Cloud Logging, filtered to that same correlation id: the proxy request, the agent identity as the platform verified it, and the Cloud Run revision that served it.

**Focus** 

- `02:24.5` **WIDE**
- `02:28.0` **PUNCH** `[x0 y377 w1250 h703]` — correlationId, event proxy.request, identity, revision_name interlock-hac340-proxy-00001-s76
- `02:34.5` **WIDE**

**Out** CROSSFADE_0.4


## ARCHITECTURE — 02:36.0 → 03:00.5  (VO-07)

### T14 · 02:36.0–02:48.5 · 12.5s · CLOUD

**Picture** `media/hac-336/frames/B16-IL-DIAG-020-path.png`

**On screen** agent -> MCP proxy -> decision + receipt -> protected target; direct call without receipt refused.

**Narration** Where Interlock sits. The agent calls a tool through the Interlock MCP proxy. Interlock reads revision-bound composition evidence before the mutation and returns a decision with a receipt.

**Focus** none

**Out** CROSSFADE_0.4

### T15 · 02:48.5–03:00.5 · 12.0s · CLOUD

**Picture** `media/hac-336/frames/B17-IL-DIAG-020-boundary.png`

**On screen** Transport provenance vs application provenance. NOT ON PATH: Agent Runtime, Agent Gateway, CONTENT_AUTHZ.

**Narration** Cloud Run IAM establishes transport provenance. It does not establish application-role semantics inside Interlock. Agent Runtime, Agent Gateway and CONTENT_AUTHZ were not on this path.

**Focus** none

**Out** HARD_CUT


## BOUNDED_CLOSE — 03:00.5 → 03:30.5  (VO-08)

### T17 · 03:00.5–03:15.5 · 15.0s · BOUNDS

**Picture** `media/hac-334/exports/IL-PROOF-014-claim-boundary-1920x1080.png`

**On screen** NOT CLAIMED: exactly-once, restart safety, target-side atomicity, production readiness, comprehensive security. ALLOW != VERIFIED. OBSERVED != SAFE. WITHHOLD_SERIALIZE != human approval.

**Narration** Two runs, two proof classes; neither is evidence for the other. Sixteen frozen scenarios, exhaustively enumerated - exact counts, not estimates. No exactly-once execution, no restart safety, no production readiness. ALLOW is a decision, not a verification.

**Focus** 

- `03:00.5` **WIDE**
- `03:04.0` **DIM** keep `y250–345` — the three column headers - controlled local experiment, Google Cloud participation, not claimed
- `03:09.5` **DIM** keep `y900–945` — Two runs, two proof classes. Neither is evidence for the other.
- `03:13.3` **WIDE**

**Out** CROSSFADE_0.4

> Absorbs the corpus bound from T16, which r02 cut. The dense NOT CLAIMED column is deliberately never punched into: it is receipt material, not a read.

### T18 · 03:15.5–03:30.5 · 15.0s · CLOSE

**Picture** `media/hac-336/frames/B20-IL-SCAF-021-thesis.png`

**On screen** Valid alone does not mean safe together.

**Narration** In this controlled corpus, per-target locking correctly coordinated what its keys represented, but missed hazards spanning distinct keys. With qualifying repository evidence present, Interlock changed that coordination; when the evidence was removed, the failures returned.

**Focus** none

**Out** CROSSFADE_0.4


## END_CARD — 03:30.5 → 03:37.0  (VO-08)

### T19 · 03:30.5–03:37.0 · 6.5s · CLOSE

**Picture** `take-0/deterministic/TAKE0-end-card-1920x1080.png`

**On screen** INTERLOCK - Evidence-bound coordination for AI-assisted change.

**Narration** Interlock makes that evidence part of the coordination decision before shared state changes.

**Focus** none

**Out** END

> No new result in the end card. PROVISIONAL: generated by take-0/bin/build-end-card.mjs. If HAC-335 authors this card under an IL-SCAF id, repoint this beat and delete the generator.
