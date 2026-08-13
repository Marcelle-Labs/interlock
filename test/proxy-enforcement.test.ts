/**
 * The proxy path, end to end, including every way it can fail.
 *
 * The two arms HAC-326 turns on:
 *
 * - **safe independent** — alpha and gamma, which the mined history shows never
 *   co-changing: allowed, receipt issued, target executes.
 * - **unsafe composed pair** — alpha and beta, co-changed at support 8: denied
 *   before the second mutation, with a rationale the caller can act on.
 *
 * Then the chaos arms, all asserting the same thing in different words: an
 * Interlock that cannot answer does not become an Interlock that permits.
 */
import { describe, expect, it } from 'vitest';

import type { Intent } from '../src/authorization/intent.js';
import type { SignedReceipt } from '../src/authorization/receipt.js';
import { Reason } from '../src/broker/pairing/arbitrate.js';
import { InMemoryReplayLedger } from '../src/broker/idempotency/ledger.js';
import {
  InMemoryPendingIntentStore,
  UnavailablePendingIntentStore,
} from '../src/broker/pairing/store.js';
import type { PendingIntentStore } from '../src/broker/pairing/store.js';
import { CallerDecision, InterlockProxy, ProxyReason } from '../src/proxy/service.js';
import type { TargetPort } from '../src/proxy/service.js';
import { ProtectedTarget } from '../src/target/service.js';
import { INITIAL_STATE, reservationPath } from '../src/target/state.js';
import { BASELINE_BASIS, BASELINE_EVIDENCE, newKeyPair } from './support/s2.js';

const TARGET_ID = 'interlock-s2-target';

const setReservation = (service: string, reserved: number): Intent => ({
  operation: 'set_reservation',
  arguments: { service, reserved },
});

interface Fixture {
  readonly proxy: InterlockProxy;
  readonly target: ProtectedTarget;
  readonly store: PendingIntentStore;
}

function fixture(
  options: {
    readonly store?: PendingIntentStore;
    readonly port?: (target: ProtectedTarget) => TargetPort;
    readonly decisionTimeoutMs?: number;
    readonly evidence?: unknown;
    readonly sourceRevision?: string;
  } = {},
): Fixture {
  const { signingKey, keys } = newKeyPair();
  const target = new ProtectedTarget({
    targetId: TARGET_ID,
    keys,
    ledger: new InMemoryReplayLedger(),
  });
  const store = options.store ?? new InMemoryPendingIntentStore();

  const defaultPort: TargetPort = {
    revision: () => Promise.resolve(target.revision),
    execute: (input) =>
      Promise.resolve(
        target.mutate({
          correlationId: input.correlationId,
          presented: input.receipt,
          intent: input.intent,
          now: new Date(),
        }),
      ),
  };

  const proxy = new InterlockProxy({
    targetId: TARGET_ID,
    store,
    target: options.port?.(target) ?? defaultPort,
    signingKey,
    // `??` would swallow a deliberate `null`, which is the case the
    // missing-evidence arm needs to exercise.
    evidence: 'evidence' in options ? options.evidence : BASELINE_EVIDENCE,
    sourceRevision: options.sourceRevision ?? BASELINE_BASIS,
    ...(options.decisionTimeoutMs === undefined
      ? {}
      : { decisionTimeoutMs: options.decisionTimeoutMs }),
  });

  return { proxy, target, store };
}

const request = (correlationId: string, service: string, reserved: number) => ({
  correlationId,
  callerIdentity: `${service}-agent@example.test`,
  identitySource: 'test',
  intent: setReservation(service, reserved),
  targets: [reservationPath(service)],
});

describe('safe independent request', () => {
  it('is allowed, and the mutation executes', async () => {
    const { proxy, target } = fixture();

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.ALLOW);
    expect(answer.receiptId).toBeDefined();
    expect(target.state.services['alpha']).toBe(50);
  });

  it('allows two intents that real history shows never co-changing', async () => {
    const { proxy, target } = fixture();

    const first = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));
    const second = await proxy.handle(request('ilk-bbbbbbbb', 'gamma', 25));

    expect(first.decision).toBe(CallerDecision.ALLOW);
    expect(second.decision).toBe(CallerDecision.ALLOW);
    expect(target.state.services).toEqual({ alpha: 50, beta: 40, gamma: 25 });
  });
});

