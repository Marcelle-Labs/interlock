#!/usr/bin/env node
/**
 * HAC-330 / S-1 — deterministic fixture history generator.
 *
 * Builds two Git repositories that differ in exactly one respect: **which two
 * files were historically maintained together**. Everything else is held
 * constant, so a difference downstream cannot be attributed to anything else.
 *
 * The fixture is a reservation broker. Three services hold reservations against
 * one shared pool, and the target invariant is arithmetic:
 *
 *     sum(services[].reserved) <= budget.totalReservable
 *
 * ## Why the co-change relationship is real and not hand-authored
 *
 * Nothing here writes a coupling into an evidence file. The histories are
 * ordinary commits, and the coupling is a *consequence* of how the pool was
 * maintained: a fixed pool means one service can only grow when another
 * shrinks, so a rebalance necessarily edits two reservation files in one
 * commit. The co-change signal is the observable shadow of the invariant.
 *
 * - `baseline`  — alpha and beta are counterparties. Every rebalance moves
 *                 budget between those two. alpha and gamma never move together.
 * - `perturbed` — gamma is the counterparty for both. alpha rebalances against
 *                 gamma, beta rebalances against gamma, at different times, and
 *                 **alpha and beta never appear in the same commit**.
 *
 * ## What is held constant across the two histories
 *
 * 1. identical final tree (asserted by `git rev-parse HEAD^{tree}`);
 * 2. identical commit count, and commit *i* touches the same number of files
 *    in both, so first-parent position decay lines up;
 * 3. identical scaffold, documentation and test commits;
 * 4. the target invariant holds at every commit in both histories.
 *
 * Commit identity is fully pinned — fixed author, committer, dates, branch and
 * file modes — so the fixture SHAs, and therefore the mined basis revision and
 * the evidence digest, are reproducible on any machine.
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { git as runGitIn } from '../lib/exec.mjs';

/** Total reservable budget. Chosen so each intent fits alone and not together. */
const TOTAL_RESERVABLE = 130;

/** Reservations every history starts from and returns to. */
const FINAL = { alpha: 40, beta: 40, gamma: 20 };

/**
 * Fixed clock. `mine` reads the commit graph, not timestamps, but commit SHAs
 * are a function of the dates, and a reproducible SHA is what makes the
 * evidence digest in this packet checkable by someone else.
 */
const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
const STEP_SECONDS = 600;

const IDENTITY = {
  GIT_AUTHOR_NAME: 'HAC-330 Fixture',
  GIT_AUTHOR_EMAIL: 'hac-330@example.invalid',
  GIT_COMMITTER_NAME: 'HAC-330 Fixture',
  GIT_COMMITTER_EMAIL: 'hac-330@example.invalid',
};

// ---------------------------------------------------------------------------
// Fixture file contents
// ---------------------------------------------------------------------------

const reservation = (service, reserved) =>
  `${JSON.stringify({ service, reserved }, null, 2)}\n`;

const pool = () => `${JSON.stringify({ totalReservable: TOTAL_RESERVABLE }, null, 2)}\n`;

/**
 * The target invariant, as an executable check inside the fixture.
 *
 * Deterministic and dependency-free: no clock, no network, no randomness, no
 * judgement. It reads three files and does integer arithmetic. Exit status is
 * the verdict, so the experiment reads a process exit code rather than
 * interpreting prose.
 */
const VERIFY_MJS = `#!/usr/bin/env node
/**
 * Target invariant for the reservation-broker fixture.
 *
 *     sum(services[].reserved) <= budget.totalReservable
 *
 * Exit 0 — invariant holds. Exit 1 — invariant violated.
 *
 * Integer arithmetic over three files. No clock, no network, no randomness, no
 * judgement call, and no dependency. Two runs against the same tree return the
 * same verdict on any machine.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts), 'utf8'));

const { totalReservable } = readJson('budget', 'pool.json');

const reserved = readdirSync(join(root, 'services'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => {
    const record = readJson('services', name, 'reservation.json');
    if (!Number.isInteger(record.reserved) || record.reserved < 0) {
      throw new Error(\`services/\${name}: reserved must be a non-negative integer\`);
    }
    return { service: name, reserved: record.reserved };
  });

const total = reserved.reduce((sum, r) => sum + r.reserved, 0);
const holds = total <= totalReservable;

process.stdout.write(
  \`\${JSON.stringify(
    {
      invariant: 'sum(services[].reserved) <= budget.totalReservable',
      totalReservable,
      reserved,
      total,
      headroom: totalReservable - total,
      holds,
    },
    null,
    2,
  )}\\n\`,
);

process.exit(holds ? 0 : 1);
`;

