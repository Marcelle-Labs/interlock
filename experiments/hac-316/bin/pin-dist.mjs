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
 * uncommitted source names a state nobody can return to.
 *
 * And it refuses to pin a `dist/` that is **not the build of the source it is
 * pinning alongside**. That second refusal is not covered by the first, and the
 * gap is specific: `git status` cannot see `dist/`, because `dist/` is
 * gitignored. A tree with a hand-edited `dist/proxy/identity.js` is clean as far
 * as git is concerned, and an earlier version of this script would have recorded
 * that edit as the canonical build — the pin would have blessed exactly the
 * tampering it exists to catch. So the check cannot be a git check. It is a
 * rebuild: `tsc` is run over the committed source, and if any compiled byte
 * moved, the `dist/` that was about to be pinned was not the build of that
 * source, and this refuses.
 *
 * `tsc` overwrites its outputs unconditionally, so the rebuild also *undoes* the
 * edit. The refusal is therefore "you were about to pin something else; it has
 * been rebuilt, run this again" rather than a dead end. Re-running immediately
 * afterwards succeeds, and that second run is pinning a build it made itself.
 *
 *   node experiments/hac-316/bin/pin-dist.mjs
 *
 * Writes only the `dist` block of `experiments/hac-316/evidence/pins.json`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECISION_PATH_MODULES,
  MODULE_ROLES,
  loadBearingSymbols,
  measureBuildProvenance,
} from '../src/dist-provenance.mjs';
import { isDirectInvocation } from '../src/entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const repoRoot = join(experimentDir, '..', '..');
const pinsPath = join(experimentDir, 'evidence', 'pins.json');

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

/**
 * The build command whose output is being pinned.
 *
 * Asserted against `package.json` rather than assumed: the rebuild below has to
 * be the same compilation the packet claims was used, and running a *different*
 * compiler to check a build would prove nothing about the one that produced it.
 * If `scripts.build` changes, this refuses rather than silently checking the
 * wrong thing.
 */
export const BUILD_SCRIPT = 'tsc -p tsconfig.build.json';

/**
 * Everything whose contents can change what `tsc` emits.
 *
 * Deliberately not "the whole working tree": a documentation edit in flight
 * elsewhere cannot alter the build, and refusing on it would push somebody to
 * pass a `--force` that then also covers the cases that matter. Every path that
 * *can* move the build is in here, and an uncommitted change to any of them is
 * a refusal.
 *
 * Note what is *not* here and cannot be: `dist/` itself. It is gitignored, so no
 * git-based check can see it — which is what the rebuild is for.
 */
export const BUILD_INPUTS = Object.freeze([
  'src/',
  'tsconfig.json',
  'tsconfig.build.json',
  'package.json',
  'pnpm-lock.yaml',
]);

/**
 * Which compiled files a rebuild moved.
 *
 * Non-empty means the `dist/` that was about to be pinned was not the build of
 * the committed source: it was stale, hand-edited, or made by another toolchain.
 * Separated out from the pinning so it can be exercised without rebuilding a
 * real tree.
 */
export function rebuiltDistDrift(before, after) {
  const moved = [];
  for (const path of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (before[path] !== after[path]) moved.push(path);
  }
  return moved;
}

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

  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  if (packageJson.scripts?.build !== BUILD_SCRIPT) {
    throw new Error(
      `package.json builds with "${packageJson.scripts?.build}" but this pins the output of ` +
        `"${BUILD_SCRIPT}"; checking a build with a different compiler proves nothing`,
    );
  }

  // Measured before the rebuild on purpose: this is the state of `dist/` as the
  // operator left it, which is the state under suspicion.
  const before = measureBuildProvenance({ repoRoot });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  const measured = measureBuildProvenance({ repoRoot });

  const moved = rebuiltDistDrift(before.built, measured.built);
  if (moved.length > 0) {
    throw new Error(
      `dist/ was not the build of the committed source: rebuilding moved ${moved.join(', ')}. ` +
        'git cannot see this because dist/ is gitignored, which is why it is rebuilt here. ' +
        'The rebuild has replaced those files; re-run to pin the build this script just made',
    );
  }
  if (measured.unboundModules.length > 0) {
    throw new Error(
      `these modules are reachable from the experiment but not bound in src/dist-provenance.mjs, ` +
        `so pinning would leave them substitutable: ${measured.unboundModules.join(', ')}`,
    );
  }

  const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
  pins.dist = {
    purpose:
      'the build verify-packet.mjs re-derives through. dist/ is gitignored, so without this ' +
      'block a stale or divergent build could silently redefine the decision function while ' +
      'the verifier reported it had re-derived against the real one.',
    builtBy: `pnpm run build (${BUILD_SCRIPT})`,
    typescript: packageJson.devDependencies.typescript,
    pinnedFromSha: git('rev-parse', 'HEAD').trim(),
    closure:
      'modules are the transitive import closure of every dist/ module imported by ' +
      'experiments/hac-316/{bin,src}, computed from the import graph rather than listed; ' +
      'symbols are every exported callable of every module in that closure. Neither set is ' +
      'maintained by hand, because both holes found in review were things nobody listed.',
    roles: MODULE_ROLES,
    naming: {
      built: 'sha256 of each compiled module in the closure, on disk; catches an edited dist/',
      source:
        'sha256 of the TypeScript each was compiled from; catches a correct build of stale source',
      loadedSymbols:
        'sha256 of Function.prototype.toString of every exported callable of the closure, as ' +
        'loaded into the verifier process, keyed "<module stem>#<export>"; catches a loader ' +
        'hook or a resolution that found a different copy, neither of which touches a file',
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
        `+ ${Object.keys(block.loadedSymbols).length} loaded symbols ` +
        `across ${DECISION_PATH_MODULES.length} modules ` +
        `(${Object.keys(loadBearingSymbols()).length} callables in the closure)\n` +
        `dist digest ${block.digest}\n`,
    );
  } catch (error) {
    process.stderr.write(`pin-dist: ${error.message}\n`);
    process.exitCode = 1;
  }
}
