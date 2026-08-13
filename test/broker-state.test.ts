/**
 * The pending-intent store, the replay ledger, and revision chaining.
 *
 * Small components, but each one holds a property the enforcement model would
 * silently lose without it, so each is tested for the failure direction as well
 * as the success direction.
 */
import { describe, expect, it } from 'vitest';

import {
  ClaimOutcome,
  InMemoryReplayLedger,
  UnavailableReplayLedger,
} from '../src/broker/idempotency/ledger.js';
import {
  InMemoryPendingIntentStore,
  UnavailablePendingIntentStore,
} from '../src/broker/pairing/store.js';
import type { PendingIntent } from '../src/broker/pairing/store.js';
import { genesisRevision, nextRevision } from '../src/broker/revision/revision.js';
import { at, T0 } from './support/s2.js';

const pending = (correlationId: string, expiresAt = at(60_000)): PendingIntent => ({
  correlationId,
  agent: 'agent@example.test',
  operation: 'set_reservation',
  targets: ['services/alpha/reservation.json'],
  intentDigest: 'sha256:x',
  recordedAt: T0.toISOString(),
  expiresAt: expiresAt.toISOString(),
});

describe('InMemoryPendingIntentStore', () => {
  it('reports an intent recorded by another caller as in flight', () => {
    const store = new InMemoryPendingIntentStore();
    store.record(pending('ilk-aaaaaaaa'));

    const active = store.active(T0, 'ilk-bbbbbbbb');

    expect(active.ok).toBe(true);
    if (active.ok) expect(active.value.map((intent) => intent.correlationId)).toEqual(['ilk-aaaaaaaa']);
  });

  it('excludes the asking intent from its own view', () => {
    const store = new InMemoryPendingIntentStore();
    store.record(pending('ilk-aaaaaaaa'));

    const active = store.active(T0, 'ilk-aaaaaaaa');
    if (active.ok) expect(active.value).toHaveLength(0);
  });

  it('drops intents whose TTL has passed', () => {
    // A crashed caller must not block its neighbours forever. Expiry bounds
    // that, and says nothing about whether the intent completed.
    const store = new InMemoryPendingIntentStore();
    store.record(pending('ilk-aaaaaaaa', at(1_000)));

    const active = store.active(at(1_001), 'ilk-bbbbbbbb');
    if (active.ok) expect(active.value).toHaveLength(0);
  });

  it('orders results deterministically regardless of insertion order', () => {
    const first = new InMemoryPendingIntentStore();
    first.record(pending('ilk-cccccccc'));
    first.record(pending('ilk-aaaaaaaa'));

    const second = new InMemoryPendingIntentStore();
    second.record(pending('ilk-aaaaaaaa'));
    second.record(pending('ilk-cccccccc'));

    const left = first.active(T0, 'ilk-zzzzzzzz');
    const right = second.active(T0, 'ilk-zzzzzzzz');
    if (left.ok && right.ok) {
      expect(left.value.map((i) => i.correlationId)).toEqual(right.value.map((i) => i.correlationId));
    }
  });

  it('settles an intent out of flight', () => {
    const store = new InMemoryPendingIntentStore();
    store.record(pending('ilk-aaaaaaaa'));
    store.settle('ilk-aaaaaaaa');

    const active = store.active(T0, 'ilk-bbbbbbbb');
    if (active.ok) expect(active.value).toHaveLength(0);
    expect(store.size).toBe(0);
  });
});

describe('UnavailablePendingIntentStore', () => {
  it('fails reads, writes and settles alike', () => {
    // A store that accepted writes while unable to serve reads would leave two
    // callers each convinced they were alone.
    const store = new UnavailablePendingIntentStore();

    expect(store.record().ok).toBe(false);
    expect(store.active().ok).toBe(false);
    expect(store.settle().ok).toBe(false);
  });

  it('never answers with an empty list, which would read as safe', () => {
    const result = new UnavailablePendingIntentStore().active();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toMatch(/unreachable/);
  });
});

describe('InMemoryReplayLedger', () => {
  it('claims a fresh nonce once', () => {
    const ledger = new InMemoryReplayLedger();

    expect(ledger.claim('nonce-1').outcome).toBe(ClaimOutcome.CLAIMED);
    expect(ledger.size).toBe(1);
  });

  it('refuses the same nonce a second time', () => {
    const ledger = new InMemoryReplayLedger();
    ledger.claim('nonce-1');

    expect(ledger.claim('nonce-1').outcome).toBe(ClaimOutcome.ALREADY_SPENT);
  });

  it('keeps distinct nonces independent', () => {
    const ledger = new InMemoryReplayLedger();
    ledger.claim('nonce-1');

    expect(ledger.claim('nonce-2').outcome).toBe(ClaimOutcome.CLAIMED);
  });
});

describe('UnavailableReplayLedger', () => {
  it('reports unavailability rather than absence of a prior claim', () => {
    const result = new UnavailableReplayLedger().claim('nonce-1');

    expect(result.outcome).toBe(ClaimOutcome.UNAVAILABLE);
    expect(result.outcome).not.toBe(ClaimOutcome.CLAIMED);
  });
});

describe('revision chaining', () => {
  const state = { totalReservable: 130, services: { alpha: 40 } };

  it('is deterministic for the same target and state', () => {
    expect(genesisRevision('t', state)).toBe(genesisRevision('t', state));
  });

  it('differs between targets holding identical state', () => {
    // Otherwise a receipt for one target would bind cleanly to another.
    expect(genesisRevision('t1', state)).not.toBe(genesisRevision('t2', state));
  });

  it('advances on every mutation', () => {
    const genesis = genesisRevision('t', state);
    const next = nextRevision(genesis, { reserved: 50 }, { ...state, services: { alpha: 50 } });

    expect(next).not.toBe(genesis);
  });

  it('depends on the mutation, not only on the resulting state', () => {
    // A counter would collide here; a chain does not.
    const genesis = genesisRevision('t', state);
    const resulting = { ...state, services: { alpha: 50 } };

    expect(nextRevision(genesis, { via: 'a' }, resulting)).not.toBe(
      nextRevision(genesis, { via: 'b' }, resulting),
    );
  });

  it('depends on history, so two paths to the same state differ', () => {
    const genesis = genesisRevision('t', state);
    const viaOne = nextRevision(genesis, { step: 1 }, state);

    expect(nextRevision(viaOne, { step: 2 }, state)).not.toBe(nextRevision(genesis, { step: 2 }, state));
  });
});
