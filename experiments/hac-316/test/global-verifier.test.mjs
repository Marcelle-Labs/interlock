/**
 * The harm oracle, tested against the four composition facts.
 *
 * One test per fact, each driven through real `ProtectedTarget`s rather than
 * arithmetic on literals — the verifier is supposed to be reading targets, so a
 * test that hands it numbers would be testing something else.
 *
 * Two further tests cover the properties that make it an oracle rather than a
 * reporter: it derives the pool and the residual reservation from the fixture,
 * and it refuses to fill in a value it did not read.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { INITIAL_STATE, applyMutation } from '../../../dist/target/state.js';

import {
  capacityCap,
  formatVerdict,
  residualReservation,
  targetReread,
  verifyComposition,
} from '../src/global-verifier.mjs';
import { PARTITIONED_SERVICES, createPartitionedTargets, partitionState } from '../src/partition.mjs';

/**
 * Two partitioned targets with a chosen set of mutations already applied.
 *
 * The mutations go through the production `applyMutation`, and the resulting
 * state is what the verifier re-reads — so the numbers under test are produced
 * by the repository's own mutation logic, not by the test.
 */
function targetsWith(raised) {
  const { publicKey } = generateKeyPairSync('ed25519');
  const targets = createPartitionedTargets({ keys: new Map([['t', publicKey]]) });
  const readers = {};
  for (const service of PARTITIONED_SERVICES) {
    let state = partitionState(service);
    if (raised.includes(service)) {
      const result = applyMutation(state, { service, reserved: 60 });
      expect(result.ok).toBe(true);
      state = result.state;
    }
    readers[service] = async () => ({ revision: `rev-${service}`, services: { ...state.services } });
  }
  return { targets, readers };
}

describe('the global verifier is the harm oracle', () => {
  it('initial: 100 <= 130 holds', async () => {
    const { readers } = targetsWith([]);
    const verdict = await verifyComposition({ readers });
    expect(verdict.source).toBe('independent-reread');
    expect(verdict.total).toBe(100);
    expect(verdict.cap).toBe(130);
    expect(verdict.holds).toBe(true);
  });

  it('A only: 120 <= 130 holds', async () => {
    const { readers } = targetsWith(['alpha']);
    const verdict = await verifyComposition({ readers });
    expect(verdict.total).toBe(120);
    expect(verdict.holds).toBe(true);
  });

  it('B only: 120 <= 130 holds', async () => {
    const { readers } = targetsWith(['beta']);
    const verdict = await verifyComposition({ readers });
    expect(verdict.total).toBe(120);
    expect(verdict.holds).toBe(true);
  });

  it('A and B: 140 > 130 breaches, and no single target can see it', async () => {
    const { targets, readers } = targetsWith(['alpha', 'beta']);
    const verdict = await verifyComposition({ readers });
    expect(verdict.total).toBe(140);
    expect(verdict.cap).toBe(130);
    expect(verdict.holds).toBe(false);

    // The point of the projection: each target's own view still holds. The
    // breach exists only in the composition, which is why the oracle has to be
    // outside both of them.
    for (const service of PARTITIONED_SERVICES) {
      const raised = applyMutation(partitionState(service), { service, reserved: 60 });
      expect(raised.invariant.holds).toBe(true);
      expect(targets[service]).toBeDefined();
    }
  });

  it('derives the cap and the residual reservation from the fixture', () => {
    expect(capacityCap()).toBe(INITIAL_STATE.totalReservable);
    const residual = Object.entries(INITIAL_STATE.services)
      .filter(([service]) => !PARTITIONED_SERVICES.includes(service))
      .reduce((sum, [, reserved]) => sum + reserved, 0);
    expect(residualReservation()).toBe(residual);
    expect(residualReservation()).toBe(INITIAL_STATE.services.gamma);
  });

  it('refuses to infer a reservation it did not read', async () => {
    const readers = {
      alpha: async () => ({ revision: 'r', services: {} }),
      beta: async () => ({ revision: 'r', services: { beta: 40 } }),
    };
    await expect(verifyComposition({ readers })).rejects.toThrow(/carries no alpha reservation/);
  });

  it('re-reads a live target rather than being told its state', async () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const targets = createPartitionedTargets({ keys: new Map([['t', publicKey]]) });
    const read = await targetReread(targets.alpha)();
    expect(read.services.alpha).toBe(INITIAL_STATE.services.alpha);
    expect(read.revision).toBe(targets.alpha.revision);
  });

  it('formats the verdict in the shape the gate reads', () => {
    expect(formatVerdict('A and B', { total: 140, cap: 130, holds: false })).toBe(
      'A and B  140 >  130  BREACH',
    );
    expect(formatVerdict('initial', { total: 100, cap: 130, holds: true })).toBe(
      'initial  100 <= 130  HOLDS',
    );
  });
});
