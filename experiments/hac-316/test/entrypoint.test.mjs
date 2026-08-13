/**
 * The symlinked-checkout control.
 *
 * A verifier that silently does nothing is worse than one that fails, because
 * "exit 0, no output" is indistinguishable from "checked everything, satisfied".
 * That is exactly what the raw `fileURLToPath(import.meta.url) === argv[1]`
 * entrypoint test produced: Node realpaths the module URL and does not realpath
 * `argv[1]`, so reaching the file through a symlink skipped `main()` entirely.
 *
 * These tests reach a real verifier through a real symlink and assert it still
 * does its work — and, more importantly, that it can still go red through that
 * path. A gate that cannot fail when invoked through a link is not a gate.
 */
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { canonicalPath, isDirectInvocation } from '../src/entrypoint.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');

/** A directory holding `repo` -> the real checkout, so paths run through a link. */
function linkedCheckout() {
  const base = mkdtempSync(join(tmpdir(), 'hac316-link-'));
  const link = join(base, 'repo');
  symlinkSync(repoRoot, link, 'dir');
  return link;
}

const runThrough = (root, mode, env = {}) =>
  spawnSync(process.execPath, [join(root, 'experiments/hac-316/bin/verify-packet.mjs'), mode], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env, VITEST: '' },
  });

describe('an entrypoint reached through a symlink still runs', () => {
  it('produces the same work through a linked path as through the real one', () => {
    const linked = runThrough(linkedCheckout(), '--rederive-only');
    // Before the fix this was `status 0` with an empty stdout — the failure the
    // whole file exists for. The output is what proves work happened.
    expect(linked.stdout).toContain('decisions match recorded');
    expect(linked.stdout).toContain('PASS');
    expect(linked.status).toBe(0);

    const direct = runThrough(repoRoot, '--rederive-only');
    expect(linked.stdout).toBe(direct.stdout);
    expect(linked.status).toBe(direct.status);
  }, 60_000);

  it('can still go red through a linked path', () => {
    const broken = runThrough(linkedCheckout(), '--rederive-only', {
      HAC316_FAULT_INJECT: 'tamper-recorded-decision',
    });
    expect(broken.status).not.toBe(0);
    expect(broken.stdout).toContain('FAIL');
  }, 60_000);

  it('compares files on disk, not the strings that named them', () => {
    const linked = linkedCheckout();
    const real = join(repoRoot, 'experiments/hac-316/bin/verify-packet.mjs');
    const throughLink = join(linked, 'experiments/hac-316/bin/verify-packet.mjs');

    expect(throughLink).not.toBe(real);
    expect(canonicalPath(throughLink)).toBe(canonicalPath(real));

    const url = `file://${real}`;
    expect(isDirectInvocation(url, throughLink)).toBe(true);
    expect(isDirectInvocation(url, real)).toBe(true);
    expect(isDirectInvocation(url, join(repoRoot, 'experiments/hac-316/bin/run-arm.mjs'))).toBe(
      false,
    );
  });

  it('answers false rather than throwing when there is no launched script', () => {
    const url = `file://${join(repoRoot, 'experiments/hac-316/bin/verify-packet.mjs')}`;
    expect(isDirectInvocation(url, undefined)).toBe(false);
    expect(isDirectInvocation(url, '')).toBe(false);
    // A path that does not exist must not crash the check; it is simply not us.
    expect(isDirectInvocation(url, join(tmpdir(), 'hac316-absent-entrypoint.mjs'))).toBe(false);
    expect(canonicalPath(join(tmpdir(), 'hac316-absent-entrypoint.mjs'))).toBe(
      join(tmpdir(), 'hac316-absent-entrypoint.mjs'),
    );
  });
});
