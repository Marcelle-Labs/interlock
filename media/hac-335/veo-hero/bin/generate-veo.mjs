#!/usr/bin/env node
/**
 * HAC-335 — bounded Veo 3.1 generation for the Interlock hero sequence.
 *
 * This is a bounded experiment, not a retry loop. Three properties are enforced
 * mechanically rather than by discipline:
 *
 *   1. Preflight passes before anything billable is attempted.
 *   2. At most THREE billable rounds run without explicit human approval. The
 *      count lives in `evidence/generation-ledger.json`, so it survives a fresh
 *      shell, a crash and a different operator.
 *   3. Every round records its full provenance — model, region, seed, prompt
 *      digests, keyframe digests, operation id, output digest — before the file
 *      is usable. A candidate with no ledger row is not a candidate.
 *
 * Credentials are never recorded. The access token is held in memory, passed in
 * an Authorization header, and never written to a manifest, a log line or an
 * error message. The ledger records an account name and a project id, which are
 * identities rather than secrets.
 *
 *     node media/hac-335/veo-hero/bin/generate-veo.mjs --tier fast
 *     node media/hac-335/veo-hero/bin/generate-veo.mjs --tier standard
 *     node media/hac-335/veo-hero/bin/generate-veo.mjs --tier fast --seed 20260824 --note "…"
 *
 * `--approve-extra-round` is the only way past the cap, and it is a human's
 * decision to type it.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExportName, validateExportName } from '../../../../scripts/export-naming.mjs';
import { preflight, preflightRemote, MODEL, FAST_MODEL, LOCATION } from './preflight.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const evidenceDir = join(root, 'evidence');
const candidatesDir = join(root, 'candidates');

const MAX_BILLABLE_ROUNDS = 3;
const DURATION_SECONDS = 8;
const ASPECT_RATIO = '16:9';
const RESOLUTION = '1080p';
const PERSON_GENERATION = 'dont_allow';
const DEFAULT_SEED = 20260824;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/* -- arguments ------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const tier = flag('tier', 'fast');
if (!['fast', 'standard'].includes(tier)) {
  console.error('--tier must be `fast` or `standard`');
  process.exit(2);
}
const model = tier === 'fast' ? FAST_MODEL : MODEL;
const seed = Number(flag('seed', DEFAULT_SEED));
if (!Number.isInteger(seed) || seed < 0) {
  console.error('--seed must be a non-negative integer');
  process.exit(2);
}
const note = flag('note', '');
/**
 * Round 2 isolates one independent variable: whether Veo is handed a last frame.
 * `--delta` records that variable in the ledger before the billable call, so the
 * experiment's design is written down before its result is known.
 */
const useLastFrame = !has('no-last-frame');
const delta = flag('delta', '');
if (!useLastFrame && !delta) {
  console.error('--no-last-frame changes the experiment, so --delta "<what changed>" is required');
  process.exit(2);
}

/* -- the spend guardrail --------------------------------------------------- */

const ledgerPath = join(evidenceDir, 'generation-ledger.json');
const ledger = existsSync(ledgerPath) ? readJson(ledgerPath) : {
  manifestId: 'IL-MOT-030-generation-ledger',
  issue: 'HAC-335',
  note: 'Every billable Veo round, in order. A candidate file with no row here is not a candidate. '
    + 'No credential value is ever recorded; `account` and `project` are identities, not secrets.',
  maxBillableRoundsWithoutApproval: MAX_BILLABLE_ROUNDS,
  rounds: [],
};

const billableSoFar = ledger.rounds.filter((r) => r.billable !== false).length;
if (billableSoFar >= MAX_BILLABLE_ROUNDS && !has('approve-extra-round')) {
  console.error(
    `\n  ${billableSoFar} billable generation rounds have already run, and the cap is `
    + `${MAX_BILLABLE_ROUNDS}.\n  Re-run with --approve-extra-round only after a human has agreed `
    + `to spend more.\n`,
  );
  process.exit(3);
}
const standardSoFar = ledger.rounds.filter((r) => r.tier === 'standard' && r.billable !== false).length;
if (tier === 'standard' && standardSoFar >= 2 && !has('approve-extra-round')) {
  console.error(`\n  Two standard candidates already exist; the brief bounds it at two.\n`);
  process.exit(3);
}

/* -- inputs, by digest ----------------------------------------------------- */

const prompt = readJson(join(evidenceDir, 'prompt.json'));
const keyframes = readJson(join(evidenceDir, 'keyframe-manifest.json'));
const start = keyframes.keyframes.find((k) => k.role === 'start');
const end = keyframes.keyframes.find((k) => k.role === 'end');
if (!start || !end) throw new Error('keyframe-manifest.json is missing a start or end row');

const repoRoot = join(here, '..', '..', '..', '..');
const readFrame = (row) => {
  const bytes = readFileSync(join(repoRoot, row.file));
  const digest = sha256(bytes);
  if (digest !== row.sha256) {
    throw new Error(`${row.file} has changed since the manifest was written (${digest.slice(0, 12)}… != `
      + `${row.sha256.slice(0, 12)}…). Re-run build-keyframes.mjs.`);
  }
  return bytes;
};
const startBytes = readFrame(start);
const endBytes = readFrame(end);

const promptSha = sha256(Buffer.from(prompt.prompt, 'utf8'));
const negativeSha = sha256(Buffer.from(prompt.negativePrompt, 'utf8'));

/* -- preflight, then generate ---------------------------------------------- */

