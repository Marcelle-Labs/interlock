import { describe, expect, it } from 'vitest';

import { describeOutcome, isMergeAuthorizing } from '../src/proof-uncovered.js';

describe('describeOutcome', () => {
  it.each([
    ['red', 'failed'],
    ['green', 'passed'],
    ['absent', 'not a pass'],
  ] as const)('describes %s', (outcome, expected) => {
    expect(describeOutcome(outcome)).toContain(expected);
  });
});

describe('isMergeAuthorizing', () => {
  it('is false for an empty gate set, because nothing was checked', () => {
    expect(isMergeAuthorizing([])).toBe(false);
  });

  it('is true only when every gate is green', () => {
    expect(isMergeAuthorizing(['green', 'green'])).toBe(true);
  });

  it.each([
    ['a red gate', ['green', 'red']],
    ['an absent gate', ['green', 'absent']],
  ] as const)('is false with %s', (_label, outcomes) => {
    expect(isMergeAuthorizing(outcomes)).toBe(false);
  });
});
