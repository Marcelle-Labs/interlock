#!/usr/bin/env node
/**
 * META-383 Stage 2a — mechanical candidate enumeration.
 *
 * Implements PREREGISTRATION.md section 4 exactly. No human judgement selects a
 * pair; this script is the selection.
 *
 * Reading of Step 3 applied here, stated so it is auditable: "patch B ... must
 * apply cleanly to T0" is part of the *definition of a replayable pair*, not a
 * deep-screen check. A pair whose B patch cannot be replayed onto T0 is not a
 * candidate pair at all, so it never consumes quota or deep-screen budget.
 *
 * Equivalence optimisation, also stated: rather than apply-checking all ~3.7k
 * filtered pairs per repository, pairs are sorted by the frozen score and
 * apply-checked in that order, taking the first N that replay. This yields the
 * identical quota set the literal rule would, at a fraction of the cost.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = dirname(HERE);
const WORK = join(EXP, '.work', 'stage2');

// ------------------------------------------------------------ frozen inputs

const REPOS = [
  { repo: 'polyfy/polylith', name: 'polylith', pin: '68dab9868274c8044817983c2424fbdbd616a456', quota: 14 },
  { repo: 'JamieMason/syncpack', name: 'syncpack', pin: '958d30689ac24b60623258630242330bd6d0264b', quota: 13 },
  { repo: 'formatjs/formatjs', name: 'formatjs', pin: '27c29bf9a40a50dac232a159b8790dbd14732c57', quota: 13 },
];

const WINDOW = 150;
const MAX_DISTANCE = 25;
const TOTAL_CEILING = 40;

const LOCKFILES = new Set([
  'Cargo.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'MODULE.bazel.lock',
]);
const VENDORED = new Set(['node_modules', 'vendor', 'third_party', 'target', 'dist', 'build']);

const isSourcePath = (p) => {
  const segs = p.split('/');
  const base = segs[segs.length - 1];
  if (LOCKFILES.has(base) || base.endsWith('.lock')) return false;
  return !segs.some((s) => VENDORED.has(s));
};

const clonePath = (name) => '/private/tmp/meta375/clones/' + name;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// ------------------------------------------------------------ token scoring

const TOKEN = /[A-Za-z_][A-Za-z0-9_]{3,}/g;

function diffTokens(diffText) {
  const added = new Set();
  const removed = new Set();
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const target = line.startsWith('+') ? added : line.startsWith('-') ? removed : null;
    if (!target) continue;
    const m = line.slice(1).match(TOKEN);
    if (m) for (const t of m) target.add(t);
  }
  // REM(C) = tokens removed and not re-added by the same commit.
  const remOnly = new Set([...removed].filter((t) => !added.has(t)));
  return { added, remOnly };
}

const intersectionSize = (a, b) => {
  let n = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) n++;
  return n;
};

// ------------------------------------------------------------ per repository

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const perRepo = [];

for (const R of REPOS) {
  const dir = clonePath(R.name);

  // Step 1 — window: the 150 most recent non-merge first-parent commits.
  const window = git(dir, 'rev-list', '--first-parent', '--no-merges', '-n', String(WINDOW), R.pin)
    .trim()
    .split('\n')
    .filter(Boolean);

  // Per-commit facts, computed once.
  const info = new Map();
  for (const sha of window) {
    const names = git(dir, 'show', '--format=', '--name-only', sha)
      .trim()
      .split('\n')
      .filter(Boolean);
    const sourcePaths = names.filter(isSourcePath);
    let tokens = { added: new Set(), remOnly: new Set() };
    if (sourcePaths.length) {
      const diff = git(dir, 'show', '--format=', '-U0', sha, '--', ...sourcePaths);
      tokens = diffTokens(diff);
    }
    info.set(sha, { sha, allPaths: names, sourcePaths, tokens });
  }

  // Steps 2 + 4 — pair domain and mechanical filters.
  const filtered = [];
  let consideredPairs = 0;
  const rejected = { noSourcePath: 0, pathsOverlap: 0 };

  for (let i = 0; i < window.length; i++) {
    for (let j = Math.max(0, i - MAX_DISTANCE); j < i; j++) {
      // index 0 is newest; larger index is older. Ca (older) = i, Cb (newer) = j.
      consideredPairs++;
      const A = info.get(window[i]);
      const B = info.get(window[j]);
      if (!A.sourcePaths.length || !B.sourcePaths.length) {
        rejected.noSourcePath++;
        continue;
      }
      const bAll = new Set(B.allPaths);
      if (A.allPaths.some((p) => bAll.has(p))) {
        rejected.pathsOverlap++;
        continue;
      }
      // Step 5 — referential-adjacency score.
      const score =
        intersectionSize(A.tokens.remOnly, B.tokens.added) +
        intersectionSize(B.tokens.remOnly, A.tokens.added);
      filtered.push({ ca: A.sha, cb: B.sha, iOlder: i, jNewer: j, score });
    }
  }

  // Step 6 ordering — score DESC, then newer-commit date DESC, then SHAs ASC.
  const dateOf = new Map(
    window.map((s) => [s, git(dir, 'show', '-s', '--format=%ct', s).trim()]),
  );
  filtered.sort(
    (x, y) =>
      y.score - x.score ||
      Number(dateOf.get(y.cb)) - Number(dateOf.get(x.cb)) ||
      (x.ca < y.ca ? -1 : x.ca > y.ca ? 1 : 0) ||
      (x.cb < y.cb ? -1 : x.cb > y.cb ? 1 : 0),
  );

  // Step 3 — replayability, checked in frozen order until the quota is filled.
  const quotaSet = [];
  const replayRejected = [];
  const probe = join(WORK, R.name + '-probe');
  rmSync(probe, { recursive: true, force: true });

  for (const cand of filtered) {
    if (quotaSet.length >= R.quota) break;
    const t0 = git(dir, 'rev-parse', cand.ca + '^').trim();
    let ok = true;
    let reason = null;
    try {
      git(dir, 'worktree', 'add', '--detach', '-f', probe, t0);
      const patchB = git(dir, 'format-patch', '-1', '--stdout', cand.cb);
      writeFileSync(join(WORK, 'probe.patch'), patchB);
      try {
        git(probe, 'apply', '--check', join(WORK, 'probe.patch'));
      } catch (err) {
        ok = false;
        reason = 'PATCH_B_DOES_NOT_APPLY_TO_T0';
      }
    } catch (err) {
      ok = false;
      reason = 'T0_UNRESOLVABLE';
    } finally {
      try {
        git(dir, 'worktree', 'remove', '--force', probe);
      } catch {
        rmSync(probe, { recursive: true, force: true });
      }
    }
    if (ok) {
      quotaSet.push({ ...cand, t0 });
    } else {
      replayRejected.push({ ca: cand.ca, cb: cand.cb, score: cand.score, reason });
    }
  }

  perRepo.push({
    repository: R.repo,
    pin: R.pin,
    quota: R.quota,
    windowSize: window.length,
    consideredPairs,
    mechanicallyRejected: rejected,
    pairsPassingMechanicalFilters: filtered.length,
    replayRejectedWhileFillingQuota: replayRejected,
    scoreDistribution: {
      max: filtered.length ? filtered[0].score : null,
      nonZeroScorePairs: filtered.filter((p) => p.score > 0).length,
    },
    enumerated: quotaSet,
  });

  console.error(
    R.name +
      ': window=' +
      window.length +
      ' considered=' +
      consideredPairs +
      ' filtered=' +
      filtered.length +
      ' enumerated=' +
      quotaSet.length +
      ' topScore=' +
      (filtered.length ? filtered[0].score : 'n/a'),
  );
}

// ------------------------------------------------------- deep-screen ordering

const REPO_ORDER = REPOS.map((r) => r.repo);
const all = [];
for (const r of perRepo) {
  r.enumerated.forEach((c, rank) => {
    all.push({ repository: r.repository, quotaRank: rank, ...c });
  });
}
if (all.length > TOTAL_CEILING) {
  throw new Error('enumeration exceeded the frozen ceiling of ' + TOTAL_CEILING);
}

// Step 7 — score DESC, tie-break by repository order then quota rank.
all.sort(
  (x, y) =>
    y.score - x.score ||
    REPO_ORDER.indexOf(x.repository) - REPO_ORDER.indexOf(y.repository) ||
    x.quotaRank - y.quotaRank,
);

const out = {
  experiment: 'META-383',
  kind: 'Stage 2a mechanical candidate enumeration',
  frozenBy: 'PREREGISTRATION.md section 4, commit 032178b',
  parameters: {
    window: WINDOW,
    maxWindowDistance: MAX_DISTANCE,
    totalCeiling: TOTAL_CEILING,
    quotas: Object.fromEntries(REPOS.map((r) => [r.repo, r.quota])),
    sourcePathRule: {
      lockfiles: [...LOCKFILES],
      lockSuffix: '.lock',
      vendoredSegments: [...VENDORED],
    },
    scoreRule:
      'score = |REM(Ca) INTERSECT ADD(Cb)| + |REM(Cb) INTERSECT ADD(Ca)|, identifiers /[A-Za-z_][A-Za-z0-9_]{3,}/ over source-path diff hunks at -U0; REM(C) excludes tokens the same commit re-adds',
    replayReading:
      'Step 3 replayability is part of the definition of a candidate pair. Pairs are apply-checked in frozen score order until the quota fills, which selects the identical set the literal rule would.',
  },
  totalEnumerated: all.length,
  deepScreenOrder: all.map((c, i) => ({
    order: i + 1,
    repository: c.repository,
    score: c.score,
    t0: c.t0,
    ca: c.ca,
    cb: c.cb,
  })),
  perRepository: perRepo,
};

mkdirSync(join(EXP, 'evidence'), { recursive: true });
writeFileSync(join(EXP, 'evidence', 'candidates.json'), JSON.stringify(out, null, 2) + '\n');

console.log(
  JSON.stringify(
    {
      totalEnumerated: all.length,
      ceiling: TOTAL_CEILING,
      top6: out.deepScreenOrder.slice(0, 6),
    },
    null,
    2,
  ),
);
