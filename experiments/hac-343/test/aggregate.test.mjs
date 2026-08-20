/**
 * HAC-343 — adversarial tests on the aggregator, before any result exists.
 *
 * The aggregator is the piece a skeptical reader has least reason to trust: it
 * turns raw records into the numbers that go in front of judges. So it is fed
 * synthetic records built to make it lie, and required not to.
 *
 * Every case here is a way the packet could report something flattering and
 * false — a broken baseline scored as a blind one, an unsafe arm topping the
 * headline metric, a scheduler-sensitive result averaged smooth, a deleted
 * record shrinking a denominator, a failing family hidden inside an aggregate,
 * or a lock arm appearing to respond to evidence it never reads.
 *
 * Written before execution on purpose. After results exist, a test that shapes
 * reporting logic cannot be distinguished from one that shapes it *around the
 * outcome*.
 */
import { describe, expect, it } from 'vitest';

import { aggregate, decisionSignature, assembleSpr, rate, ORDERS } from '../lib/aggregate.mjs';
import { SCENARIOS, FAMILIES } from '../lib/corpus.mjs';
import { ARMS } from '../lib/arms.mjs';

/** A record that looks like a clean, safe, plausible execution. */
function baseRecord(scenario, arm, order) {
  const sameTarget = scenario.label === 'SAME_TARGET_CONTENTION';
  const inadmissible = scenario.label === 'EVIDENCE_INADMISSIBLE';
  const coupled = scenario.label === 'COUPLED';

  // A2 serializes everything; A3 serializes only same-target; A4 serializes
  // coupled and refuses inadmissible; A1 never serializes.
  let concurrent = true;
  if (arm === 'A2_global_lock') concurrent = false;
  if (arm === 'A3_per_target_lock' && sameTarget) concurrent = false;
  if (arm === 'A4_interlock' && (coupled || inadmissible || sameTarget)) concurrent = false;

  const refused = arm === 'A4_interlock' && inadmissible;

  return {
    scenarioId: scenario.id,
    family: scenario.family,
    label: scenario.label,
    arm,
    order,
    concurrent,
    refusalReason: refused ? scenario.expectedRefusalReason : null,
    verdicts: null,
    outcomes: scenario.intents.map((_, index) => ({ intentId: `i${index}`, applied: !refused })),
    oracle: { holds: true, exitCode: 0, verifierSha256: 'a'.repeat(64) },
    error: null,
  };
}

/** A complete 128-record matrix, optionally mutated. */
function buildRecords(mutate = () => {}) {
  const records = [];
  for (const scenario of SCENARIOS) {
    for (const arm of ARMS) {
      for (const order of ORDERS) {
        const record = baseRecord(scenario, arm, order);
        mutate(record, scenario);
        records.push(record);
      }
    }
  }
  return records;
}

const run = (records) => aggregate({ records, scenarios: SCENARIOS, arms: ARMS, families: FAMILIES });

// ---------------------------------------------------------------------------

describe('a clean matrix aggregates', () => {
  it('accepts a complete matrix and reports no defects', () => {
    const report = run(buildRecords());

    expect(report.completeness.missing).toEqual([]);
    expect(report.completeness.observed).toBe(SCENARIOS.length * ARMS.length * ORDERS.length);
    expect(report.defects).toEqual([]);
  });
});

describe('a broken baseline cannot be scored as a blind one', () => {
  it('fires the lockValidity defect gate when A3 fails one same-target case', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A3_per_target_lock' && scenario.label === 'SAME_TARGET_CONTENTION' && scenario.family === 'budget') {
        record.concurrent = true; // did not serialize — a defective lock
      }
    });

    const report = run(records);
    const defect = report.defects.find((d) => d.gate === 'lockValidity' && d.arm === 'A3_per_target_lock');

    expect(defect).toBeDefined();
    expect(report.lockValidity.A3_per_target_lock.numerator).toBe(1);
    expect(report.lockValidity.A3_per_target_lock.denominator).toBe(2);
  });

  it('fires the gate for A2 as well', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A2_global_lock' && scenario.label === 'SAME_TARGET_CONTENTION') record.concurrent = true;
    });

    expect(run(records).defects.some((d) => d.gate === 'lockValidity' && d.arm === 'A2_global_lock')).toBe(true);
  });
});

describe('an unsafe arm cannot top the headline metric', () => {
  it('renders A1 at SPR 100% as explicitly unsafe, never as the winner', () => {
    const records = buildRecords((record, scenario) => {
      // A1 permits everything, including the coupled composition, which the
      // oracle then rejects.
      if (record.arm === 'A1_uncoordinated' && scenario.label === 'COUPLED') {
        record.oracle = { holds: false, exitCode: 1, verifierSha256: 'a'.repeat(64) };
      }
    });

    const report = run(records);
    const a1 = report.aggregate.A1_uncoordinated.spr;

    expect(a1.safeParallelismRetained.rate).toBe(1); // 100% parallelism…
    expect(a1.unsafeJointState.numerator).toBe(2); // …at a nonzero unsafe rate
    expect(a1.qualified).toBe(false);
    expect(a1.rendering).toContain('UNSAFE, not safe parallelism');
    // The unsafe rate travels with the number, always.
    expect(a1.rendering).toContain('at unsafe-joint-state rate');
  });

  it('refuses to construct an SPR figure without an unsafe-joint-state rate', () => {
    expect(() => assembleSpr(rate(2, 2), undefined)).toThrow(/may not be assembled without/i);
    expect(() => assembleSpr(rate(2, 2), null)).toThrow(/may not be assembled without/i);
  });
});

