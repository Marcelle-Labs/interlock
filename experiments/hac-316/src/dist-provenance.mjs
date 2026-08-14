/**
 * What `dist/` actually contained when a decision was re-derived.
 *
 * ## The hole this closes
 *
 * The verifier's central claim is that it does not re-read the packet, it
 * **re-derives** — it imports the real `arbitrate` and runs it again over the
 * inputs the proxies were handed. That claim rests entirely on `dist/` being the
 * build of the frozen source. And `dist/` is gitignored: `git ls-files dist` is
 * empty, so nothing in the repository recorded which build produced the function
 * the verifier calls. Every other external fact this experiment depends on is
 * pinned by digest before an arm runs; the one artifact that *defines what
 * re-derivation means* was not.
 *
 * ## The two holes the first version of this file still left open
 *
 * The first pin bound a hand-written list of 15 modules and four function
 * bodies. Adversarial review found, and reproduced, two independent escapes.
 *
 * **Unpinned transitive dependencies.** The hand-written list named the modules
 * somebody thought of, not the modules a decision travels through. `dist/`
 * holds 22 modules; seven were unpinned, and two of those were imported *by
 * pinned modules on the decision path*: `proxy/identity`, which supplies the
 * caller identity the target's admission gate enforces, and `http/json`, which
 * reads the request body both servers decide about. Editing `observeIdentity`
 * in `dist/proxy/identity.js` so it always returned the receipt's own caller
 * inverted the exact behaviour REQ-039's probe measures, and the verifier
 * produced byte-identical `PASS` output at exit 0.
 *
 * **Unpinned symbols inside pinned files.** `loadedSymbols` bound four
 * functions. `verifyReceipt` — the whole admission gate — lives in
 * `dist/authorization/receipt.js`, which *was* a pinned file, but was not a
 * pinned symbol. A Node loader hook that neutered the caller binding inside
 * `verifyReceipt` passed `--rederive-only` and `--counterfactual` with nothing
 * on disk changed. The same hook applied to `arbitrate`, a pinned symbol,
 * correctly reddened. So the guard existed and did not bite.
 *
 * Both escapes have the same shape: the pin was a list somebody maintained, and
 * the thing that got through was the thing nobody thought to add. So neither
 * list is maintained by hand any more.
 *
 * ## What is bound, and what each layer catches
 *
 * `built`   sha256 of every compiled module in the **transitive import closure**
 *           of what the experiment loads out of `dist/` — computed from the
 *           import graph (see `computeDistClosure`), not enumerated. Catches a
 *           `dist/` edited on disk, or produced by a different toolchain. This
 *           is what E1's `observeIdentity` edit now trips.
 *
 * `source`  sha256 of the TypeScript each was compiled from. Catches a `dist/`
 *           that is a correct build of the *wrong* source — the stale case,
 *           where `src/` moved on and nobody rebuilt. `built` alone cannot see
 *           this, because a stale build is internally consistent.
 *
 * `loadedSymbols`
 *           sha256 of `Function.prototype.toString` of **every exported callable
 *           of every module in the closure** — 44 functions and classes, derived
 *           from the module namespace objects rather than named. The other two
 *           layers are claims about files on disk; this is a claim about the
 *           objects that will actually be called. A loader hook, a patched
 *           module cache, or a resolution that found a different copy all change
 *           this and leave every file untouched. This is what E2's `verifyReceipt`
 *           hook now trips.
 *
 * The layers are not redundant. `built` cannot see a stale build; `source`
 * cannot see a substitution that never touches the tree; `loadedSymbols` cannot
 * see a file that is on disk but not imported in this process. Each covers the
 * others' blind spot, which is why all three survive.
 *
 * ## Why "every exported callable" rather than a chosen few
 *
 * The five behaviours a verdict in this experiment depends on are identity,
 * receipt admission, arbitration, target execution, and independent observation
 * (`MODULE_ROLES` below records which module carries which, and why). Trying to
 * name the *functions* inside those modules is how E2 happened: `verifyReceipt`
 * sat one export away from `signReceipt`, and only one of them was a candidate
 * anybody wrote down. A module that is on the decision path has no exported
 * callable that is safe to leave substitutable — a helper that formats a digest
 * is as load-bearing as the gate that compares it, because rewriting either one
 * changes the verdict. So the rule is mechanical: if the module is in the
 * closure, every function and class it exports is bound.
 *
 * The pins are taken by `bin/pin-dist.mjs`, which refuses to run against a dirty
 * source tree, and — because its clean-tree check cannot see a gitignored
 * `dist/` — also rebuilds and refuses if the rebuild moved anything.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

import * as authorizationCanonical from '../../../dist/authorization/canonical.js';
import * as authorizationIntent from '../../../dist/authorization/intent.js';
import * as authorizationReceipt from '../../../dist/authorization/receipt.js';
import * as brokerBypassGuard from '../../../dist/broker/bypass/guard.js';
import * as brokerIdempotencyLedger from '../../../dist/broker/idempotency/ledger.js';
import * as brokerPairingArbitrate from '../../../dist/broker/pairing/arbitrate.js';
import * as brokerPairingStore from '../../../dist/broker/pairing/store.js';
import * as brokerRevisionRevision from '../../../dist/broker/revision/revision.js';
import * as correlation from '../../../dist/correlation.js';
import * as httpJson from '../../../dist/http/json.js';
import * as proxyHttp from '../../../dist/proxy/http.js';
import * as proxyIdentity from '../../../dist/proxy/identity.js';
import * as proxyService from '../../../dist/proxy/service.js';
import * as proxyTargetPort from '../../../dist/proxy/target-port.js';
import * as targetHttp from '../../../dist/target/http.js';
import * as targetService from '../../../dist/target/service.js';
import * as targetState from '../../../dist/target/state.js';

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

/**
 * The closure, bound as live module namespaces.
 *
 * Namespace imports rather than named ones on purpose: a named import is a list
 * that goes stale the moment somebody adds an export, and a stale list is
 * exactly how `verifyReceipt` escaped. `Object.entries` of a namespace object
 * enumerates whatever the module exports *now*.
 *
 * Resolved through the same relative specifiers `bin/verify-packet.mjs` and
 * `bin/run-arm.mjs` use, so what is measured is the module instance those files
 * hold — ESM caches by resolved URL, so these are the same objects, not copies.
 *
 * This list is a static import statement and therefore cannot itself be
 * computed. It is checked instead: `measureBuildProvenance` recomputes the
 * closure from the import graph on every measurement and reports any module the
 * graph reaches that is not bound here (`unboundModules`). A new import cannot
 * escape the pin silently — it either matches the pin or turns the packet red.
 */
