#!/usr/bin/env node
/**
 * HAC-343 — build and freeze the corpus manifest.
 *
 *     WORKSPACEJSON_CLI=<pinned-cli-checkout> node experiments/hac-343/bin/build-corpus.mjs
 *
 * Materializes the family-2 fixture histories, mines both, records what the
 * miner actually observed, validates every corpus requirement the frozen metric
 * manifest imposes, and writes `evidence/corpus.json`.
 *
 * This runs *before* any arm exists. That ordering is the point: the corpus and
 * its labels are fixed, and demonstrated to be fixed, before anything can be
 * measured against them. A corpus adjusted after seeing an arm's output is not a
 * corpus, and `metric-definitions.json` forbids it in writing.
 *
 * Family 1's fixtures are HAC-330's, reused rather than rebuilt: this script
 * reads their recorded revisions from that packet and does not regenerate them,
 * so the budget family in this corpus is the same history the S-1 gate proved.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMiner, mineEvidence, resolveCliCheckout, verifyPin } from '../../hac-330/lib/evidence.mjs';
import { buildFixture, FIXTURES, SUBJECT_PATHS } from '../lib/families/registry.mjs';
import { SCENARIOS, FAMILIES, corpusCounts, validateCorpus } from '../lib/corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(EXPERIMENT_DIR, '..', '..');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');
const WORK_DIR = join(EXPERIMENT_DIR, '.work', 'fixtures');

process.chdir(REPO_ROOT);

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const failures = [];
function check(id, passed, detail) {
  if (!passed) failures.push(`${id}: ${detail}`);
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${id.padEnd(14)} ${detail}`);
  return passed;
}

const section = (title) => console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);

// ---------------------------------------------------------------------------

section('Pinned checkouts');

const cliCheckout = resolveCliCheckout();
const pins = {
  'workspacejson-cli': verifyPin('workspacejson-cli', cliCheckout),
  'workspacejson-standard': verifyPin('workspacejson-standard', join(cliCheckout, '..', 'standard')),
};
for (const [id, pin] of Object.entries(pins)) {
  check(id === 'workspacejson-cli' ? 'PIN-CLI' : 'PIN-STD', pin.matches && pin.clean, `${pin.observedSha} ${pin.clean ? 'clean' : 'DIRTY'}`);
}

// ---------------------------------------------------------------------------

section('Family 1 — budget (reused from HAC-330)');

const budgetFixtures = JSON.parse(
  readFileSync(join(REPO_ROOT, 'experiments', 'hac-330', 'evidence', 'fixtures.json'), 'utf8'),
);
check(
  'F1-REUSED',
  typeof budgetFixtures.baseline?.head === 'string' && typeof budgetFixtures.perturbed?.head === 'string',
  `baseline ${budgetFixtures.baseline?.head?.slice(0, 12)} perturbed ${budgetFixtures.perturbed?.head?.slice(0, 12)}`,
);
check(
  'F1-TREE',
  budgetFixtures.baseline.tree === budgetFixtures.perturbed.tree,
  `shared final tree ${budgetFixtures.baseline.tree.slice(0, 12)}`,
);

// ---------------------------------------------------------------------------

section('Family 2 — registry (built here)');

mkdirSync(WORK_DIR, { recursive: true });
const registryFixtures = {};
for (const [name, steps] of Object.entries(FIXTURES)) {
  registryFixtures[name] = buildFixture(join(WORK_DIR, name), steps);
  const f = registryFixtures[name];
  console.log(`  built ${name.padEnd(10)} head=${f.head.slice(0, 12)} tree=${f.tree.slice(0, 12)} commits=${f.commitCount}`);
}

check(
  'F2-TREE',
  registryFixtures.baseline.tree === registryFixtures.perturbed.tree,
  `shared final tree ${registryFixtures.baseline.tree.slice(0, 12)} — the perturbation is history-only`,
);
check(
  'F2-SHAPE',
  registryFixtures.baseline.commitCount === registryFixtures.perturbed.commitCount,
  `${registryFixtures.baseline.commitCount} commits in each`,
);

// ---------------------------------------------------------------------------

section('Family 2 — mined evidence');

const miner = await loadMiner();
const registryEvidence = {};
const qualifying = {};

for (const name of Object.keys(FIXTURES)) {
  const evidence = await mineEvidence({
    fixture: name,
    repo: join(WORK_DIR, name),
    miner,
  });
  registryEvidence[name] = evidence;

  const selection = evidence.envelope?.selection ?? evidence.selection;
  const pairs = (selection?.pairs ?? []).filter((p) => p.support >= 3);
  qualifying[name] = pairs.map((p) => ({ files: p.files, support: p.support, occurrences: p.occurrences ?? 0 }));

  writeJson(join(EVIDENCE_DIR, `registry.${name}.evidence.json`), evidence.envelope ?? evidence);
}

const spansSubjects = (pairs) =>
  pairs.some(
    (p) =>
      (p.files[0] === SUBJECT_PATHS.left && p.files[1] === SUBJECT_PATHS.right) ||
      (p.files[0] === SUBJECT_PATHS.right && p.files[1] === SUBJECT_PATHS.left),
  );

check(
  'F2-COUPLED',
  spansSubjects(qualifying.baseline),
  `baseline carries ${SUBJECT_PATHS.left} <-> ${SUBJECT_PATHS.right}`,
);
check(
  'F2-PERTURBED',
  !spansSubjects(qualifying.perturbed),
  `perturbed does NOT carry that pair — only the subject coupling was removed`,
);

const touchesIndependent = (pairs) =>
  pairs.some((p) => p.files.includes(SUBJECT_PATHS.independent) &&
    (p.files.includes(SUBJECT_PATHS.left) || p.files.includes(SUBJECT_PATHS.right)));
check(
  'F2-INDEP',
  !touchesIndependent(qualifying.baseline),
  `${SUBJECT_PATHS.independent} couples to neither subject path, so it is usable as the INDEPENDENT counterpart`,
);

// ---------------------------------------------------------------------------

section('Corpus requirements');

const corpusFailures = validateCorpus();
check('CORPUS-VALID', corpusFailures.length === 0, corpusFailures.length ? corpusFailures.join('; ') : 'every requirement in metric-definitions.json holds');

const counts = corpusCounts();
check('CORPUS-BREADTH', FAMILIES.length >= 2, `${FAMILIES.length} families, ${counts.total} scenarios`);

// ---------------------------------------------------------------------------

section('Write manifest');

const manifest = {
  experiment: 'HAC-343',
  kind: 'corpus manifest',
  status: 'FROZEN_BEFORE_RESULTS',
  revision: 'r01',
  supersedes: [],
  frozenRule:
    'Committed in its own commit, after metric-definitions.json and before any arm implementation or results.json. Scenario counts, labels and intents are fixed here. A corpus change after any result exists invalidates that result and requires a rerun, per metric-definitions.json corpusRequirements.noOptimisation.',
  metricDefinitions: {
    file: 'experiments/hac-343/evidence/metric-definitions.json',
    revision: 'r01',
    sha256: sha256(readFileSync(join(EVIDENCE_DIR, 'metric-definitions.json'))),
  },
  breadthRationale:
    'Two structurally different hazard classes, so a result is not one topology repeated. budget is arithmetic (composed increases overshoot a ceiling); registry is referential (one intent removes a referent the other points at). Both carry all five ground-truth classes, so a per-family divergence is about hazard shape rather than uneven class coverage.',
  families: {
    budget: {
      hazardClass: 'arithmetic',
      invariant: 'sum(services[].reserved) <= budget.totalReservable',
      source: 'experiments/hac-330 — reused verbatim, not rebuilt',
      subjectPaths: {
        left: 'services/alpha/reservation.json',
        right: 'services/beta/reservation.json',
        independent: 'services/gamma/reservation.json',
      },
      fixtures: budgetFixtures,
    },
    registry: {
      hazardClass: 'referential',
      invariant: 'every route.service and alias target resolves in registry/services.json',
      source: 'experiments/hac-343/lib/families/registry.mjs — built by this script',
      subjectPaths: SUBJECT_PATHS,
      fixtures: registryFixtures,
      qualifyingPairs: qualifying,
      controls: {
        sharedFinalTree: registryFixtures.baseline.tree,
        commitCount: registryFixtures.baseline.commitCount,
        note: 'Same four controls as HAC-330: identical final tree, identical commit count, commit i touching the same number of files in both, and the invariant holding at every commit (asserted in planCommits).',
      },
    },
  },
  counts,
  scenarios: SCENARIOS,
  validation: {
    corpusRequirements: corpusFailures.length === 0 ? 'PASS' : corpusFailures,
    checksRun: ['PIN-CLI', 'PIN-STD', 'F1-REUSED', 'F1-TREE', 'F2-TREE', 'F2-SHAPE', 'F2-COUPLED', 'F2-PERTURBED', 'F2-INDEP', 'CORPUS-VALID', 'CORPUS-BREADTH'],
  },
  reproduction: {
    buildCommand: 'WORKSPACEJSON_CLI=<pinned-cli-checkout> node experiments/hac-343/bin/build-corpus.mjs',
    pins,
  },
};

writeJson(join(EVIDENCE_DIR, 'corpus.json'), manifest);
console.log(`  wrote experiments/hac-343/evidence/corpus.json (${counts.total} scenarios, ${FAMILIES.length} families)`);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nFAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nCorpus frozen. All checks passed.');
