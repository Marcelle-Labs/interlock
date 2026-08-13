/**
 * The two-target projection, and the boundaries that make it real.
 *
 * The projection is only worth anything if the separation is enforced rather
 * than agreed. Three things are checked here that a comment could otherwise be
 * left to claim: each partition really does keep the whole pool, the alpha
 * target really cannot represent beta, and a receipt minted for one target
 * really is refused by the other.
 *
 * The last one is measured, not assumed. `targetId` is inside the signed claims,
 * so cross-target replay is defeated cryptographically — but "is defeated"
 * is a claim about code, and this is the test that makes it a claim about a
 * measurement.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { intentDigest } from '../../../dist/authorization/intent.js';
import {
  RECEIPT_DECISION_ALLOW,
  RECEIPT_VERSION,
  signReceipt,
} from '../../../dist/authorization/receipt.js';
import { InMemoryReplayLedger } from '../../../dist/broker/idempotency/ledger.js';
import { ProtectedTarget } from '../../../dist/target/service.js';
import {
  INITIAL_STATE,
  OPERATION_SET_RESERVATION,
  applyMutation,
} from '../../../dist/target/state.js';

import {
  FIXTURE,
  PARTITIONED_SERVICES,
  RESIDUAL_SERVICES,
  TARGET_IDS,
  createPartitionedTargets,
  partitionGenesisRevision,
  partitionState,
} from '../src/partition.mjs';

const keyMaterial = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'partition-test';
  return { keyId, signingKey: { keyId, privateKey }, keys: new Map([[keyId, publicKey]]) };
};

describe('the two-target partition', () => {
  it('gives each partition the whole pool and exactly one service, starting at 40', () => {
    for (const service of PARTITIONED_SERVICES) {
      const state = partitionState(service);
      expect(state.totalReservable).toBe(INITIAL_STATE.totalReservable);
      expect(Object.keys(state.services)).toEqual([service]);
      expect(state.services[service]).toBe(INITIAL_STATE.services[service]);
    }
  });

  it('matches the projection recorded in fixture.json before any arm ran', () => {
    // Two independent computations of the same thing. The deployed projection is
    // derived from INITIAL_STATE; the recorded one was written by the preflight
    // producer. If they ever disagree, one of them is describing a fixture that
    // no longer exists.
    for (const service of PARTITIONED_SERVICES) {
      expect(partitionState(service)).toEqual(FIXTURE.partitions[service]);
    }
    expect(RESIDUAL_SERVICES).toEqual(FIXTURE.residualServices);
    expect(FIXTURE.gammaTargetExists).toBe(false);
  });

  it('accepts alpha 40->60 and beta 40->60 on their own targets', () => {
    for (const service of PARTITIONED_SERVICES) {
      const result = applyMutation(partitionState(service), { service, reserved: 60 });
      expect(result.ok).toBe(true);
      expect(result.invariant.total).toBe(60);
      expect(result.invariant.holds).toBe(true);
    }
  });

  it('refuses a beta mutation at the alpha target with UNKNOWN_SERVICE', () => {
    const result = applyMutation(partitionState('alpha'), { service: 'beta', reserved: 60 });
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('UNKNOWN_SERVICE');
  });

  it('gives the two partitions distinct genesis revisions', () => {
    expect(TARGET_IDS.alpha).not.toBe(TARGET_IDS.beta);
    expect(partitionGenesisRevision('alpha')).not.toBe(partitionGenesisRevision('beta'));
  });

  it('rejects a cross-target receipt: alpha authorization presented to beta gives WRONG_TARGET', () => {
    const { keyId, signingKey, keys } = keyMaterial();
    const targets = createPartitionedTargets({ keys });

    // A genuine, valid, correctly signed authorization — for the wrong target.
    const intent = {
      operation: OPERATION_SET_RESERVATION,
      arguments: { service: 'beta', reserved: 60 },
    };
    const issuedAt = new Date();
    const receipt = signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: `rcpt-${randomUUID()}`,
        correlationId: `ilk-${randomUUID().replaceAll('-', '')}`,
        caller: { identity: 'partition-test', identitySource: 'test' },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: TARGET_IDS.alpha, expectedRevision: targets.beta.revision },
        evidence: { basisRevision: 'x', artifactSha256: 'x', producerSha: 'x' },
        decision: RECEIPT_DECISION_ALLOW,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + 30_000).toISOString(),
        nonce: `nonce-${randomUUID()}`,
      },
      signingKey,
    );

    const revisionBefore = targets.beta.revision;
    const response = targets.beta.mutate({
      correlationId: receipt.claims.correlationId,
      presented: receipt,
      intent,
      now: new Date(),
    });

    expect(response.status).toBe('REJECTED');
    // The receipt module's rejection is `WRONG_TARGET`; the admission gate
    // surfaces it to the target namespaced as `RECEIPT_WRONG_TARGET`. Asserting
    // the measured string rather than the cited one, and asserting the relation
    // between them, so neither can drift without this failing.
    expect(response.reasonCode).toBe('RECEIPT_WRONG_TARGET');
    expect(response.reasonCode.endsWith('WRONG_TARGET')).toBe(true);
    expect(response.detail).toContain(TARGET_IDS.alpha);
    // Rejected *and* without side effect. Those are different claims.
    expect(targets.beta.revision).toBe(revisionBefore);
    expect(keys.has(keyId)).toBe(true);
  });

  it('builds each partition as an unchanged ProtectedTarget', () => {
    const { keys } = keyMaterial();
    const targets = createPartitionedTargets({ keys });
    for (const service of PARTITIONED_SERVICES) {
      expect(targets[service]).toBeInstanceOf(ProtectedTarget);
      expect(targets[service].read().state).toEqual(partitionState(service));
    }
    expect(new InMemoryReplayLedger()).toBeDefined();
  });
});
