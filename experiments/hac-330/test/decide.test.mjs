/**
 * Tests for the Interlock decision function.
 *
 * Run by the repository's single test runner (`pnpm test`), alongside the
 * production suite. Assertions are `node:assert/strict` rather than vitest's
 * `expect`, because nothing here needs a matcher library and the decision
 * function's contract reads better as plain assertions.
 *
 * These run in CI on a machine that has no `workspacejson/cli` sibling
 * checkout, which is why they exercise the decision function against recorded
 * evidence artifacts rather than mining anything. The full mining run is
 * `bin/run-experiment.mjs` and needs the pinned sibling checkout.
 *
 * The property under test is the one HAC-330 cares about most: **no degraded
 * evidence state produces a permissive answer.** That is asserted case by case
 * below, and then asserted exhaustively over every mutation of the real
 * artifact that this module knows how to describe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { DEFAULT_POLICY, Decision, MINED_STATES, Reason, decide } from '../lib/decide.mjs';

const EVIDENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence');
const load = (name) => JSON.parse(readFileSync(join(EVIDENCE_DIR, name), 'utf8'));

const baseline = load('baseline.evidence.json');
const perturbed = load('perturbed.evidence.json');
const shallow = load('shallow.evidence.json');
const empty = load('empty.evidence.json');
const misattributed = load('misattributed.evidence.json');

const INTENTS = [
  { id: 'A', targets: ['services/alpha/reservation.json'] },
  { id: 'B', targets: ['services/beta/reservation.json'] },
];

const at = (envelope) => envelope.historyBasis.basisRevision;
const clone = (value) => JSON.parse(JSON.stringify(value));

describe('the coupled and uncoupled arms', () => {
  it('withholds the composition when the mined history couples the targets', () => {
    const result = decide({ intents: INTENTS, evidence: baseline, targetRevision: at(baseline) });
    assert.equal(result.decision, Decision.WITHHOLD_SERIALIZE);
    assert.equal(result.reason, Reason.COUPLING_OBSERVED);
    assert.equal(result.couplings.length, 1);
    assert.deepEqual(result.couplings[0].files, [
      'services/alpha/reservation.json',
      'services/beta/reservation.json',
    ]);
    assert.ok(result.couplings[0].support >= DEFAULT_POLICY.couplingMinSupport);
  });

  it('allows the composition when the same pipeline mined a history without that pair', () => {
    const result = decide({ intents: INTENTS, evidence: perturbed, targetRevision: at(perturbed) });
    assert.equal(result.decision, Decision.ALLOW_PARALLEL);
    assert.equal(result.reason, Reason.NO_QUALIFYING_COUPLING);
  });

  it('changes its answer only because the evidence changed', () => {
    // Same intents, same policy, same code path; the artifacts differ and the
    // perturbed fixture's tree is identical to the baseline's.
    const a = decide({ intents: INTENTS, evidence: baseline, targetRevision: at(baseline) });
    const b = decide({ intents: INTENTS, evidence: perturbed, targetRevision: at(perturbed) });
    assert.notEqual(a.decision, b.decision);
    assert.equal(baseline.source.tree, perturbed.source.tree);
  });

  it('ignores a coupling that is internal to a single intent', () => {
    const both = [{ id: 'AB', targets: ['services/alpha/reservation.json', 'services/beta/reservation.json'] }];
    const result = decide({ intents: both, evidence: baseline, targetRevision: at(baseline) });
    assert.equal(result.decision, Decision.ALLOW_PARALLEL);
  });

  it('is order-independent across the pair', () => {
    const forward = decide({ intents: INTENTS, evidence: baseline, targetRevision: at(baseline) });
    const reverse = decide({ intents: [...INTENTS].reverse(), evidence: baseline, targetRevision: at(baseline) });
    assert.equal(forward.decision, reverse.decision);
    assert.equal(forward.couplings[0].support, reverse.couplings[0].support);
  });
});

describe('degraded evidence is never permission', () => {
  const cases = [
    ['null', null, undefined, Reason.EVIDENCE_ABSENT],
    ['undefined', undefined, undefined, Reason.EVIDENCE_ABSENT],
    ['no selection', { experiment: 'HAC-330' }, undefined, Reason.EVIDENCE_MALFORMED],
    ['selection is not an object', { selection: 'nope' }, undefined, Reason.EVIDENCE_MALFORMED],
    ['no completeness', { selection: { l0SelectionVersion: 1, receipt: {}, pairs: [] } }, undefined, Reason.EVIDENCE_MALFORMED],
    ['no pairs array', { selection: { l0SelectionVersion: 1, completeness: { state: 'MINED' }, receipt: {} } }, undefined, Reason.EVIDENCE_MALFORMED],
    ['real shallow clone', shallow, 'any', Reason.HISTORY_NOT_MINED],
    ['real empty repository', empty, 'any', Reason.HISTORY_NOT_MINED],
    ['real ancestor-repository mine', misattributed, 'any', Reason.EVIDENCE_REPOSITORY_MISMATCH],
  ];

  for (const [name, evidence, revision, expectedReason] of cases) {
    it(`${name} → INSUFFICIENT_EVIDENCE (${expectedReason})`, () => {
      const result = decide({ intents: INTENTS, evidence, targetRevision: revision ?? 'irrelevant' });
      assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE);
      assert.equal(result.reason, expectedReason);
    });
  }

  it('an unsupported selection version is unknown, not clean', () => {
    const evidence = clone(baseline);
    evidence.selection.l0SelectionVersion = 2;
    const result = decide({ intents: INTENTS, evidence, targetRevision: at(baseline) });
    assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE);
    assert.equal(result.reason, Reason.EVIDENCE_VERSION_UNSUPPORTED);
  });

  it('an unpinned basis is unknown, not clean', () => {
    const evidence = clone(baseline);
    delete evidence.selection.scoringBasis;
    const result = decide({ intents: INTENTS, evidence, targetRevision: at(baseline) });
    assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE);
    assert.equal(result.reason, Reason.NO_BASIS_PIN);
  });

  it('a basis that does not match the target revision is stale, not clean', () => {
    const result = decide({ intents: INTENTS, evidence: baseline, targetRevision: 'f'.repeat(40) });
    assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE);
    assert.equal(result.reason, Reason.STALE_BASIS);
  });

  it('a stale artifact is refused even when it carries the coupling', () => {
    // The dangerous direction is the other one, but this asserts the guard is
    // about the pin rather than about whether the answer looks safe.
    const result = decide({ intents: INTENTS, evidence: baseline, targetRevision: at(perturbed) });
    assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE);
  });

  it('every non-mined completeness state is insufficient', () => {
    for (const state of ['NOT_MINED', 'EVIDENCE_UNAVAILABLE']) {
      const evidence = clone(baseline);
      evidence.selection.completeness = { state, reason: 'GIT_FAILED', detail: 'synthetic' };
      const result = decide({ intents: INTENTS, evidence, targetRevision: at(baseline) });
      assert.equal(result.decision, Decision.INSUFFICIENT_EVIDENCE, state);
      assert.notEqual(result.decision, Decision.ALLOW_PARALLEL, state);
    }
  });

  it('a pair below the support threshold is not treated as a coupling', () => {
    const evidence = clone(baseline);
    for (const pair of evidence.selection.pairs) pair.support = DEFAULT_POLICY.couplingMinSupport - 1;
    const result = decide({ intents: INTENTS, evidence, targetRevision: at(baseline) });
    assert.equal(result.decision, Decision.ALLOW_PARALLEL);
  });

  it('MINED_NO_QUALIFYING_RELATIONSHIP is a claim and may permit, unlike NOT_MINED', () => {
    // The distinction the upstream package exists to preserve: "we looked and
    // found nothing" is a finding; "we never looked" is not. Both yield zero
    // pairs, and only one of them may permit a composition.
    const looked = clone(baseline);
    looked.selection.completeness = { state: 'MINED_NO_QUALIFYING_RELATIONSHIP', reason: 'MINED', detail: 'none' };
    looked.selection.pairs = [];
    assert.equal(
      decide({ intents: INTENTS, evidence: looked, targetRevision: at(baseline) }).decision,
      Decision.ALLOW_PARALLEL,
    );

    const neverLooked = clone(looked);
    neverLooked.selection.completeness = { state: 'NOT_MINED', reason: 'SHALLOW_CLONE', detail: 'none' };
    assert.equal(
      decide({ intents: INTENTS, evidence: neverLooked, targetRevision: at(baseline) }).decision,
      Decision.INSUFFICIENT_EVIDENCE,
    );
  });
});

describe('recorded artifacts still say what the packet claims', () => {
  it('the baseline artifact carries the coupling with full provenance', () => {
    assert.equal(baseline.completeness.state, 'QUALIFYING_RELATIONSHIP_OBSERVED');
    assert.match(baseline.historyBasis.basisRevision, /^[0-9a-f]{40}$/);
    assert.equal(baseline.producer.package, '@workspacejson/mining-core');
    assert.equal(baseline.producer.published, false);
    assert.equal(baseline.producer.pipeline, 'mine -> score -> select');
    assert.equal(baseline.producer.l1ProjectionUsed, false);
    assert.equal(baseline.source.isRequestedRepository, true);
  });

  it('both fixtures were mined, so the arms differ on the pair and not on completeness', () => {
    assert.equal(perturbed.completeness.state, 'QUALIFYING_RELATIONSHIP_OBSERVED');
    assert.ok(MINED_STATES.includes(baseline.completeness.state));
    assert.ok(MINED_STATES.includes(perturbed.completeness.state));
  });

  it('the control pair is identical across both histories', () => {
    const control = (envelope) =>
      envelope.selection.pairs.find((p) => p.files.includes('docs/runbook.md'));
    assert.deepEqual(control(baseline), control(perturbed));
  });

  it('no artifact in the packet emits a coChange block', () => {
    // L1 emission is step 3 of the A-009 staged transition and is not
    // authorized by the package this experiment consumes.
    //
    // Asserted on structure rather than on the substring: the envelope records
    // *in prose* that L1 projection was deliberately not used, and a substring
    // check would fail on the note that documents the boundary being kept.
    const keys = (value) => {
      if (Array.isArray(value)) return value.flatMap(keys);
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]);
      }
      return [];
    };
    for (const [name, envelope] of Object.entries({ baseline, perturbed, shallow, empty })) {
      assert.ok(!keys(envelope).includes('coChange'), `${name} must not carry a coChange key`);
      assert.ok(!keys(envelope).includes('manual'), `${name} must not be a workspace.json artifact`);
    }
  });
});
