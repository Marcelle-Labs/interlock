#!/usr/bin/env node
/**
 * Records the executed runtime source as a digest manifest.
 *
 * runtimeSourceSha `ae6d0d3…` is the commit that was deployed, and it stays the
 * recorded runtime identity. But that commit object cannot be published: its
 * tree carries `experiments/hac-340/evidence/local-traversal.json`, which
 * hardcodes the Google Cloud project identifier. Publishing a ref to it would
 * leak exactly what HAC-342 exists to redact.
 *
 * Rewriting the commit to drop that file would change its SHA, and a rewritten
 * commit renamed `runtimeSourceSha` would be a lie about which bytes ran.
 *
 * So this publishes neither. It records a per-file digest of the *source that
 * executed*, taken from the private commit, and a single digest over that
 * canonical listing. A reader who has the published product source can hash
 * their files and confirm they are the bytes that ran, without the private
 * commit ever becoming reachable.
 *
 * LOCAL GENERATION. Requires the private commit; never runs in public CI.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIME_SOURCE_SHA = 'ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a';

/**
 * What actually ran, plus the inputs that built it. Evidence artifacts are
 * excluded: they are the output of the run, not the source of it, and
 * `local-traversal.json` is the file that makes the commit unpublishable.
 */
const INCLUDE = [/^src\//, /^experiments\/hac-340\/(agent|bin|deploy)\//, /^(package\.json|pnpm-lock\.yaml|tsconfig\.json|tsconfig\.build\.json)$/];
const EXCLUDE = [/^experiments\/hac-340\/evidence\//];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Resolved to an absolute path rather than looked up on PATH. This tool reads
 * provenance, so the binary it trusts must not be selectable by whatever PATH
 * happens to be set when it runs.
 */
const GIT_BIN = [process.env.GIT_BIN, '/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git']
  .find((candidate) => candidate && existsSync(candidate));
if (!GIT_BIN) throw new Error('no git binary found at a fixed absolute path; set GIT_BIN');

const run = (args, options = {}) => execFileSync(GIT_BIN, args, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, ...options });
const git = (args) => run(args, { encoding: 'utf8' });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const paths = git(['ls-tree', '-r', '--name-only', RUNTIME_SOURCE_SHA])
  .split('\n')
  .filter(Boolean)
  .filter((p) => INCLUDE.some((re) => re.test(p)) && !EXCLUDE.some((re) => re.test(p)))
  .sort();

if (paths.length === 0) throw new Error(`no runtime source found at ${RUNTIME_SOURCE_SHA}; is the private commit present?`);

const files = paths.map((path) => ({
  path,
  sha256: sha256(run(['cat-file', 'blob', `${RUNTIME_SOURCE_SHA}:${path}`])),
}));

// One digest over the canonical listing, so the snapshot has a single identity.
const listing = files.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n';
const runtimeSourceSnapshotSha256 = sha256(listing);

const snapshot = {
  issue: 'HAC-342',
  kind: 'runtime source snapshot',
  runtimeSourceSha: RUNTIME_SOURCE_SHA,
  runtimeSourceShaPublished: false,
  runtimeSourceShaWithheldBecause:
    'The tree at this commit contains experiments/hac-340/evidence/local-traversal.json, which hardcodes the '
    + 'Google Cloud project identifier. Publishing a ref to this commit would expose it.',
  runtimeSourceSnapshotSha256,
  snapshotSemantics:
    'runtimeSourceSnapshotSha256 is the SHA-256 of the canonical "<sha256>  <path>" listing below, sorted by path. '
    + 'It corresponds to the source recorded at runtimeSourceSha but is NOT that Git commit object and must never '
    + 'be presented as runtimeSourceSha. Each file digest is the SHA-256 of that file’s bytes as they executed.',
  fileCount: files.length,
  files,
};

mkdirSync(join(repoRoot, 'experiments', 'hac-342', 'evidence'), { recursive: true });
writeFileSync(join(repoRoot, 'experiments', 'hac-342', 'evidence', 'runtime-source-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
process.stdout.write(`runtimeSourceSnapshotSha256 ${runtimeSourceSnapshotSha256}\nfiles ${files.length}\n`);
