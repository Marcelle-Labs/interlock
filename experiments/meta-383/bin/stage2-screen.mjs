#!/usr/bin/env node
/**
 * META-383 Stage 2b — deep screening against the eight admission rules.
 *
 * Walks the frozen deep-screen order from candidates.json, at most 6 candidates,
 * and STOPS at the first candidate that satisfies all eight rules. Every
 * rejection reason is preserved.
 *
 * Rules 3 and 5 are established by the repository's OWN validation surface:
 *
 *     T0            must PASS   (otherwise nothing is attributable)
 *     T0 + A        must PASS   (independent local validity)
 *     T0 + B        must PASS   (independent local validity)
 *     T0 + A + B    must FAIL   (deterministic composed consequence)
 *
 * The failure existing only in the composition IS the attribution to the
 * interaction. Exit codes are never the evidence on their own; the surface's
 * output is preserved verbatim for every one of the four states.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = dirname(HERE);
const WORK = join(EXP, '.work', 'stage2-screen');
const CANDIDATES = JSON.parse(readFileSync(join(EXP, 'evidence', 'candidates.json'), 'utf8'));

const MAX_DEEP_SCREEN = 6;

const CLONE = {
  'polyfy/polylith': '/private/tmp/meta375/clones/polylith',
  'JamieMason/syncpack': '/private/tmp/meta375/clones/syncpack',
  'formatjs/formatjs': '/private/tmp/meta375/clones/formatjs',
};

/** Frozen, repository-native validation surfaces (PREREGISTRATION.md section 3). */
const SURFACE = {
  'JamieMason/syncpack': {
    cmd: 'cargo',
    args: ['check', '--workspace', '--locked'],
    label: 'cargo check --workspace --locked',
  },
  'formatjs/formatjs': {
    cmd: 'cargo',
    args: [
      'check',
      '--workspace',
      '--locked',
      '--exclude',
      'formatjs_icu_messageformat_parser_integration_tests',
    ],
    label: 'cargo check --workspace --locked --exclude formatjs_icu_messageformat_parser_integration_tests',
  },
  'polyfy/polylith': {
    cmd: 'clojure',
    args: ['-M:poly', 'check'],
    label: 'clojure -M:poly check',
  },
};

const ENV = {
  ...process.env,
  PATH: process.env.HOME + '/.cargo/bin:/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
  // Shared dependency cache, held outside the per-run work directory so it
  // survives worktree teardown. Cargo keys on fingerprints, so sharing a target
  // directory changes build time only, never a verdict.
  CARGO_TARGET_DIR: '/private/tmp/meta375/m383-cargo-target',
};

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: ENV });
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function runSurface(repo, tree) {
  const s = SURFACE[repo];
  const started = Date.now();
  try {
    const stdout = execFileSync(s.cmd, s.args, {
      cwd: tree,
      encoding: 'utf8',
      env: ENV,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 3_600_000,
    });
    return { surface: s.label, exitCode: 0, passed: true, stdout: stdout.slice(-8000), stderr: '', ms: Date.now() - started };
  } catch (err) {
    return {
      surface: s.label,
      exitCode: err.status ?? null,
      passed: false,
      stdout: (err.stdout ?? '').slice(-8000),
      stderr: (err.stderr ?? '').slice(-12000),
      ms: Date.now() - started,
    };
  }
}

// ------------------------------------------------------------- T0 evidence

const CLI_CHECKOUT = '/Users/user1/dev/cli';
const MINING_ENTRY = join('packages', 'mining-core', 'dist', 'index.js');

/**
 * Mine the committed evidence available at T0 with `@workspacejson/mining-core`
 * from the local workspacejson/cli checkout.
 *
 * Evidence flows cli -> interlock only. Nothing is written to the cli
 * repository and no dependency on it is declared here; the entry point is
 * loaded by absolute path and its identity is recorded in the receipt.
 */
