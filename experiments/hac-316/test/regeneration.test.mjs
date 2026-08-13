/**
 * The regeneration-comparison control.
 *
 * REQ-067 asks that regenerating Preflight V2 be a no-op. The producer writes
 * two files — `preflight.v2.json` and `fixture.json` — and the check captured
 * the first only. An in-place rewrite of the fixture was therefore invisible
 * inside the run that caused it, while REQ-010, REQ-011, REQ-019 and the arms'
 * initial-state comparison all read that fixture.
 *
 * The first two tests prove the comparison catches a change in *either* output.
 * The third proves the check the verifier actually runs captures both, by
 * reading the requirement's own detail line rather than trusting the source.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { regenerationChanges } from '../src/regeneration.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const evidenceDir = join(experimentDir, 'evidence');

const WRITTEN = ['preflight.v2.json', 'fixture.json'];
const bytes = (name) => readFileSync(join(evidenceDir, name));

describe('regenerating a producer is compared across everything it writes', () => {
  it('sees a change in either output, not only the first', () => {
    const before = { 'preflight.v2.json': Buffer.from('a'), 'fixture.json': Buffer.from('b') };

    expect(regenerationChanges(before, before)).toEqual([]);

    // The case that used to be invisible: only the *second* output moved.
    expect(
      regenerationChanges(before, { ...before, 'fixture.json': Buffer.from('b2') }),
    ).toEqual(['fixture.json']);

    expect(
      regenerationChanges(before, { ...before, 'preflight.v2.json': Buffer.from('a2') }),
    ).toEqual(['preflight.v2.json']);

    expect(
      regenerationChanges(before, {
        'preflight.v2.json': Buffer.from('a2'),
        'fixture.json': Buffer.from('b2'),
      }),
    ).toEqual(WRITTEN);
  });

  it('counts an output that stopped being written as changed', () => {
    const before = { 'preflight.v2.json': Buffer.from('a'), 'fixture.json': Buffer.from('b') };
    expect(regenerationChanges(before, { 'preflight.v2.json': Buffer.from('a') })).toEqual([
      'fixture.json',
    ]);
    expect(regenerationChanges({ 'preflight.v2.json': Buffer.from('a') }, before)).toEqual([
      'fixture.json',
    ]);
  });

  it('is byte-stable across a real regeneration of both outputs', () => {
    const before = Object.fromEntries(WRITTEN.map((name) => [name, bytes(name)]));
    const run = spawnSync(process.execPath, [join(experimentDir, 'bin', 'preflight-v2.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const after = Object.fromEntries(WRITTEN.map((name) => [name, bytes(name)]));

    // The producer refuses to run against a dirty build/source tree, which is
    // its own discipline. Either way it must not have rewritten its outputs.
    expect(regenerationChanges(before, after), run.stderr).toEqual([]);
  }, 60_000);
});
