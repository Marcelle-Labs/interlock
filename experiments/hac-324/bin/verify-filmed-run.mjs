#!/usr/bin/env node
/**
 * HAC-324 — refuses a filmed-run record that is not the emitted packet plus the
 * one declared correction.
 *
 * A derivation that can silently change an execution fact is worse than no
 * derivation: the raw packet would still be sitting beside it looking like
 * corroboration. So this proves three things rather than asserting them.
 *
 *   1. `filmed-run.json` is exactly what the producer rebuilds from the raw
 *      packet — no hand edit survives.
 *   2. Every execution fact is byte-identical between raw and derived. The
 *      correction touched the principal projection and nothing else.
 *   3. The capture package agrees with the derived record about which run it
 *      is, and its frames are still the frames it claims.
 *
 *     node experiments/hac-324/bin/verify-filmed-run.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveFilmedRun, EXECUTION_FACTS, PRINCIPAL_CORRECTION } from './build-filmed-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const evidence = join(here, '..', 'evidence');

const errors = [];
const fail = (message) => errors.push(message);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const raw = readJson(join(evidence, 'filmed-run.raw.json'));
const derived = readJson(join(evidence, 'filmed-run.json'));
const pkg = readJson(join(evidence, 'capture-package.json'));
const teardown = readJson(join(evidence, 'teardown.json'));

/* -- 1. the record is derived, not hand-edited ----------------------------- */

const rebuilt = deriveFilmedRun(raw);
if (JSON.stringify(rebuilt) !== JSON.stringify(derived)) {
  fail('filmed-run.json is not what build-filmed-run.mjs produces from the raw packet');
}

/* -- 2. the correction changed the projection and nothing else ------------- */

for (const field of EXECUTION_FACTS) {
  if (JSON.stringify(raw[field]) !== JSON.stringify(derived[field])) {
    fail(`execution fact "${field}" differs between the emitted packet and the derived record`);
  }
}

// The resources block is the only one that may differ, and only in the two
// principal keys. Anything else moving there would be a silent rewrite of the
// environment the run happened in.
const rawResourceKeys = Object.keys(raw.resources);
for (const key of rawResourceKeys) {
  if (key === 'observerPrincipal') continue;
  if (JSON.stringify(raw.resources[key]) !== JSON.stringify(derived.resources[key])) {
    fail(`resources.${key} differs between the emitted packet and the derived record`);
  }
}
if (derived.resources.operatorPrincipal !== raw.resources.observerPrincipal) {
  fail('operatorPrincipal does not preserve the value the packet actually emitted');
}
if (derived.resources.observerPrincipal === raw.resources.observerPrincipal) {
  fail('observerPrincipal was not corrected; the record still names the provisioning caller');
}
if (!derived.resources.observerPrincipal.startsWith('serviceAccount:')) {
  fail('the corrected observerPrincipal is not a service account');
}
if (derived.principalProjection?.correction?.classification !== PRINCIPAL_CORRECTION.classification) {
  fail('the derived record does not carry the adjudicated classification for the correction');
}

/* -- 3. the capture package still describes this run, and these frames ----- */

if (pkg.filmedRunId !== derived.correlationId) {
  fail(`capture package names run ${pkg.filmedRunId}, the record names ${derived.correlationId}`);
}
if (pkg.receiptId !== derived.receiptId) fail('capture package receipt id disagrees with the record');
if (pkg.runtimeSourceSha !== derived.commitSha) fail('capture package runtime source SHA disagrees with the record');
if (pkg.externalCallerPrincipal !== derived.resources.observerPrincipal) {
  fail('capture package and record disagree about who performed the observation');
}

for (const frame of pkg.frames) {
  const path = join(root, 'experiments', 'hac-324', 'frames', `scene-${frame.sceneId}.png`);
  if (!existsSync(path)) {
    fail(`frame for scene ${frame.sceneId} is missing on disk`);
    continue;
  }
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (digest !== frame.sha256) fail(`frame ${frame.sceneId} does not match its recorded sha256`);
  if (!frame.qualityPass) fail(`frame ${frame.sceneId} is recorded as failing the capture-quality floor`);
}

if (teardown.status !== 'completed') fail('teardown evidence is not complete');

if (errors.length) {
  process.stderr.write(`HAC-324 filmed-run record violated:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  'HAC-324 filmed-run record verified\n'
  + `  run ${derived.correlationId}, receipt ${derived.receiptId}\n`
  + `  ${EXECUTION_FACTS.length} execution facts byte-identical to the emitted packet\n`
  + `  observer ${derived.resources.observerPrincipal}\n`
  + `  operator ${derived.resources.operatorPrincipal}\n`
  + `  ${pkg.frames.length} frames match their digests, all quality-PASS; teardown ${teardown.status}\n`,
);
