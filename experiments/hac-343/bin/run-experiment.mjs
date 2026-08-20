#!/usr/bin/env node
/**
 * HAC-343 — execute the frozen corpus through the four arms.
 *
 *     WORKSPACEJSON_CLI=<pinned-cli-checkout> node experiments/hac-343/bin/run-experiment.mjs
 *     node experiments/hac-343/bin/run-experiment.mjs --plan     # wiring only, no execution
 *
 * Consumes only what is already frozen: the corpus (dbdcaa9), the metric
 * definitions (0a6babb) and the arm semantics (276750b). It decides nothing.
 * Every scenario runs against every arm in both intent orders — 16 x 4 x 2 =
 * 128 raw records — and a record is written for a failure exactly as for a
 * success, because an arm must not be able to improve a rate by declining to
 * produce a record.
 *
 * `--plan` resolves fixtures, evidence and the full record matrix and prints
 * what *would* execute, without running an arm or writing a result. It exists so
 * the wiring can be proven before any number exists.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixture as buildBudget, FIXTURES as BUDGET_FIXTURES } from '../../hac-330/bin/build-fixtures.mjs';
import { git } from '../../hac-330/lib/exec.mjs';
import { buildFixture as buildRegistry, FIXTURES as REGISTRY_FIXTURES } from '../lib/families/registry.mjs';
import { SCENARIOS, FAMILIES, INADMISSIBLE_EVIDENCE } from '../lib/corpus.mjs';
import { ARMS, runArm } from '../lib/arms.mjs';
import { aggregate, ORDERS } from '../lib/aggregate.mjs';
import { oracle, resetWorktree, sha256 } from '../lib/executor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(EXPERIMENT_DIR, '..', '..');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');
const WORK_DIR = join(EXPERIMENT_DIR, '.work', 'run');

process.chdir(REPO_ROOT);

const PLAN_ONLY = process.argv.includes('--plan');
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// Evidence resolution — declared by the corpus, never invented here
// ---------------------------------------------------------------------------

const HAC330_EVIDENCE = join(REPO_ROOT, 'experiments', 'hac-330', 'evidence');
const HAC343_EVIDENCE = EVIDENCE_DIR;

/**
 * The evidence envelope a scenario is evaluated against.
 *
 * A scenario's `evidenceOverride` names one of the frozen inadmissible sources
 * from the corpus. The runner looks that name up; it never decides on its own
 * that a scenario should get degraded evidence, because a runner that could
 * choose when to hand an arm unreadable evidence could choose to hand it to one
 * arm and not another.
 */
function evidenceFor(scenario) {
  if (scenario.evidenceOverride) {
    const source = INADMISSIBLE_EVIDENCE[scenario.evidenceOverride];
    if (!source) throw new Error(`${scenario.id}: unknown evidenceOverride ${scenario.evidenceOverride}`);
    if (source.file === null) {
      return { envelope: null, source: 'absent', sha256: null, expectedReason: source.expectedReason };
    }
    const path = join(HAC330_EVIDENCE, source.file);
    const bytes = readFileSync(path);
    return {
      envelope: JSON.parse(bytes.toString('utf8')),
      source: `experiments/hac-330/evidence/${source.file}`,
      sha256: sha256(bytes),
      expectedReason: source.expectedReason,
    };
  }

  const path =
    scenario.family === 'budget'
      ? join(HAC330_EVIDENCE, `${scenario.fixture}.evidence.json`)
      : join(HAC343_EVIDENCE, `registry.${scenario.fixture}.evidence.json`);
  const bytes = readFileSync(path);
  return {
    envelope: JSON.parse(bytes.toString('utf8')),
    source: path.replace(`${REPO_ROOT}/`, ''),
    sha256: sha256(bytes),
    expectedReason: null,
  };
}

/** Intents tagged with stable ids from the scenario's canonical order. */
const identify = (scenario) => scenario.intents.map((intent, index) => ({ ...intent, id: `i${index}` }));

