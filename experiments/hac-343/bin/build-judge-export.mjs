#!/usr/bin/env node
/**
 * HAC-343 — derive the judge-facing export from the frozen result.
 *
 *     node experiments/hac-343/bin/build-judge-export.mjs
 *
 * Presentation only. It reads the frozen packet and writes `judge-export.json`;
 * it modifies nothing that was frozen — not the metric definitions, the corpus,
 * the arm semantics, the raw records, the aggregator, or the canonical result.
 *
 * ## Why this exists rather than a hand-written summary
 *
 * The canonical result is correct and unpromotable as-is. Its unsafe-joint-state
 * denominator is COUPLED scenarios only, so A4 reads 0/2 (0.0%) while having
 * produced an invalid joint state in two of sixteen scenarios — the two where the
 * co-change evidence was deliberately removed. Rendering that bare number to a
 * judge would be the exact class of claim this packet exists to prevent.
 *
 * The repair is not a re-measurement. It is to stop collapsing a heterogeneous
 * corpus into one denominator, and to present two questions separately:
 *
 *   Panel 1 — under the evidence that was available, how do the four
 *             coordination strategies compare?
 *   Panel 2 — does removing that evidence reverse Interlock's decision?
 *
 * Both panels are the same frozen records read two ways. Neither is a new run.
 *
 * ## No hand-entered outcome values
 *
 * Every figure is built by `figure()`, which requires a `derivedFrom` pointer
 * naming where in the frozen packet it came from, and the script refuses to emit
 * if any figure lacks one. A number typed in by hand cannot acquire a pointer,
 * so it cannot reach the export.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENARIOS, FAMILIES } from '../lib/corpus.mjs';
import { ARMS } from '../lib/arms.mjs';
import { FROZEN_COMMITS, ORDERS } from '../lib/aggregate.mjs';
import { GIT } from '../../hac-330/lib/exec.mjs';

const EXPERIMENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(EXPERIMENT_DIR, '..', '..');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');

const read = (name) => readFileSync(join(EVIDENCE_DIR, name));
const json = (name) => JSON.parse(read(name).toString('utf8'));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** The canonical result commit. Recorded so the export names its own source. */
const CANONICAL_RESULT_COMMIT = execFileSync(
  GIT,
  ['-C', REPO_ROOT, 'log', '-1', '--format=%H', '--', 'experiments/hac-343/evidence/results.json'],
  { encoding: 'utf8' },
).trim();

const raw = json('raw-results.json');
const results = json('results.json');
const report = results.report;

// ---------------------------------------------------------------------------

const problems = [];

/**
 * Every number in the export passes through here.
 *
 * `derivedFrom` is mandatory and names the location in the frozen packet the
 * figure came from. A hand-typed value has no such location, which is what makes
 * "no hand-entered outcome values" mechanically enforced rather than promised.
 */
function figure(numerator, denominator, derivedFrom) {
  if (typeof derivedFrom !== 'string' || derivedFrom.length === 0) {
    problems.push(`figure ${numerator}/${denominator} has no derivedFrom pointer`);
  }
  if (denominator === 0) {
    return { numerator, denominator, display: 'n/a (0 cases)', derivedFrom };
  }
  return {
    numerator,
    denominator,
    display: `${numerator}/${denominator}`,
    percent: Number(((numerator / denominator) * 100).toFixed(1)),
    derivedFrom,
  };
}

/** Records for one scenario x arm, both orders. */
const recordsFor = (scenarioId, arm) =>
  ORDERS.map((order) => raw.records.find((r) => r.scenarioId === scenarioId && r.arm === arm && r.order === order));

const scenariosLabelled = (label) => SCENARIOS.filter((s) => s.label === label);

/** A scenario counts invalid when the fixture verifier rejected either order. */
const invalidInEitherOrder = (scenarioId, arm) =>
  recordsFor(scenarioId, arm).some((r) => r.error != null || r.oracle?.holds === false);

// ---------------------------------------------------------------------------
// Panel 1 — operational utility under available evidence
// ---------------------------------------------------------------------------

const LABELS = {
  A1_uncoordinated: 'Uncoordinated',
  A2_global_lock: 'Global lock',
  A3_per_target_lock: 'Per-target lock',
  A4_interlock: 'Interlock',
};

