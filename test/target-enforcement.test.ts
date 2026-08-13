/**
 * The protected target, attacked directly.
 *
 * Every request in this file bypasses the proxy entirely and speaks straight to
 * the target — which is the only way to test the claim that matters. A test that
 * drove the proxy would be proving the proxy behaves; these prove the target
 * refuses regardless of how it is reached.
 *
 * Two properties are asserted after *every* refusal:
 *
 * 1. the response is a refusal with a machine-readable reason, and
 * 2. **state and revision are unchanged** — the side effect did not happen and
 *    was not rolled back. "Rejected" and "rejected without side effect" are
 *    different claims and only the second is worth anything.
 */
import { describe, expect, it } from 'vitest';

import { intentDigest } from '../src/authorization/intent.js';
import type { Intent } from '../src/authorization/intent.js';
import type {
  ReceiptClaims,
  SignedReceipt,
  SigningKey,
  VerificationKeys,
} from '../src/authorization/receipt.js';
import { RECEIPT_VERSION, ReceiptRejection, signReceipt, verifyReceipt } from '../src/authorization/receipt.js';
import { AdmissionRejection, admit, isBypassAttempt } from '../src/broker/bypass/guard.js';
import { InMemoryReplayLedger, UnavailableReplayLedger } from '../src/broker/idempotency/ledger.js';
import { ProtectedTarget } from '../src/target/service.js';
import { INITIAL_STATE, applyMutation, checkInvariant, readSetReservation } from '../src/target/state.js';
import { at, newKeyPair, T0 } from './support/s2.js';

const TARGET_ID = 'interlock-s2-target';

const setReservation = (service: string, reserved: number): Intent => ({
  operation: 'set_reservation',
  arguments: { service, reserved },
});

interface Harness {
  readonly target: ProtectedTarget;
  readonly signingKey: SigningKey;
  readonly keys: VerificationKeys;
  readonly ledger: InMemoryReplayLedger;
  receiptFor(intent: Intent, overrides?: Partial<ReceiptClaims>): SignedReceipt;
}

function harness(): Harness {
  const { signingKey, keys } = newKeyPair();
  const ledger = new InMemoryReplayLedger();
  const target = new ProtectedTarget({ targetId: TARGET_ID, keys, ledger });

  let counter = 0;
  return {
    target,
    signingKey,
    keys,
    ledger,
    receiptFor(intent, overrides = {}) {
      counter += 1;
      return signReceipt(
        {
          receiptVersion: RECEIPT_VERSION,
          receiptId: `rcpt-${counter}`,
          correlationId: `ilk-${String(counter).padStart(8, '0')}`,
          caller: { identity: 'agent@example.test', identitySource: 'test' },
          operation: intent.operation,
          intentDigest: intentDigest(intent),
          target: { targetId: TARGET_ID, expectedRevision: target.revision },
          evidence: { basisRevision: 'eb67a6f', artifactSha256: '2c021d0', producerSha: 'defac1e' },
          decision: 'ALLOW',
          issuedAt: T0.toISOString(),
          expiresAt: at(30_000).toISOString(),
          nonce: `nonce-${counter}`,
          ...overrides,
        } as ReceiptClaims,
        signingKey,
      );
    },
  };
}

/** Assert a refusal happened and nothing moved. */
function expectRefusedWithoutSideEffect(
  fixture: Harness,
  response: ReturnType<ProtectedTarget['mutate']>,
  reasonCode: string,
): void {
  const before = INITIAL_STATE;
  expect(response.status).toBe('REJECTED');
  if (response.status === 'REJECTED') expect(response.reasonCode).toBe(reasonCode);
  expect(fixture.target.state).toEqual(before);
  expect(fixture.target.revision).toBe(response.status === 'REJECTED' ? response.revision : '');
}

describe('the target executes a genuine authorization', () => {
  it('applies the mutation and advances its revision', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);
    const revisionBefore = fixture.target.revision;

    const response = fixture.target.mutate({
      correlationId: 'ilk-aaaaaaaa',
      presented: fixture.receiptFor(intent),
      intent,
      now: at(1_000),
    });

    expect(response.status).toBe('EXECUTED');
    if (response.status === 'EXECUTED') {
      expect(response.revisionBefore).toBe(revisionBefore);
      expect(response.revisionAfter).not.toBe(revisionBefore);
      expect(response.state.services['alpha']).toBe(50);
      expect(response.invariant.holds).toBe(true);
    }
  });

  it('carries the correlation id through to the execution record', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);

    const response = fixture.target.mutate({
      correlationId: 'ilk-traceable',
      presented: fixture.receiptFor(intent),
      intent,
      now: at(1_000),
    });

    expect(response.correlationId).toBe('ilk-traceable');
  });
});

