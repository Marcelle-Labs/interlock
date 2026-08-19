/**
 * HAC-343 — aggregation. A pure function over raw records.
 *
 * No filesystem, no git, no clock, no network. It receives the raw records and
 * the frozen corpus and returns a report; the same inputs always produce the
 * same output, which is what lets `verify-packet.mjs` recompute every number
 * from the committed raw records rather than trusting a summary.
 *
 * Three properties matter more than the arithmetic:
 *
 * 1. **It cannot skip.** A missing scenario x arm x order combination throws.
 *    A metric quietly computed over 14 of 16 scenarios would report a rate that
 *    looks like a measurement and is not one — the "missing-run green state"
 *    HAC-319 forbids by name.
 * 2. **It cannot suppress.** Refused, rejected and errored records are counted,
 *    not filtered. An arm cannot improve a rate by failing to produce a record.
 * 3. **SPR cannot escape alone.** The only way to obtain an SPR figure from this
 *    module is as an object that also carries the unsafe-joint-state rate and
 *    both sets of counts. `assembleSpr` throws if asked to build one without.
 *
 * @see evidence/metric-definitions.json — every definition below is frozen there
 * @see evidence/execution-semantics.json — the two-order aggregation rule
 */

/** Full identities of the commits that froze this experiment's contracts. */
export const FROZEN_COMMITS = Object.freeze({
  'experiments/hac-343/evidence/metric-definitions.json': '0a6babbc5d1a3f69b057f98093108ee508072e48',
  'experiments/hac-343/evidence/corpus.json': 'dbdcaa940933f90091a838f5f183031c7556afad',
  'experiments/hac-343/evidence/execution-semantics.json': '276750ba7a4a51461fb2447b361d69be5e2a020b',
});

export const ORDERS = Object.freeze(['AB', 'BA']);

// ---------------------------------------------------------------------------

/**
 * A rate that always shows its working.
 *
 * An empty denominator is `n/a (0 cases)` and never 0% or 100%: a metric with
 * nothing to measure must not render as a passing green state.
 */
export function rate(numerator, denominator) {
  if (denominator === 0) {
    return { numerator, denominator, rate: null, display: 'n/a (0 cases)' };
  }
  const value = numerator / denominator;
  return {
    numerator,
    denominator,
    rate: value,
    display: `${numerator}/${denominator} (${(value * 100).toFixed(1)}%)`,
  };
}

/**
 * Build an SPR figure. The only constructor, and it refuses to make a bare one.
 *
 * An arm that permits everything scores SPR 100% and is unsafe; publishing that
 * number alone would make the worst arm look best. The frozen definition states
 * SPR is reported only as an ordered pair, so the pairing is enforced in the
 * type rather than left to whoever renders it.
 */
export function assembleSpr(sprRate, unsafeRate) {
  if (unsafeRate === undefined || unsafeRate === null) {
    throw new Error('SPR may not be assembled without an unsafe-joint-state rate (metric-definitions.json headlineKpi.safetyPrecondition)');
  }
  const qualified = unsafeRate.denominator > 0 && unsafeRate.numerator === 0;
  return {
    safeParallelismRetained: sprRate,
    unsafeJointState: unsafeRate,
    // An arm may be described as retaining *safe* parallelism only when its
    // unsafe rate is zero. Otherwise the qualifier travels with the number.
    qualified,
    rendering: `SPR ${sprRate.display} at unsafe-joint-state rate ${unsafeRate.display}${qualified ? '' : ' — UNSAFE, not safe parallelism'}`,
  };
}

// ---------------------------------------------------------------------------

const key = (scenarioId, arm, order) => `${scenarioId}|${arm}|${order}`;

/**
 * Collapse a scenario's two execution orders into one verdict per the frozen
 * rule. Every clause is conservative toward A4.
 */
function collapseOrders(scenarioId, arm, byOrder) {
  const records = ORDERS.map((order) => byOrder.get(key(scenarioId, arm, order)));

  const errored = records.filter((r) => r.error != null);
  // Safety must hold under all orders.
  const unsafe = records.some((r) => r.oracle?.holds === false) || errored.length > 0;
  // Parallelism is claimed only when it is order-independent.
  const permittedConcurrently = records.every(
    (r) => r.concurrent === true && Array.isArray(r.outcomes) && r.outcomes.length > 0 && r.outcomes.every((o) => o.applied === true),
  );
  const anyApplied = records.some((r) => Array.isArray(r.outcomes) && r.outcomes.some((o) => o.applied === true));
  const serialized = records.every((r) => r.concurrent === false);

  const signatures = records.map((r) => decisionSignature(r));
  const orderDisagreement = signatures[0] !== signatures[1];

  return {
    scenarioId,
    arm,
    records,
    unsafe,
    permittedConcurrently,
    anyApplied,
    serialized,
    errored: errored.length > 0,
    signature: signatures[0],
    signatures,
    orderDisagreement,
    refusalReasons: records.map((r) => r.refusalReason ?? null),
  };
}

/**
 * A canonical, order-independent summary of what an arm decided.
 *
 * Sorted by intent id so permuting the execution order cannot change the
 * signature on its own — otherwise every scenario would look order-sensitive and
 * the evidence-sensitivity metric would measure the permutation.
 */
