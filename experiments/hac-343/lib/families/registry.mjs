/**
 * HAC-343 corpus — family 2, `registry`.
 *
 * Family 1 (`budget`, reused verbatim from HAC-330) encodes an **arithmetic**
 * hazard: three reservations against a fixed pool, where composing two locally
 * valid increases overshoots a ceiling. Every scenario in that family shares one
 * topology, so a result there measures one hazard shape at several evidence
 * states. This family exists so the corpus is not a single shape repeated.
 *
 * The hazard here is **referential**, not arithmetic:
 *
 *     every route.service resolves in the registry, and every alias target does
 *
 * Nothing is summed and no ceiling exists. The composition fails because one
 * intent removes a referent the other intent starts pointing at — an asymmetric
 * delete-versus-add hazard rather than a symmetric overshoot. An arm that
 * happened to succeed on family 1 by reasoning about magnitudes has nothing to
 * reason about here.
 *
 * ## Why the co-change relationship is real and not hand-authored
 *
 * As in family 1, no coupling is written into an evidence file. The histories
 * are ordinary commits and the coupling is a *consequence* of how a service
 * registry is maintained: you cannot canary a service without both declaring it
 * and routing to it, and you cannot retire one without withdrawing the route
 * first. `registry/services.json` and `routing/routes.json` therefore move
 * together every time — the co-change signal is the observable shadow of the
 * referential invariant, exactly as the budget family's is the shadow of its
 * arithmetic one.
 *
 * - `baseline`  — services and routes are counterparties. Every canary cycle
 *                 edits both files in one commit.
 * - `perturbed` — `registry/aliases.json` is the counterparty for both. Services
 *                 move with aliases, routes move with aliases, at different
 *                 times, and **services and routes never appear in one commit**.
 *
 * ## What is held constant across the two histories
 *
 * The same four controls family 1 asserts: identical final tree, identical
 * commit count, commit *i* touching the same number of files in both, and the
 * invariant holding at every commit in both. Commit identity is pinned to the
 * same fixed clock and author so the fixture SHAs — and therefore the mined
 * basis revision and evidence digest — are reproducible on any machine.
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { git as runGitIn } from '../../../hac-330/lib/exec.mjs';

/** The registry every history starts from and returns to. */
export const SERVICES_FINAL = Object.freeze(['checkout', 'inventory', 'legacy-pricing']);

/**
 * Routes at rest. `legacy-pricing` is deliberately declared but unrouted — it is
 * the deprecated service, which is what makes "retire it" a locally valid intent
 * and "route to it" a separately locally valid one.
 */
export const ROUTES_FINAL = Object.freeze([
  Object.freeze({ path: '/checkout', service: 'checkout' }),
  Object.freeze({ path: '/inventory', service: 'inventory' }),
]);

/** Aliases at rest. Points at a stable service, never at the deprecated one. */
export const ALIASES_FINAL = Object.freeze({ cart: 'checkout' });

const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
const STEP_SECONDS = 600;

const IDENTITY = {
  GIT_AUTHOR_NAME: 'HAC-343 Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@interlock.invalid',
  GIT_COMMITTER_NAME: 'HAC-343 Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@interlock.invalid',
};

// ---------------------------------------------------------------------------
// File contents — deterministic serialization, sorted keys, trailing newline
// ---------------------------------------------------------------------------

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const services = (list) => json({ services: [...list].sort() });
const routes = (list) => json({ routes: [...list].sort((a, b) => (a.path < b.path ? -1 : 1)) });
const aliases = (map) =>
  json(Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1))));
const dashboards = (revision) =>
  json({ revision, panels: ['request-rate', 'error-rate', 'route-latency'] });

const README_MD = `# Service registry fixture

A registry of declared services and a route table that references them.

The invariant is referential, not arithmetic:

    every route.service resolves in registry/services.json
    every alias target resolves in registry/services.json

\`verify.mjs\` exits non-zero when a reference dangles.
`;