const CLOSURE_NAMESPACES = Object.freeze({
  'authorization/canonical': authorizationCanonical,
  'authorization/intent': authorizationIntent,
  'authorization/receipt': authorizationReceipt,
  'broker/bypass/guard': brokerBypassGuard,
  'broker/idempotency/ledger': brokerIdempotencyLedger,
  'broker/pairing/arbitrate': brokerPairingArbitrate,
  'broker/pairing/store': brokerPairingStore,
  'broker/revision/revision': brokerRevisionRevision,
  correlation,
  'http/json': httpJson,
  'proxy/http': proxyHttp,
  'proxy/identity': proxyIdentity,
  'proxy/service': proxyService,
  'proxy/target-port': proxyTargetPort,
  'target/http': targetHttp,
  'target/service': targetService,
  'target/state': targetState,
});

/**
 * Why each module in the closure is load-bearing.
 *
 * The mandate is that the pin cover every function whose behaviour determines
 * identity, receipt admission, arbitration, target execution, or independent
 * observation. These are those five roles, assigned per module — the level at
 * which the judgement is actually made. Which *symbols* get bound is not a
 * judgement: it is every exported callable of every module listed here.
 *
 * A module can carry more than one role; the first is the one that puts it
 * beyond argument.
 */
export const MODULE_ROLES = Object.freeze({
  'authorization/canonical':
    'observation — the canonicalisation and digest every other binding is expressed in. ' +
    'A canonicalDigest that collapses inputs makes intent digests, receipt signatures and ' +
    'revision chains all agree with anything.',
  'authorization/intent':
    'observation — the identity of the operation both sides claim to be acting on. ' +
    'A different intentDigest makes two different requests the same request.',
  'authorization/receipt':
    'receipt admission — verifyReceipt is the admission gate itself; signReceipt mints what ' +
    'it checks, readSignedReceipt decides what counts as a receipt at all, and the key ' +
    'readers decide which signatures it will accept. This is the module E2 escaped through.',
  'broker/bypass/guard':
    'receipt admission — admit is the second half of the gate: whether a request that ' +
    'carries no valid pairing is refused, and whether a replayed one is executed twice.',
  'broker/idempotency/ledger':
    'target execution — the claim that decides whether a second arrival of the same ' +
    'operation executes. A ledger that always grants turns one mutation into two.',
  'broker/pairing/arbitrate':
    'arbitration — the decision function the verifier re-derives through. The one thing ' +
    'that was pinned before, and still is.',
  'broker/pairing/store':
    'arbitration — what arbitration sees as pending. Arbitrating correctly over a ' +
    'fabricated pending set is still the wrong verdict.',
  'broker/revision/revision':
    'target execution — the revision chain that orders executions against the state they ' +
    'were authorised for. A stale revision accepted as current is a lost-update.',
  correlation:
    'observation — the identifier that joins the proxy-side and target-side records of one ' +
    'request. Independent observation of two sides is only independent if they can be ' +
    'matched without trusting either.',
  'http/json':
    'observation — the read and write of every request and response body on both servers. ' +
    'A readJsonBody that returns something other than what arrived substitutes the input ' +
    'the gate decides about. One of the two modules E1 escaped through.',
  'proxy/http':
    'identity — the proxy request path: it observes the caller, routes the intent and ' +
    'shapes the tool result. Reached the caller identity before the decision did.',
  'proxy/identity':
    'identity — observeIdentity supplies the caller identity the target admission gate ' +
    'enforces, and is what REQ-039 probes. The other module E1 escaped through: rewriting ' +
    'it to return the receipt’s own caller inverted the measured behaviour and the ' +
    'verifier still printed PASS.',
  'proxy/service':
    'arbitration — InterlockProxy is the caller-side decision path that calls arbitrate ' +
    'and issues the receipt the target will admit on.',
  'proxy/target-port':
    'target execution — how the proxy actually reaches the target. A port that fabricates ' +
    'target responses makes execution unobservable.',
  'target/http':
    'receipt admission — decodes the receipt off the wire before the gate sees it. A ' +
    'decoder that returns a receipt nobody sent bypasses verifyReceipt without touching it.',
  'target/service':
    'target execution — ProtectedTarget is where admission is enforced and the protected ' +
    'mutation is applied.',
  'target/state':
    'target execution — the mutation, the invariant, and asCanonical, which is the state ' +
    'reading the global verifier compares arms against.',
});