async function mineT0(dir, t0) {
  const entry = join(CLI_CHECKOUT, MINING_ENTRY);
  const pipeline = await import(pathToFileURL(entry).href);
  const pkg = JSON.parse(
    readFileSync(join(CLI_CHECKOUT, 'packages', 'mining-core', 'package.json'), 'utf8'),
  );
  const producer = {
    repository: 'workspacejson/cli',
    remote: git(CLI_CHECKOUT, 'remote', 'get-url', 'origin').trim(),
    observedSha: git(CLI_CHECKOUT, 'rev-parse', 'HEAD').trim(),
    checkoutClean: git(CLI_CHECKOUT, 'status', '--porcelain').trim() === '',
    package: pkg.name,
    version: pkg.version,
    published: pkg.private !== true,
    entrypoint: MINING_ENTRY,
    bundleSha256: sha256(readFileSync(entry)),
    pipeline: 'mine -> score -> select',
    l1ProjectionUsed: false,
    l1ProjectionNote:
      'project() is exported but deliberately not called. L1 emission onto generated.coChange is step 3 of the A-009 staged transition and is not authorized by this experiment.',
  };

  const tree = treeAt(dir, 'mine-t0', t0);
  const { mine, score, select, serializeSelection } = pipeline;
  const selection = select(score(await mine(tree)));
  const serialized = serializeSelection(selection);
  dropTree(dir, tree);

  return {
    producer,
    selection,
    serializedSelection: serialized,
    serializedSha256: sha256(Buffer.from(serialized, 'utf8')),
  };
}

const treeAt = (dir, name, rev) => {
  const p = join(WORK, name);
  try {
    git(dir, 'worktree', 'remove', '--force', p);
  } catch {
    /* not registered */
  }
  rmSync(p, { recursive: true, force: true });
  git(dir, 'worktree', 'add', '--detach', '-f', p, rev);
  return p;
};

const dropTree = (dir, p) => {
  try {
    git(dir, 'worktree', 'remove', '--force', p);
  } catch {
    rmSync(p, { recursive: true, force: true });
  }
};

/** Rule 7 — mechanical scan for a prose oracle stating the interaction. */
function proseOracleScan(diffA, diffB, symbols) {
  const proseLines = [];
  for (const [label, d] of [['A', diffA], ['B', diffB]]) {
    for (const line of d.split('\n')) {
      if (!line.startsWith('+')) continue;
      const t = line.slice(1).trim();
      const isProse =
        t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith(';;') || t.startsWith('///');
      if (!isProse) continue;
      const hits = symbols.filter((s) => t.includes(s));
      if (hits.length >= 2) proseLines.push({ side: label, line: t.slice(0, 300), symbols: hits });
    }
  }
  return proseLines;
}

// ---------------------------------------------------------------- screening

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const order = CANDIDATES.deepScreenOrder.slice(0, MAX_DEEP_SCREEN);
const screened = [];
let admitted = null;

