# HAC-333 — muted 30-second storyboard contract

The judge-facing 30-second cut, as a repository-native contract. This issue owns
the story, the timing, the motion semantics and the capture states. It does not
own final video assembly — that is HAC-336.

The cut is **muted**. Every claim must survive with the sound off and the motion
off. If a proposition is only legible while something is moving, it is not in
the story.

## Files

| File | Role |
| --- | --- |
| `storyboard.html` | Canonical source-editable storyboard. Nine frames authored at true 1920 × 1080. |
| `scene-manifest.json` | Machine-readable contract. Nine scenes, timing, proof class, bindings, motion, hold and capture states. |
| `bin/verify-storyboard.mjs` | Mechanical gate. Derives timing from the scenes and refuses semantic drift. |

Review affordances on `storyboard.html`, neither of which changes a captured
frame: `?static=1` forces the reduced-motion resolution, `?rails=off` hides the
storyboard annotation rails. **Capture always runs with rails off.** The rails
are storyboard metadata and are never part of the video.

## Timing — exactly 30.00 s

| Scene | Start | End | Dur | Proof class | Semantic state |
| --- | --- | --- | --- | --- | --- |
| SB-00 Identity | 0.00 | 2.20 | 2.20 | brand | `story.identity` |
| SB-01 Two locally valid intents | 2.20 | 5.00 | 2.80 | A | `run.local.intents` |
| SB-02 Shared environment, coupling | 5.00 | 8.20 | 3.20 | A | `run.local.coupled` |
| SB-03 Baseline arm | 8.20 | 11.40 | 3.20 | A | `run.local.baseline` |
| SB-04 Interlock treatment | 11.40 | 15.60 | 4.20 | A | `run.local.treatment` |
| SB-05 Perturbed evidence arm | 15.60 | 18.00 | 2.40 | A | `run.local.perturbed` |
| SB-06 Hard proof-class reset | 18.00 | 19.40 | 1.40 | transition | `transition.proof-class-reset` |
| SB-07 Google Cloud participation | 19.40 | 25.60 | 6.20 | B | `run.cloud.overview` |
| SB-08 Close / claim boundary | 25.60 | 30.00 | 4.40 | close | `run.claim-boundary` |

The total is **derived from the scenes** by the verifier, never read from a
total field. A scene edit cannot leave a stale 30.00 behind and still pass.

## Two proof classes, never one run

**Proof class A — HAC-330, controlled local experiment.** Baseline `140 > 130`,
treatment `WITHHOLD_SERIALIZE` → `120 <= 130` with checks 24/24, perturbed
evidence → `ALLOW_PARALLEL` → `140 > 130`. Local and deterministic. No cloud
runtime, no receipt, no protected target, no observer.

**Proof class B — HAC-340, Google Cloud participation.** One recorded traversal:
Gemini 3.5 Flash → Google ADK 1.35.1 → Cloud Run agent → Interlock MCP proxy →
`ALLOW` + receipt → protected mutation → independently authenticated read-back →
`alpha=45`, with Cloud Logging correlation and controls 403 / 401 / 403.

**SB-06 is the boundary.** The field inverts completely — class A is paper, class
B is ink — and the divider states *different run, different evidence, nothing
crosses*. The verifier enforces that every class-A scene ends before SB-06
begins and every class-B scene starts after it ends. No continuous timeline
links the two, and HAC-340 does not reproduce the 140 / 120 counterfactual in
Google Cloud.

## Motion contract

Motion is presentation. It is never product truth.

**Allowed semantic jobs:** reading order, continuity, coupling becoming visible,
decision-state change, bounded-result comparison, proof-class context reset,
effect vs observation distinction.

**Forbidden:** particles, perpetual motion, fake telemetry, typewriter effects,
agent-thinking indicators, arbitrary counters, and any animation implying
execution the evidence does not contain.

Every scene records `motionJob`, `staticEquivalent`, `reducedMotionEquivalent`
and `holdState` in the manifest. The reduced-motion media query and the
`?static=1` resolution declare **identical** rules, so the static frame is
exactly what a reduced-motion viewer sees — verified by parsing the stylesheet,
not assumed. No scene resolves to a frame that lost its causal order; disabling
motion never removes a step from the chain.

