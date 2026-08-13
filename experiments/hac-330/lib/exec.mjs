/**
 * One resolved `git` binary, one place that spawns it.
 *
 * Every module here shells out to git. Resolving the name `git` through `PATH`
 * on each call means the binary that runs is decided by the environment at call
 * time, and any writeable directory earlier in `PATH` can decide it — the risk
 * `javascript:S4036` names. It is also a real cost rather than a theoretical
 * one: `@workspacejson/mining-core` measures a bound 500-transition window at
 * 7.3–8.2 s with a short `PATH` and 27.2–29.9 s with a 36-entry one, precisely
 * because Node re-resolves the binary on every spawn.
 *
 * So resolution happens exactly once, here, at module load:
 *
 * 1. fixed, conventional absolute locations first;
 * 2. then `PATH`, skipping any entry that is not absolute — a relative `PATH`
 *    entry resolves against the current directory and is the sharp edge;
 * 3. and if neither yields an executable, it throws rather than falling back to
 *    the bare name, because a silent fallback would reintroduce what this
 *    module exists to remove.
 *
 * Callers spawn the resolved absolute path. `GIT` is exported so a run can
 * record which binary it actually used.
 */
import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

const FIXED_CANDIDATES = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git', '/bin/git'];

function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveGit() {
  for (const candidate of FIXED_CANDIDATES) {
    if (isExecutableFile(candidate)) return candidate;
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '' || !isAbsolute(dir)) continue;
    const candidate = join(dir, 'git');
    if (isExecutableFile(candidate)) return candidate;
  }
  throw new Error(
    'git could not be resolved to an absolute executable path. Install git, or put it in one of: ' +
      FIXED_CANDIDATES.join(', '),
  );
}

/** The absolute path of the git binary every call in this experiment uses. */
export const GIT = resolveGit();

/** Run git in a repository. */
export function git(repo, args, options = {}) {
  return execFileSync(GIT, ['-C', repo, ...args], { encoding: 'utf8', ...options });
}

/**
 * Run git with no repository context — `clone`, and anything else that takes
 * its target as an argument rather than as `-C`.
 */
export function runGit(args, options = {}) {
  return execFileSync(GIT, args, { encoding: 'utf8', ...options });
}

/**
 * Run git with git's own stderr suppressed.
 *
 * For probes whose failure is an expected, meaningful condition — a repository
 * with no commits, or a path outside any repository. Letting git print `fatal:`
 * there would put a line that reads as a defect into the middle of a run that is
 * working exactly as intended.
 */
export function quietGit(repo, args) {
  return git(repo, args, { stdio: ['ignore', 'pipe', 'ignore'] });
}
