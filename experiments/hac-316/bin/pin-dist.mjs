#!/usr/bin/env node
/**
 * Pin the build the verifier re-derives through.
 *
 * `dist/` is gitignored and therefore untracked, so nothing in the repository
 * recorded which build produced the `arbitrate` that `verify-packet.mjs`
 * imports. Every other external fact HAC-316 depends on is pinned by digest
 * before an arm runs; this closes the one that defines what "re-derived" means.
 *
 * ## Two refusals
 *
 * It refuses to pin from a **dirty source tree**, because a pin taken from
 * uncommitted source names a state nobody can return to. And it refuses to pin
 * a `dist/` that is **not the build of the source it is pinning alongside** —
 * it rebuilds first and fails if the rebuild moved anything, so a stale `dist/`
 * cannot be blessed by running this script.
 *
 *   pnpm run build && node experiments/hac-316/bin/pin-dist.mjs
 *
 * Writes only the `dist` block of `experiments/hac-316/evidence/pins.json`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { arbitrate } from '../../../dist/broker/pairing/arbitrate.js';
import { genesisRevision } from '../../../dist/broker/revision/revision.js';
import { intentDigest } from '../../../dist/authorization/intent.js';
import { asCanonical } from '../../../dist/target/state.js';

import { measureBuildProvenance } from '../src/dist-provenance.mjs';
import { isDirectInvocation } from '../src/entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const pinsPath = join(experimentDir, 'evidence', 'pins.json');

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

/**
 * The functions whose *loaded* source text is pinned.
 *
 * Imported here exactly as the verifier imports them, so the pin is taken from
 * the same resolution the verifier will perform rather than from a path this
 * script decided to read.
 */
export const PINNED_SYMBOLS = { arbitrate, asCanonical, genesisRevision, intentDigest };

/**
 * Everything whose contents can change what `tsc` emits.
 *
 * Deliberately not "the whole working tree": a documentation edit in flight
 * elsewhere cannot alter the build, and refusing on it would push somebody to
 * pass a `--force` that then also covers the cases that matter. Every path that
 * *can* move the build is in here, and an uncommitted change to any of them is
 * a refusal.
 */
export const BUILD_INPUTS = Object.freeze([
  'src/',
  'tsconfig.json',
  'tsconfig.build.json',
  'package.json',
  'pnpm-lock.yaml',
]);

export function pinDist() {
  const dirty = git('status', '--porcelain')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(3))
    .filter((path) => BUILD_INPUTS.some((input) => path.startsWith(input)));
  if (dirty.length > 0) {
    throw new Error(
      `build inputs are uncommitted (${dirty.join(', ')}); a build pinned from uncommitted ` +
        'source names a state nobody can return to',
    );
  }

  const measured = measureBuildProvenance({ repoRoot, symbols: PINNED_SYMBOLS });

  const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
  pins.dist = {
    purpose:
      'the build verify-packet.mjs re-derives through. dist/ is gitignored, so without this ' +
      'block a stale or divergent build could silently redefine the decision function while ' +
      'the verifier reported it had re-derived against the real one.',
    builtBy: 'pnpm run build (tsc -p tsconfig.build.json)',
    typescript: JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies
      .typescript,
    pinnedFromSha: git('rev-parse', 'HEAD').trim(),
    naming: {
      built: 'sha256 of each compiled decision-path module on disk',
      source: 'sha256 of the TypeScript each was compiled from; catches a correct build of stale source',
      loadedSymbols:
        'sha256 of Function.prototype.toString of the functions actually imported into the ' +
        'verifier process; catches a resolution that found a different copy',
    },
    ...measured,
  };
  writeFileSync(pinsPath, `${JSON.stringify(pins, null, 2)}\n`);
  return pins.dist;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const block = pinDist();
    process.stdout.write(
      `pinned ${Object.keys(block.built).length} built + ${Object.keys(block.source).length} source ` +
        `+ ${Object.keys(block.loadedSymbols).length} loaded symbols\n` +
        `dist digest ${block.digest}\n`,
    );
  } catch (error) {
    process.stderr.write(`pin-dist: ${error.message}\n`);
    process.exitCode = 1;
  }
}
