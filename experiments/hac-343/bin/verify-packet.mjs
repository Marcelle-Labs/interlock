#!/usr/bin/env node
/**
 * Verify the committed HAC-343 packet against itself.
 *
 *     node experiments/hac-343/bin/verify-packet.mjs
 *
 * Needs no sibling checkout, no network and no fixtures, so CI can enforce it.
 * It does not re-run the experiment; what it proves is that nobody edited a
 * number, a definition or a raw record afterwards.
 *
 * The load-bearing property is that **every metric is recomputed from the raw
 * records** rather than read from the summary. A verifier that compared a
 * summary to itself would pass on any summary. `aggregate()` is a pure function,
 * so the same raw records must reproduce the committed report byte for byte.
 *
 * It also pins the three freeze commits. Each frozen contract must still be the
 * file its freeze commit introduced: if `metric-definitions.json` is edited
 * later, its last-touching commit stops being 0a6babb and this fails. That is
 * what makes "frozen before results" checkable by someone who was not there.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENARIOS, FAMILIES } from '../lib/corpus.mjs';
import { ARMS } from '../lib/arms.mjs';
import { aggregate, FROZEN_COMMITS, ORDERS } from '../lib/aggregate.mjs';
import { GIT } from '../../hac-330/lib/exec.mjs';

const EXPERIMENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(EXPERIMENT_DIR, '..', '..');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');

const read = (name) => readFileSync(join(EVIDENCE_DIR, name));
const json = (name) => JSON.parse(read(name).toString('utf8'));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const failures = [];
function verify(claim, passed, detail = '') {
  if (!passed) failures.push(claim);
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${claim}${detail ? ` — ${detail}` : ''}`);
  return passed;
}

const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);

// ---------------------------------------------------------------------------

section('Freeze commits');

for (const [file, expectedSha] of Object.entries(FROZEN_COMMITS)) {
  let lastTouching = null;
  try {
    lastTouching = execFileSync(GIT, ['-C', REPO_ROOT, 'log', '-1', '--format=%H', '--', file], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    lastTouching = `<git failed: ${error.message}>`;
  }
  verify(
    `${file} is still the file its freeze commit introduced`,
    lastTouching === expectedSha,
    `last touched by ${lastTouching.slice(0, 12)}, expected ${expectedSha.slice(0, 12)}`,
  );

  // `git log` answers about committed history only, so an uncommitted edit to a
  // frozen contract would pass the check above. Compare the bytes on disk to the
  // blob the freeze commit recorded, which closes that door.
  let frozenBytes = null;
  try {
    frozenBytes = execFileSync(GIT, ['-C', REPO_ROOT, 'show', `${expectedSha}:${file}`], {
      encoding: 'buffer',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    frozenBytes = null;
  }
  const onDisk = existsSync(join(REPO_ROOT, file)) ? readFileSync(join(REPO_ROOT, file)) : null;
  verify(
    `${file} on disk is byte-identical to its frozen blob`,
    frozenBytes !== null && onDisk !== null && sha256(frozenBytes) === sha256(onDisk),
    frozenBytes && onDisk ? `sha256 ${sha256(onDisk).slice(0, 12)}` : 'could not read one side',
  );
}

// ---------------------------------------------------------------------------

section('Packet presence');

const hasRaw = existsSync(join(EVIDENCE_DIR, 'raw-results.json'));
const hasResults = existsSync(join(EVIDENCE_DIR, 'results.json'));

if (!hasRaw || !hasResults) {
  console.log(`  ..    no results yet (raw-results.json ${hasRaw ? 'present' : 'absent'}, results.json ${hasResults ? 'present' : 'absent'})`);
  console.log('\nMachinery verified; the experiment has not been executed.');
  process.exit(failures.length > 0 ? 1 : 0);
}

const raw = json('raw-results.json');
const results = json('results.json');

// ---------------------------------------------------------------------------

section('Digests');

verify(
  'results.json cites the metric definitions it was computed against',
  results.metricDefinitionsSha256 === sha256(read('metric-definitions.json')),
);
verify('results.json cites the frozen corpus', results.corpusSha256 === sha256(read('corpus.json')));
verify(
  'results.json cites the frozen execution semantics',
  results.executionSemanticsSha256 === sha256(read('execution-semantics.json')),
);
verify(
  'results.json cites the exact raw records it summarises',
  results.rawResultsSha256 === sha256(read('raw-results.json')),
);
for (const [name, sha] of Object.entries(raw.frozenInputs ?? {})) {
  verify(`raw-results.json pins ${name}`, Object.values(FROZEN_COMMITS).includes(sha), sha.slice(0, 12));
}

// ---------------------------------------------------------------------------

section('Completeness');

const expected = SCENARIOS.length * ARMS.length * ORDERS.length;
verify(
  `every scenario x arm x order produced a record (${expected})`,
  raw.records.length === expected,
  `${raw.records.length} present`,
);

const seen = new Set(raw.records.map((r) => `${r.scenarioId}|${r.arm}|${r.order}`));
const missing = [];
for (const scenario of SCENARIOS) {
  for (const arm of ARMS) {
    for (const order of ORDERS) {
      if (!seen.has(`${scenario.id}|${arm}|${order}`)) missing.push(`${scenario.id}|${arm}|${order}`);
    }
  }
}
verify('no record is missing', missing.length === 0, missing.slice(0, 3).join(', '));

verify(
  'every record carries its oracle evidence or an explicit error',
  raw.records.every((r) => r.error != null || (r.oracle?.exitCode !== undefined && /^[0-9a-f]{64}$/.test(r.oracle.verifierSha256))),
);

// ---------------------------------------------------------------------------

section('Recomputation');

let recomputed = null;
let recomputeError = null;
try {
  recomputed = aggregate({ records: raw.records, scenarios: SCENARIOS, arms: ARMS, families: FAMILIES });
} catch (error) {
  recomputeError = String(error?.message ?? error);
}

verify('aggregation reruns over the raw records', recomputeError === null, recomputeError ?? '');

if (recomputed) {
  verify(
    'the committed report is exactly what the raw records produce',
    JSON.stringify(recomputed) === JSON.stringify(results.report),
    'recomputed from raw records, not read from the summary',
  );

  verify(
    'no SPR figure is present without its unsafe-joint-state rate',
    ARMS.every((arm) => {
      const spr = recomputed.aggregate[arm]?.spr;
      return spr?.safeParallelismRetained && spr.unsafeJointState && typeof spr.rendering === 'string';
    }),
  );

  verify(
    'lock validity is reported for every arm before the headline metrics',
    ARMS.every((arm) => recomputed.lockValidity[arm] !== undefined),
  );

  verify(
    'per-family metrics exist for every family',
    FAMILIES.every((family) => ARMS.every((arm) => recomputed.perFamily[family]?.[arm]?.spr)),
  );

  verify('no defect gate is tripped', recomputed.defects.length === 0, recomputed.defects.map((d) => `${d.gate}/${d.arm}`).join(', '));
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nFAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nHAC-343 packet verified.');
