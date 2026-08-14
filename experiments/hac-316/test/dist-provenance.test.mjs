/**
 * The build-provenance control.
 *
 * `verify-packet.mjs` claims it re-derives decisions through the *frozen*
 * `arbitrate`. `dist/` is gitignored, `git ls-files dist` is empty, and until
 * the pin existed nothing in the repository named the build the verifier calls.
 *
 * The pin has since been through adversarial review, which found two escapes and
 * reproduced both. Each has a test here that fails against the pin as it stood:
 *
 * - **E1** a hand-written module list missed `proxy/identity` and `http/json`,
 *   which pinned decision-path modules import. Editing `observeIdentity` on disk
 *   inverted what REQ-039 measures and the verifier still printed `PASS`.
 *   Covered by "the closure is computed, not listed" below — the old 15-entry
 *   list does not equal the closure of the import graph.
 * - **E2** `loadedSymbols` bound four functions out of the 44 the closure
 *   exports, so a loader hook could rewrite `verifyReceipt` — the admission gate
 *   — inside a *pinned file* with nothing on disk changed. Covered by "every
 *   exported callable of the closure is bound" and by the narrowing test: a
 *   caller handing in four symbols no longer decides the coverage.
 *
 * The rest check what they always checked: that the measurement really reads the
 * files on disk, that the comparison can fail, and that the verifier actually
 * refuses to re-derive through an unpinned build.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { arbitrate } from '../../../dist/broker/pairing/arbitrate.js';
import { BUILD_SCRIPT, rebuiltDistDrift } from '../bin/pin-dist.mjs';
import {
  DECISION_PATH_MODULES,
  EXPERIMENT_ENTRY_DIRS,
  MODULE_ROLES,
  PIN_BINDING_FILE,
  computeDistClosure,
  digestOfMap,
  loadBearingSymbols,
  measureBuildProvenance,
  nonEmptyClosureProblems,
  verifyDistProvenance,
} from '../src/dist-provenance.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(experimentDir, '..', '..');
const verifier = join(experimentDir, 'bin', 'verify-packet.mjs');

const pins = JSON.parse(readFileSync(join(experimentDir, 'evidence', 'pins.json'), 'utf8'));
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Everything `experiments/hac-316/{bin,src}` imports directly out of `dist/`,
 * excluding the pin's own binding file — its imports bind the closure rather
 * than use it.
 */