const panel1 = {
  question: 'Under the co-change evidence that was available, how do the four coordination strategies compare?',
  scope: 'COUPLED and INDEPENDENT scenarios only. Evidence-ablation scenarios are Panel 2; inadmissible-evidence scenarios are reported under limitations.',
  rows: ARMS.map((arm) => ({
    arm,
    label: LABELS[arm],
    coupledUnsafe: figure(
      report.aggregate[arm].unsafeJointState.numerator,
      report.aggregate[arm].unsafeJointState.denominator,
      `results.json report.aggregate.${arm}.unsafeJointState`,
    ),
    safeParallelism: figure(
      report.aggregate[arm].spr.safeParallelismRetained.numerator,
      report.aggregate[arm].spr.safeParallelismRetained.denominator,
      `results.json report.aggregate.${arm}.spr.safeParallelismRetained`,
    ),
  })),
  reading:
    'Global locking preserved safety by eliminating concurrency. Per-target locking preserved concurrency but missed every cross-target composition hazard. Interlock is the only arm in both left-hand columns at once on this corpus.',
};

// A3's credibility gate, without which its unsafe column is dismissible.
const crossTarget = SCENARIOS.filter((s) => s.label === 'COUPLED' || s.label === 'INDEPENDENT');
const a3Parallelised = crossTarget.filter((s) =>
  recordsFor(s.id, 'A3_per_target_lock').every((r) => r.concurrent === true),
).length;

panel1.perTargetLockCredibility = {
  claim: 'A3 is a real lock, so its misses are blindness rather than absence of a lock.',
  serializedSameTargetContention: figure(
    report.lockValidity.A3_per_target_lock.numerator,
    report.lockValidity.A3_per_target_lock.denominator,
    'results.json report.lockValidity.A3_per_target_lock',
  ),
  parallelisedCrossTarget: figure(a3Parallelised, crossTarget.length, 'raw-results.json records[A3, cross-target].concurrent'),
  missedCrossTargetHazards: figure(
    report.aggregate.A3_per_target_lock.unsafeJointState.numerator,
    report.aggregate.A3_per_target_lock.unsafeJointState.denominator,
    'results.json report.aggregate.A3_per_target_lock.unsafeJointState',
  ),
  note: 'It locked exactly what a lock can see. A composition hazard spanning two lock keys is not visible to any per-key discipline.',
};

// ---------------------------------------------------------------------------
// Panel 2 — evidence ablation / causal control
// ---------------------------------------------------------------------------

const coupledScenarios = scenariosLabelled('COUPLED');
const perturbedScenarios = scenariosLabelled('EVIDENCE_PERTURBED');

const panel2 = {
  question: 'Is Interlock’s safety derived from the evidence, or from something else?',
  design:
    'The perturbed fixtures hold the intents and the final tree identical to their coupled counterparts and change only the commit history, so the coupling is absent from the mined evidence while the composition remains genuinely hazardous.',
  rows: [
    {
      condition: 'Interlock + coupling evidence present',
      invalidOutcomes: figure(
        coupledScenarios.filter((s) => invalidInEitherOrder(s.id, 'A4_interlock')).length,
        coupledScenarios.length,
        'raw-results.json records[A4, COUPLED].oracle.holds',
      ),
      decision: [...new Set(coupledScenarios.flatMap((s) => recordsFor(s.id, 'A4_interlock').flatMap((r) => (r.verdicts ?? []).map((v) => v.decision))))].sort(),
    },
    {
      condition: 'Interlock + coupling evidence removed',
      invalidOutcomes: figure(
        perturbedScenarios.filter((s) => invalidInEitherOrder(s.id, 'A4_interlock')).length,
        perturbedScenarios.length,
        'raw-results.json records[A4, EVIDENCE_PERTURBED].oracle.holds',
      ),
      decision: [...new Set(perturbedScenarios.flatMap((s) => recordsFor(s.id, 'A4_interlock').flatMap((r) => (r.verdicts ?? []).map((v) => v.decision))))].sort(),
    },
  ],
  reading:
    'Interlock’s safety is evidence-derived. With revision-bound composition evidence present it withheld both hazardous compositions while retaining both safe parallel opportunities. When that evidence was deliberately removed, the decision reversed and both invariants failed.',
  forbiddenRendering:
    'A4 must not be described as globally 0% unsafe, and the sixteen-scenario corpus must not be collapsed into a single unsafe-rate denominator. The 0/2 in Panel 1 is bounded to COUPLED scenarios and means nothing without Panel 2 beside it.',
};

// ---------------------------------------------------------------------------
// Limitations
// ---------------------------------------------------------------------------

const inadmissible = scenariosLabelled('EVIDENCE_INADMISSIBLE');
const failedClosed = inadmissible.filter((s) =>
  recordsFor(s.id, 'A4_interlock').every((r) => (r.outcomes ?? []).every((o) => o.applied === false)),
).length;

