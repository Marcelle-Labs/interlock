/**
 * The evidence substrate adapter.
 *
 * Interlock does not mine anything. It locates the pinned `workspacejson/cli`
 * sibling checkout, refuses to proceed unless that checkout is at the revision
 * `provenance/manifest.json` records, executes the upstream
 * `mine -> score -> select` pipeline in place, and wraps the verbatim result in
 * a provenance envelope.
 *
 * Three boundaries are enforced here rather than documented and hoped for:
 *
 * 1. **No mining logic is copied.** The pipeline is imported from the sibling
 *    checkout's built output. `@workspacejson/mining-core` is `private: true`
 *    and unpublished, which is what keeps it out of this repository.
 *
 * 2. **No L1 projection.** The package authorizes `mine -> score -> select`
 *    only; projecting a selection onto `generated.coChange` is step 3 of A-009's
 *    staged transition and the package does not authorize it. Nothing here
 *    writes a `workspace.json`, and the `project()` export is deliberately not
 *    called. Interlock consumes the selection *as evidence*.
 *
 * 3. **No pin drift.** A mismatch between the checkout and the manifest is a
 *    hard failure. Evidence produced from an unrecorded revision is evidence
 *    nobody can recount.
 *
 * The artifact digest is taken over the bytes of the upstream
 * `serializeSelection`, not over this module's envelope, so the digest is a
 * digest of what the producer emitted.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { git, quietGit } from './exec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..', '..');

const MINING_CORE_ENTRY = join('packages', 'mining-core', 'dist', 'index.js');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** The manifest is the authority on which revision may be executed. */
export function manifestPin(id) {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'provenance', 'manifest.json'), 'utf8'));
  const entry = manifest.dependencies.find((dependency) => dependency.id === id);
  if (!entry) throw new Error(`provenance/manifest.json has no dependency "${id}"`);
  return entry;
}

/**
 * Locate the pinned sibling checkout.
 *
 * `WORKSPACEJSON_CLI` overrides the search for a checkout in a non-standard
 * place. The search itself walks up from this repository looking for the
 * documented sibling layout, so it works from the primary checkout and from an
 * issue worktree without either path being hardcoded.
 */
export function resolveCliCheckout() {
  const candidates = [];
  if (process.env.WORKSPACEJSON_CLI) candidates.push(resolve(process.env.WORKSPACEJSON_CLI));

  let dir = REPO_ROOT;
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(dir, '..', 'cli'));
    dir = resolve(dir, '..');
  }

  for (const candidate of candidates) {
    const path = resolve(candidate);
    if (existsSync(join(path, MINING_CORE_ENTRY))) return path;
  }

  throw new Error(
    `could not find the pinned workspacejson/cli checkout (looked for ${MINING_CORE_ENTRY}). ` +
      'Clone it as a sibling per docs/development/workspace.md and run ' +
      '`pnpm install --frozen-lockfile && pnpm -r build`, or set WORKSPACEJSON_CLI.',
  );
}

/**
 * Verify a sibling checkout is at its recorded revision and unmodified.
 *
 * Refusing on drift is the point. HAC-328 forbids modifying `workspacejson/cli`
 * to make a fixture pass, and an experiment that silently ran against a dirty
 * or moved checkout could not distinguish a real result from a local edit.
 */
export function verifyPin(id, checkout) {
  const pin = manifestPin(id);
  const head = git(checkout, ['rev-parse', 'HEAD']).trim();
  const dirty = git(checkout, ['status', '--porcelain']).trim();

  const problems = [];
  if (head !== pin.pinnedSha) {
    problems.push(`${pin.repository} is at ${head} but the manifest pins ${pin.pinnedSha}`);
  }
  if (dirty !== '') {
    problems.push(
      `${pin.repository} has ${dirty.split('\n').length} modified path(s); evidence from a dirty checkout is not reproducible`,
    );
  }

  return {
    id,
    repository: pin.repository,
    remote: pin.remote,
    disposition: pin.disposition,
    pinnedSha: pin.pinnedSha,
    observedSha: head,
    clean: dirty === '',
    matches: problems.length === 0,
    problems,
  };
}