const directDistImports = () => {
  const stems = new Set();
  for (const dir of EXPERIMENT_ENTRY_DIRS) {
    for (const entry of readdirSync(join(repoRoot, dir))) {
      if (!entry.endsWith('.mjs') || entry === PIN_BINDING_FILE) continue;
      const text = readFileSync(join(repoRoot, dir, entry), 'utf8');
      for (const match of text.matchAll(/from\s*'[^']*\/dist\/([^']+)\.js'/g)) stems.add(match[1]);
    }
  }
  return stems;
};

/**
 * A fabricated import graph, so the closure walk can be exercised on a shape
 * that does not exist in the tree without writing to the tree.
 */
const fabricatedTree = ({ extraImport }) => ({
  readDir: () => ['entry.mjs'],
  readFile: (path) => {
    const at = path.replaceAll('\\', '/');
    if (at.endsWith('/entry.mjs')) {
      return Buffer.from("import { arbitrate } from '../../../dist/broker/pairing/arbitrate.js';");
    }
    if (at.endsWith('dist/broker/pairing/arbitrate.js')) {
      return Buffer.from(extraImport ? "import '../../config.js';\n" : '\n');
    }
    return Buffer.from(`stub:${at}`);
  },
});

describe('the build the verifier re-derives through is pinned', () => {
  it('pins the closure, and the pin matches what is on disk', () => {
    const measured = measureBuildProvenance({ repoRoot });
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
    const measured = measureBuildProvenance({ repoRoot });
    for (const stem of DECISION_PATH_MODULES) {
      expect(measured.built[`dist/${stem}.js`]).toBe(
        sha256Hex(readFileSync(join(repoRoot, 'dist', `${stem}.js`))),
      );
      expect(measured.source[`src/${stem}.ts`]).toBe(
        sha256Hex(readFileSync(join(repoRoot, 'src', `${stem}.ts`))),
      );
    }
    // And the loaded function, not a file that claims to define it.
    expect(measured.loadedSymbols['broker/pairing/arbitrate#arbitrate']).toBe(
      sha256Hex(String(arbitrate)),
    );
  });

  // -- E1: the module set -------------------------------------------------

  it('pins the closure of the import graph, not a list somebody maintains', () => {
    // The list and the graph have to agree. Against the pre-review list of 15
    // this fails, because the graph reaches 17.
    expect(computeDistClosure({ repoRoot })).toEqual([...DECISION_PATH_MODULES]);
  });

  it('reaches modules no experiment file imports directly', () => {
    const direct = directDistImports();
    // The exact two E1 escaped through: imported by pinned decision-path
    // modules, imported by nothing in the experiment, unpinned until now.
    for (const stem of ['proxy/identity', 'http/json']) {
      expect(direct.has(stem)).toBe(false);
      expect(DECISION_PATH_MODULES).toContain(stem);
      expect(pins.dist.built).toHaveProperty(`dist/${stem}.js`);
      expect(pins.dist.source).toHaveProperty(`src/${stem}.ts`);
    }
    // `observeIdentity` is the function whose edit produced a byte-identical PASS.
    expect(pins.dist.loadedSymbols).toHaveProperty('proxy/identity#observeIdentity');
  });

  it('turns a future import that escapes the static binding red', () => {
    const clean = fabricatedTree({ extraImport: false });
    expect(computeDistClosure({ repoRoot, ...clean })).toEqual(['broker/pairing/arbitrate']);

    // A pinned module gains an import of a module nobody bound. The graph walk
    // reaches it; the static namespace list in dist-provenance.mjs does not.
    const escaped = fabricatedTree({ extraImport: true });
    expect(computeDistClosure({ repoRoot, ...escaped })).toEqual([
      'broker/pairing/arbitrate',
      'config',
    ]);

    const measured = measureBuildProvenance({ repoRoot, ...escaped });
    expect(measured.unboundModules).toEqual(['config']);
    // Compared against itself, so the only disagreement possible is the escape.
    expect(verifyDistProvenance(measured, measured)).toEqual([
      expect.stringContaining('dist/config.js is imported by a pinned module but is not bound'),
    ]);
    // And the real tree has no escape.
    expect(measureBuildProvenance({ repoRoot }).unboundModules).toEqual([]);
  });

  it('gives every module in the closure a recorded reason for being there', () => {
    expect(Object.keys(MODULE_ROLES).sort()).toEqual([...DECISION_PATH_MODULES]);
    for (const role of Object.values(MODULE_ROLES)) {
      expect(role).toMatch(
        /^(identity|receipt admission|arbitration|target execution|observation) — /,
      );
    }
    expect(pins.dist.roles).toEqual(MODULE_ROLES);
  });

  // -- E2: the symbol set -------------------------------------------------

  it('binds every exported callable of every module in the closure', async () => {
    const expected = new Set();
    for (const stem of DECISION_PATH_MODULES) {
      const namespace = await import(join(repoRoot, 'dist', `${stem}.js`));
      for (const [name, value] of Object.entries(namespace)) {
        if (typeof value === 'function') expected.add(`${stem}#${name}`);
      }
    }
    expect(new Set(Object.keys(loadBearingSymbols()))).toEqual(expected);
    // The pin is not narrower than the code.
    expect(new Set(Object.keys(pins.dist.loadedSymbols))).toEqual(expected);

    // The admission gate, in a file that was pinned while the function was not.
    expect(expected.has('authorization/receipt#verifyReceipt')).toBe(true);
    expect(pins.dist.loadedSymbols).toHaveProperty('authorization/receipt#verifyReceipt');
    // Classes count: `toString` on a class carries every method with it.
    expect(pins.dist.loadedSymbols).toHaveProperty('target/service#ProtectedTarget');
  });

  it('does not let a caller narrow what gets measured', () => {
    // Exactly the shape of E2: the verifier handed in the four symbols it
    // happened to import, and the measurement treated that as the coverage.
    const narrowed = measureBuildProvenance({ repoRoot, symbols: { arbitrate } });
    expect(Object.keys(narrowed.loadedSymbols)).toHaveLength(
      Object.keys(loadBearingSymbols()).length,
    );
    expect(narrowed.loadedSymbols).toHaveProperty('authorization/receipt#verifyReceipt');

    // A substitution of a bound name still lands, which is what controls need.
    const substituted = measureBuildProvenance({
      repoRoot,
      symbols: { 'authorization/receipt#verifyReceipt': () => true },
    });
    expect(substituted.loadedSymbols['authorization/receipt#verifyReceipt']).not.toBe(
      narrowed.loadedSymbols['authorization/receipt#verifyReceipt'],
    );
  });

  // -- the comparison itself ----------------------------------------------

  it('reports a divergent build, a stale build, and a swapped function', () => {
    const real = measureBuildProvenance({ repoRoot });

    const redigest = (measured) => ({
      ...measured,
      digest: digestOfMap({ ...measured.built, ...measured.source }),
    });

    // Divergent: dist/ edited, src/ untouched. Now including the module E1 used.
    const divergent = redigest({
      ...real,
      built: { ...real.built, 'dist/proxy/identity.js': sha256Hex('edited') },
    });
    const divergentProblems = verifyDistProvenance(real, divergent);
    expect(divergentProblems.join(' ')).toContain('dist/proxy/identity.js');
    expect(divergentProblems.join(' ')).toContain('dist digest');

    // Stale: a correct build of source that has since moved.
    const stale = redigest({
      ...real,
      source: { ...real.source, 'src/broker/pairing/arbitrate.ts': sha256Hex('moved on') },
    });
    expect(verifyDistProvenance(real, stale).join(' ')).toContain(
      'src/broker/pairing/arbitrate.ts',
    );

    // Swapped: the files are right and the loaded object is not. This is the
    // load-time substitution class, on the symbol E2 went through.
    const swapped = {
      ...real,
      loadedSymbols: {
        ...real.loadedSymbols,
        'authorization/receipt#verifyReceipt': sha256Hex('function verifyReceipt(){return true}'),
      },
    };
    const swappedProblems = verifyDistProvenance(real, swapped);
    expect(swappedProblems.join(' ')).toContain('loadedSymbols: authorization/receipt#verifyReceipt');
    // Nothing on disk moved, so the file layers stay silent — which is exactly
    // why the third layer has to exist.
    expect(swappedProblems).toHaveLength(1);
  });

  it('refuses an empty closure, which compares clean against everything', () => {
    // The hole the layers could not see. `verifyDistProvenance` walks the union
    // of the pinned and measured keys of each group; when both sides of a group
    // are empty that union is empty and the group reports nothing. The digest
    // does not save it either — the digest of an empty map is a fixed value, so
    // an empty pin and an empty measurement agree on that too. And
    // `loadedSymbols` is deliberately outside the digest, so an empty symbol set
    // was clean on every layer at once.
    const real = measureBuildProvenance({ repoRoot });
    const empty = { built: {}, source: {}, loadedSymbols: {}, digest: digestOfMap({}) };

    const wouldHaveCompared = ['built', 'source', 'loadedSymbols'].every(
      (group) => new Set([...Object.keys(empty[group]), ...Object.keys(empty[group])]).size === 0,
    );
    expect(wouldHaveCompared).toBe(true);
    expect(empty.digest).toBe(digestOfMap({}));

    const problems = verifyDistProvenance(empty, { ...empty, unboundModules: [] });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('module closure is empty');
    expect(problems.join(' ')).toContain('load-bearing symbol set is empty');

    // One empty side is caught too, and named on the side it is empty on.
    expect(
      verifyDistProvenance({ ...real, loadedSymbols: {} }, real).join(' '),
    ).toContain('pins.json: the load-bearing symbol set is empty');
    expect(
      verifyDistProvenance(real, { ...real, loadedSymbols: {} }).join(' '),
    ).toContain('measured: the load-bearing symbol set is empty');

    // And the predicate directly, both sets and both directions.
    expect(nonEmptyClosureProblems({ modules: ['a'], symbols: ['b'], subject: 'x' })).toEqual([]);
    expect(nonEmptyClosureProblems({ modules: [], symbols: ['b'], subject: 'x' })).toHaveLength(1);
    expect(nonEmptyClosureProblems({ modules: ['a'], symbols: [], subject: 'x' })).toHaveLength(1);
    expect(nonEmptyClosureProblems({ subject: 'x' })).toHaveLength(2);
  });

  it('measures something, or throws rather than returning an empty measurement', () => {
    const measured = measureBuildProvenance({ repoRoot });
    expect(DECISION_PATH_MODULES.length).toBeGreaterThan(0);
    expect(Object.keys(measured.loadedSymbols).length).toBeGreaterThan(0);
    expect(Object.keys(measured.built).length).toBe(DECISION_PATH_MODULES.length);
  });

  it('refuses to call an unpinned build re-derivation', () => {
    expect(verifyDistProvenance(undefined, measureBuildProvenance({ repoRoot }))).toEqual([
      expect.stringContaining('no dist block'),
    ]);
  });

  // -- the pin cannot bless a dist/ git cannot see ------------------------

  it('refuses to pin a dist/ a rebuild would move', () => {
    // pin-dist's clean-tree check is a git check, and git cannot see dist/ —
    // it is gitignored. So the check is a rebuild-and-compare instead.
    expect(rebuiltDistDrift({ 'dist/a.js': 'x' }, { 'dist/a.js': 'x' })).toEqual([]);
    expect(rebuiltDistDrift({ 'dist/a.js': 'edited' }, { 'dist/a.js': 'x' })).toEqual([
      'dist/a.js',
    ]);
    expect(rebuiltDistDrift({}, { 'dist/new.js': 'x' })).toEqual(['dist/new.js']);
  });

  it('rebuilds with the command the packet says built it', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts.build).toBe(BUILD_SCRIPT);
    expect(pins.dist.builtBy).toContain(BUILD_SCRIPT);
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