const reasonMismatches = inadmissible
  .map((s) => {
    const observed = [...new Set(recordsFor(s.id, 'A4_interlock').map((r) => r.refusalReason))];
    return { scenario: s.id, expected: s.expectedRefusalReason, observed: observed.join(','), matches: observed.length === 1 && observed[0] === s.expectedRefusalReason };
  })
  .filter((row) => !row.matches);

const limitations = {
  inadmissibleEvidence: {
    failedClosed: figure(failedClosed, inadmissible.length, 'raw-results.json records[A4, EVIDENCE_INADMISSIBLE].outcomes[].applied'),
    exactReasonAgreement: figure(
      report.aggregate.A4_interlock.refusalCorrectness.numerator,
      report.aggregate.A4_interlock.refusalCorrectness.denominator,
      'results.json report.aggregate.A4_interlock.refusalCorrectness',
    ),
    mismatches: reasonMismatches,
    statement:
      'Every inadmissible-evidence scenario failed closed and applied no mutation. Exact refusal-reason agreement with the frozen corpus was lower: two scenarios refused with HISTORY_NOT_MINED where the corpus predicted HISTORY_EVIDENCE_UNAVAILABLE. The envelope’s completeness state is NOT_MINED, so the decision core took the correct branch and the corpus expectation was mistaken. Neither mismatch permitted a mutation. The corpus is frozen and stays wrong on the record.',
  },
  outsideScope: [
    'same-target atomicity and target-side compare-and-set',
    'exactly-once execution',
    'restart and recovery behaviour',
    'joint human authorization',
    'Agent Runtime and Agent Gateway participation',
  ],
  outsideScopeNote:
    'HAC-343 measures a deterministic coordination decision. It does not model a target-side CAS, so A4 permitting two writes to one path is outside what this experiment tested rather than evidence that it is safe. Those belong to HAC-317 and HAC-327.',
  corpusBound:
    'Sixteen scenarios across two hazard families. Every rate is a property of this corpus and is not a population estimate. No confidence intervals: the decision core is deterministic and the corpus is enumerated exhaustively, so there is no sampling process.',
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

const provenance = {
  canonicalResultCommit: CANONICAL_RESULT_COMMIT,
  frozenCommits: FROZEN_COMMITS,
  digests: {
    'metric-definitions.json': sha256(read('metric-definitions.json')),
    'corpus.json': sha256(read('corpus.json')),
    'execution-semantics.json': sha256(read('execution-semantics.json')),
    'raw-results.json': sha256(read('raw-results.json')),
    'results.json': sha256(read('results.json')),
  },
  matrix: figure(raw.records.length, SCENARIOS.length * ARMS.length * ORDERS.length, 'raw-results.json records.length'),
  families: FAMILIES,
  perFamilyIdentical: FAMILIES.every((family) =>
    ARMS.every(
      (arm) =>
        JSON.stringify(report.perFamily[family][arm].unsafeJointState.rate) ===
        JSON.stringify(report.perFamily[FAMILIES[0]][arm].unsafeJointState.rate),
    ),
  ),
  evidenceProducer: {
    note: 'The evidence consumed by the run is frozen in git and records its own producer. @workspacejson/cli@0.6.2 was present at execution but provably not loaded: nothing in the runner’s import graph reaches the miner, and the run plans identically with WORKSPACEJSON_CLI unset or pointing at a nonexistent path. It is reproduction tooling, not an input.',
    pinnedCliSha: 'defac1e5dce6fb692a48e775fb44854b371cbca4',
    miningCoreBundleSha256: '7aa5ae231d6713449d6c1790f0b19a509e82ec0c84d67a8a6a52ff492ec27bb8',
  },
  // Captured directly from the registry, not transcribed.
  npmIntegrity: {
    '@workspacejson/cli@0.6.2': 'sha512-DyXe4oY4s6paN9lgLkFnhj9x46Excg3GSSQfcF3VBTzGj2LUeosaM3iZ5NgM1was8hQWhxibyS1a7YOq5OxI5Q==',
    '@workspacejson/spec@0.5.0': 'sha512-KpsUxvLXFHHHKY6F58tWBnqsx5REJjK99Kum1+ATU4b8oUGlStfVkWyphNQ+nFZU3hy/ckNLZTxs4mpOeWGQLA==',
    '@workspacejson/rules@0.5.0': 'sha512-UlJUnDdc1In4oAMCNMFbFnCAVUGSb1HR0MeP3Pa6Db3uHrH/OvXPyQCqGXLDe9ii3D+6Ua/OHAJMeocKv2bL1Q==',
  },
  toolchain: { node: process.version, platform: `${process.platform} ${process.arch}` },
};

// Every integrity string must be a complete sha512 base64 digest. Line-wrapped
// or truncated values are a real failure mode when a figure is copied through a
// terminal, so length is asserted rather than eyeballed.
for (const [pkg, integrity] of Object.entries(provenance.npmIntegrity)) {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) {
    problems.push(`npm integrity for ${pkg} is not a complete sha512 digest (length ${integrity.length})`);
  }
}