console.log(`\nVeo hero generation — tier=${tier} model=${model} seed=${seed}`);
console.log(`  lastFrame: ${useLastFrame ? 'supplied' : 'WITHHELD'}`);
if (delta) console.log(`  delta: ${delta}`);
console.log('');
console.log('Preflight:');
const ctx = preflight();
const pre = ctx.ok === false ? ctx : await preflightRemote(ctx);
if (!pre.ok) {
  console.error('\n  Preflight failed. Nothing billable was attempted.\n');
  for (const f of pre.checks.filter((c) => !c.ok)) {
    console.error(`  - ${f.name}: ${f.detail ?? 'failed'}\n    ${f.remedy ?? ''}`);
  }
  console.error('');
  process.exit(1);
}

const { project, token } = ctx;
const base = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}`
  + `/locations/${LOCATION}/publishers/google/models/${model}`;
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const instance = {
  prompt: prompt.prompt,
  image: { bytesBase64Encoded: startBytes.toString('base64'), mimeType: 'image/png' },
};
// The canonical open state is deliberately NOT supplied as any kind of reference
// when the last frame is withheld: supplying it elsewhere in the request would
// reintroduce the variable this round exists to remove.
if (useLastFrame) {
  instance.lastFrame = { bytesBase64Encoded: endBytes.toString('base64'), mimeType: 'image/png' };
}

const body = {
  instances: [instance],
  parameters: {
    aspectRatio: ASPECT_RATIO,
    durationSeconds: DURATION_SECONDS,
    resolution: RESOLUTION,
    sampleCount: 1,
    personGeneration: PERSON_GENERATION,
    negativePrompt: prompt.negativePrompt,
    seed,
    generateAudio: true,
  },
};

const requestedAt = new Date().toISOString();
console.log(`\n  submitting :predictLongRunning …`);
const submit = await fetch(`${base}:predictLongRunning`, {
  method: 'POST', headers: authHeaders, body: JSON.stringify(body),
});
const submitBody = await submit.json().catch(() => ({}));
if (!submit.ok) {
  // The response body may echo request context; print the status and message only.
  console.error(`\n  generation request rejected: ${submit.status} `
    + `${submitBody?.error?.status ?? ''} ${submitBody?.error?.message ?? ''}`.trim());
  console.error('  No candidate was produced and no ledger row was written.\n');
  process.exit(1);
}
const operationName = submitBody.name;
if (!operationName) throw new Error('the API accepted the request but returned no operation name');
console.log(`  operation ${operationName.split('/').pop()}`);

/* -- poll ------------------------------------------------------------------ */

const deadline = Date.now() + 10 * 60 * 1000;
let op = null;
process.stdout.write('  waiting ');
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));
  const poll = await fetch(`${base}:fetchPredictOperation`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ operationName }),
  });
  op = await poll.json().catch(() => ({}));
  if (op.done) break;
  process.stdout.write('.');
}
console.log('');
if (!op?.done) throw new Error(`operation ${operationName} did not complete within 10 minutes`);
if (op.error) {
  console.error(`\n  generation failed: ${op.error.message ?? JSON.stringify(op.error)}\n`);
  process.exit(1);
}

const videos = op.response?.videos ?? op.response?.generatedSamples ?? [];
const first = videos[0];
const b64 = first?.bytesBase64Encoded ?? first?.video?.bytesBase64Encoded;
if (!b64) {
  const filtered = op.response?.raiMediaFilteredReasons;
  console.error(`\n  the operation completed but returned no video`
    + `${filtered ? `: ${JSON.stringify(filtered)}` : ''}\n`);
  process.exit(1);
}

/* -- persist --------------------------------------------------------------- */

mkdirSync(candidatesDir, { recursive: true });
const round = ledger.rounds.length + 1;
const name = buildExportName({
  id: 'IL-MOT-030',
  slug: `veo-hero-candidate-${tier}-${String(round).padStart(2, '0')}`,
  width: 1920, height: 1080, ext: 'mp4',
});
const check = validateExportName(name);
if (!check.valid) throw new Error(`candidate filename violates the naming contract: ${name} — ${check.error}`);

const mp4 = Buffer.from(b64, 'base64');
writeFileSync(join(candidatesDir, name), mp4);

ledger.rounds.push({
  round,
  tier,
  billable: true,
  backend: 'vertex-ai',
  model,
  region: LOCATION,
  project,
  account: pre.checks.find((c) => c.name === 'Google Cloud project resolvable')?.detail ?? project,
  aspectRatio: ASPECT_RATIO,
  resolution: RESOLUTION,
  durationSeconds: DURATION_SECONDS,
  personGeneration: PERSON_GENERATION,
  seed,
  promptSha256: promptSha,
  negativePromptSha256: negativeSha,
  startFrame: start.file,
  startFrameSha256: start.sha256,
  usedLastFrame: useLastFrame,
  endFrame: useLastFrame ? end.file : null,
  endFrameSha256: useLastFrame ? end.sha256 : null,
  delta: delta || null,
  requestedAt,
  completedAt: new Date().toISOString(),
  operationId: operationName,
  status: 'SUCCEEDED',
  file: `media/hac-335/veo-hero/candidates/${name}`,
  fileSha256: sha256(mp4),
  fileBytes: mp4.length,
  note,
  adjudication: null,
});
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

console.log(`\n  ${name}  ${sha256(mp4).slice(0, 12)}…  ${(mp4.length / 1024 / 1024).toFixed(1)} MiB`);
console.log(`  ledger round ${round} recorded (${round}/${MAX_BILLABLE_ROUNDS} billable)\n`);
console.log('  Next: inspect frame-by-frame against the rejection list in README.md,');
console.log('  then record the verdict in the round\'s `adjudication` field.\n');