/**
 * The modules the pin covers, as `dist/<stem>.js` / `src/<stem>.ts`.
 *
 * Derived from the bound namespaces, and validated against the import graph on
 * every measurement. Still called the decision path, because that is what the
 * closure of the decision path is.
 */
export const DECISION_PATH_MODULES = Object.freeze(Object.keys(CLOSURE_NAMESPACES).sort());

/**
 * Where the closure starts: the experiment code that imports out of `dist/`.
 *
 * `bin/` and `src/` only. `test/` is excluded deliberately — a test can import
 * whatever it likes without any of it reaching a packet, and letting tests widen
 * the pin would mean every new test invalidates the evidence.
 */
export const EXPERIMENT_ENTRY_DIRS = Object.freeze([
  'experiments/hac-316/bin',
  'experiments/hac-316/src',
]);

/**
 * This file, which the root scan skips.
 *
 * Its `dist/` imports exist to *bind* the closure, not to use it. Counting them
 * as roots would make the closure contain whatever this file already imports —
 * the computation would agree with the list by construction and could never
 * disagree with it, which is the one thing it is for.
 */
export const PIN_BINDING_FILE = 'dist-provenance.mjs';

/**
 * Import specifiers, as they appear in ESM source.
 *
 * Covers `import x from 's'`, `export … from 's'`, bare `import 's'` and
 * `import('s')`. Regex rather than a parser because the alternative is a
 * dependency, and the failure mode is safe in the direction that matters: a
 * specifier this misses that a real import reaches shows up as an unbound
 * module, and a specifier it invents shows up as a missing file. Both are loud.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

const specifiersIn = (text) => [...text.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);

/**
 * Compute the transitive closure of `dist/` modules the experiment loads.
 *
 * Roots are every `dist/<stem>.js` any `.mjs` under `EXPERIMENT_ENTRY_DIRS`
 * imports; the walk then follows the relative specifiers inside those compiled
 * modules until nothing new appears. Node builtins and bare specifiers are not
 * followed — they are not part of this build.
 *
 * This is the answer to E1. The previous list was written by hand and was
 * missing two modules that pinned modules imported. A list nobody maintains
 * cannot go stale.
 *
 * @returns sorted stems, e.g. `['authorization/canonical', …]`.
 */