describe('the target refuses, before any side effect', () => {
  it('refuses a request carrying no receipt at all — the bypass case', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);

    const response = fixture.target.mutate({
      correlationId: 'ilk-bypass',
      presented: null,
      intent,
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.ABSENT);
  });

  it('refuses a malformed receipt', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);

    const response = fixture.target.mutate({
      correlationId: 'ilk-malformed',
      presented: { not: 'a receipt' },
      intent,
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.MALFORMED);
  });

  it('refuses a receipt whose arguments were altered after signing', () => {
    const fixture = harness();
    const authorized = setReservation('alpha', 50);
    const receipt = fixture.receiptFor(authorized);

    // Same receipt, different request body. This is the lift attack.
    const response = fixture.target.mutate({
      correlationId: 'ilk-altered',
      presented: receipt,
      intent: setReservation('alpha', 120),
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.INTENT_MISMATCH);
  });

  it('refuses a receipt lifted onto a different service', () => {
    const fixture = harness();
    const receipt = fixture.receiptFor(setReservation('alpha', 50));

    const response = fixture.target.mutate({
      correlationId: 'ilk-lifted',
      presented: receipt,
      intent: setReservation('beta', 50),
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.INTENT_MISMATCH);
  });

  it('refuses an expired receipt', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);
    const receipt = fixture.receiptFor(intent);

    const response = fixture.target.mutate({
      correlationId: 'ilk-expired',
      presented: receipt,
      intent,
      now: at(31_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.EXPIRED);
  });

  it('refuses a receipt addressed to another target', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);
    const receipt = fixture.receiptFor(intent, {
      target: { targetId: 'someone-elses-target', expectedRevision: fixture.target.revision },
    });

    const response = fixture.target.mutate({
      correlationId: 'ilk-wrong-target',
      presented: receipt,
      intent,
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, ReceiptRejection.WRONG_TARGET);
  });

  it('refuses a receipt bound to a revision the target has moved past', () => {
    const fixture = harness();
    const first = setReservation('alpha', 50);

    // Mint two receipts against the same starting revision — the shape of two
    // concurrent decisions — then execute both in sequence.
    const receiptOne = fixture.receiptFor(first);
    const second = setReservation('gamma', 25);
    const receiptTwo = fixture.receiptFor(second);

    const executed = fixture.target.mutate({
      correlationId: 'ilk-first',
      presented: receiptOne,
      intent: first,
      now: at(1_000),
    });
    expect(executed.status).toBe('EXECUTED');

    const stateAfterFirst = fixture.target.state;
    const revisionAfterFirst = fixture.target.revision;

    const response = fixture.target.mutate({
      correlationId: 'ilk-second',
      presented: receiptTwo,
      intent: second,
      now: at(2_000),
    });

    expect(response.status).toBe('REJECTED');
    if (response.status === 'REJECTED') {
      expect(response.reasonCode).toBe(ReceiptRejection.STALE_REVISION);
    }
    // The gamma mutation would not have breached the invariant — only the stale
    // revision binding stopped it, which is what isolates the property.
    expect(fixture.target.state).toEqual(stateAfterFirst);
    expect(fixture.target.revision).toBe(revisionAfterFirst);
  });

  it('refuses a replayed receipt, and the replay does not mutate again', () => {
    const fixture = harness();
    const intent = setReservation('alpha', 50);
    const receipt = fixture.receiptFor(intent);

    const first = fixture.target.mutate({
      correlationId: 'ilk-once',
      presented: receipt,
      intent,
      now: at(1_000),
    });
    expect(first.status).toBe('EXECUTED');

    const stateAfterFirst = fixture.target.state;

    // Identical bytes, presented again. Everything about the receipt is still
    // valid except that it has been spent.
    const replay = fixture.target.mutate({
      correlationId: 'ilk-again',
      presented: receipt,
      intent,
      now: at(2_000),
    });

    expect(replay.status).toBe('REJECTED');
    if (replay.status === 'REJECTED') {
      // Revision moved on after the first execution, so the stale check fires
      // first. The nonce ledger is proven independently below, where the
      // revision is held constant.
      expect([AdmissionRejection.REPLAYED, ReceiptRejection.STALE_REVISION]).toContain(
        replay.reasonCode,
      );
    }
    expect(fixture.target.state).toEqual(stateAfterFirst);
  });

  it('refuses a replayed receipt even when the revision has not moved', () => {
    // Isolates replay from staleness: same nonce, same revision, second
    // presentation. Only the ledger can refuse this.
    const { signingKey, keys } = newKeyPair();
    const ledger = new InMemoryReplayLedger();
    const target = new ProtectedTarget({ targetId: TARGET_ID, keys, ledger });
    const intent = setReservation('alpha', 50);

    const receipt = signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: 'rcpt-replay',
        correlationId: 'ilk-replay',
        caller: { identity: 'agent@example.test', identitySource: 'test' },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: TARGET_ID, expectedRevision: target.revision },
        evidence: { basisRevision: 'x', artifactSha256: 'y', producerSha: 'z' },
        decision: 'ALLOW',
        issuedAt: T0.toISOString(),
        expiresAt: at(30_000).toISOString(),
        nonce: 'nonce-replay',
      } as ReceiptClaims,
      signingKey,
    );

    const verdict = admit({
      presented: receipt,
      ledger,
      expectations: {
        targetId: TARGET_ID,
        currentRevision: target.revision,
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        now: at(1_000),
        keys,
      },
    });
    expect(verdict.admitted).toBe(true);

    const second = admit({
      presented: receipt,
      ledger,
      expectations: {
        targetId: TARGET_ID,
        currentRevision: target.revision,
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        now: at(1_000),
        keys,
      },
    });

    expect(second.admitted).toBe(false);
    if (!second.admitted) expect(second.reasonCode).toBe(AdmissionRejection.REPLAYED);
  });

  it('refuses when the replay ledger cannot answer', () => {
    const { signingKey, keys } = newKeyPair();
    const target = new ProtectedTarget({
      targetId: TARGET_ID,
      keys,
      ledger: new UnavailableReplayLedger(),
    });
    const intent = setReservation('alpha', 50);

    const receipt = signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: 'rcpt-1',
        correlationId: 'ilk-ledger',
        caller: { identity: 'agent@example.test', identitySource: 'test' },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: TARGET_ID, expectedRevision: target.revision },
        evidence: { basisRevision: 'x', artifactSha256: 'y', producerSha: 'z' },
        decision: 'ALLOW',
        issuedAt: T0.toISOString(),
        expiresAt: at(30_000).toISOString(),
        nonce: 'nonce-1',
      } as ReceiptClaims,
      signingKey,
    );

    const response = target.mutate({
      correlationId: 'ilk-ledger',
      presented: receipt,
      intent,
      now: at(1_000),
    });

    expect(response.status).toBe('REJECTED');
    if (response.status === 'REJECTED') {
      expect(response.reasonCode).toBe(AdmissionRejection.LEDGER_UNAVAILABLE);
    }
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('refuses an unsupported operation before looking at the receipt', () => {
    const fixture = harness();

    const response = fixture.target.mutate({
      correlationId: 'ilk-op',
      presented: null,
      intent: { operation: 'drop_database', arguments: {} },
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, 'UNSUPPORTED_OPERATION');
  });

  it('refuses malformed arguments', () => {
    const fixture = harness();

    const response = fixture.target.mutate({
      correlationId: 'ilk-args',
      presented: null,
      intent: { operation: 'set_reservation', arguments: { service: 'alpha', reserved: -5 } },
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, 'MALFORMED_ARGUMENTS');
  });

  it('refuses an authorized mutation that would breach its own invariant', () => {
    // Authorization and integrity are different checks. A perfectly authorized
    // request can still be refused here, which is why the invariant runs after
    // admission rather than instead of it.
    const fixture = harness();
    const intent = setReservation('alpha', 120);

    const response = fixture.target.mutate({
      correlationId: 'ilk-breach',
      presented: fixture.receiptFor(intent),
      intent,
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, 'INVARIANT_BREACH');
  });

  it('refuses a mutation to a service it does not have', () => {
    const fixture = harness();
    const intent = setReservation('delta', 10);

    const response = fixture.target.mutate({
      correlationId: 'ilk-unknown',
      presented: fixture.receiptFor(intent),
      intent,
      now: at(1_000),
    });

    expectRefusedWithoutSideEffect(fixture, response, 'UNKNOWN_SERVICE');
  });
});

describe('red/green: the target check is what is doing the work', () => {
  it('RED — a target that does not validate the receipt executes an unauthorized call', () => {
    // The defect is isolated to this test: an unguarded apply, standing in for a
    // target that trusts its network path. No production code path can reach it.
    const unguarded = applyMutation(INITIAL_STATE, { service: 'alpha', reserved: 50 });

    expect(unguarded.ok).toBe(true);
    if (unguarded.ok) expect(unguarded.state.services['alpha']).toBe(50);
  });

  it('GREEN — the real target refuses the identical unauthorized call', () => {
    const fixture = harness();

    const response = fixture.target.mutate({
      correlationId: 'ilk-green',
      presented: null,
      intent: setReservation('alpha', 50),
      now: at(1_000),
    });

    expect(response.status).toBe('REJECTED');
    expect(fixture.target.state.services['alpha']).toBe(40);
  });

  it('RED — a target that binds to the receipt revision instead of its own accepts a stale receipt', () => {
    // The defect: verifying against `claims.target.expectedRevision` rather than
    // the revision the target actually holds. Expressed by constructing the
    // expectation that way, so no production switch exists to get this wrong.
    const fixture = harness();
    const advance = setReservation('alpha', 50);
    const stale = setReservation('gamma', 25);
    const staleReceipt = fixture.receiptFor(stale);

    // Move the target on, so the receipt really is stale.
    fixture.target.mutate({
      correlationId: 'ilk-advance',
      presented: fixture.receiptFor(advance),
      intent: advance,
      now: at(1_000),
    });
    expect(fixture.target.revision).not.toBe(staleReceipt.claims.target.expectedRevision);

    const staleAccepting = verifyReceipt(staleReceipt, {
      targetId: TARGET_ID,
      // The defect, made explicit: trusting the revision the receipt names
      // instead of the one the target holds.
      currentRevision: staleReceipt.claims.target.expectedRevision,
      operation: stale.operation,
      intentDigest: intentDigest(stale),
      now: at(2_000),
      keys: fixture.keys,
    });

    expect(staleAccepting.ok).toBe(true);
  });

  it('GREEN — binding to the revision the target actually holds rejects it', () => {
    const fixture = harness();
    const first = setReservation('alpha', 50);
    const stale = setReservation('gamma', 25);
    const staleReceipt = fixture.receiptFor(stale);

    fixture.target.mutate({
      correlationId: 'ilk-advance',
      presented: fixture.receiptFor(first),
      intent: first,
      now: at(1_000),
    });

    const response = fixture.target.mutate({
      correlationId: 'ilk-stale',
      presented: staleReceipt,
      intent: stale,
      now: at(2_000),
    });

    expect(response.status).toBe('REJECTED');
    if (response.status === 'REJECTED') {
      expect(response.reasonCode).toBe(ReceiptRejection.STALE_REVISION);
    }
  });
});

describe('bypass classification', () => {
  it('separates "no receipt" from "receipt found wanting"', () => {
    const { keys } = newKeyPair();
    const ledger = new InMemoryReplayLedger();
    const expectations = {
      targetId: TARGET_ID,
      currentRevision: 'r',
      operation: 'set_reservation',
      intentDigest: 'd',
      now: at(0),
      keys,
    };

    expect(isBypassAttempt(admit({ presented: null, ledger, expectations }))).toBe(true);
    expect(isBypassAttempt(admit({ presented: { junk: true }, ledger, expectations }))).toBe(false);
  });
});

describe('target state helpers', () => {
  it('reports the invariant holding and breaching', () => {
    expect(checkInvariant(INITIAL_STATE).holds).toBe(true);
    expect(
      checkInvariant({ totalReservable: 130, services: { alpha: 100, beta: 100 } }).holds,
    ).toBe(false);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing service', { reserved: 5 }],
    ['a non-integer reservation', { service: 'alpha', reserved: 1.5 }],
    ['a negative reservation', { service: 'alpha', reserved: -1 }],
  ])('refuses %s as a set_reservation argument set', (_label, value) => {
    expect(readSetReservation(value)).toBeNull();
  });
});
