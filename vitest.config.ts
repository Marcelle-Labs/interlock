import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // `lcov` is what Codecov consumes; `text-summary` is what a human or an
      // agent reads in the job log without leaving the failure output.
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
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
