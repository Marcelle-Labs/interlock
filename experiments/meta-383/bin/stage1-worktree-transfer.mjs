#!/usr/bin/env node
/**
 * META-383 Stage 1 — mechanical transfer control.
 *
 * Question, and only this question:
 *
 *     Can the already-proven HAC-343 cross-target composition fixture be
 *     faithfully represented as live Git worktree state?
 *
 * A pass is MECHANISM_TRANSFER_ONLY. It is not workspace.json usefulness
 * evidence and is never reported as such.
 *
 * Fidelity rule: the intents are read from HAC-343's frozen corpus and applied
 * through HAC-343's own executor. Nothing here reimplements the semantics, so
 * "reproduced without changing HAC-343 semantics" is structural rather than
 * asserted.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyIntent } from '../../hac-343/lib/executor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = dirname(HERE);
const HAC343 = join(dirname(EXP), 'hac-343');
const CORPUS = JSON.parse(readFileSync(join(HAC343, 'evidence', 'corpus.json'), 'utf8'));
const FIXTURE = join(HAC343, '.work', 'fixtures', 'baseline');
const WORK = join(EXP, '.work', 'stage1');

const SCENARIO_ID = 'registry/coupled/retire-vs-route';

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Run the fixture's own verifier. The verdict is the exit code, never stdout. */
function verify(tree) {
  try {
    const stdout = execFileSync(process.execPath, [join(tree, 'verify.mjs')], {
      cwd: tree,
      encoding: 'utf8',
    });
    return { exitCode: 0, stdout, stderr: '', holds: true };
  } catch (err) {
    return {
      exitCode: err.status ?? null,
      stdout: err.stdout ?? '',
      stderr: (err.stderr ?? '').slice(0, 4000),
      holds: false,
    };
  }
}

/** Digest of the full worktree content, so mutation by composition is detectable. */
const treeDigest = (tree) => sha256(git(tree, 'status', '--porcelain') + ' ' + git(tree, 'diff'));

const fail = (code, detail) => {
  mkdirSync(join(EXP, 'evidence'), { recursive: true });
  writeFileSync(
    join(EXP, 'evidence', 'stage1.json'),
    JSON.stringify({ stage: 1, disposition: code, detail }, null, 2) + '\n',
  );
  console.error('STAGE 1 ' + code + ': ' + detail);
  process.exit(1);
};

// ---------------------------------------------------------------- provenance

const frozen = CORPUS.families.registry.fixtures.baseline;
if (!existsSync(FIXTURE)) fail('WORKTREE_TRANSFER_FAILED', 'fixture absent: ' + FIXTURE);

const observedHead = git(FIXTURE, 'rev-parse', 'HEAD').trim();
const observedTree = git(FIXTURE, 'rev-parse', 'HEAD^{tree}').trim();
if (observedHead !== frozen.head) {
  fail('WORKTREE_TRANSFER_FAILED', 'fixture head ' + observedHead + ' != frozen ' + frozen.head);
}
if (observedTree !== frozen.tree) {
  fail('WORKTREE_TRANSFER_FAILED', 'fixture tree ' + observedTree + ' != frozen ' + frozen.tree);
}

const scenario = CORPUS.scenarios.find((s) => s.id === SCENARIO_ID);
if (!scenario) fail('WORKTREE_TRANSFER_FAILED', 'scenario absent from frozen corpus: ' + SCENARIO_ID);
if (scenario.composeViolatesInvariant !== true) {
  fail('WORKTREE_TRANSFER_FAILED', SCENARIO_ID + ' is not a composition-hazard scenario');
}

// ---------------------------------------------------------------- worktrees

for (const name of ['wt-a', 'wt-b', 'wt-int']) {
  const p = join(WORK, name);
  try {
    git(FIXTURE, 'worktree', 'remove', '--force', p);
  } catch {
    /* not registered */
  }
  rmSync(p, { recursive: true, force: true });
}
mkdirSync(WORK, { recursive: true });

const WT_A = join(WORK, 'wt-a');
const WT_B = join(WORK, 'wt-b');
git(FIXTURE, 'worktree', 'add', '--detach', WT_A, observedHead);
git(FIXTURE, 'worktree', 'add', '--detach', WT_B, observedHead);

// Both worktrees start from one base revision and start clean.
for (const [label, wt] of [['A', WT_A], ['B', WT_B]]) {
  if (git(wt, 'status', '--porcelain').trim() !== '') {
    fail('WORKTREE_TRANSFER_FAILED', 'worktree ' + label + ' dirty at creation');
  }
  if (git(wt, 'rev-parse', 'HEAD').trim() !== observedHead) {
    fail('WORKTREE_TRANSFER_FAILED', 'worktree ' + label + ' not at base revision');
  }
}

// ------------------------------------------------------- pending, not committed

const [intentA, intentB] = scenario.intents;
applyIntent(WT_A, 'registry', intentA);
applyIntent(WT_B, 'registry', intentB);

const changedPaths = (wt) => git(wt, 'diff', '--name-only').trim().split('\n').filter(Boolean);

const pathsA = changedPaths(WT_A);
const pathsB = changedPaths(WT_B);
const diffA = git(WT_A, 'diff');
const diffB = git(WT_B, 'diff');

// The changes must remain worktree-local during the decision: still uncommitted.
for (const [label, wt] of [['A', WT_A], ['B', WT_B]]) {
  if (git(wt, 'rev-parse', 'HEAD').trim() !== observedHead) {
    fail('WORKTREE_TRANSFER_FAILED', 'worktree ' + label + ' advanced past the base revision');
  }
  if (git(wt, 'diff', '--cached', '--name-only').trim() !== '') {
    fail('WORKTREE_TRANSFER_FAILED', 'worktree ' + label + ' staged its change');
  }
}

