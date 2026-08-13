/**
 * PROOF FIXTURE (META-337 §8) — deleted before this branch is closed.
 *
 * Deliberately shipped with no tests, so that `codecov/patch` has a bounded
 * quantity of uncovered new production code to adjudicate. Nothing imports it.
 */

export type GateOutcome = 'red' | 'green' | 'absent';

export function describeOutcome(outcome: GateOutcome): string {
  if (outcome === 'red') {
    return 'the gate failed and named its defect';
  }

  if (outcome === 'green') {
    return 'the gate passed on this head';
  }

  return 'the gate did not report, which is not a pass';
}

export function isMergeAuthorizing(outcomes: readonly GateOutcome[]): boolean {
  if (outcomes.length === 0) {
    return false;
  }

  return outcomes.every((outcome) => outcome === 'green');
}