const README_MD = `# reservation-broker (HAC-330 fixture)

Three services hold reservations against one shared pool.

The pool is fixed, so the reservations are not independent: raising one means
lowering another. That constraint is enforced by \`verify.mjs\`, and it is also
why the reservation files are edited together — a rebalance is one change, not
two.

    sum(services[].reserved) <= budget.totalReservable

Run \`node verify.mjs\`. Exit 0 means the invariant holds.
`;

const runbook = (revision) => {
  const sections = [
    '# Rebalancing runbook\n',
    '\nThe pool is fixed. A service can only grow if another shrinks, so a\n' +
      'rebalance is a single coordinated change and is reviewed as one.\n',
  ];
  for (let i = 1; i <= revision; i += 1) {
    sections.push(
      `\n## Revision ${i}\n\nRebalance procedure revision ${i}: confirm the pool total, ` +
        `apply the paired\nreservation change, then run \`node verify.mjs\` before publishing.\n`,
    );
  }
  return sections.join('');
};

const smokeTest = (revision) => {
  const cases = [];
  for (let i = 1; i <= revision; i += 1) {
    cases.push(
      `\n// Case ${i}: revision ${i} of the runbook must leave the invariant holding.\n` +
        `assertInvariantHolds('runbook revision ${i}');\n`,
    );
  }
  return (
    `// Smoke test for the rebalancing runbook.\n` +
    `//\n` +
    `// Each runbook revision gets a case here in the same change, because a\n` +
    `// procedure nobody exercises is a procedure nobody can trust.\n` +
    `import { execFileSync } from 'node:child_process';\n` +
    `import { dirname, join } from 'node:path';\n` +
    `import { fileURLToPath } from 'node:url';\n\n` +
    `const root = join(dirname(fileURLToPath(import.meta.url)), '..');\n\n` +
    `function assertInvariantHolds(label) {\n` +
    `  execFileSync(process.execPath, [join(root, 'verify.mjs')], { stdio: 'ignore' });\n` +
    `  console.log('ok -', label);\n` +
    `}\n` +
    cases.join('')
  );
};

// ---------------------------------------------------------------------------
// Histories
// ---------------------------------------------------------------------------

/**
 * A rebalance step. `moves` is the complete post-state of the services it
 * touches; every step is zero-sum across the services it names, so the total
 * never moves and the invariant holds at every commit.
 */
const BASELINE_REBALANCES = [
  { moves: { alpha: 50, beta: 30 }, note: 'shift headroom to alpha for the ingest burst' },
  { moves: { alpha: 35, beta: 45 }, note: 'return headroom to beta after the burst' },
  { moves: { alpha: 55, beta: 25 }, note: 'alpha reindex window' },
  { moves: { alpha: 45, beta: 35 }, note: 'partial unwind of the reindex reservation' },
  { moves: { alpha: 30, beta: 50 }, note: 'beta backfill window' },
  { moves: { alpha: 48, beta: 32 }, note: 'alpha takes the evening peak' },
  { moves: { alpha: 38, beta: 42 }, note: 'even out after the peak' },
  { moves: { alpha: 40, beta: 40 }, note: 'settle both services at parity' },
];

/**
 * The alternate world. Same number of rebalances, same two files per commit,
 * same arithmetic discipline — but gamma is the counterparty for both services,
 * so alpha and beta never appear in one commit.
 */
const PERTURBED_REBALANCES = [
  { moves: { alpha: 50, gamma: 10 }, note: 'alpha borrows from the spare pool for the ingest burst' },
  { moves: { beta: 32, gamma: 18 }, note: 'beta returns headroom to the spare pool' },
  { moves: { alpha: 44, gamma: 24 }, note: 'alpha returns part of the burst reservation' },
  { moves: { beta: 45, gamma: 11 }, note: 'beta borrows from the spare pool for backfill' },
  { moves: { alpha: 36, gamma: 19 }, note: 'alpha unwinds ahead of the maintenance window' },
  { moves: { beta: 38, gamma: 26 }, note: 'beta unwinds after the backfill' },
  { moves: { alpha: 40, gamma: 22 }, note: 'alpha settles at parity' },
  { moves: { beta: 40, gamma: 20 }, note: 'beta settles at parity; spare pool restored' },
];

