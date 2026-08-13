#!/usr/bin/env node
/**
 * Verify the committed HAC-330 evidence packet against itself.
 *
 *     node experiments/hac-330/bin/verify-packet.mjs
 *
 * This is the half of the gate that runs anywhere. It needs no
 * `workspacejson/cli` sibling checkout and no network, so CI can enforce it:
 * every digest, revision and claim recorded in `results.json` is recomputed
 * from the committed artifacts, and the recorded decisions are re-derived by
 * running the real decision function over the recorded evidence.
 *
 * It cannot prove the artifacts came from the pinned miner — only re-running
 * `run-experiment.mjs` against the pinned sibling checkout does that. What it
 * proves is that nobody edited an artifact, a digest or a claim afterwards.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Decision, decide } from '../lib/decide.mjs';

const EXPERIMENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(EXPERIMENT_DIR, 'evidence');

const read = (name) => readFileSync(join(EVIDENCE_DIR, name));
const json = (name) => JSON.parse(read(name).toString('utf8'));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * Key-order-independent JSON, for comparing *content* rather than spelling.
 *
 * The committed `.selection.json` is the upstream `serializeSelection` output,
 * which sorts object keys; the envelope is written with `JSON.stringify`, which
 * preserves insertion order. Comparing those two strings directly compares the
 * serializers, not the data.
 */
function compareKeys(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compareKeys(a, b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const failures = [];
function verify(claim, passed, detail) {
  const status = passed ? 'ok  ' : 'FAIL';
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`  ${status}  ${claim}${suffix}`);
  if (!passed) failures.push(claim);
}

const results = json('results.json');
const baseline = json('baseline.evidence.json');
const perturbed = json('perturbed.evidence.json');
const fixtures = json('fixtures.json');
const guards = json('guards.json');
const producerPath = json('producer-path.json');

const INTENTS = [
  { id: 'A', targets: ['services/alpha/reservation.json'] },
  { id: 'B', targets: ['services/beta/reservation.json'] },
];

console.log('HAC-330 evidence packet verification\n');

// 1. Artifact digests are the digests of the artifacts.
for (const arm of ['baseline', 'perturbed']) {
  const bytes = read(`${arm}.selection.json`);
  const digest = sha256(bytes);
  const envelope = arm === 'baseline' ? baseline : perturbed;
  verify(
    `${arm}: recorded digest matches the committed selection bytes`,
    digest === results.evidenceDigests[arm] && digest === envelope.artifact.sha256,
    `sha256 ${digest.slice(0, 16)}…`,
  );
  verify(
    `${arm}: envelope selection matches the serialized selection`,
    canonical(JSON.parse(bytes.toString('utf8'))) === canonical(envelope.selection),
    'envelope and serialized artifact carry the same selection',
  );
}

// 2. The two arms really are different evidence about the same tree.
verify(
  'the two histories produced different evidence',
  results.evidenceDigests.baseline !== results.evidenceDigests.perturbed,
);
verify(
  'the two histories end at the same tree, so the target state is held constant',
  fixtures.baseline.tree === fixtures.perturbed.tree && baseline.source.tree === perturbed.source.tree,
  fixtures.baseline.tree,
);
verify(
  'both histories reached the same completeness state',
  baseline.completeness.state === 'QUALIFYING_RELATIONSHIP_OBSERVED' &&
    perturbed.completeness.state === 'QUALIFYING_RELATIONSHIP_OBSERVED',
);

// 3. Provenance is bound to a revision and a producer.
verify(
  'the evidence basis is a full-length object name equal to the fixture HEAD',
  /^[0-9a-f]{40}$/.test(baseline.historyBasis.basisRevision) &&
    baseline.historyBasis.basisRevision === fixtures.baseline.head,
  baseline.historyBasis.basisRevision,
);
verify(
  'the producer is recorded by repository SHA, package, version and bundle digest',
  /^[0-9a-f]{40}$/.test(baseline.producer.pinnedSha) &&
    /^[0-9a-f]{64}$/.test(baseline.producer.bundleSha256) &&
    baseline.producer.package === '@workspacejson/mining-core',
  `${baseline.producer.package}@${baseline.producer.version} from ${baseline.producer.pinnedSha.slice(0, 12)}…`,
);
verify(
  'the recorded producer SHA matches the manifest pin',
  baseline.producer.pinnedSha === results.pins['workspacejson-cli'].pinnedSha,
);
verify(
  'no L1 projection was used and no workspace.json artifact was produced',
  baseline.producer.l1ProjectionUsed === false && producerPath.coChangePresent === false,
);

// 4. The decisions re-derive from the committed evidence.
const treatment = decide({
  intents: INTENTS,
  evidence: baseline,
  targetRevision: baseline.historyBasis.basisRevision,
});
const control = decide({
  intents: INTENTS,
  evidence: perturbed,
  targetRevision: perturbed.historyBasis.basisRevision,
});
verify(
  'the recorded treatment decision re-derives from the committed evidence',
  treatment.decision === results.decisions.treatment.decision &&
    treatment.reason === results.decisions.treatment.reason &&
    treatment.decision === Decision.WITHHOLD_SERIALIZE,
  `${treatment.decision} (${treatment.reason})`,
);
verify(
  'the recorded control decision re-derives from the committed evidence',
  control.decision === results.decisions.perturbedControl.decision &&
    control.decision === Decision.ALLOW_PARALLEL,
  `${control.decision} (${control.reason})`,
);
verify(
  'the decision changed, and the citation names the mined pair',
  treatment.decision !== control.decision &&
    treatment.couplings[0].files.join() === 'services/alpha/reservation.json,services/beta/reservation.json',
  `support ${treatment.couplings[0].support} at basis ${treatment.basisRevision.slice(0, 12)}…`,
);

// 5. Degraded evidence stayed closed.
verify(
  'every recorded degraded case was INSUFFICIENT_EVIDENCE',
  guards.length > 0 && guards.every((g) => g.decision === Decision.INSUFFICIENT_EVIDENCE),
  `${guards.length} cases`,
);
verify(
  'no degraded case applied a mutation, and the invariant held in all of them',
  guards.every((g) => g.mutationsApplied === 0 && g.invariantHolds === true),
);
verify(
  'the degraded cases cover absence, malformation, staleness, attribution and unmined history',
  ['EVIDENCE_ABSENT', 'EVIDENCE_MALFORMED', 'STALE_BASIS', 'EVIDENCE_REPOSITORY_MISMATCH', 'HISTORY_NOT_MINED', 'NO_BASIS_PIN'].every(
    (reason) => guards.some((g) => g.reason === reason),
  ),
  [...new Set(guards.map((g) => g.reason))].join(', '),
);

// 6. The headline claim.
verify(
  'green A + green B produced a red joint state',
  results.invariantOutcomes.actionAAlone === true &&
    results.invariantOutcomes.actionBAlone === true &&
    results.invariantOutcomes.baselineJoint === false,
);
verify(
  'treatment held the invariant and the perturbed control did not',
  results.invariantOutcomes.treatment === true && results.invariantOutcomes.perturbedControl === false,
);
verify('the recorded run passed every check', results.result === 'PASS' && results.checks.every((c) => c.passed));

const verdict = failures.length === 0 ? 'PASS' : 'FAIL';
const summary =
  failures.length === 0
    ? 'the committed packet verifies against itself'
    : `${failures.length} claim(s) do not hold`;
console.log(`\n${verdict} — ${summary}`);
if (failures.length > 0) process.exit(1);