/** The two execution orders. `AB` is canonical order; `BA` is reversed. */
function ordered(intents, order) {
  return order === 'AB' ? [...intents] : [...intents].reverse();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildFixtures() {
  mkdirSync(WORK_DIR, { recursive: true });
  const repos = { budget: {}, registry: {} };
  for (const fixture of ['baseline', 'perturbed']) {
    repos.budget[fixture] = join(WORK_DIR, 'budget', fixture);
    buildBudget(repos.budget[fixture], BUDGET_FIXTURES[fixture]);
    repos.registry[fixture] = join(WORK_DIR, 'registry', fixture);
    buildRegistry(repos.registry[fixture], REGISTRY_FIXTURES[fixture]);
  }
  return repos;
}

const headOf = (repo) => git(repo, ['rev-parse', 'HEAD']).trim();

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

/** Every (scenario, arm, order) triple that must produce a record. */
function matrix() {
  const rows = [];
  for (const scenario of SCENARIOS) {
    for (const arm of ARMS) {
      for (const order of ORDERS) rows.push({ scenario, arm, order });
    }
  }
  return rows;
}

if (PLAN_ONLY) {
  const rows = matrix();
  const evidence = new Map();
  for (const scenario of SCENARIOS) evidence.set(scenario.id, evidenceFor(scenario));

  console.log(`plan: ${SCENARIOS.length} scenarios x ${ARMS.length} arms x ${ORDERS.length} orders = ${rows.length} records\n`);
  for (const scenario of SCENARIOS) {
    const e = evidence.get(scenario.id);
    console.log(
      `  ${scenario.id.padEnd(38)} ${scenario.label.padEnd(23)} evidence=${e.source}${e.expectedReason ? ` expect=${e.expectedReason}` : ''}`,
    );
  }
  console.log(`\nno arm executed, no result written`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

console.log('Building fixtures…');
const repos = buildFixtures();
const sourceRevisions = {
  budget: { baseline: headOf(repos.budget.baseline), perturbed: headOf(repos.budget.perturbed) },
  registry: { baseline: headOf(repos.registry.baseline), perturbed: headOf(repos.registry.perturbed) },
};

const records = [];
for (const { scenario, arm, order } of matrix()) {
  const repo = repos[scenario.family][scenario.fixture];
  const evidence = evidenceFor(scenario);
  const intents = ordered(identify(scenario), order);
  const sourceRevision = sourceRevisions[scenario.family][scenario.fixture];

  const record = {
    scenarioId: scenario.id,
    family: scenario.family,
    label: scenario.label,
    fixture: scenario.fixture,
    fixtureRevision: sourceRevision,
    arm,
    order,
    intents,
    evidence: { source: evidence.source, sha256: evidence.sha256, expectedReason: evidence.expectedReason },
    error: null,
  };

  try {
    resetWorktree(repo);
    const run = runArm({
      arm,
      repo,
      family: scenario.family,
      scenario,
      intents,
      evidence: evidence.envelope,
      sourceRevision,
    });

    record.verdicts = run.verdicts ?? null;
    record.outcomes = run.outcomes;
    record.lockGroups = run.lockGroups ?? null;
    record.concurrent = run.concurrent;
    record.refusalReason = run.refusalReason ?? null;
    record.oracle = oracle(repo, scenario.family);
  } catch (error) {
    // A thrown execution is still a record. Dropping it would let an arm
    // improve a rate by failing, and the aggregator treats an errored record
    // as unsafe rather than as absent.
    record.error = String(error?.message ?? error);
    record.outcomes = record.outcomes ?? [];
    record.concurrent = record.concurrent ?? false;
    record.oracle = record.oracle ?? null;
  } finally {
    resetWorktree(repo);
  }

  records.push(record);
}

console.log(`Executed ${records.length} records (${records.filter((r) => r.error).length} errored).`);

writeJson(join(EVIDENCE_DIR, 'raw-results.json'), {
  experiment: 'HAC-343',
  kind: 'raw results',
  frozenInputs: {
    metricDefinitions: '0a6babbc5d1a3f69b057f98093108ee508072e48',
    corpus: 'dbdcaa940933f90091a838f5f183031c7556afad',
    executionSemantics: '276750ba7a4a51461fb2447b361d69be5e2a020b',
  },
  sourceRevisions,
  records,
});

// Aggregation is a pure function over exactly those records.
const report = aggregate({ records, scenarios: SCENARIOS, arms: ARMS, families: FAMILIES });

writeJson(join(EVIDENCE_DIR, 'results.json'), {
  experiment: 'HAC-343',
  kind: 'results',
  metricDefinitionsSha256: sha256(readFileSync(join(EVIDENCE_DIR, 'metric-definitions.json'))),
  corpusSha256: sha256(readFileSync(join(EVIDENCE_DIR, 'corpus.json'))),
  executionSemanticsSha256: sha256(readFileSync(join(EVIDENCE_DIR, 'execution-semantics.json'))),
  rawResultsSha256: sha256(readFileSync(join(EVIDENCE_DIR, 'raw-results.json'))),
  report,
});

// Lock validity is reported before anything else: a baseline that did not lock
// makes every downstream comparison meaningless.
console.log('\nLock validity (gate, evaluated before headline metrics):');
for (const [arm, validity] of Object.entries(report.lockValidity)) {
  console.log(`  ${arm.padEnd(22)} ${validity.display}`);
}

if (report.defects.length > 0) {
  console.error('\nDEFECT GATES TRIPPED — the harness is wrong, these are not results:');
  for (const defect of report.defects) console.error(`  ${defect.gate}/${defect.arm}: ${defect.detail}`);
  process.exit(1);
}

console.log('\nPer-arm (aggregate across both families):');
for (const arm of ARMS) {
  console.log(`  ${arm.padEnd(22)} ${report.aggregate[arm].spr.rendering}`);
}

console.log(`\nWrote raw-results.json and results.json. Verify with:`);
console.log('  node experiments/hac-343/bin/verify-packet.mjs');