/**
 * Where the documentation commits sit in the sequence, as an index into the
 * rebalance list. Identical in both histories, so commit *i* touches the same
 * number of files in both and position decay lines up.
 */
const DOC_AFTER_REBALANCE = new Set([2, 4, 5, 7, 8]);

/**
 * Build the ordered commit plan for a history.
 *
 * Returns a list of `{ message, files }`, where `files` maps a repository-
 * relative path to its complete new content.
 */
function planCommits(rebalances) {
  const commits = [];

  commits.push({
    message: 'chore: scaffold the reservation broker and its invariant',
    files: {
      'README.md': README_MD,
      'verify.mjs': VERIFY_MJS,
      'budget/pool.json': pool(),
      'docs/runbook.md': runbook(0),
      'tests/smoke.test.mjs': smokeTest(0),
    },
  });

  // Services are registered one per commit, so the registrations themselves
  // create no co-change between any two of them.
  const state = {};
  for (const service of ['alpha', 'beta', 'gamma']) {
    state[service] = FINAL[service];
    commits.push({
      message: `feat(${service}): register the ${service} reservation`,
      files: { [`services/${service}/reservation.json`]: reservation(service, FINAL[service]) },
    });
  }

  let docRevision = 0;
  rebalances.forEach((step, index) => {
    const files = {};
    for (const [service, reserved] of Object.entries(step.moves)) {
      state[service] = reserved;
      files[`services/${service}/reservation.json`] = reservation(service, reserved);
    }

    const total = Object.values(state).reduce((sum, n) => sum + n, 0);
    if (total > TOTAL_RESERVABLE) {
      throw new Error(
        `fixture plan is invalid: rebalance ${index + 1} leaves total ${total} above ${TOTAL_RESERVABLE}`,
      );
    }

    commits.push({
      message: `fix(budget): ${step.note}`,
      files,
    });

    if (DOC_AFTER_REBALANCE.has(index + 1)) {
      docRevision += 1;
      commits.push({
        message: `docs(runbook): record rebalance procedure revision ${docRevision}`,
        files: {
          'docs/runbook.md': runbook(docRevision),
          'tests/smoke.test.mjs': smokeTest(docRevision),
        },
      });
    }
  });

  const finalTotal = Object.values(state).reduce((sum, n) => sum + n, 0);
  const expected = Object.values(FINAL).reduce((sum, n) => sum + n, 0);
  if (finalTotal !== expected) {
    throw new Error(`fixture plan does not settle at the shared final state (${finalTotal} vs ${expected})`);
  }
  for (const [service, reserved] of Object.entries(FINAL)) {
    if (state[service] !== reserved) {
      throw new Error(`fixture plan leaves ${service} at ${state[service]}, expected ${reserved}`);
    }
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
  // Pin the mode: git records 100644 vs 100755, and an inherited umask must not
  // be allowed to change the tree object.
  chmodSync(full, 0o644);
}

export function buildFixture(repo, rebalances) {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });

  git(repo, ['init', '-b', 'main', '--quiet']);
  git(repo, ['config', 'user.name', IDENTITY.GIT_AUTHOR_NAME]);
  git(repo, ['config', 'user.email', IDENTITY.GIT_AUTHOR_EMAIL]);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['config', 'gc.auto', '0']);

  const commits = planCommits(rebalances);

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
  baseline: BASELINE_REBALANCES,
  perturbed: PERTURBED_REBALANCES,
};

export { TOTAL_RESERVABLE, FINAL };

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: build-fixtures.mjs <output-directory>');
    process.exit(2);
  }

  const built = {};
  for (const [name, rebalances] of Object.entries(FIXTURES)) {
    built[name] = buildFixture(join(outDir, name), rebalances);
    console.log(
      `${name.padEnd(9)} head=${built[name].head} tree=${built[name].tree} commits=${built[name].commitCount}`,
    );
  }

  // The control that makes the whole experiment attributable: if the two
  // histories did not land on the same tree, a downstream difference could be
  // the target state rather than the evidence.
  if (built.baseline.tree !== built.perturbed.tree) {
    console.error('FATAL: fixtures do not share a final tree; the perturbation is not controlled');
    process.exit(1);
  }
  console.log(`\nshared final tree: ${built.baseline.tree}`);
}
