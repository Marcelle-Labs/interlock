/**
 * The environment-reading control.
 *
 * Two silent weakenings lived in this experiment, and both were an *empty*
 * variable being read as a value:
 *
 *   HAC316_FAULT_INJECT=''  made REQ-026 skip the broken-verifier spawn
 *   VITEST=''               downgraded every suite-backed REQ to NOT_EXERCISED
 *
 * Neither said anything in the output. A third failure mode sat next to them: a
 * value the program did not recognise selected the default instead of stopping.
 * These tests hold all three shut.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  EnvironmentError,
  insideVitest,
  readBooleanEnv,
  readEnumEnv,
  readEnv,
} from '../src/env.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');

describe('a set-but-empty variable is absent, not a value', () => {
  it('reads empty and whitespace-only as absent', () => {
    expect(readEnv('X', { X: '' })).toBe(null);
    expect(readEnv('X', { X: '   ' })).toBe(null);
    expect(readEnv('X', { X: '\t\n ' })).toBe(null);
    expect(readEnv('X', {})).toBe(null);
    expect(readEnv('X', { X: ' value ' })).toBe('value');
  });

  it('does not treat VITEST="" as running inside vitest', () => {
    expect(insideVitest({ VITEST: '' })).toBe(false);
    expect(insideVitest({ VITEST: '   ' })).toBe(false);
    expect(insideVitest({})).toBe(false);
    expect(insideVitest({ VITEST: 'true' })).toBe(true);
    expect(insideVitest({ VITEST: '1' })).toBe(true);
    expect(insideVitest({ VITEST: 'false' })).toBe(false);
  });

  it('does not treat an empty fault variable as an installed fault', () => {
    expect(readEnumEnv('HAC316_FAULT_INJECT', ['stub-reread'], { HAC316_FAULT_INJECT: '' })).toBe(
      null,
    );
  });
});

describe('an unrecognised value is a hard error, never a silent skip', () => {
  it('refuses an enum value it does not implement', () => {
    expect(() =>
      readEnumEnv('HAC316_FAULT_INJECT', ['stub-reread'], { HAC316_FAULT_INJECT: 'stub_reread' }),
    ).toThrow(EnvironmentError);
    expect(() =>
      readEnumEnv('HAC316_FAULT_INJECT', ['stub-reread'], { HAC316_FAULT_INJECT: 'stub_reread' }),
    ).toThrow(/not one of/);
  });

  it('refuses a boolean it cannot parse rather than reading it as false', () => {
    expect(readBooleanEnv('F', { F: 'TRUE' })).toBe(true);
    expect(readBooleanEnv('F', { F: '0' })).toBe(false);
    expect(readBooleanEnv('F', {})).toBe(null);
    for (const value of ['yes', 'on', 'enabled', 'False ish', '2']) {
      expect(() => readBooleanEnv('F', { F: value }), value).toThrow(EnvironmentError);
    }
  });

  it('stops the verifier on an unknown fault name instead of running clean', () => {
    const run = spawnSync(process.execPath, [verifier, '--rederive-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, VITEST: '', HAC316_FAULT_INJECT: 'tamper-recorded-decisions' },
    });
    // Before the strict read this exited 0 with a clean PASS: the operator
    // asked for a fault, got none, and was told nothing.
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain('PASS');
    expect(run.stderr).toContain('HAC316_FAULT_INJECT');
  }, 60_000);

  it('still runs clean when the fault variable is set but empty', () => {
    const run = spawnSync(process.execPath, [verifier, '--rederive-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, VITEST: '', HAC316_FAULT_INJECT: '' },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('PASS');
  }, 60_000);
});