## Caption contract

Caption-safe foot of 1680 × 200, type at 46 px against a 44 px minimum, at most
two lines, one proposition at a time. Verified in the browser at true geometry:
every scene sits inside the safe area with no overflow. SB-06 carries no caption
because its split board is the proposition.

## Semantic state vocabulary

One vocabulary spans storyboard, cockpit and capture. Each scene carries
`semanticStateId`, `holdStateId` (`hold.<state>`) and `captureStateId`
(`capture.<state>`). The storyboard frames expose the same values as
`data-semantic-state`, `data-hold-state` and `data-capture-state`, so a capture
run selects frames by contract rather than by index.

`correspondingCockpitStateId` maps each scene onto the HAC-341 cockpit state it
belongs to — `run.local.baseline`, `run.local.treatment`, `run.local.perturbed`,
`transition.proof-class-reset` and `run.cloud.overview` are shared names, not
parallel inventions.

## Handoffs

**To HAC-324 (deterministic capture).** Consume `captureStateId` per scene. Each
scene defines exactly one inspectable hold state. Run with annotation rails off.
Every frame here is a deterministic graphic; where a scene expects a product
surface instead, `captureRequirements` names it.

**To HAC-336 (final media assembly).** Consume this manifest and
`storyboard.html`. HAC-333 owns story, timing and motion semantics; HAC-336 owns
recording and assembly. `globalNonClaims` in the manifest lists what must not
appear in the final video.

**To HAC-341 (cockpit).** Consume `semanticStateId` / `correspondingCockpitStateId`.

## Public evidence

HAC-342 is PASS, and the manifest carries its bindings under `publicEvidence`:

```text
evidencePublicationSha       75253e38791e69f7e2a4bb3a041044a9114c32f0
publicPacketSha256           ea1d6993ca937bb5ae14ad43954e48bd1a91ceb5e959719f8a99492b0b0dbf0d
sourcePacketSha256           794befb86b37d862dfbfa86070a2948cb7ddf53836fbb14748611126403188d0   (private commitment)
runtimeSourceSnapshotSha256  9aaa4ad1661444fff50a0392785aa69cbfc8a54fecff1fc4a1c178aa7da22cd1
```

`runtimeSourceSha` is `ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a` and is
intentionally **not** publicly resolvable; the snapshot digest carries that
provenance instead. No `runtimeSourceUrl` is fabricated.

## What the storyboard does not claim

Carried in `globalNonClaims`: HAC-330 did not run on Google Cloud; HAC-340 does
not reproduce the counterfactual; Agent Runtime, Agent Gateway and CONTENT_AUTHZ
did not participate; wrong-audience rejection is local parity, not a cloud
result; HAC-316 is failed/pivoted provenance; `WITHHOLD_SERIALIZE` is not human
approval or certification; `ALLOW` + receipt is not an `AUTHORIZED` lifecycle
state and no HAC-317 vocabulary is imported; no exactly-once, restart-safety or
recovery guarantee; no safety, security or production-readiness guarantee; three
cloud controls are three controls, not attack coverage.

Only the proxy revision `interlock-hac340-proxy-00002-wzf` is evidenced. The
agent and target revision names appear in no frozen artifact and appear in no
frame.

## Verify

```sh
node media/hac-333/bin/verify-storyboard.mjs
```

The gate fails on: a total that is not 30.00, duplicate scene ids, a timing gap
or overlap, SB-06 ceasing to separate the classes, class-B content before the
reset, a scene citing both runs as one, `AUTHORIZED` / joint review / human
approval / exactly-once / "both withheld" / observer-cannot-authorize copy,
HAC-316 as causal authority, a required HAC-317 or HAC-318 dependency, a lost
frozen binding, a changed cloud control, an unevidenced deployment revision, a
missing static or reduced-motion equivalent, a missing hold or capture state, a
storyboard frame that has drifted from the manifest, or an unresolved
`[BIND: …]` placeholder.