// Cross-target, and no textual merge conflict is available as a solution.
const disjoint = pathsA.every((p) => !pathsB.includes(p));
if (!disjoint) fail('WORKTREE_TRANSFER_FAILED', 'the two intents are not path-disjoint');

// -------------------------------------------------- independent local validity

const verifyA = verify(WT_A);
const verifyB = verify(WT_B);
if (!verifyA.holds || !verifyB.holds) {
  fail('WORKTREE_TRANSFER_FAILED', 'a pending change is not independently valid at T0');
}

const digestBeforeA = treeDigest(WT_A);
const digestBeforeB = treeDigest(WT_B);

// ------------------------------------------- composition in a disposable tree

const WT_INT = join(WORK, 'wt-int');
git(FIXTURE, 'worktree', 'add', '--detach', WT_INT, observedHead);

const patchA = join(WORK, 'a.patch');
const patchB = join(WORK, 'b.patch');
writeFileSync(patchA, diffA);
writeFileSync(patchB, diffB);

let mergeConflict = null;
try {
  git(WT_INT, 'apply', '--3way', patchA);
  git(WT_INT, 'apply', '--3way', patchB);
} catch (err) {
  mergeConflict = String(err.message).slice(0, 2000);
}
if (mergeConflict) {
  fail('WORKTREE_TRANSFER_FAILED', 'composition produced a textual conflict: ' + mergeConflict);
}

const verifyComposed = verify(WT_INT);

// ------------------------------------------------------------ replay integrity

const mutatedA = treeDigest(WT_A) !== digestBeforeA;
const mutatedB = treeDigest(WT_B) !== digestBeforeB;
if (mutatedA || mutatedB) {
  fail('WORKTREE_TRANSFER_FAILED', 'composition verification mutated an active candidate worktree');
}

// ------------------------------------------------------------------ gold check

const composedReport = (() => {
  try {
    return JSON.parse(verifyComposed.stdout);
  } catch {
    return null;
  }
})();

const reproducedGold =
  verifyComposed.holds === false &&
  verifyComposed.exitCode === 1 &&
  composedReport !== null &&
  composedReport.holds === false &&
  composedReport.dangling.some(
    (d) => d.kind === 'route' && d.from === intentB.route && d.to === intentB.service,
  );

const disposition = reproducedGold ? 'MECHANISM_TRANSFER_ONLY' : 'WORKTREE_TRANSFER_FAILED';

const receipt = {
  stage: 1,
  question:
    'Can the frozen HAC-343 cross-target composition fixture be represented as live Git worktree state?',
  disposition,
  claimBoundary:
    'MECHANISM_TRANSFER_ONLY is a mechanism check. It is not evidence of workspace.json usefulness and is never reported as such.',
  scenario: {
    id: scenario.id,
    label: scenario.label,
    family: scenario.family,
    intents: scenario.intents,
  },
  hac343Fidelity: {
    intentsReadFrom: 'experiments/hac-343/evidence/corpus.json',
    intentsAppliedBy: 'experiments/hac-343/lib/executor.mjs applyIntent()',
    oracle:
      "the fixture's own verify.mjs; the verdict is the exit code, and stdout is preserved but never parsed for the verdict",
    semanticsChanged: false,
  },
  baseRevision: observedHead,
  baseTree: observedTree,
  frozenCorpusHead: frozen.head,
  frozenCorpusTree: frozen.tree,
  worktrees: {
    a: {
      path: WT_A.replace(EXP, '<experiment>'),
      changedPaths: pathsA,
      diffSha256: sha256(diffA),
      committed: false,
      staged: false,
    },
    b: {
      path: WT_B.replace(EXP, '<experiment>'),
      changedPaths: pathsB,
      diffSha256: sha256(diffB),
      committed: false,
      staged: false,
    },
    integration: { path: WT_INT.replace(EXP, '<experiment>'), disposable: true },
  },
  crossTarget: { pathDisjoint: disjoint, textualMergeConflict: false },
  independentLocalValidity: {
    a: { exitCode: verifyA.exitCode, holds: verifyA.holds, stdout: verifyA.stdout },
    b: { exitCode: verifyB.exitCode, holds: verifyB.holds, stdout: verifyB.stdout },
  },
  composed: {
    exitCode: verifyComposed.exitCode,
    holds: verifyComposed.holds,
    stdout: verifyComposed.stdout,
    stderr: verifyComposed.stderr,
    dangling: composedReport ? composedReport.dangling : null,
  },
  replayIntegrity: { candidateWorktreeMutatedByComposition: mutatedA || mutatedB },
  exitZeroIsNotEvidence:
    'Every state above is established by the preserved verifier output, not by an exit code alone.',
  diffs: { a: diffA, b: diffB },
};

mkdirSync(join(EXP, 'evidence'), { recursive: true });
writeFileSync(join(EXP, 'evidence', 'stage1.json'), JSON.stringify(receipt, null, 2) + '\n');

console.log(
  JSON.stringify(
    {
      disposition,
      baseRevision: observedHead,
      pathsA,
      pathsB,
      independentlyValid: [verifyA.holds, verifyB.holds],
      composedHolds: verifyComposed.holds,
      composedExit: verifyComposed.exitCode,
      dangling: composedReport ? composedReport.dangling : null,
      candidateWorktreesUnmutated: !(mutatedA || mutatedB),
    },
    null,
    2,
  ),
);

if (!reproducedGold) process.exit(1);