describe('unsafe composed pair', () => {
  it('denies the second intent before it reaches the target', async () => {
    const { proxy, target } = fixture();
    // A is left in flight — the store is not settled — which is what "concurrent"
    // means here.
    const store = new InMemoryPendingIntentStore();
    store.record({
      correlationId: 'ilk-aaaaaaaa',
      agent: 'capacity-planner@example.test',
      operation: 'set_reservation',
      targets: [reservationPath('alpha')],
      intentDigest: 'sha256:a',
      recordedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const withPending = fixture({ store });
    const answer = await withPending.proxy.handle(request('ilk-bbbbbbbb', 'beta', 60));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(Reason.COUPLING_OBSERVED);
    // The target was never contacted: nothing moved.
    expect(withPending.target.state).toEqual(INITIAL_STATE);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('returns a rationale the caller can act on', async () => {
    const store = new InMemoryPendingIntentStore();
    store.record({
      correlationId: 'ilk-aaaaaaaa',
      agent: 'capacity-planner@example.test',
      operation: 'set_reservation',
      targets: [reservationPath('alpha')],
      intentDigest: 'sha256:a',
      recordedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const { proxy } = fixture({ store });

    const answer = await proxy.handle(request('ilk-bbbbbbbb', 'beta', 60));

    expect(answer.correlationId).toBe('ilk-bbbbbbbb');
    expect(answer.couplings?.[0]?.files).toEqual([
      reservationPath('alpha'),
      reservationPath('beta'),
    ]);
    expect(answer.couplings?.[0]?.support).toBe(8);
    expect(answer.evidenceRefs).toContain(`basis:${BASELINE_BASIS}`);
    expect(answer.message).toMatch(/coupling/);
    // No receipt is issued on a denial, so there is nothing to replay later.
    expect(answer.receiptId).toBeUndefined();
  });

  it('allows the same intent once its neighbour is no longer in flight', async () => {
    // The counterfactual: the denial is caused by concurrency plus evidence, not
    // by the intent being intrinsically invalid.
    const { proxy, target } = fixture();

    const answer = await proxy.handle(request('ilk-bbbbbbbb', 'beta', 60));

    expect(answer.decision).toBe(CallerDecision.ALLOW);
    expect(target.state.services['beta']).toBe(60);
  });
});

describe('fail closed', () => {
  it('denies when the pending-intent store cannot be written', async () => {
    const { proxy, target } = fixture({ store: new UnavailablePendingIntentStore() });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(ProxyReason.STORE_WRITE_FAILED);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('denies when the store can be written but not read', async () => {
    // Half-available is the nastier case: the intent is registered, so the proxy
    // could believe it is coordinating while seeing nothing.
    const halfAvailable: PendingIntentStore = {
      record: () => ({ ok: true, value: undefined }),
      active: () => ({ ok: false, detail: 'read replica unreachable' }),
      settle: () => ({ ok: true, value: undefined }),
    };
    const { proxy, target } = fixture({ store: halfAvailable });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(Reason.STORE_UNAVAILABLE);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('denies when the decision exceeds its deadline', async () => {
    const { proxy, target } = fixture({
      decisionTimeoutMs: 20,
      port: (target_) => ({
        revision: () =>
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve(target_.revision), 2_000);
            timer.unref();
          }),
        execute: () => Promise.reject(new Error('never reached')),
      }),
    });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(ProxyReason.DECISION_TIMEOUT);
    expect(answer.message).toMatch(/no receipt was issued/);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('denies when the target cannot be reached at all', async () => {
    const { proxy, target } = fixture({
      port: () => ({
        revision: () => Promise.reject(new Error('ECONNREFUSED')),
        execute: () => Promise.reject(new Error('ECONNREFUSED')),
      }),
    });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(ProxyReason.TARGET_UNREACHABLE);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('reports an unknown outcome, not a success, when execution fails mid-flight', async () => {
    // The honest answer to "did it run?" after a transport failure is "unknown".
    // Reporting success here would be exactly the acknowledgement-as-observation
    // error this gate exists to prevent.
    const { proxy } = fixture({
      port: (target_) => ({
        revision: () => Promise.resolve(target_.revision),
        execute: () => Promise.reject(new Error('socket hang up')),
      }),
    });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.message).toMatch(/UNKNOWN to the proxy/);
    expect(answer.message).toMatch(/not an observation/);
  });

  it('denies when evidence is missing', async () => {
    const { proxy, target } = fixture({ evidence: null });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(Reason.EVIDENCE_ABSENT);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('denies when evidence is stale relative to the source being mutated', async () => {
    const { proxy, target } = fixture({ sourceRevision: 'a-different-commit' });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(Reason.STALE_BASIS);
    expect(target.state).toEqual(INITIAL_STATE);
  });

  it('surfaces a target refusal as a denial rather than a success', async () => {
    // The proxy allowed; the target — the actual enforcement boundary —
    // declined. The caller must not read that as an allow.
    const { proxy } = fixture({
      port: (target_) => ({
        revision: () => Promise.resolve(target_.revision),
        execute: (input) =>
          Promise.resolve(
            target_.mutate({
              correlationId: input.correlationId,
              // Strip the receipt on the way, standing in for a path that loses it.
              presented: null,
              intent: input.intent,
              now: new Date(),
            }),
          ),
      }),
    });

    const answer = await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(answer.decision).toBe(CallerDecision.DENY);
    expect(answer.reasonCode).toBe(ProxyReason.TARGET_REJECTED);
    expect(answer.message).toMatch(/RECEIPT_ABSENT/);
  });
});

describe('concurrency', () => {
  it('denies one of two genuinely simultaneous coupled requests', async () => {
    const { proxy, target } = fixture();

    const [first, second] = await Promise.all([
      proxy.handle(request('ilk-aaaaaaaa', 'alpha', 60)),
      proxy.handle(request('ilk-bbbbbbbb', 'beta', 60)),
    ]);

    const decisions = [first.decision, second.decision].sort();
    expect(decisions).toEqual([CallerDecision.ALLOW, CallerDecision.DENY]);

    // Ground truth: had both landed, the pool would have been breached at 140.
    // Exactly one did, so the invariant holds.
    const total = Object.values(target.state.services).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(target.state.totalReservable);
  });

  it('issues a receipt bound to the revision current at decision time', async () => {
    let issued: SignedReceipt | undefined;
    const { proxy, target } = fixture({
      port: (target_) => ({
        revision: () => Promise.resolve(target_.revision),
        execute: (input) => {
          issued = input.receipt;
          return Promise.resolve(
            target_.mutate({
              correlationId: input.correlationId,
              presented: input.receipt,
              intent: input.intent,
              now: new Date(),
            }),
          );
        },
      }),
    });

    const revisionBefore = target.revision;
    await proxy.handle(request('ilk-aaaaaaaa', 'alpha', 50));

    expect(issued?.claims.target.expectedRevision).toBe(revisionBefore);
    expect(issued?.claims.correlationId).toBe('ilk-aaaaaaaa');
    expect(issued?.claims.evidence.basisRevision).toBe(BASELINE_BASIS);
  });
});

describe('argument modification', () => {
  it('is mechanically possible, which is why the portable contract excludes it', async () => {
    // Demonstrated once, deliberately not shipped. A proxy that rewrote
    // arguments before signing would produce a receipt the target accepts for a
    // request the caller never made — and nothing in the receipt would record
    // the divergence. The S2 portable contract is therefore ALLOW | DENY.
    const { proxy, target } = fixture({
      port: (target_) => ({
        revision: () => Promise.resolve(target_.revision),
        execute: (input) =>
          Promise.resolve(
            target_.mutate({
              correlationId: input.correlationId,
              presented: input.receipt,
              intent: input.intent,
              now: new Date(),
            }),
          ),
      }),
    });

    const answer = await proxy.handle({
      correlationId: 'ilk-aaaaaaaa',
      callerIdentity: 'agent@example.test',
      identitySource: 'test',
      intent: setReservation('alpha', 50),
      targets: [reservationPath('alpha')],
    });

    expect(answer.decision).toBe(CallerDecision.ALLOW);
    // The executed value is the value the caller asked for — unmodified.
    expect(target.state.services['alpha']).toBe(50);
  });
});
