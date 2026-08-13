/**
 * The packet-failure control.
 *
 * A green packet proves nothing unless a broken verifier produces a red one.
 * Without this file, every other test in this experiment is consistent with a
 * verifier that reports `PASS` unconditionally — including the tests that check
 * the verifier, since they would be checking the same broken thing.
 *
 * So each test here deliberately breaks the verifier and asserts the gate goes
 * red. Three different breakages, because they fail in three different places:
 *
 *   invert-composition        the verdict is negated after a genuine re-read
 *   stub-reread               the re-read is replaced by a canned answer
 *   tamper-recorded-decision  a recorded decision is edited before re-derivation
 *
 * Each is paired with the same command run clean, so a test that passed because
 * the command is broken *all* the time would fail here.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SCAN } from '../bin/verify-packet.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');

const run = (mode, fault) =>
  spawnSync(process.execPath, [verifier, mode], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(fault === undefined ? {} : { HAC316_FAULT_INJECT: fault }), VITEST: '' },
  });

describe('a broken verifier cannot produce a green experiment', () => {
  it('passes the composition self-check when the verifier is intact', () => {
    const clean = run('--selfcheck-composition');
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('A and B  140 >  130  BREACH');
    expect(clean.stdout.trim().endsWith('PASS')).toBe(true);
  }, 60_000);

  it('fails the composition self-check when the composition verdict is inverted', () => {
    const broken = run('--selfcheck-composition', 'invert-composition');
    expect(broken.status).not.toBe(0);
    expect(broken.stdout).toContain('FAIL');
    // The breach must be the thing that disappeared, not merely some error.
    expect(broken.stdout).toContain('A and B  140 <= 130  HOLDS');
  }, 60_000);

  it('fails the composition self-check when the re-read is stubbed out', () => {
    const broken = run('--selfcheck-composition', 'stub-reread');
    expect(broken.status).not.toBe(0);
    expect(broken.stderr).toContain('did not come from an independent re-read');
  }, 60_000);

  it('re-derives every decision when the record is intact', () => {
    const clean = run('--rederive-only');
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('2/2 treatment + 2/2 perturbation');
    expect(clean.stdout).toContain('PASS');
  }, 60_000);

  it('fails re-derivation when a recorded decision is tampered with', () => {
    const broken = run('--rederive-only', 'tamper-recorded-decision');
    expect(broken.status).not.toBe(0);
    expect(broken.stdout).toContain('FAIL');
    expect(broken.stderr).toMatch(/recorded ALLOW_PARALLEL.*rederived/s);
  }, 60_000);

  it('still catches every prohibited token despite assembling its patterns from fragments', () => {
    // The scanner lives inside the tree it scans, so it builds its patterns
    // rather than spelling them out. That is only acceptable if the compiled
    // patterns are still the ones the requirements name — which is what this
    // asserts, token by token, against strings that must be caught.
    // The samples are assembled for the same reason the patterns are: this file
    // is inside the scanned tree, so writing the tokens out here would make the
    // repository-wide prohibition scans match the test that checks them.
    const j = (...parts) => parts.join('');
    const mustCatch = [
      [SCAN.capacityCap, [j('totalReservable: ', '6', '5'), j('cap ', '6', '5', ' per partition')]],
      [
        SCAN.backingStore,
        [j('re', 'dis', '://localhost'), j('fire', 'store'), j('Memory', 'Store'), j('span', 'ner'), j('data', 'store'), j('distri', 'buted', '-store')],
      ],
      [
        SCAN.invariantsOff,
        [j('dis', 'able_', 'invar', 'iant'), j('dis', 'able ', 'invar', 'iant'), j('skip', 'Invariant'), j('INVARIANT', '_DISABLED'), j('bypass', 'Invariant')],
      ],
      [
        SCAN.falsifiedTopology,
        [j('AGENT', '_TO_', 'ANYWHERE'), j('CONTENT', '_AUTHZ'), j('ag', 'ent-', 'gate', 'way'), j('Ag', 'ent ', 'Gate', 'way')],
      ],
      [SCAN.vendoredSwarm, [j('ai-', 'swarm'), j('spec-', 'writer'), j('swarm', '/templates')]],
      [
        SCAN.manufacturedTiming,
        [j('sle', 'ep', '(2)'), 'setTimeout(fn, 1500)', j('bar', 'rier'), j('await ', 'delay'), j('time.', 'sle', 'ep')],
      ],
    ];
    for (const [pattern, samples] of mustCatch) {
      for (const sample of samples) {
        expect(pattern.test(sample), `${pattern} missed ${sample}`).toBe(true);
      }
    }

    // And does not fire on the near-misses the literal greps also tolerate.
    expect(SCAN.capacityCap.test('b6dca50765b7')).toBe(false);
    expect(SCAN.capacityCap.test('services 165 units')).toBe(false);
    expect(SCAN.manufacturedTiming.test('setTimeout(fn, 0)')).toBe(false);
  });

  it('fails the counterfactual gate when the verifier is broken', () => {
    const clean = run('--counterfactual');
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('attribution   OK');

    const broken = run('--counterfactual', 'invert-composition');
    expect(broken.status).not.toBe(0);
    expect(broken.stdout).toContain('attribution   FAILED');
  }, 60_000);
});