export function computeDistClosure({
  repoRoot,
  readFile = readFileSync,
  readDir = readdirSync,
} = {}) {
  const roots = new Set();
  for (const dir of EXPERIMENT_ENTRY_DIRS) {
    for (const entry of readDir(join(repoRoot, dir))) {
      if (!entry.endsWith('.mjs') || entry === PIN_BINDING_FILE) continue;
      for (const specifier of specifiersIn(String(readFile(join(repoRoot, dir, entry))))) {
        const match = /(?:^|\/)dist\/(.+)\.js$/.exec(specifier);
        if (match !== null) roots.add(match[1]);
      }
    }
  }

  const reached = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const stem = pending.shift();
    if (reached.has(stem)) continue;
    reached.add(stem);
    const text = String(readFile(join(repoRoot, 'dist', `${stem}.js`)));
    for (const specifier of specifiersIn(text)) {
      if (!specifier.startsWith('.')) continue;
      pending.push(posix.normalize(posix.join(posix.dirname(stem), specifier)).replace(/\.js$/, ''));
    }
  }
  return [...reached].sort();
}

/**
 * Every exported callable of every module in the closure, keyed `stem#name`.
 *
 * Qualified keys because two modules may export the same name, and because an
 * unqualified `arbitrate` does not say which file it was supposed to come from
 * — which is the question when a resolution finds a different copy.
 *
 * Classes are included: `Function.prototype.toString` on a class returns its
 * whole body, so binding `ProtectedTarget` binds every method that enforces
 * admission on it.
 */
export function loadBearingSymbols(namespaces = CLOSURE_NAMESPACES) {
  const symbols = {};
  for (const stem of Object.keys(namespaces).sort()) {
    for (const name of Object.keys(namespaces[stem]).sort()) {
      const value = namespaces[stem][name];
      if (typeof value === 'function') symbols[`${stem}#${name}`] = value;
    }
  }
  return symbols;
}

/**
 * The two sets that must never be empty, checked as their own statement.
 *
 * ## Why emptiness is not caught by the comparison
 *
 * `verifyDistProvenance` walks the union of the pinned and measured keys of each
 * group. When *both* sides of a group are empty that union is empty, the loop
 * body never runs, and the group reports no problems — a clean comparison of
 * nothing against nothing. `digest` does not save it either: the digest of an
 * empty map is a fixed value, so an empty pin and an empty measurement agree on
 * that too. The one shape this pin exists to refuse — "nothing is bound, so
 * nothing can be substituted detectably" — was the one shape it could not see.
 *
 * `loadedSymbols` was the live case. It is deliberately outside `digest` (a
 * module loader legitimately rewrites function bodies, see `measureBuildProvenance`),
 * so a simultaneously-empty pinned and measured symbol set was clean on every
 * layer at once. A namespace enumeration that returned nothing — a build that
 * emitted empty modules, an import that resolved to a stub, a future refactor
 * that made `loadBearingSymbols` filter everything out — would have been
 * indistinguishable from a build whose symbols all matched.
 *
 * Emptiness is therefore asserted directly, in both places it can arise: at
 * measurement, where an empty set means the process bound nothing, and at
 * comparison, where an empty pin means the file on disk binds nothing.
 *
 * @returns the problems found; `[]` when both sets carry something.
 */
export function nonEmptyClosureProblems({ modules, symbols, subject }) {
  const problems = [];
  if ((modules?.length ?? 0) === 0) {
    problems.push(
      `${subject}: the module closure is empty. A pin over no modules binds nothing and ` +
        'compares clean against any build at all',
    );
  }
  if ((symbols?.length ?? 0) === 0) {
    problems.push(
      `${subject}: the load-bearing symbol set is empty. loadedSymbols is outside the file ` +
        'digest by design, so an empty one is clean on every layer at once and no substituted ' +
        'function could ever be detected',
    );
  }
  return problems;
}

/** Digest a `{path: digest}` map into one value, order-independently. */
export function digestOfMap(entries) {
  const canonical = Object.keys(entries)
    .sort()
    .map((key) => `${key} ${entries[key]}`)
    .join('');
  return sha256Hex(canonical);
}

/**
 * Measure `dist/`, `src/` and the loaded functions.
 *
 * `readFile` is injectable so the control suite can fabricate drift without
 * writing to the tree — mutating a real `dist/` file to prove a check works is
 * a race against every other test in the run.
 *
 * `symbols` overrides individual bindings *within* the load-bearing set, for the
 * same reason. Note what it cannot do: a name that is not load-bearing is
 * ignored rather than added, so no caller can narrow — or widen — the set that
 * gets measured. That set is fixed here, deliberately. E2 was a caller handing
 * in four symbols and the measurement believing that was the coverage.
 *
 * @param options.repoRoot repository root.
 * @param options.symbols  substitutions keyed `stem#name`, for controls.
 * @param options.readFile `(path) => Buffer`, defaults to reading from disk.
 * @param options.readDir  `(path) => string[]`, defaults to reading from disk.
 */