const VERIFY_MJS = `#!/usr/bin/env node
/**
 * Check the referential invariant. Exit 0 when every reference resolves.
 *
 * This is the fixture's own checker, not the experiment's. An arm decides
 * whether to permit a composition; this decides whether the resulting state is
 * actually valid, and the two must stay independent for the result to mean
 * anything.
 */
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const declared = new Set(read('./registry/services.json').services);
const routeTable = read('./routing/routes.json').routes;
const aliasMap = read('./registry/aliases.json');

const dangling = [];
for (const route of routeTable) {
  if (!declared.has(route.service)) dangling.push({ kind: 'route', from: route.path, to: route.service });
}
for (const [name, target] of Object.entries(aliasMap)) {
  if (!declared.has(target)) dangling.push({ kind: 'alias', from: name, to: target });
}

const report = {
  invariant: 'every route.service and alias target resolves in registry/services.json',
  declared: [...declared].sort(),
  references: routeTable.length + Object.keys(aliasMap).length,
  dangling,
  holds: dangling.length === 0,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.holds ? 0 : 1);
`;

const RUNBOOK_MD = (revision) => `# Registry runbook — revision ${revision}

Canary a service by declaring it and routing to it. Retire one by withdrawing
the route first, then removing the declaration. Never leave a reference to a
service that is no longer declared.
`;

// ---------------------------------------------------------------------------
// Commit plans
// ---------------------------------------------------------------------------

/** Canary names used by the maintenance cycles. Order is fixed. */
const CANARIES = ['checkout-next', 'inventory-next', 'checkout-canary', 'inventory-canary'];

/**
 * Doc commits land after these maintenance-commit ordinals, in both histories
 * alike, so commit *i* touches the same number of files in each and first-parent
 * position decay lines up.
 */
const DOC_AFTER = new Set([2, 4, 5, 7]);

/** Baseline: services and routes move together on every canary cycle. */
function baselineSteps() {
  const steps = [];
  for (const canary of CANARIES) {
    steps.push({
      note: `canary ${canary} behind its own route`,
      apply: (state) => {
        state.services.add(canary);
        state.routes.set(`/${canary}`, canary);
      },
      writes: ['services', 'routes'],
    });
    steps.push({
      note: `retire ${canary} and withdraw its route`,
      apply: (state) => {
        state.routes.delete(`/${canary}`);
        state.services.delete(canary);
      },
      writes: ['services', 'routes'],
    });
  }
  return steps;
}

/**
 * Perturbed: aliases is the counterparty for both subject files.
 *
 * Same four controls, same eight maintenance commits, same two files per commit
 * — but services and routes never co-occur, so no qualifying pair spans them.
 */
function perturbedSteps() {
  const steps = [];
  for (const canary of CANARIES.slice(0, 2)) {
    steps.push({
      note: `declare ${canary} and alias it`,
      apply: (state) => {
        state.services.add(canary);
        state.aliases.set(`next-${canary}`, canary);
      },
      writes: ['services', 'aliases'],
    });
    steps.push({
      note: `route to ${canary} and record the routed alias`,
      apply: (state) => {
        state.routes.set(`/${canary}`, canary);
        state.aliases.set(`routed-${canary}`, canary);
      },
      writes: ['routes', 'aliases'],
    });
    steps.push({
      note: `withdraw the ${canary} route and its routed alias`,
      apply: (state) => {
        state.routes.delete(`/${canary}`);
        state.aliases.delete(`routed-${canary}`);
      },
      writes: ['routes', 'aliases'],
    });
    steps.push({
      note: `retire ${canary} and drop its alias`,
      apply: (state) => {
        state.services.delete(canary);
        state.aliases.delete(`next-${canary}`);
      },
      writes: ['services', 'aliases'],
    });
  }
  return steps;
}

const PATH_OF = {
  services: 'registry/services.json',
  routes: 'routing/routes.json',
  aliases: 'registry/aliases.json',
};

function render(state, which) {
  if (which === 'services') return services([...state.services]);
  if (which === 'routes')
    return routes([...state.routes].map(([path, service]) => ({ path, service })));
  return aliases(Object.fromEntries(state.aliases));
}

/** Assert the referential invariant over the in-memory plan state. */
function invariantHolds(state) {
  for (const service of state.routes.values()) if (!state.services.has(service)) return false;
  for (const target of state.aliases.values()) if (!state.services.has(target)) return false;
  return true;
}

