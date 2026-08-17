/**
 * HAC-341 — what one *selected arm* shows.
 *
 * This module exists because of a specific defect. The cockpit used to read
 * `run.environmentEvidence[0]` for every arm, so selecting the perturbed arm
 * changed the decision and the outcome but left the treatment's basis revision
 * and `coupling support 8/10` on screen. The surface then asserted a coupling
 * and its absence at the same time, ~80px apart, and the perturbation — which
 * exists to show that the evidence is load-bearing — taught the opposite: same
 * evidence, different decision.
 *
 * The derivation lives here rather than inside the HTML so it can be asserted
 * against the frozen arms without a browser. The gate and the negative proofs
 * call the same function the cockpit renders from, so a future rewiring of the
 * binding fails mechanically instead of silently.
 *
 * Pure and dependency-free: it reads the normalized view model and returns a
 * presentation shape. It derives no evidence of its own — every value below is
 * copied from the selected frozen arm.
 */

/** The baseline runs with Interlock disabled, so no decision produced it. */
const NO_DECISION = 'Interlock disabled';

/**
 * The evidence instance the selected arm actually ran on.
 *
 * The shared environment and its bound are properties of the experiment and do
 * not move between arms; the *evidence* does. `source` is therefore taken from
 * the environment, while `basis` and `couplings` come from the arm.
 */
function armEvidence(run, arm) {
  const env = run.environmentEvidence?.[0] ?? {};
  return {
    source: env.source ?? '',
    basis: arm.basisRevision ?? null,
    couplings: arm.couplings ?? [],
    // An arm with Interlock disabled never consulted the evidence at all;
    // showing coupling support beside it would imply a reading that never
    // happened.
    consulted: arm.interlock === 'enabled',
    note: arm.evidenceNote ?? '',
  };
}

/**
 * The outcome rows to show for a selection.
 *
 * Every arm except the baseline is shown against the baseline, so the delta is
 * always visible. Selecting the baseline itself yields ONE row: comparing the
 * baseline against itself is not a counterfactual, and rendering it twice read
 * as a bug rather than as a comparison.
 */
function comparisonRows(run, arm, baseline) {
  const selected = {
    key: 'selected',
    armId: arm.armId,
    label: arm.label,
    cause: arm.decision ?? NO_DECISION,
    outcome: arm.outcome,
    checksLabel: arm.armId === run.defaultArm ? (run.checks?.label ?? null) : null,
  };
  if (arm.armId === baseline?.armId) return [{ ...selected, key: 'only' }];
  return [
    {
      key: 'reference',
      armId: baseline.armId,
      label: 'Baseline · no coordination',
      cause: NO_DECISION,
      outcome: baseline.outcome,
      checksLabel: null,
    },
    selected,
  ];
}

/**
 * Derive everything the local L1 renders for `armId`.
 *
 * Falls back to the run's declared default arm when the id is unknown, matching
 * the routing contract: an unknown *state* is refused upstream, so by the time
 * this is called the arm is expected to exist.
 */
export function armView(run, armId) {
  const arm = run.arms.find((a) => a.armId === armId)
    ?? run.arms.find((a) => a.armId === run.defaultArm);
  const baseline = run.arms.find((a) => a.interlock === 'disabled') ?? null;
  const reference = run.arms.find((a) => a.armId === run.defaultArm) ?? null;
  const evidence = armEvidence(run, arm);

  // The perturbation is only legible as a change *from* something. The default
  // arm is that something, so a basis that differs from it is the fact the
  // reader has to see before the decision makes sense.
  const referenceBasis = reference?.basisRevision ?? null;
  const evidenceChanged = Boolean(
    evidence.basis && referenceBasis && evidence.basis !== referenceBasis,
  );

  return {
    arm,
    baseline,
    evidence,
    evidenceChanged,
    referenceBasis: evidenceChanged ? referenceBasis : null,
    coupled: evidence.consulted && evidence.couplings.length > 0,
    constraint: run.constraints?.[0] ?? null,
    comparison: comparisonRows(run, arm, baseline),
  };
}

export { NO_DECISION };
