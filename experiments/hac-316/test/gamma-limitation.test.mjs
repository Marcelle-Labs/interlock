/**
 * Which term of the harm verdict was measured, recorded where the verdict is.
 *
 * ## What was wrong
 *
 * `arms.*.globalVerification` carried `total`, `cap` and `residual: 20` side by
 * side with no marker. Two of those are re-reads of running targets; two are
 * immutable canonical-fixture inputs that nothing in the experiment ever
 * observes (SPEC 5.9, X-14). The disclosure existed — in a separate top-level
 * `observationScope` block — but a reader consuming `globalVerification`, which
 * is the object the verdict lives on, saw none of it.
 *
 * REQ-074 requires it in two places: per-quantity at
 * `results.json.arms.*.globalVerification.provenance`, and once at
 * `results.json.limitations.gammaAsserted`.
 *
 * ## And it must stay derived
 *
 * `20`, `130` and `10` are not written anywhere in the driver. The residual and
 * the cap come off `INITIAL_STATE` through the harm oracle's own accessors, and
 * the margin comes from the perturbation arm's *measured* breach. X-14 is why:
 * a hardcoded fixture value keeps agreeing with itself after the fixture moves.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { QuantityProvenance, compositionProvenance, gammaAssertedLimitation } from '../bin/run-arm.mjs';
import { capacityCap, residualReservation } from '../src/global-verifier.mjs';
import { PARTITIONED_SERVICES, RESIDUAL_SERVICES } from '../src/partition.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const readEvidence = (name) =>
  JSON.parse(readFileSync(join(experimentDir, 'evidence', name), 'utf8'));

const results = readEvidence('results.json');
const fixture = readEvidence('fixture.json');
const ARM_NAMES = ['baseline', 'treatment', 'perturbation'];

describe('per-quantity provenance sits on the verdict itself', () => {
  it('marks the partitions observed and the fixture inputs asserted', () => {
    for (const service of PARTITIONED_SERVICES) {
      expect(compositionProvenance()[service], service).toBe(QuantityProvenance.OBSERVED);
    }
    for (const service of RESIDUAL_SERVICES) {
      expect(compositionProvenance()[service], service).toBe(QuantityProvenance.ASSERTED);
    }
    expect(compositionProvenance().cap).toBe(QuantityProvenance.ASSERTED);
  });

  it('is recorded on every arm, next to total and cap', () => {
    for (const name of ARM_NAMES) {
      const verification = results.arms[name].globalVerification;

      expect(verification.source, name).toBe('independent-reread');
      expect(verification.provenance, name).toBeDefined();
      expect(verification.provenance.alpha, name).toBe('observed');
      expect(verification.provenance.beta, name).toBe('observed');
      expect(verification.provenance.gamma, name).toBe('asserted-fixture');
      expect(verification.provenance.cap, name).toBe('asserted-fixture');
    }
  });

  it('never describes the residual as observed', () => {
    for (const name of ARM_NAMES) {
      const verification = results.arms[name].globalVerification;
      // `residual` is the number that used to sit unmarked on this object.
      expect(verification.residual).toBe(residualReservation());
      for (const service of RESIDUAL_SERVICES) {
        expect(verification.provenance[service], `${name}.${service}`).not.toBe(
          QuantityProvenance.OBSERVED,
        );
      }
      expect(verification.provenanceNote).toMatch(/asserting it/);
    }
  });
});

describe('the limitation, recorded once and derived throughout', () => {
  const limitation = results.limitations.gammaAsserted;

  it('agrees with the canonical fixture', () => {
    expect(limitation.assertedGamma).toBe(fixture.canonicalFixture.services.gamma);
    expect(limitation.assertedCap).toBe(fixture.canonicalFixture.totalReservable);
  });

  it('derives both from INITIAL_STATE rather than restating the fixture', () => {
    expect(limitation.assertedGamma).toBe(residualReservation());
    expect(limitation.assertedCap).toBe(capacityCap());
  });

  it('derives the margin from the measured breach', () => {
    const breach = results.arms.perturbation.globalVerification;

    expect(limitation.breachMargin).toBe(breach.total - breach.cap);
    expect(limitation.assertedGammaExceedsMarginBy).toBe(
      limitation.assertedGamma - limitation.breachMargin,
    );
  });

  it('names which quantities are observed and which are asserted', () => {
    expect(limitation.observedQuantities).toEqual([...PARTITIONED_SERVICES]);
    expect(limitation.observedQuantities.join(',')).toBe('alpha,beta');
    expect(limitation.assertedQuantities).toEqual([...RESIDUAL_SERVICES, 'cap']);
  });

  it('is marked as carried into the receipt', () => {
    expect(limitation.carriedInto).toMatch(/receipt/i);
  });

  it('recomputes from the arm it was derived from', () => {
    expect(gammaAssertedLimitation(results.arms.perturbation.globalVerification)).toEqual(
      limitation,
    );
  });
});

describe('the top-level scope block agrees with the two required places', () => {
  const scope = results.observationScope;
  const limitation = results.limitations.gammaAsserted;

  it('reports the same asserted values', () => {
    expect(scope.notObserved.gamma.value).toBe(limitation.assertedGamma);
    expect(scope.notObserved.cap.value).toBe(limitation.assertedCap);
    expect(scope.breachMargin.margin).toBe(limitation.breachMargin);
    expect(scope.breachMargin.gammaIsMultipleOfMargin).toBe(
      limitation.assertedGamma / limitation.breachMargin,
    );
  });

  it('points at where a consumer of the verdict will find it', () => {
    expect(scope.alsoRecordedAt).toContain('results.json.arms.*.globalVerification.provenance');
    expect(scope.alsoRecordedAt).toContain('results.json.limitations.gammaAsserted');
    expect(scope.independentlyReread.services).toEqual([...PARTITIONED_SERVICES]);
  });
});
