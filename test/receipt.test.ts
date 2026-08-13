import { describe, expect, it } from 'vitest';

import { isProvenBlockingGate, validateReceipt } from '../src/receipt.js';

const provenBlockingReceipt = {
  repository: 'Marcelle-Labs/interlock',
  check: 'test (22)',
  sourceApp: 'github-actions',
  posture: 'blocking',
  injectedDefect: 'Assert 1 === 2 in the receipt suite.',
  observedFailure: 'test (22) concluded failure from github-actions on head abc1234.',
  repair: 'Reverted the assertion.',
  finalState: 'Required context on main, pinned to app 15368.',
};

function issueFields(input: unknown): string[] {
  const result = validateReceipt(input);
  if (result.ok) {
    throw new Error('expected validation to fail');
  }
  return result.issues.map((issue) => issue.field);
}

describe('validateReceipt', () => {
  it('accepts a blocking receipt carrying a complete bidirectional proof', () => {
    const result = validateReceipt(provenBlockingReceipt);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.repository).toBe('Marcelle-Labs/interlock');
    expect(result.receipt.posture).toBe('blocking');
    expect(result.receipt.observedFailure).toContain('github-actions');
  });

  it('accepts an advisory receipt with no red/green proof', () => {
    const result = validateReceipt({
      repository: 'workspacejson/integrations',
      check: 'Sourcery review',
      sourceApp: 'sourcery-ai',
      posture: 'advisory',
      finalState: 'Reporting, deliberately not required.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.injectedDefect).toBeUndefined();
  });

  it('rejects a blocking receipt that never observed a failure', () => {
    const { observedFailure, ...withoutObservedFailure } = provenBlockingReceipt;
    void observedFailure;

    const fields = issueFields(withoutObservedFailure);

    expect(fields).toContain('observedFailure');
  });

  it('names every missing proof field at once rather than stopping at the first', () => {
    const fields = issueFields({
      repository: 'Marcelle-Labs/interlock',
      check: 'test (22)',
      sourceApp: 'github-actions',
      posture: 'blocking',
      finalState: 'Required context on main.',
    });

    expect(fields).toEqual(
      expect.arrayContaining(['injectedDefect', 'observedFailure', 'repair']),
    );
  });

  it.each([
    ['a non-object', 42],
    ['null', null],
    ['an array', []],
  ])('rejects %s', (_label, input) => {
    const result = validateReceipt(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe('.');
  });

  it('rejects a blank identity field instead of treating whitespace as content', () => {
    const fields = issueFields({ ...provenBlockingReceipt, check: '   ' });

    expect(fields).toContain('check');
  });

  it('rejects a non-string identity field', () => {
    const fields = issueFields({ ...provenBlockingReceipt, sourceApp: 7 });

    expect(fields).toContain('sourceApp');
  });

  it('rejects a repository that is not in owner/repo form', () => {
    const fields = issueFields({ ...provenBlockingReceipt, repository: 'interlock' });

    expect(fields).toContain('repository');
  });

  it.each([
    ['an unknown posture', 'informational'],
    ['a non-string posture', 3],
  ])('rejects %s', (_label, posture) => {
    const fields = issueFields({ ...provenBlockingReceipt, posture });

    expect(fields).toContain('posture');
  });

  it('rejects a present-but-blank proof field even on an advisory receipt', () => {
    const fields = issueFields({
      repository: 'workspacejson/cli',
      check: 'Sourcery review',
      sourceApp: 'sourcery-ai',
      posture: 'advisory',
      finalState: 'Reporting, not required.',
      repair: '  ',
    });

    expect(fields).toContain('repair');
  });

  it('trims surrounding whitespace from accepted values', () => {
    const result = validateReceipt({ ...provenBlockingReceipt, check: '  test (20)  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.check).toBe('test (20)');
  });
});

describe('isProvenBlockingGate', () => {
  it('is true only when a blocking gate carries every proof field', () => {
    const result = validateReceipt(provenBlockingReceipt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(isProvenBlockingGate(result.receipt)).toBe(true);
  });

  it('is false for an advisory signal, which authorizes nothing', () => {
    const result = validateReceipt({
      repository: 'workspacejson/integrations',
      check: 'Sourcery review',
      sourceApp: 'sourcery-ai',
      posture: 'advisory',
      finalState: 'Reporting, deliberately not required.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(isProvenBlockingGate(result.receipt)).toBe(false);
  });
});