export function decisionSignature(record) {
  if (record.error != null) return `ERROR:${record.error}`;
  if (record.refusalReason) return `REFUSED:${record.refusalReason}`;
  if (Array.isArray(record.verdicts) && record.verdicts.length > 0) {
    return record.verdicts.map((v) => v.decision).sort().join(',');
  }
  return (record.outcomes ?? [])
    .map((o) => `${o.intentId}:${o.applied ? 'applied' : 'rejected'}`)
    .sort()
    .join(',');
}

// ---------------------------------------------------------------------------

function metricsFor(collapsed, scenarios, arm) {
  const forArm = collapsed.filter((c) => c.arm === arm);
  const scenarioOf = (c) => scenarios.find((s) => s.id === c.scenarioId);
  const withLabel = (label) => forArm.filter((c) => scenarioOf(c).label === label);

  const coupled = withLabel('COUPLED');
  const independent = withLabel('INDEPENDENT');
  const sameTarget = withLabel('SAME_TARGET_CONTENTION');
  const perturbed = withLabel('EVIDENCE_PERTURBED');
  const inadmissible = withLabel('EVIDENCE_INADMISSIBLE');

  // Evaluated first, and reported first: a baseline that did not lock makes
  // every downstream comparison meaningless.
  const lockValidity = rate(sameTarget.filter((c) => c.serialized).length, sameTarget.length);

  const unsafeJointState = rate(coupled.filter((c) => c.unsafe).length, coupled.length);
  const permit = rate(forArm.filter((c) => c.anyApplied).length, forArm.length);
  const falseBlock = rate(independent.filter((c) => !c.permittedConcurrently).length, independent.length);

  const evidenceSensitivity = rate(
    perturbed.filter((c) => {
      const origin = forArm.find((o) => o.scenarioId === scenarioOf(c).perturbationOf);
      return origin != null && origin.signature !== c.signature;
    }).length,
    perturbed.length,
  );

  const refusalCorrectness = rate(
    inadmissible.filter((c) =>
      c.refusalReasons.every((reason) => reason != null && reason === scenarioOf(c).expectedRefusalReason),
    ).length,
    inadmissible.length,
  );

  const spr = assembleSpr(
    rate(independent.filter((c) => c.permittedConcurrently).length, independent.length),
    unsafeJointState,
  );

  return { lockValidity, unsafeJointState, permit, falseBlock, evidenceSensitivity, refusalCorrectness, spr };
}

// ---------------------------------------------------------------------------

/**
 * Aggregate raw records into the report.
 *
 * @throws when any scenario x arm x order record is missing or duplicated.
 */
export function aggregate({ records, scenarios, arms, families }) {
  const byOrder = new Map();
  for (const record of records) {
    const k = key(record.scenarioId, record.arm, record.order);
    if (byOrder.has(k)) throw new Error(`duplicate raw record for ${k}`);
    byOrder.set(k, record);
  }

  const expected = [];
  const missing = [];
  for (const scenario of scenarios) {
    for (const arm of arms) {
      for (const order of ORDERS) {
        const k = key(scenario.id, arm, order);
        expected.push(k);
        if (!byOrder.has(k)) missing.push(k);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `incomplete raw results: ${missing.length} of ${expected.length} records missing — ` +
        `a metric computed over a partial matrix is not a measurement (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''})`,
    );
  }

  const collapsed = [];
  for (const scenario of scenarios) {
    for (const arm of arms) collapsed.push(collapseOrders(scenario.id, arm, byOrder));
  }

  const perArm = Object.fromEntries(arms.map((arm) => [arm, metricsFor(collapsed, scenarios, arm)]));

  // Per family first, then aggregate, so a family-level failure cannot be
  // averaged into an acceptable-looking whole.
  const perFamily = Object.fromEntries(
    families.map((family) => {
      const familyScenarios = scenarios.filter((s) => s.family === family);
      const ids = new Set(familyScenarios.map((s) => s.id));
      const familyCollapsed = collapsed.filter((c) => ids.has(c.scenarioId));
      return [
        family,
        Object.fromEntries(arms.map((arm) => [arm, metricsFor(familyCollapsed, familyScenarios, arm)])),
      ];
    }),
  );

  const orderEffects = collapsed
    .filter((c) => c.orderDisagreement)
    .map((c) => ({ scenarioId: c.scenarioId, arm: c.arm, signatures: c.signatures }));

  // Defect gates. These are not results; a trip means the harness is wrong.
  const defects = [];
  for (const arm of arms) {
    if (arm === 'A4_interlock') continue;
    const sensitivity = perArm[arm].evidenceSensitivity;
    if (sensitivity.denominator > 0 && sensitivity.numerator > 0) {
      defects.push({
        gate: 'evidenceSensitivity',
        arm,
        detail: `${arm} consumes no evidence, so a decision that moves when evidence moves means the harness is leaking state between arms (${sensitivity.display})`,
      });
    }
  }
  for (const arm of ['A2_global_lock', 'A3_per_target_lock']) {
    const validity = perArm[arm]?.lockValidity;
    if (validity && validity.denominator > 0 && validity.numerator !== validity.denominator) {
      defects.push({
        gate: 'lockValidity',
        arm,
        detail: `${arm} failed to serialize a SAME_TARGET_CONTENTION scenario (${validity.display}); it is a defective lock rather than a blind one, and its unsafe results prove nothing`,
      });
    }
  }

  return {
    completeness: { expected: expected.length, observed: byOrder.size, missing },
    lockValidity: Object.fromEntries(arms.map((arm) => [arm, perArm[arm].lockValidity])),
    perFamily,
    aggregate: perArm,
    orderEffects,
    defects,
  };
}
