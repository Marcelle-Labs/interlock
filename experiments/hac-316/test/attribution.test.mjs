/**
 * The attribution controls.
 *
 * Three of REQ-056's and REQ-039's comparisons could not fail, for the same
 * reason in three shapes: a value was produced once and compared to itself.
 *
 *   deployment/implementation digests   computed once in `runAll` and assigned
 *                                       to both arms, with `deploymentDigest()`
 *                                       reading `ARMS.treatment.*` whichever arm
 *                                       it was describing. `baseline` never got
 *                                       one at all.
 *   enforceCallerIdentity               `String(ENFORCE_CALLER_IDENTITY)`
 *                                       printed three times and described as
 *                                       "read back off each component".
 *   per-attempt retention               only the final attempt kept its
 *                                       decisions, executions, commits, overlap
 *                                       and verification; superseded attempts
 *                                       were reduced to six fields.
 *
 * These tests hold each of the replacements to being a genuine measurement:
 * recomputable from what was recorded, produced independently per arm, and
 * complete for every attempt of every arm rather than the last one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_DETAIL_FIELDS,
  deploymentComponents,
  deploymentDigestOf,
  retainAttempt,
} from '../bin/run-arm.mjs';
import { classifyArrivals } from '../src/trial.mjs';
import { overlappingPair } from './_arrivals.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(
  readFileSync(join(experimentDir, 'evidence', 'results.json'), 'utf8'),
);
const ARM_NAMES = ['baseline', 'treatment', 'perturbation'];

describe('deployment and implementation are measured per arm', () => {
  it('recomputes every arm digest from that arm own recorded description', () => {
    for (const name of ARM_NAMES) {
      const arm = results.arms[name];
      expect(arm.deploymentComponents, name).toBeDefined();
      expect(arm.deploymentDigest, name).toBe(deploymentDigestOf(arm.deploymentComponents));
      expect(typeof arm.implementationDigest, name).toBe('string');
    }
  });

  it('gives the treatment and perturbation the same deployment, and the baseline a different one', () => {
    expect(results.arms.treatment.deploymentDigest).toBe(
      results.arms.perturbation.deploymentDigest,
    );
    // The comparison that was structurally absent: the baseline arm is the one
    // with nothing in the path, so its deployment must be distinguishable.
    expect(results.arms.baseline.deploymentDigest).not.toBe(
      results.arms.treatment.deploymentDigest,
    );
    expect(new Set(ARM_NAMES.map((name) => results.arms[name].implementationDigest)).size).toBe(1);
  });

  it('describes the deployment out of what the arm built, so a difference is explicable', () => {
    const baseline = results.arms.baseline.deploymentComponents;
    const treatment = results.arms.treatment.deploymentComponents;
    const differing = Object.keys(treatment).filter(
      (key) => JSON.stringify(baseline[key]) !== JSON.stringify(treatment[key]),
    );
    expect(differing.sort()).toEqual(['inPath', 'proxyCount', 'storeCount', 'storeTopology']);
    expect(treatment.proxyCount).toBe(2);
    expect(treatment.storeCount).toBe(1);
    expect(baseline.proxyCount).toBe(0);
    // The evidence artifact is the one thing an arm may vary, so it must not be
    // folded in — otherwise every arm's deployment differs by construction.
    expect(Object.keys(treatment)).not.toContain('evidencePath');
    expect(Object.keys(treatment)).not.toContain('sourceRevision');
  });

  it('produces a different digest when the deployment really differs', () => {
    const shared = {
      declared: { storeTopology: 'shared-object', inPath: 'routing surface' },
      initialStateDigest: 'sha256:abc',
      callerIdentityBinding: { alpha: 'false', beta: 'false' },
      proxyCount: 2,
      storeCount: 1,
    };
    const same = deploymentDigestOf(deploymentComponents(shared));
    expect(deploymentDigestOf(deploymentComponents(shared))).toBe(same);

    for (const change of [
      { storeCount: 2 },
      { proxyCount: 1 },
      { initialStateDigest: 'sha256:def' },
      { callerIdentityBinding: { alpha: 'true', beta: 'false' } },
      { declared: { storeTopology: 'separate-objects', inPath: 'routing surface' } },
    ]) {
      expect(
        deploymentDigestOf(deploymentComponents({ ...shared, ...change })),
        JSON.stringify(change),
      ).not.toBe(same);
    }
  });
});

describe('the caller-identity binding is probed, not restated', () => {
  it('records a measurement from every arm rather than one constant', () => {
    const observed = results.enforceCallerIdentity;
    expect(Object.keys(observed.perArm).sort()).toEqual([...ARM_NAMES].sort());
    for (const name of ARM_NAMES) {
      expect(results.arms[name].callerIdentityBinding, name).toEqual(observed.perArm[name]);
      expect(results.arms[name].callerIdentityBindingMeasuredBy, name).toMatch(/receipt/);
    }
  });

  it('says which components possess the setting and which do not', () => {
    const components = results.enforceCallerIdentity.components;
    expect(components.targetAlpha.possessesSetting).toBe(true);
    expect(components.targetBeta.possessesSetting).toBe(true);
    // The issuer has no enforceCallerIdentity option. Recording a value against
    // it while implying it does is the manufactured claim this replaces.
    expect(components.baselineIssuer.possessesSetting).toBe(false);
    expect(components.baselineIssuer.why).toMatch(/no enforceCallerIdentity option/i);
    for (const name of ['targetAlpha', 'targetBeta', 'baselineIssuer']) {
      expect(components[name].measuredBy, name).toMatch(/RECEIPT_WRONG_CALLER/);
      expect(components[name].observed, name).toBe(results.enforceCallerIdentity[name]);
    }
  });

  it('no longer claims every component was read back as constructed', () => {
    expect(results.enforceCallerIdentity.note).not.toMatch(/read back off each component/);
  });
});

describe('every attempt of every arm is retained in full', () => {
  it('keeps the detail, not a summary, for each arm', () => {
    expect(Object.keys(results.concurrency.attemptsByArm).sort()).toEqual([...ARM_NAMES].sort());
    for (const name of ARM_NAMES) {
      const attempts = results.concurrency.attemptsByArm[name];
      expect(attempts.length, name).toBeGreaterThan(0);
      expect(attempts, name).toEqual(results.arms[name].attempts);
      for (const attempt of attempts) {
        expect(attempt.retained, name).toBe(true);
        for (const field of ATTEMPT_DETAIL_FIELDS) {
          expect(attempt.detail?.[field], `${name} attempt ${attempt.index} ${field}`).toBeDefined();
        }
      }
    }
    expect(results.concurrency.discardedAttempts).toBe(0);
  });

  it('retains a superseded attempt as completely as the one that succeeded', () => {
    // The case Phase 7 can produce and a local run cannot: attempt 1 misses the
    // window, attempt 2 catches it. Attempt 1 is the one a reader needs, and it
    // is the one the old code flattened.
    const missed = fabricatedAttempt('NO_OVERLAP_OBSERVED', 0);
    const caught = fabricatedAttempt('COMPOSITION_WITHHELD', 1);

    const first = retainAttempt(1, 'treatment', missed);
    const second = retainAttempt(2, 'treatment', caught);

    expect(first.outcome).toBe('NO_OVERLAP_OBSERVED');
    expect(first.retained).toBe(true);
    expect(first.detail).toBe(missed);
    for (const field of ATTEMPT_DETAIL_FIELDS) {
      expect(first.detail[field], field).toBeDefined();
    }
    expect(Object.keys(first.detail)).toEqual(Object.keys(second.detail));
  });

  it('refuses to retain an attempt that arrives already summarised', () => {
    const partial = fabricatedAttempt('NO_OVERLAP_OBSERVED', 0);
    delete partial.decisions;
    expect(() => retainAttempt(1, 'treatment', partial)).toThrow(/decisions/);
    expect(() => retainAttempt(1, 'treatment', partial)).toThrow(/undisclosed filter/);
  });
});

/** An attempt result shaped like the real one, for the multi-attempt cases. */
function fabricatedAttempt(outcome, executedCount) {
  const arrivals = overlappingPair();
  return {
    arm: 'treatment',
    outcome,
    intents: { A: { digest: 'sha256:a', service: 'alpha' } },
    decisions: [{ correlationId: 'ilk-1', decision: 'ALLOW_PARALLEL' }],
    executed: Array.from({ length: executedCount }, (_, index) => ({ correlationId: `ilk-${index}` })),
    commits: [],
    overlap: arrivals,
    // Retained as completely as everything else. An attempt whose arrival record
    // was dropped is one nobody can check for a duplicated mutation.
    ingressRetry: classifyArrivals(arrivals),
    globalVerification: { source: 'independent-reread', total: 120, cap: 130, holds: true },
  };
}
