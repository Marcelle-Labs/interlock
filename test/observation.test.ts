/**
 * The line between what was acknowledged and what was observed.
 *
 * The claim under test is structural, not behavioural: there must be **no
 * argument you can pass** that turns a response into an observation. If that
 * holds, a later verifier can trust the distinction without auditing every
 * caller.
 */
import { describe, expect, it } from 'vitest';

import {
  LifecycleState,
  UnassertableStateError,
  isObserved,
  observe,
  record,
} from '../src/observation/events.js';
import {
  CORRELATION_HEADER,
  RECEIPT_HEADER,
  isCorrelationId,
  newCorrelationId,
  resolveCorrelationId,
} from '../src/correlation.js';

const base = { correlationId: 'ilk-aaaaaaaa', at: '2026-08-13T12:00:00.000Z', detail: 'x' };

describe('lifecycle records', () => {
  it.each([
    LifecycleState.INTENT_RECEIVED,
    LifecycleState.DECIDED,
    LifecycleState.RECEIPT_ISSUED,
    LifecycleState.TARGET_ACCEPTED,
    LifecycleState.MUTATION_EXECUTED,
    LifecycleState.CALLER_ACKNOWLEDGED,
  ])('lets a participant assert %s about its own work', (state) => {
    expect(record({ ...base, state, recordedBy: 'proxy' }).state).toBe(state);
  });

  it('refuses to let any participant assert OBSERVED', () => {
    // The whole point: a component cannot certify that its own write landed.
    expect(() => record({ ...base, state: LifecycleState.OBSERVED, recordedBy: 'target' })).toThrow(
      UnassertableStateError,
    );
  });

  it('refuses to let a participant assert OBSERVATION_MISMATCH either', () => {
    expect(() =>
      record({ ...base, state: LifecycleState.OBSERVATION_MISMATCH, recordedBy: 'proxy' }),
    ).toThrow(/independent read/);
  });
});

describe('observe', () => {
  it('reports OBSERVED when an independent read matches what was expected', () => {
    const event = observe({
      correlationId: 'ilk-aaaaaaaa',
      readState: { services: { alpha: 50 } },
      expectedState: { services: { alpha: 50 } },
      at: base.at,
      recordedBy: 'verifier',
    });

    expect(event.state).toBe(LifecycleState.OBSERVED);
  });

  it('reports OBSERVATION_MISMATCH when the state is not what was claimed', () => {
    const event = observe({
      correlationId: 'ilk-aaaaaaaa',
      readState: { services: { alpha: 40 } },
      expectedState: { services: { alpha: 50 } },
      at: base.at,
      recordedBy: 'verifier',
    });

    expect(event.state).toBe(LifecycleState.OBSERVATION_MISMATCH);
    expect(event.detail).toMatch(/expected/);
  });

  it('compares canonically, so key order is not a mismatch', () => {
    const event = observe({
      correlationId: 'ilk-aaaaaaaa',
      readState: { b: 2, a: 1 },
      expectedState: { a: 1, b: 2 },
      at: base.at,
      recordedBy: 'verifier',
    });

    expect(event.state).toBe(LifecycleState.OBSERVED);
  });
});

describe('isObserved', () => {
  it('is false for a trace of acknowledgements alone', () => {
    // Every participant agreeing that it did its job is still not evidence that
    // the state changed.
    const trace = [
      record({ ...base, state: LifecycleState.RECEIPT_ISSUED, recordedBy: 'proxy' }),
      record({ ...base, state: LifecycleState.TARGET_ACCEPTED, recordedBy: 'target' }),
      record({ ...base, state: LifecycleState.MUTATION_EXECUTED, recordedBy: 'target' }),
      record({ ...base, state: LifecycleState.CALLER_ACKNOWLEDGED, recordedBy: 'caller' }),
    ];

    expect(isObserved(trace)).toBe(false);
  });

  it('is true only once an independent read is in the trace', () => {
    const trace = [
      record({ ...base, state: LifecycleState.MUTATION_EXECUTED, recordedBy: 'target' }),
      observe({
        correlationId: base.correlationId,
        readState: { alpha: 50 },
        expectedState: { alpha: 50 },
        at: base.at,
        recordedBy: 'verifier',
      }),
    ];

    expect(isObserved(trace)).toBe(true);
  });

  it('is false when the independent read disagreed', () => {
    const trace = [
      observe({
        correlationId: base.correlationId,
        readState: { alpha: 40 },
        expectedState: { alpha: 50 },
        at: base.at,
        recordedBy: 'verifier',
      }),
    ];

    expect(isObserved(trace)).toBe(false);
  });
});

describe('correlation', () => {
  it('mints identifiers that satisfy its own pattern', () => {
    expect(isCorrelationId(newCorrelationId())).toBe(true);
  });

  it('mints a distinct identifier each time', () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it('carries a caller-supplied identifier so a caller can trace its own retries', () => {
    const resolved = resolveCorrelationId('ilk-abcdefgh');

    expect(resolved).toEqual({ correlationId: 'ilk-abcdefgh', supplied: true });
  });

  it.each([
    ['a missing value', undefined],
    ['a non-string', 42],
    ['the wrong prefix', 'req-abcdefgh'],
    ['too short a body', 'ilk-abc'],
    ['punctuation that would inject into a log line', 'ilk-abcdefgh\nINJECTED'],
    ['an over-long value', `ilk-${'a'.repeat(65)}`],
  ])('replaces %s rather than failing the request', (_label, supplied) => {
    const resolved = resolveCorrelationId(supplied);

    expect(resolved.supplied).toBe(false);
    expect(isCorrelationId(resolved.correlationId)).toBe(true);
  });

  it('fixes the wire header names, which the verifier will depend on', () => {
    expect(CORRELATION_HEADER).toBe('interlock-correlation-id');
    expect(RECEIPT_HEADER).toBe('interlock-receipt');
  });
});
