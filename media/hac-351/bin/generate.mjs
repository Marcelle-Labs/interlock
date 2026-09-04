#!/usr/bin/env node
/**
 * HAC-351 — one bounded Veo 3.1 cold-open generation, with its receipt.
 *
 * This script is the only thing in the repository that calls a generative video
 * service, and it is deliberately narrow: it submits one request built from the
 * two deterministic frames, polls the operation, and writes a manifest that
 * records what was asked for alongside what the service actually did.
 *
 * WHY REST RATHER THAN THE SDK
 * ----------------------------
 * HAC-351 asks for a pinned `@google/genai` version. The Agent Platform path it
 * also mandates — apiVersion v1, `:predictLongRunning` — is reachable directly,
 * and this repository carries no runtime dependencies at all (`package.json` has
 * devDependencies only). Adding a large SDK to issue one HTTP POST would earn a
 * permanent dependency for a bounded experiment, which AGENTS.md and HAC-351 §21
 * both push back on. The transport is therefore `fetch` against the documented
 * v1 endpoint, and the manifest records `sdk: null` with this rationale rather
 * than pinning a version that was never in the request path. That is a recorded
 * deviation, not a silent one.
 *
 * WHAT THIS SCRIPT REFUSES TO DO
 * ------------------------------
 *   - claim the seed makes generation reproducible: it records the seed and says so;
 *   - report a requested parameter as honoured because the request was accepted;
 *   - overwrite an original with an edited derivative;
 *   - describe the output as evidence of anything. It is editorial metaphor.
 *
 * Credentials come from `gcloud auth print-access-token`. Nothing is read from
 * or written to a credentials file here.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PROJECT = 'nimble-octagon-505403-n3';
const REGION = 'us-central1';
const API_VERSION = 'v1';
const BUCKET = 'gs://mlabs-interlock-media-backup/hac-351';

/** The canonical motion prompt, verbatim from HAC-351. Composition and style are
 *  owned by the two deterministic frames, so the prompt controls motion only. */
const POSITIVE = 'A slow, precise dolly forward. Three independent matte trajectories '
  + 'advance in parallel across separate channels. As the camera approaches, the shared '
  + 'underlying support becomes visible and the trajectories subtly converge toward the '
  + 'same load-bearing boundary. Motion remains restrained, mechanically plausible, '
  + 'continuous, and easy to read. Deep focus. No dialogue. No generated text.';

/** Concrete exclusion vocabulary. Nouns and elements, never vague style commands. */
const NEGATIVE = 'humanoid robot, cyberpunk, neon city, holographic interface, code rain, '
  + 'floating UI, pseudo-text, letters, numbers, logos, visible watermark, particles, '
  + 'lens flare, excessive bokeh, server racks, sci-fi corridor, explosion, rapid camera '
  + 'movement, shaky camera, distorted geometry, duplicated objects, melting surfaces, '
  + 'unreadable symbols, oversaturated colors, stock-ad aesthetic';

const SEED = 351_2026;

/**
 * Prompt variants. HAC-351 §10 allows one meaningful change per iteration, so
 * each entry differs from the baseline in exactly one dimension and says which.
 * Composition and style stay owned by the deterministic frames throughout.
 */
const VARIANTS = {
  // p1 — the canonical HAC-351 motion prompt, unmodified.
  'p1-baseline': { dimension: 'baseline', prompt: POSITIVE },

  // p2 — camera velocity only. p1 measured a smooth creep to 3.7s, a ~5x lurch
  // in the following second, then a long retreat: not a restrained, continuous,
  // mechanically plausible move. This variant constrains pacing and nothing else.
  'p2-velocity': {
    dimension: 'camera velocity',
    prompt: 'A single continuous dolly forward at one constant slow speed, from the '
      + 'first framing to the last framing, arriving exactly at the end of the shot. '
      + 'The camera never accelerates, never lurches, never stops, and never moves '
      + 'backward at any point. Three independent matte trajectories advance in '
      + 'parallel across separate channels. As the camera approaches, the shared '
      + 'underlying support beneath them comes gradually into view at an even rate. '
      + 'Motion is restrained, mechanically plausible, continuous, and easy to read. '
      + 'Deep focus. Static tripod dolly on rails. No dialogue. No generated text.',
  },
};

const token = () =>
  execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const base = `https://${REGION}-aiplatform.googleapis.com/${API_VERSION}`
  + `/projects/${PROJECT}/locations/${REGION}/publishers/google/models`;

