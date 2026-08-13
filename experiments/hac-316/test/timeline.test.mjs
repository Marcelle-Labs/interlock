/**
 * The experiment-local lifecycle schema.
 *
 * Two properties are worth testing and the rest is bookkeeping.
 *
 * The first is that `OBSERVED` has exactly one producer. Every convenient
 * shortcut — a 200, a receipt id coming back, a proxy saying it allowed — is a
 * statement about a request, and none of them is a statement about state. If any
 * of them could produce `OBSERVED`, the word would stop meaning anything and
 * every observation claim in the packet would be worth exactly nothing.
 *
 * The second is that `ACCEPTED` stays absent. It is in the vocabulary because
 * the boundary exists conceptually and cannot be witnessed against this target,
 * and the schema refuses it rather than letting a plausible-looking event fill
 * the hole.
 */
import { describe, expect, it } from 'vitest';

import { LifecycleState } from '../../../dist/observation/events.js';

import {
  ExperimentState,
  INDEPENDENT_REREAD,
  Timeline,
  UnobservedBoundaryError,
  acceptedAvailability,
  emit,
} from '../src/timeline.mjs';

const at = () => new Date().toISOString();

describe('the experiment-local lifecycle schema', () => {
  it('declares exactly the seven states, and does not redefine the frozen eight', () => {
    expect(Object.keys(ExperimentState).sort()).toEqual(
      ['ACCEPTED', 'EXECUTED', 'FAILED', 'OBSERVED', 'REQUESTED', 'WITHHELD', 'AUTHORIZED'].sort(),
    );
    // The production vocabulary is untouched and is a different set.
    expect(Object.keys(LifecycleState)).toHaveLength(8);
    expect(Object.keys(LifecycleState)).toContain('OBSERVATION_MISMATCH');
    expect(Object.keys(ExperimentState)).not.toContain('OBSERVATION_MISMATCH');
  });

  it('an acknowledgement cannot satisfy OBSERVED', () => {
    // Every one of these is something a component could say about its own work.
    for (const producer of ['caller', 'proxy', 'protected-target', 'ingress', 'http-200']) {
      expect(() =>
        emit({
          correlationId: 'ilk-aaaaaaaaaaaaaaaa',
          state: ExperimentState.OBSERVED,
          at: at(),
          producedBy: producer,
          detail: 'the call came back fine',
        }),
      ).toThrow(UnobservedBoundaryError);
    }

    // Only a re-read performed by something that did not write can say it.
    const observed = emit({
      correlationId: 'ilk-aaaaaaaaaaaaaaaa',
      state: ExperimentState.OBSERVED,
      at: at(),
      producedBy: INDEPENDENT_REREAD,
      detail: 'total 120 <= 130',
    });
    expect(observed.state).toBe('OBSERVED');
    expect(observed.producedBy).toBe(INDEPENDENT_REREAD);
  });

  it('refuses to emit ACCEPTED and records why it is unavailable', () => {
    expect(() =>
      emit({
        correlationId: 'ilk-aaaaaaaaaaaaaaaa',
        state: ExperimentState.ACCEPTED,
        at: at(),
        producedBy: 'protected-target',
        detail: 'the target validated the receipt',
      }),
    ).toThrow(/no observable boundary/);

    const availability = acceptedAvailability();
    expect(availability.emitted).toBe(false);
    expect(availability.status).toBe('unavailable');
    expect(availability.deferredTo).toMatch(/HAC-317/);
  });

  it('emits the boundaries that were observed, and nothing else', () => {
    const timeline = new Timeline();
    const correlationId = 'ilk-bbbbbbbbbbbbbbbb';
    timeline.record({ correlationId, state: ExperimentState.REQUESTED, at: at(), producedBy: 'ingress', detail: '' });
    timeline.record({ correlationId, state: ExperimentState.AUTHORIZED, at: at(), producedBy: 'proxy', detail: '' });
    timeline.record({ correlationId, state: ExperimentState.EXECUTED, at: at(), producedBy: 'protected-target', detail: '' });
    timeline.record({
      correlationId,
      state: ExperimentState.OBSERVED,
      at: at(),
      producedBy: INDEPENDENT_REREAD,
      detail: '',
    });

    expect(timeline.states()).toEqual(['REQUESTED', 'AUTHORIZED', 'EXECUTED', 'OBSERVED']);
    expect(timeline.states()).not.toContain('ACCEPTED');

    const gap = timeline.notEmitted(ExperimentState.ACCEPTED, 'no observable boundary');
    expect(gap.emitted).toBe(false);
    expect(timeline.events).toHaveLength(4);
  });

  it('rejects a state outside the schema and an event with no correlation id', () => {
    expect(() =>
      emit({ correlationId: 'ilk-aaaaaaaaaaaaaaaa', state: 'TARGET_ACCEPTED', at: at(), producedBy: 'x', detail: '' }),
    ).toThrow(/not a state of this schema/);
    expect(() =>
      emit({ correlationId: '', state: ExperimentState.REQUESTED, at: at(), producedBy: 'x', detail: '' }),
    ).toThrow(/correlation id/);
  });
});
