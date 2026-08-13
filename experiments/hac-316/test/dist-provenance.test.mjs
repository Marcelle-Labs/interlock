/**
 * The build-provenance control.
 *
 * `verify-packet.mjs` claims it re-derives decisions through the *frozen*
 * `arbitrate`. `dist/` is gitignored, `git ls-files dist` is empty, and until
 * now `pins.json` never mentioned it — so the claim rested on a build nothing
 * in the repository named. A stale build (correct compile of source that has
 * since moved) or a divergent one (hand-edited, or produced by a different
 * compiler) would have redefined the decision function while the verifier
 * reported it had re-derived against the real one.
 *
 * These tests check three things: that the measurement really reads the files
 * on disk, that the comparison can fail, and that the verifier actually refuses
 * to re-derive through an unpinned build.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { intentDigest } from '../../../dist/authorization/intent.js';
import { arbitrate } from '../../../dist/broker/pairing/arbitrate.js';
import { genesisRevision } from '../../../dist/broker/revision/revision.js';
import { asCanonical } from '../../../dist/target/state.js';
import {
  DECISION_PATH_MODULES,
  digestOfMap,
  measureBuildProvenance,
  verifyDistProvenance,
} from '../src/dist-provenance.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');

const pins = JSON.parse(readFileSync(join(experimentDir, 'evidence', 'pins.json'), 'utf8'));
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

/** Imported exactly as `pin-dist.mjs` imports them, so the pin is comparable. */
const symbols = { arbitrate, asCanonical, genesisRevision, intentDigest };

describe('the build the verifier re-derives through is pinned', () => {
  it('pins the decision path, and the pin matches what is on disk', () => {
    const measured = measureBuildProvenance({ repoRoot, symbols });
    // On-disk groups only, here. Vite's SSR transform rewrites cross-module
    // references while evaluating, so `Function.prototype.toString` under
    // vitest is not the text a plain `node` process sees — which is why the
    // loaded-symbol binding is checked in the spawned verifier below, in the
    // process that actually re-derives.
    expect(verifyDistProvenance(pins.dist, measured, { groups: ['built', 'source'] })).toEqual([]);
    expect(Object.keys(pins.dist.built)).toHaveLength(DECISION_PATH_MODULES.length);
    expect(pins.dist.built).toHaveProperty('dist/broker/pairing/arbitrate.js');
    expect(pins.dist.source).toHaveProperty('src/broker/pairing/arbitrate.ts');
  });

  it('measures the real bytes rather than restating the pin', () => {
    // Computed here, independently of the module under test. If the measurement
    // were reading pins.json instead of the tree, this disagrees.
    const measured = measureBuildProvenance({ repoRoot, symbols });
    for (const stem of DECISION_PATH_MODULES) {
      expect(measured.built[`dist/${stem}.js`]).toBe(
        sha256Hex(readFileSync(join(repoRoot, 'dist', `${stem}.js`))),
      );
      expect(measured.source[`src/${stem}.ts`]).toBe(
        sha256Hex(readFileSync(join(repoRoot, 'src', `${stem}.ts`))),
      );
    }
    // And the loaded function, not a file that claims to define it.
    expect(measured.loadedSymbols.arbitrate).toBe(sha256Hex(String(arbitrate)));
  });

  it('reports a divergent build, a stale build, and a swapped function', () => {
    const real = measureBuildProvenance({ repoRoot, symbols });

    const redigest = (measured) => ({
      ...measured,
      digest: digestOfMap({ ...measured.built, ...measured.source }),
    });

    // Divergent: dist/ edited, src/ untouched.
    const divergent = redigest({
      ...real,
      built: { ...real.built, 'dist/broker/pairing/arbitrate.js': sha256Hex('edited') },
    });
    const divergentProblems = verifyDistProvenance(real, divergent);
    expect(divergentProblems.join(' ')).toContain('dist/broker/pairing/arbitrate.js');
    expect(divergentProblems.join(' ')).toContain('dist digest');

    // Stale: a correct build of source that has since moved.
    const stale = redigest({
      ...real,
      source: { ...real.source, 'src/broker/pairing/arbitrate.ts': sha256Hex('moved on') },
    });
    expect(verifyDistProvenance(real, stale).join(' ')).toContain(
      'src/broker/pairing/arbitrate.ts',
    );

    // Swapped: the files are right and the loaded object is not.
    const swapped = {
      ...real,
      loadedSymbols: { ...real.loadedSymbols, arbitrate: sha256Hex('function arbitrate(){}') },
    };
    expect(verifyDistProvenance(real, swapped).join(' ')).toContain('loadedSymbols: arbitrate');
  });

  it('refuses to call an unpinned build re-derivation', () => {
    expect(verifyDistProvenance(undefined, measureBuildProvenance({ repoRoot, symbols }))).toEqual([
      expect.stringContaining('no dist block'),
    ]);
  });

  it('names the pinned build in the re-derivation it performs', () => {
    const run = spawnSync(process.execPath, [verifier, '--rederive-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, VITEST: '' },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`pinned dist ${pins.dist.digest}`);
  }, 60_000);
});
