import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Three patterns, one runner. The repository's production tests live in
    // `test/` as TypeScript; the HAC-330 experiment's decision-function tests
    // live beside the experiment as ESM. Running them under a second test
    // runner would fork ownership of the `test` context, which META-337's
    // matrix gives to exactly one owner, so they are included here instead.
    //
    // The third pattern covers ESM contracts a gate imports at runtime.
    // `scripts/export-naming.mjs` is loaded by `node` from `media/hac-334/bin/`,
    // so it cannot be TypeScript without putting a build step in front of every
    // export check. Its tests live in `test/` with the rest rather than beside
    // it, because it is a repository-wide contract and not one issue's
    // experiment.
    include: ['test/**/*.test.ts', 'test/**/*.test.mjs', 'experiments/**/test/*.test.mjs'],
    coverage: {
      provider: 'v8',
      // `lcov` is what Codecov consumes; `text-summary` is what a human or an
      // agent reads in the job log without leaving the failure output.
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Coverage stays scoped to production source. `experiments/` is a frozen
      // evaluation harness, not shipped behaviour, and widening this would
      // change the denominator of the patch-coverage gate Codecov owns —
      // a different issue's contract, not this one's to alter.
      include: ['src/**/*.ts'],

      // Deliberately no `thresholds` block.
      //
      // Codecov owns the coverage gate (patch coverage on changed production
      // code). Setting a second, local aggregate threshold here would give the
      // same failure class two owners with two different numbers, which is
      // exactly the duplication META-337 is trying to remove. If coverage should
      // block, it blocks at Codecov, once.
    },
  },
});
