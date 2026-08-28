# HAC-335 — the Interlock hero sequence

A five-and-a-half-second sequence that closes the judge cut. It is a **visual
synthesis of already-proven behaviour**, and it is the only asset in this
repository that no frozen record stands behind. Everything here exists to keep
that distinction from eroding.

> **This sequence is not evidence.** It depicts no run. It carries no figure, no
> decision, no receipt, no correlation id and no proof class. HAC-330 owns the
> causal counterfactual; HAC-324 owns the filmed Google Cloud run. Neither is
> represented here, and the sequence must never be described as demonstrating
> either.

## Why HAC-335 authorizes this

HAC-335's contract is explicit, and it is the only issue in the media set that
is:

> *Generated imagery may frame metaphor/mood only; factual product state,
> architecture, metrics and evidence remain deterministic.*

Its asset-registry requirements also already carry a **deterministic vs
generated/editorial provenance** field, so the registry anticipated a generated
asset before one existed. HAC-336 owns the *edit* — where a beat sits and how
long it holds — and integration is therefore staged for HAC-336 rather than
performed here. See [Integration](#integration).

## Files

| Path | Role |
| --- | --- |
| `evidence/prompt.json` | **Authored.** The prompt, the negative prompt, the motion authority they were derived from, and every correction made to the production brief. The only file here a human writes. |
| `evidence/keyframe-manifest.json` | Derived. The two frames, their digests, the canonical paths they drew, and the measured gate aperture. |
| `evidence/end-card-manifest.json` | Derived. The end card, its digest, and the upstream files that still authorize its one sentence. |
| `evidence/generation-ledger.json` | Derived, append-only. One row per billable round. Absent until a round runs. |
| `keyframes/*.png`, `*.svg` | The deterministic first and last frames handed to Veo. |
| `cards/`, `exports/` | The deterministic end card master and its PNG. |
| `candidates/` | Generated MP4s. Gitignored until one is selected. |
| `bin/preflight.mjs` | Free Vertex prerequisite check. Nothing billable. |
| `bin/generate-veo.mjs` | The bounded generation driver. |
| `bin/verify-veo-hero.mjs` | The gate. Node builtins only, no network. |

## Build

```sh
pnpm run veohero:build       # keyframes -> end card -> manifests
pnpm run veohero:sequence    # render IL-MOT-031; needs ffmpeg
pnpm run check:veo-hero      # the gate

# the generative experiment, now closed — kept for reproducibility
pnpm run veohero:preflight   # Vertex prerequisites; free, no generation
pnpm run veohero:generate -- --tier fast --no-last-frame --delta "..."
```

`veohero:build` and `check:veo-hero` need no credentials and no network. CI runs
the gate and nothing else — generation is a local, human-authorized step, and no
credential ever reaches a runner.

## The keyframes are the identity; Veo does not draw it

Veo is never asked to invent the Interlock mark. It is handed two exact
1920 × 1080 frames built from the canonical SVG geometry and told to connect
them. What it may author is the environment, the material, the camera, and the
mechanics of the transition — never the identity, and never a claim.

The two frames are the endpoints of the five-state motion model:

| | Source | Leaves | Aperture |
| --- | --- | --- | --- |
| start | `assets/logo/interlock-symbol-white.svg` | meet at 23.2 / 24.8 | 1.6 units |
| end | `assets/logo/interlock-symbol-open.svg` | stand at 21.6 / 26.4 | 4.8 units |

`GATE_TRAVEL` in `assets/brand/logo-geometry.js` is 1.6 units per leaf, so the
aperture must open by exactly 3.2. The builder asserts it and the gate re-asserts
it, which is what makes "the gate opened" a measurement rather than an
impression.

**Neither frame contains typography.** The gate fails on a `<text>` element in a
keyframe master. The wordmark arrives afterwards, from
`assets/logo/interlock-lockup-horizontal-white.svg`, composited deterministically
by `build-end-card.mjs`. A generative model may not draw the Interlock name.

### The field is flat, deliberately

An earlier pass lifted the environment with a wide radial gradient. At eight bits
over 1080 rows that spread six code values across hundreds of pixels and
rasterised as visible concentric banding — a defect in the one frame the model is
told to reproduce exactly, and the kind of low-amplitude structure a video model
amplifies into noise. The field is flat ink; lighting is Veo's job.

## The motion grammar is the repository's, not the brief's

`evidence/prompt.json` records every place the production brief was corrected
against repository authority rather than followed. The material one:

> The brief asked for an authorization pause of "approximately three quarters of
> a second". `--dur-hold` in `assets/tokens/motion.css` is **700 ms**, and is
> described there as *"the authorization pause: deliberately felt"*. The prompt
> uses 0.7 s. The gate opening is stated as `--dur-gate`, 520 ms, on the
> mechanical easing the product surfaces already use.

The five-state sequence — independent, constraint, coupling, authorization,
passage — is not an interpretation. It is `interlock-state-1.svg` through
`interlock-state-5.svg`, in order, and the phase durations are the `--mot-p1…p5`
tokens. No replacement geometry was invented.

**The pause is the semantic centre of the shot.** The gate may not change state
before it, and neither trajectory may pass before the gate is fully open. A
candidate that opens early is rejected regardless of how it looks.

## The spend guardrail

Generation is a bounded experiment, not a retry loop. Three properties are
enforced mechanically rather than by discipline:

1. `preflight.mjs` passes before anything billable is attempted, so "spent money
   discovering the API was disabled" cannot happen.
2. At most **three billable rounds** run without `--approve-extra-round`, and at
   most **two** of them at the standard tier. The count lives in the ledger, so
   it survives a fresh shell, a crash, and a different operator.
3. Every round records complete provenance before its file is usable. A
   candidate with no ledger row is not a candidate, and the gate says so.

The intended sequence is one Fast candidate to validate timing and composition,
then up to two Standard candidates at 1080p once the motion structure is right.
When a candidate is wrong, change **exactly one** material prompt variable and
record the change — `prompt.json` carries a `revision`, and the gate refuses a
recorded round whose prompt digest no longer matches the file.

## Credentials

The driver holds an access token in memory, passes it in an `Authorization`
header, and never writes it to a manifest, a log line or an error message. The
ledger records an account name and a project id, which are identities rather than
secrets. `preflight.mjs` inspects credential **presence** and configuration only.

The gate scans every committed text file in this package for credential shapes —
Google API keys, OAuth access and refresh tokens, private-key blocks,
`client_secret` / `private_key` / `refresh_token` fields, and bearer header
values — and fails on a hit. `scripts/check-provenance.mjs` scans the repository
for the same class of thing independently.

If both `GOOGLE_API_KEY`/`GEMINI_API_KEY` and Vertex ADC are configured,
preflight **fails rather than guessing**, and prints neither value. Two
configured backends is a decision a human makes.

## Rejecting a candidate

Inspect frame by frame. Reject on any of these, regardless of how good the shot
otherwise looks:

- canonical geometry materially distorted, or central symmetry broken;
- new limbs, extra gate leaves, or extra trajectories;
- **the gate opens before the pause**, or the trajectories move during it;
- **a trajectory passes before the gate is fully open**;
- the final state materially disagrees with the supplied open frame;
- any text or fabricated typography;
- generic cyberpunk / AI visual tropes dominating;
- movement that reads as magic rather than controlled mechanical authorization;
- visual noise loud enough to compete with the proof surfaces;
- anything implying a factual claim the repository's evidence does not carry.

Surviving candidates are then assessed on geometry fidelity, causal legibility,
pause legibility, physical plausibility, restraint, brand alignment, cinematic
quality, and usefulness as the cut's final synthesis beat. Record the winner's
`adjudication` — `selected`, `why`, and the `rejectionChecklist` — in its ledger
row. The gate fails if a round is selected without them.

## The end card

`IL-SCAF-012` resolves the sequence: the canonical white lockup on the same
near-black field the clip ends on, carrying exactly one line —

> Evidence-bound coordination before shared-state mutation.

That sentence is **not new**. It is already frozen in `README.md`, HAC-333's
scene manifest, HAC-336's `B01` narration and caption track, and the HAC-335
title and open-graph cards. The card restates it; it does not author, sharpen or
extend it. `end-card-manifest.json` names those upstream files and the gate
re-reads each one, so the card cannot outlive the language it restates.

No figure, proof class, run identity or issue number appears on it. Those belong
to `IL-SCAF-011`, which remains the **cut's** evidence end card. Two cards, two
jobs: `IL-SCAF-012` closes the metaphor, `IL-SCAF-011` closes the argument.

## Integration

HAC-336 already owns an assembled cut — 21 beats, **3:49.5 against a 4:00
ceiling** — so this sequence is *staged for* that issue rather than merged into
it. Three things make integration a HAC-336 decision rather than a HAC-335 edit:

**1. It needs a proof class that does not exist yet.** Every beat's
`proofClass` must be a key of `cut.proofClasses` (`CUT-CLASSES`), and none of
`brand` / `A` / `EVAL` / `transition` / `B` / `bounds` / `close` describes a
synthesis that asserts nothing. A new `synthesis` class is an editorial addition
to a claim-bearing contract.

**2. It needs a new source kind.** Every current beat is a still hold.
`build-video.mjs` composes stills; a clip source is a concat, not a hold.

**3. Audio.** No longer an issue: `IL-MOT-031` is encoded with `-an` and carries
no audio track at all, which is what HAC-336's muted cut requires. The gate fails
if one ever appears. (The rejected Veo candidates do carry audio; neither is
used.)

### The arithmetic, so the ceiling is a fact rather than a hope

Holds sum to 237.5s across 21 beats; 20 crossfades at 0.4s overlap by 8.0s;
229.5s results.

Inserting `IL-MOT-031` (5.508s) as a 22nd beat between `B20` and `B21` gives
22 beats, 243.008s of holds, 21 crossfades overlapping by 8.4s:

**234.608s = 3:54.6, with 5.392s of headroom under the 240s ceiling.**

That is a real margin rather than a rounding accident, and it is larger than
either option the 8s generated clip would have allowed. `B21` remains the
deterministic evidence end card, so the narrative role is unchanged: canonical
opener -> product, problem, proof, demo -> synthesis -> deterministic end card.

`IL-SCAF-012` is available if HAC-336 wants the metaphor to resolve on the
wordmark before `B21` closes the argument; at 3.0s that still lands at 3:57.2.
It is not required, and the recommendation is to leave it out unless a cold
reader asks for it.

The clip goes **after** `B20` and the whole cloud act, never near the opening:
the canonical short stinger stays the opener, and a synthesis may not precede
the proof it synthesises.

## Status

**`DETERMINISTIC`. The sequence is rendered and passes every gate. The generative
experiment is closed at 2 of 3 billable rounds; the third was never spent.**

Nothing here may be described as frozen, and the sequence may not appear in the
judge cut, until HAC-336 integrates it under its own gate and the three-reader
cold read has run.

### If a Veo plate is ever wanted

The remaining option Veo is actually good at is the **environment**: a near-black
volume with lighting, atmosphere and a slow camera move, containing **no Interlock
geometry at all**. `IL-MOT-031` would then composite over it. That is a separate,
still-unspent billable round and a separate decision; the sequence stands on its
own flat ink field today, which is on-brand rather than a compromise — *the mark
is ink on paper, or paper on ink*.

## Verify

```sh
pnpm run check:veo-hero
```

The gate fails on: a missing keyframe; a keyframe that is not 1920 × 1080, by its
own PNG header rather than by its manifest row; a keyframe whose bytes moved; a
source logo that changed after the frames were built; an aperture that does not
open by exactly `GATE_TRAVEL × 2`; an end frame not built from the canonical open
geometry; typography in a frame handed to the model; an unresolvable end-card
asset; an end-card sentence that stopped being authorized upstream; a run
identity or frozen figure anywhere in the package; a generation round missing any
required provenance field; a recorded round whose prompt digest no longer matches
`prompt.json`; a candidate whose bytes do not hash to its recorded digest; more
than one selected candidate; a winner with no adjudication, no rejection
checklist, or no silent integration copy; and any credential-shaped value in any
committed text file.