/** Load the upstream pipeline from the pinned checkout, refusing on drift. */
export async function loadMiner() {
  const checkout = resolveCliCheckout();
  const pin = verifyPin('workspacejson-cli', checkout);
  if (!pin.matches) {
    throw new Error(`refusing to mine: ${pin.problems.join('; ')}`);
  }

  const entry = join(checkout, MINING_CORE_ENTRY);
  const pipeline = await import(pathToFileURL(entry).href);
  const packageJson = JSON.parse(
    readFileSync(join(checkout, 'packages', 'mining-core', 'package.json'), 'utf8'),
  );

  return {
    pipeline,
    producer: {
      repository: pin.repository,
      remote: pin.remote,
      pinnedSha: pin.pinnedSha,
      observedSha: pin.observedSha,
      checkoutClean: pin.clean,
      package: packageJson.name,
      version: packageJson.version,
      published: packageJson.private !== true,
      entrypoint: MINING_CORE_ENTRY,
      bundleSha256: sha256(readFileSync(entry)),
      pipeline: 'mine -> score -> select',
      l1ProjectionUsed: false,
      l1ProjectionNote:
        'project() is exported by the package but is deliberately not called: L1 emission onto generated.coChange is step 3 of the A-009 staged transition and the package does not authorize it.',
    },
  };
}

/**
 * Mine one repository and return the evidence envelope Interlock consumes.
 *
 * `sourceRevision` is the revision of the repository the intents will mutate.
 * `historyBasis` is what the miner actually counted against. They are recorded
 * separately and compared by the decision function, because a pin that has
 * fallen behind the working revision is a stale observation, not a clean one.
 */
export async function mineEvidence({ fixture, repo, miner }) {
  const { pipeline, producer } = miner;
  const { mine, score, select, serializeSelection } = pipeline;

  const observations = await mine(repo);
  const scored = score(observations);
  const selection = select(scored);

  const serialized = serializeSelection(selection);
  const bytes = Buffer.from(serialized, 'utf8');

  let sourceRevision = null;
  let sourceTree = null;
  let commitCount = 0;
  let toplevel = null;
  try {
    sourceRevision = quietGit(repo, ['rev-parse', 'HEAD']).trim();
    sourceTree = quietGit(repo, ['rev-parse', 'HEAD^{tree}']).trim();
    commitCount = Number(quietGit(repo, ['rev-list', '--count', 'HEAD']).trim());
  } catch {
    // A repository with no commits, or none at all. That is a real condition
    // the completeness state already describes; it must not be smoothed into a
    // plausible-looking revision here.
  }
  try {
    toplevel = realpathSync(quietGit(repo, ['rev-parse', '--show-toplevel']).trim());
  } catch {
    // Not inside any repository at all.
  }

  // Attribution, checked rather than assumed.
  //
  // Git resolves a path by walking *up* until it finds a repository, so mining
  // a directory that is not itself a repository silently mines the nearest
  // ancestor that is. The result is well-formed, reports MINED, and is about a
  // different repository than the caller named. No completeness state describes
  // that — from the miner's side the analysis genuinely succeeded — so the
  // adapter records it here. Bounded, consumer-local, and it changes nothing
  // upstream: the observation is reported, not repaired.
  const requested = existsSync(repo) ? realpathSync(repo) : resolve(repo);
  const isRequestedRepository = toplevel !== null && toplevel === requested;

  // Absolute paths are compared, but never recorded. A committed evidence
  // packet that carries `/Users/<someone>/…` is both unreproducible on another
  // machine and a gratuitous disclosure of a home directory.
  const record = (absolute) => {
    if (absolute === null) return null;
    const rel = relative(realpathSync(REPO_ROOT), absolute);
    if (rel === '') return '.';
    return rel.startsWith('..') ? `<outside-repository>/${basename(absolute)}` : rel;
  };

  return {
    envelope: {
      experiment: 'HAC-330',
      fixture,
      producer,
      source: {
        repository: record(requested),
        revision: sourceRevision,
        tree: sourceTree,
        commitCount,
        toplevel: record(toplevel),
        isRequestedRepository,
      },
      historyBasis: {
        basisRevision: selection.scoringBasis?.basisRevision ?? null,
        weightingVersion: selection.scoringBasis?.weightingVersion ?? null,
        availableTransitions: selection.basisWindow?.availableTransitions ?? null,
        extractedTransitions: selection.basisWindow?.extractedTransitions ?? null,
        windowTruncated: selection.basisWindow?.windowTruncated ?? null,
      },
      completeness: selection.completeness,
      receipt: selection.receipt,
      artifact: { serialization: 'serializeSelection', bytes: bytes.length, sha256: sha256(bytes) },
      selection,
    },
    serialized,
    digest: sha256(bytes),
  };
}

export { sha256 };