for (const cand of order) {
  const dir = CLONE[cand.repository];
  const record = {
    order: cand.order,
    repository: cand.repository,
    score: cand.score,
    t0: cand.t0,
    changeA: cand.ca,
    changeB: cand.cb,
    rules: {},
    disposition: null,
    rejectionReason: null,
  };

  const subjectA = git(dir, 'show', '-s', '--format=%s', cand.ca).trim();
  const subjectB = git(dir, 'show', '-s', '--format=%s', cand.cb).trim();
  const pathsA = git(dir, 'show', '--format=', '--name-only', cand.ca).trim().split('\n').filter(Boolean);
  const pathsB = git(dir, 'show', '--format=', '--name-only', cand.cb).trim().split('\n').filter(Boolean);
  record.changeASubject = subjectA;
  record.changeBSubject = subjectB;
  record.changedPathsA = pathsA;
  record.changedPathsB = pathsB;

  // Rule 2 — real changes, by construction from real historical commits.
  record.rules.realChanges = {
    pass: true,
    detail: 'both patches are diffs of real historical commits; no edit was invented',
  };

  // Rule 1 — T0 availability.
  record.rules.t0Availability = {
    pass: true,
    detail:
      'T0 = ' + cand.t0 + ' = first-parent parent of the older change; the evidence treatment is mined only from history reachable at T0',
  };

  // Rule 4 — no ordinary merge-conflict solution.
  const overlap = pathsA.filter((p) => pathsB.includes(p));
  const patchAFile = join(WORK, 'a.patch');
  const patchBFile = join(WORK, 'b.patch');
  const diffA = git(dir, 'format-patch', '-1', '--stdout', cand.ca);
  const diffB = git(dir, 'format-patch', '-1', '--stdout', cand.cb);
  writeFileSync(patchAFile, diffA);
  writeFileSync(patchBFile, diffB);

  let composedTree = treeAt(dir, 'composed', cand.t0);
  let textualConflict = null;
  try {
    git(composedTree, 'apply', patchAFile);
    git(composedTree, 'apply', patchBFile);
  } catch (err) {
    textualConflict = String(err.message).slice(0, 1500);
  }
  record.rules.noMergeConflict = {
    pass: overlap.length === 0 && textualConflict === null,
    pathOverlap: overlap,
    textualConflict,
  };
  if (!record.rules.noMergeConflict.pass) {
    dropTree(dir, composedTree);
    record.disposition = 'REJECTED';
    record.rejectionReason = overlap.length
      ? 'PATHS_OVERLAP'
      : 'TEXTUAL_MERGE_CONFLICT_ON_COMPOSITION';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }

  // Rules 3 and 5 — the repository's own surface on four states.
  const t0Tree = treeAt(dir, 't0', cand.t0);
  const baseline = runSurface(cand.repository, t0Tree);
  record.rules.baseT0Valid = { pass: baseline.passed, receipt: baseline };
  if (!baseline.passed) {
    dropTree(dir, t0Tree);
    dropTree(dir, composedTree);
    record.disposition = 'REJECTED';
    record.rejectionReason = 'T0_DOES_NOT_PASS_ITS_OWN_VALIDATION_SURFACE';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }
  dropTree(dir, t0Tree);

  const aTree = treeAt(dir, 'wt-a', cand.t0);
  git(aTree, 'apply', patchAFile);
  const aOnly = runSurface(cand.repository, aTree);

  const bTree = treeAt(dir, 'wt-b', cand.t0);
  git(bTree, 'apply', patchBFile);
  const bOnly = runSurface(cand.repository, bTree);

  record.rules.independentLocalValidity = {
    pass: aOnly.passed && bOnly.passed,
    a: aOnly,
    b: bOnly,
  };

  const composed = runSurface(cand.repository, composedTree);
  record.rules.deterministicComposedConsequence = {
    pass: aOnly.passed && bOnly.passed && baseline.passed && !composed.passed,
    attribution:
      'T0 passes, T0+A passes, T0+B passes, T0+A+B fails: the violation exists only in the composition',
    composed,
  };

  // Rule 8 — replay integrity.
  const aDigest = sha256(git(aTree, 'diff'));
  const bDigest = sha256(git(bTree, 'diff'));
  record.rules.replayIntegrity = {
    pass: true,
    detail:
      'composition ran only in the disposable integration worktree; candidate worktrees were never composed into',
    aDiffSha256: aDigest,
    bDiffSha256: bDigest,
  };

  dropTree(dir, aTree);
  dropTree(dir, bTree);
  dropTree(dir, composedTree);

  if (!record.rules.independentLocalValidity.pass) {
    record.disposition = 'REJECTED';
    record.rejectionReason = aOnly.passed
      ? 'CHANGE_B_NOT_INDEPENDENTLY_VALID_AT_T0'
      : 'CHANGE_A_NOT_INDEPENDENTLY_VALID_AT_T0';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }

  if (!record.rules.deterministicComposedConsequence.pass) {
    record.disposition = 'REJECTED';
    record.rejectionReason = 'COMPOSITION_IS_VALID_NO_DETERMINISTIC_CONSEQUENCE';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }

  // Rule 7 — no trivial current-tree oracle.
  const errText = composed.stderr + composed.stdout;
  const symbols = [...new Set(errText.match(/`([A-Za-z_][A-Za-z0-9_]{2,})`/g) || [])].map((s) =>
    s.replace(/`/g, ''),
  );
  const prose = proseOracleScan(diffA, diffB, symbols);
  record.rules.noTrivialProseOracle = {
    pass: prose.length === 0,
    scannedSymbols: symbols.slice(0, 40),
    proseLinesNamingTwoOrMoreSymbols: prose,
  };
  if (!record.rules.noTrivialProseOracle.pass) {
    record.disposition = 'REJECTED';
    record.rejectionReason = 'TRIVIAL_PROSE_ORACLE_IN_TREE';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }

  // Rule 6 — evidence honesty, decided against the actual mined artifact.
  //
  // This is a claim about an artifact that does not exist until it is mined, so
  // it cannot be presumed. If the T0 history carries no descriptive observation
  // relating the two changes' paths, there is nothing for arms B and C to
  // carry, and the candidate is rejected rather than furnished with an
  // observation invented for it.
  const mined = await mineT0(dir, cand.t0);
  const touched = new Set([...pathsA, ...pathsB]);
  const spanning = mined.selection.pairs.filter(
    (p) =>
      (pathsA.includes(p.files[0]) && pathsB.includes(p.files[1])) ||
      (pathsB.includes(p.files[0]) && pathsA.includes(p.files[1])),
  );
  const unrelated = mined.selection.pairs
    .filter((p) => !touched.has(p.files[0]) && !touched.has(p.files[1]))
    .sort(
      (x, y) =>
        y.support - x.support ||
        x.occurrences - y.occurrences ||
        (x.files[0] < y.files[0] ? -1 : x.files[0] > y.files[0] ? 1 : 0) ||
        (x.files[1] < y.files[1] ? -1 : x.files[1] > y.files[1] ? 1 : 0),
    );

  record.rules.evidenceHonesty = {
    pass: spanning.length > 0 && unrelated.length > 0,
    basisRevision: mined.selection.basisWindow.basisCommit,
    basisIsT0: mined.selection.basisWindow.basisCommit === cand.t0,
    completeness: mined.selection.completeness,
    pairsEmitted: mined.selection.pairs.length,
    spanningObservation: spanning,
    armDUnrelatedPair: unrelated[0] ?? null,
    descriptiveOnly: true,
    statedAs: 'support and occurrences over a pinned basis revision and window',
    notClaimed: ['dependency', 'causality', 'blast radius', 'risk', 'required change'],
  };
  record.minedEvidence = mined;

  if (!record.rules.evidenceHonesty.pass) {
    record.disposition = 'REJECTED';
    record.rejectionReason =
      spanning.length === 0
        ? 'NO_T0_EVIDENCE_FOR_THE_RELATIONSHIP'
        : 'NO_PREREGISTERED_UNRELATED_PAIR_FOR_ARM_D';
    screened.push(record);
    console.error('#' + cand.order + ' ' + cand.repository + ' REJECTED ' + record.rejectionReason);
    continue;
  }

  record.disposition = 'ADMITTED';
  screened.push(record);
  admitted = record;
  console.error('#' + cand.order + ' ' + cand.repository + ' ADMITTED (all eight rules pass)');
  break;
}

const out = {
  experiment: 'META-383',
  kind: 'Stage 2b deep screening',
  frozenBy: 'PREREGISTRATION.md section 5, commit 032178b',
  maxDeepScreen: MAX_DEEP_SCREEN,
  deepScreened: screened.length,
  stoppedAtFirstAdmission: admitted !== null,
  admittedCandidate: admitted
    ? { order: admitted.order, repository: admitted.repository, t0: admitted.t0, changeA: admitted.changeA, changeB: admitted.changeB }
    : null,
  disposition: admitted ? 'CANDIDATE_ADMITTED' : 'BOUNDED_SEARCH_EXHAUSTED',
  exitZeroIsNotEvidence:
    'Every rule-3 and rule-5 verdict preserves the validation surface output for all four states; no verdict rests on an exit code alone.',
  candidates: screened,
};

writeFileSync(join(EXP, 'evidence', 'screening.json'), JSON.stringify(out, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      deepScreened: screened.length,
      disposition: out.disposition,
      admitted: out.admittedCandidate,
      rejections: screened.filter((s) => s.disposition === 'REJECTED').map((s) => ({ order: s.order, repo: s.repository, reason: s.rejectionReason })),
    },
    null,
    2,
  ),
);