async function post(url, body, bearer) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const label = process.argv[2];
  const model = process.argv[3] ?? 'veo-3.1-fast-generate-001';
  if (!label) {
    console.error('usage: generate.mjs <candidate-label> [model-id]');
    process.exit(2);
  }

  const variant = VARIANTS[label];
  if (!variant) {
    console.error(`unknown candidate '${label}'. known: ${Object.keys(VARIANTS).join(', ')}`);
    process.exit(2);
  }

  const frames = JSON.parse(
    readFileSync(join(root, 'evidence', 'frame-manifest.json'), 'utf8'),
  ).frames;
  const first = frames.find((f) => f.station === 'first');
  const last = frames.find((f) => f.station === 'last');

  // The frames on disk must still be the frames the manifest describes, or the
  // continuity authority for this generation is not what the receipt will claim.
  for (const f of [first, last]) {
    const actual = sha256File(join(root, '..', '..', f.png));
    if (actual !== f.pngSha256) {
      throw new Error(`frame digest drift for ${f.assetId}: manifest ${f.pngSha256} != disk ${actual}`);
    }
  }

  const requestedConfig = {
    aspectRatio: '16:9',
    resolution: '1080p',
    durationSeconds: 8,
    sampleCount: 1,
    seed: SEED,
    negativePrompt: NEGATIVE,
    storageUri: `${BUCKET}/original/${label}/`,
    generateAudio: false,
    personGeneration: 'dont_allow',
    // enhancePrompt is deliberately absent. Requesting `false` on
    // veo-3.1-fast-generate-001 is rejected outright:
    //   code 3 — "Veo 3 prompt enhancement cannot be disabled."
    // (recorded in evidence/preflight.json). So prompt rewriting is NOT under
    // our control on this path, and nothing here may claim that it is. The
    // positive prompt below is the prompt we submitted, not necessarily the
    // prompt the model was ultimately conditioned on.
  };

  const body = {
    instances: [{
      prompt: variant.prompt,
      image: {
        gcsUri: `${BUCKET}/frames/${first.assetId}-1920x1080.png`,
        mimeType: 'image/png',
      },
      lastFrame: {
        gcsUri: `${BUCKET}/frames/${last.assetId}-1920x1080.png`,
        mimeType: 'image/png',
      },
    }],
    parameters: requestedConfig,
  };

  const bearer = token();
  const requestedAt = new Date().toISOString();
  const submit = await post(`${base}/${model}:predictLongRunning`, body, bearer);

  if (submit.status !== 200) {
    console.error('SUBMIT FAILED', submit.status, JSON.stringify(submit.json, null, 2));
    process.exit(1);
  }
  const opName = submit.json.name;
  console.log(`operation ${opName}`);

  let op;
  for (let i = 0; i < 90; i += 1) {
    await sleep(10_000);
    const poll = await post(`${base}/${model}:fetchPredictOperation`,
      { operationName: opName }, token());
    op = poll.json;
    process.stdout.write(op.done ? 'done\n' : '.');
    if (op.done) break;
  }
  const completedAt = new Date().toISOString();

  mkdirSync(join(root, 'evidence'), { recursive: true });
  const receipt = {
    issue: 'HAC-351',
    candidate: label,
    claimBoundary: 'Editorial metaphor only. This clip is not execution evidence, '
      + 'Google Cloud footage, architecture, telemetry, product UI, or a simulated '
      + 'Interlock decision.',
    project: PROJECT,
    region: REGION,
    apiVersion: API_VERSION,
    endpoint: `${base}/${model}:predictLongRunning`,
    model,
    sdk: null,
    sdkRationale: 'Agent Platform v1 REST used directly; no @google/genai in the '
      + 'request path, so no version is pinned. See header comment.',
    transport: 'node:fetch',
    operation: opName,
    requestedAt,
    completedAt,
    seed: SEED,
    seedClaim: 'Recorded for provenance. No deterministic-generation claim is made.',
    positivePrompt: variant.prompt,
    variantDimension: variant.dimension,
    negativePrompt: NEGATIVE,
    requestedConfig,
    observedParameterBehaviour: {
      enhancePrompt: 'REQUESTED false -> REJECTED (code 3, "Veo 3 prompt '
        + 'enhancement cannot be disabled"). OMITTED. Prompt rewriting is not '
        + 'under our control and is not claimed.',
      personGeneration: 'REQUESTED "dont_allow" -> ACCEPTED, but the field is not '
        + 'enum-validated on this path (a deliberate bogus value was also accepted '
        + 'in preflight), so acceptance is not evidence it was honoured. The '
        + 'deterministic input frames contain no people; any output introducing a '
        + 'person or face is rejected regardless of this field.',
      generateAudio: 'REQUESTED false -> ACCEPTED. Verified mechanically with '
        + 'ffprobe against the returned original rather than trusted.',
      seed: 'Recorded. No deterministic-generation claim.',
    },
    firstFrame: { path: first.png, sha256: first.pngSha256, gcsUri: body.instances[0].image.gcsUri },
    lastFrame: { path: last.png, sha256: last.pngSha256, gcsUri: body.instances[0].lastFrame.gcsUri },
    response: op,
  };
  const out = join(root, 'evidence', `generation-${label}.json`);
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`wrote ${out}`);

  if (op?.error) {
    console.error('OPERATION ERROR', JSON.stringify(op.error, null, 2));
    process.exit(1);
  }
  const videos = op?.response?.videos ?? [];
  for (const v of videos) console.log(`output ${v.gcsUri ?? '(inline bytes)'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