describe('scheduler sensitivity is not averaged away', () => {
  it('classifies a scenario unsafe when only one order violates', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A4_interlock' && scenario.id === 'budget/coupled/alpha-beta' && record.order === 'BA') {
        record.oracle = { holds: false, exitCode: 1, verifierSha256: 'a'.repeat(64) };
      }
    });

    const report = run(records);

    // Unsafe if EITHER order violates — the safe order does not rescue it.
    expect(report.aggregate.A4_interlock.unsafeJointState.numerator).toBe(1);
  });

  it('reports an order disagreement explicitly rather than smoothing it', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A4_interlock' && scenario.id === 'budget/independent/alpha-gamma' && record.order === 'BA') {
        record.outcomes = record.outcomes.map((o) => ({ ...o, applied: false }));
      }
    });

    const report = run(records);
    const effect = report.orderEffects.find((e) => e.scenarioId === 'budget/independent/alpha-gamma');

    expect(effect).toBeDefined();
    expect(effect.arm).toBe('A4_interlock');
    // Parallel only if BOTH orders permit: one failing order loses the credit.
    expect(report.aggregate.A4_interlock.spr.safeParallelismRetained.numerator).toBe(1);
  });
});

describe('a missing record cannot shrink a denominator', () => {
  it('throws rather than aggregating a partial matrix', () => {
    const records = buildRecords().filter(
      (r) => !(r.scenarioId === 'registry/coupled/retire-vs-route' && r.arm === 'A4_interlock' && r.order === 'BA'),
    );

    expect(() => run(records)).toThrow(/incomplete raw results/i);
  });

  it('throws on a duplicated record rather than double-counting', () => {
    const records = buildRecords();
    records.push({ ...records[0] });

    expect(() => run(records)).toThrow(/duplicate raw record/i);
  });

  it('treats an errored record as unsafe rather than absent', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A4_interlock' && scenario.id === 'budget/coupled/alpha-beta') {
        record.error = 'boom';
        record.oracle = null;
      }
    });

    expect(run(records).aggregate.A4_interlock.unsafeJointState.numerator).toBe(1);
  });
});

describe('a failing family is not hidden inside an aggregate', () => {
  it('surfaces the failure per family and in the aggregate', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A4_interlock' && scenario.family === 'registry' && scenario.label === 'COUPLED') {
        record.oracle = { holds: false, exitCode: 1, verifierSha256: 'a'.repeat(64) };
      }
    });

    const report = run(records);

    expect(report.perFamily.budget.A4_interlock.unsafeJointState.numerator).toBe(0);
    expect(report.perFamily.registry.A4_interlock.unsafeJointState.numerator).toBe(1);
    // The aggregate must not read as clean while a family is failing.
    expect(report.aggregate.A4_interlock.unsafeJointState.numerator).toBe(1);
    expect(report.aggregate.A4_interlock.spr.qualified).toBe(false);
  });
});

describe('an evidence-blind arm cannot appear evidence-sensitive', () => {
  it.each(['A1_uncoordinated', 'A2_global_lock', 'A3_per_target_lock'])(
    'fires the defect gate when %s changes decision under perturbation alone',
    (arm) => {
      const records = buildRecords((record, scenario) => {
        if (record.arm === arm && scenario.label === 'EVIDENCE_PERTURBED') {
          record.outcomes = record.outcomes.map((o) => ({ ...o, applied: false }));
        }
      });

      const report = run(records);
      const defect = report.defects.find((d) => d.gate === 'evidenceSensitivity' && d.arm === arm);

      expect(defect).toBeDefined();
      expect(defect.detail).toMatch(/consumes no evidence/);
    },
  );

  it('does not fire the gate for A4, which is supposed to be evidence-sensitive', () => {
    const records = buildRecords((record, scenario) => {
      if (record.arm === 'A4_interlock' && scenario.label === 'EVIDENCE_PERTURBED') {
        record.concurrent = true;
        record.outcomes = record.outcomes.map((o) => ({ ...o, applied: true }));
      }
    });

    expect(run(records).defects.some((d) => d.gate === 'evidenceSensitivity')).toBe(false);
  });
});

describe('reporting conventions hold', () => {
  it('renders an empty denominator as n/a rather than 0% or 100%', () => {
    expect(rate(0, 0).display).toBe('n/a (0 cases)');
    expect(rate(0, 0).rate).toBeNull();
  });

  it('never renders a bare percentage', () => {
    expect(rate(1, 2).display).toBe('1/2 (50.0%)');
  });

  it('makes decision signatures independent of intent ordering', () => {
    const ab = { outcomes: [{ intentId: 'i0', applied: true }, { intentId: 'i1', applied: false }] };
    const ba = { outcomes: [{ intentId: 'i1', applied: false }, { intentId: 'i0', applied: true }] };

    expect(decisionSignature(ab)).toBe(decisionSignature(ba));
  });
});