export function measureBuildProvenance({
  repoRoot,
  symbols = {},
  readFile = readFileSync,
  readDir = readdirSync,
}) {
  const built = {};
  const source = {};
  for (const stem of DECISION_PATH_MODULES) {
    const builtPath = `dist/${stem}.js`;
    const sourcePath = `src/${stem}.ts`;
    built[builtPath] = sha256Hex(readFile(join(repoRoot, builtPath)));
    source[sourcePath] = sha256Hex(readFile(join(repoRoot, sourcePath)));
  }

  const bound = loadBearingSymbols();
  for (const [name, value] of Object.entries(symbols)) {
    if (name in bound) bound[name] = value;
  }
  const loadedSymbols = {};
  for (const name of Object.keys(bound).sort()) {
    loadedSymbols[name] = sha256Hex(String(bound[name]));
  }

  // Before anything is returned, and as a throw rather than a problem: a
  // measurement that bound nothing is not a weak measurement, it is not one.
  // Returning it would let `verifyDistProvenance` compare it to an equally empty
  // pin and report agreement.
  const empty = nonEmptyClosureProblems({
    modules: DECISION_PATH_MODULES,
    symbols: Object.keys(loadedSymbols),
    subject: 'measured',
  });
  if (empty.length > 0) throw new Error(empty.join('; '));

  // The escape hatch check. `DECISION_PATH_MODULES` is a static import list and
  // cannot compute itself; the graph can. Anything the graph reaches that is not
  // bound above is a module a future import added and nobody pinned.
  const closure = computeDistClosure({ repoRoot, readFile, readDir });
  const unboundModules = closure.filter((stem) => !DECISION_PATH_MODULES.includes(stem));

  return {
    built,
    source,
    loadedSymbols,
    unboundModules,
    // Over the files only. `loadedSymbols` is deliberately outside the digest
    // because it is not a property of the tree: a module loader that rewrites
    // cross-module references while evaluating — vite's SSR transform does
    // exactly this, so every function body differs under vitest — would change
    // it without anything on disk moving. It stays a compared group (see
    // `COMPARABLE_GROUPS`), checked in the process that does the re-deriving.
    digest: digestOfMap({ ...built, ...source }),
  };
}

/** The three bindings, in the order a reader should think about them. */
export const COMPARABLE_GROUPS = Object.freeze(['built', 'source', 'loadedSymbols']);

/**
 * Compare a measurement to the pinned one, enumerating every disagreement.
 *
 * Returns problems rather than throwing on the first: a caller who has to fix a
 * stale build wants the whole list, and a single "dist digest mismatch" says
 * nothing about which file moved.
 */
export function verifyDistProvenance(pinned, measured, { groups = COMPARABLE_GROUPS } = {}) {
  const problems = [];
  if (pinned === undefined || pinned === null) {
    return [
      'pins.json carries no dist block, so the build the verifier re-derives through is ' +
        'unpinned; run experiments/hac-316/bin/pin-dist.mjs',
    ];
  }
  // The pinned side, before any comparison. An empty pin agrees with an empty
  // measurement, and the loop below cannot say so because it iterates the union
  // of their keys — which, for two empty sides, is empty.
  problems.push(
    ...nonEmptyClosureProblems({
      modules: Object.keys(pinned.built ?? {}),
      symbols: Object.keys(pinned.loadedSymbols ?? {}),
      subject: 'pins.json',
    }),
    ...nonEmptyClosureProblems({
      modules: Object.keys(measured.built ?? {}),
      symbols: Object.keys(measured.loadedSymbols ?? {}),
      subject: 'measured',
    }),
  );

  for (const group of groups) {
    const want = pinned[group] ?? {};
    const got = measured[group] ?? {};
    for (const key of new Set([...Object.keys(want), ...Object.keys(got)])) {
      if (!(key in want)) {
        problems.push(`${group}: ${key} is present but not pinned`);
      } else if (!(key in got)) {
        problems.push(`${group}: ${key} is pinned but was not measured`);
      } else if (want[key] !== got[key]) {
        problems.push(
          `${group}: ${key} pinned ${String(want[key]).slice(0, 12)}… measured ` +
            `${String(got[key]).slice(0, 12)}…`,
        );
      }
    }
  }
  for (const stem of measured.unboundModules ?? []) {
    problems.push(
      `closure: dist/${stem}.js is imported by a pinned module but is not bound in ` +
        'src/dist-provenance.mjs, so nothing pins it; add its namespace import and re-pin',
    );
  }
  if (pinned.digest !== measured.digest) {
    problems.push(
      `dist digest pinned ${String(pinned.digest).slice(0, 12)}… measured ` +
        `${String(measured.digest).slice(0, 12)}…`,
    );
  }
  return problems;
}