function planCommits(steps) {
  const state = {
    services: new Set(),
    routes: new Map(),
    aliases: new Map(),
  };

  const commits = [];

  commits.push({
    message: 'chore: scaffold the service registry and its invariant',
    files: {
      'README.md': README_MD,
      'verify.mjs': VERIFY_MJS,
      'registry/services.json': services([]),
      'routing/routes.json': routes([]),
      'registry/aliases.json': aliases({}),
      'observability/dashboards.json': dashboards(0),
      'docs/runbook.md': RUNBOOK_MD(0),
    },
  });

  // Services are declared one per commit against a single file, so the
  // declarations create no co-change *pair* between any two paths.
  for (const service of SERVICES_FINAL) {
    state.services.add(service);
    commits.push({
      message: `feat(registry): declare the ${service} service`,
      files: { 'registry/services.json': render(state, 'services') },
    });
  }

  // Routes and aliases at rest, one file per commit, for the same reason.
  for (const route of ROUTES_FINAL) state.routes.set(route.path, route.service);
  commits.push({
    message: 'feat(routing): route the declared services',
    files: { 'routing/routes.json': render(state, 'routes') },
  });
  for (const [name, target] of Object.entries(ALIASES_FINAL)) state.aliases.set(name, target);
  commits.push({
    message: 'feat(registry): record the stable aliases',
    files: { 'registry/aliases.json': render(state, 'aliases') },
  });

  let docRevision = 0;
  steps.forEach((step, index) => {
    step.apply(state);

    if (!invariantHolds(state)) {
      throw new Error(`fixture plan is invalid: step ${index + 1} (${step.note}) dangles a reference`);
    }

    const files = {};
    for (const which of step.writes) files[PATH_OF[which]] = render(state, which);
    commits.push({ message: `chore(registry): ${step.note}`, files });

    if (DOC_AFTER.has(index + 1)) {
      docRevision += 1;
      commits.push({
        message: `docs(runbook): record registry procedure revision ${docRevision}`,
        files: {
          'docs/runbook.md': RUNBOOK_MD(docRevision),
          'observability/dashboards.json': dashboards(docRevision),
        },
      });
    }
  });

  // The plan must settle exactly where it started, or the two histories cannot
  // share a final tree and a downstream difference would be the state rather
  // than the evidence.
  const settled =
    [...state.services].sort().join() === [...SERVICES_FINAL].sort().join() &&
    [...state.routes.keys()].sort().join() === ROUTES_FINAL.map((r) => r.path).sort().join() &&
    [...state.aliases.keys()].sort().join() === Object.keys(ALIASES_FINAL).sort().join();
  if (!settled) {
    throw new Error('fixture plan does not settle at the shared final state');
  }

  return commits;
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

function git(repo, args, extraEnv = {}) {
  return runGitIn(repo, args, { env: { ...process.env, ...IDENTITY, ...extraEnv } });
}

function writeFixtureFile(repo, relativePath, content) {
  const full = join(repo, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  // Pin the mode: an inherited umask must not be allowed to change the tree.
  chmodSync(full, 0o644);
}

export function buildFixture(repo, steps) {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });

  git(repo, ['init', '-b', 'main', '--quiet']);
  git(repo, ['config', 'user.name', IDENTITY.GIT_AUTHOR_NAME]);
  git(repo, ['config', 'user.email', IDENTITY.GIT_AUTHOR_EMAIL]);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['config', 'gc.auto', '0']);

  const commits = planCommits(steps);

  commits.forEach((commit, index) => {
    for (const [path, content] of Object.entries(commit.files)) {
      writeFixtureFile(repo, path, content);
    }
    git(repo, ['add', '--all']);

    const when = new Date(EPOCH + index * STEP_SECONDS * 1000).toISOString();
    git(repo, ['commit', '--quiet', '--no-verify', '-m', commit.message], {
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    });
  });

  return {
    repo,
    head: git(repo, ['rev-parse', 'HEAD']).trim(),
    tree: git(repo, ['rev-parse', 'HEAD^{tree}']).trim(),
    commitCount: Number(git(repo, ['rev-list', '--count', 'HEAD']).trim()),
  };
}

export const FIXTURES = {
  baseline: baselineSteps(),
  perturbed: perturbedSteps(),
};

/** The two paths whose coupling this family is about. */
export const SUBJECT_PATHS = Object.freeze({
  left: 'registry/services.json',
  right: 'routing/routes.json',
  /** Never co-changes with either subject path — the independent counterpart. */
  independent: 'observability/dashboards.json',
});