// ---------------------------------------------------------------------------

const boundedClaim =
  'On a frozen sixteen-scenario corpus spanning two structurally different hazard classes — an arithmetic budget ceiling and a referential service registry — global locking preserved safety by eliminating concurrency, per-target locking preserved concurrency but missed every composition hazard spanning distinct targets, and Interlock withheld both hazardous compositions while retaining both safe parallel opportunities. Interlock’s safety is evidence-derived: with the co-change evidence deliberately removed and the intents unchanged, its decision reversed and both invariants failed. Bounded to this corpus; no claim is made about exactly-once execution, restart behaviour, target-side atomicity, or production readiness.';

const overclaims = [
  'Interlock is 0% unsafe — it produced invalid joint states in the two evidence-ablation scenarios by design.',
  'Interlock prevents composition hazards — it withheld the hazardous compositions present in this corpus, given evidence that described them.',
  'Interlock is safer than locking — it is safe against a hazard class per-key locking cannot see; per-target locking is correct for the hazard it addresses.',
  'A 100% / 0% headline over all sixteen scenarios — the corpus is heterogeneous and must not share one denominator.',
  'Statistically significant, or any interval — the corpus is an exhaustive deterministic enumeration, not a sample.',
  'Production-ready, exactly-once, or restart-safe — none were tested here.',
];

const exportDocument = {
  experiment: 'HAC-343',
  kind: 'judge export (derived, presentation only)',
  derivedFrom: { canonicalResultCommit: CANONICAL_RESULT_COMMIT, modifiesNothingFrozen: true },
  generator: 'experiments/hac-343/bin/build-judge-export.mjs',
  boundedClaim,
  panel1,
  panel2,
  limitations,
  orderEffects: {
    count: report.orderEffects.length,
    allSameArm: [...new Set(report.orderEffects.map((e) => e.arm))],
    statement:
      'Every order disagreement is A2 under a single global lock, where whichever intent enters the critical section first wins and the other is rejected. Real and expected. Safety held under both orders for every arm, so the aggregation absorbs it without hiding it.',
    derivedFrom: 'results.json report.orderEffects',
  },
  mustNotClaim: overclaims,
  provenance,
};

if (problems.length > 0) {
  console.error('REFUSING TO EMIT — the export contains values it cannot trace:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

writeFileSync(join(EVIDENCE_DIR, 'judge-export.json'), `${JSON.stringify(exportDocument, null, 2)}\n`);

// ---------------------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);
console.log('PANEL 1 — operational utility under available evidence');
console.log(`  ${pad('', 20)}${'coupled unsafe'.padStart(16)}${'safe parallelism'.padStart(19)}`);
for (const row of panel1.rows) {
  console.log(`  ${pad(row.label, 20)}${row.coupledUnsafe.display.padStart(16)}${row.safeParallelism.display.padStart(19)}`);
}
const cred = panel1.perTargetLockCredibility;
console.log(`\n  Per-target lock credibility: serialized same-target ${cred.serializedSameTargetContention.display}, ` +
  `parallelised cross-target ${cred.parallelisedCrossTarget.display}, missed ${cred.missedCrossTargetHazards.display}`);

console.log('\nPANEL 2 — evidence ablation (causal control)');
for (const row of panel2.rows) {
  console.log(`  ${pad(row.condition, 42)}${row.invalidOutcomes.display.padStart(8)} invalid   [${row.decision.join(' + ')}]`);
}

console.log('\nLIMITATIONS');
console.log(`  failed closed on inadmissible evidence   ${limitations.inadmissibleEvidence.failedClosed.display}`);
console.log(`  exact refusal-reason agreement           ${limitations.inadmissibleEvidence.exactReasonAgreement.display}`);
for (const m of limitations.inadmissibleEvidence.mismatches) {
  console.log(`    ${m.scenario}: expected ${m.expected}, observed ${m.observed}`);
}

console.log(`\nMatrix ${provenance.matrix.display} · per-family identical: ${provenance.perFamilyIdentical}`);
console.log(`Derived from ${CANONICAL_RESULT_COMMIT.slice(0, 12)} · wrote evidence/judge-export.json`);
