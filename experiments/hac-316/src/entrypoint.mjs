/**
 * Whether this module is the program Node was asked to run.
 *
 * ## The bug this replaces
 *
 * The obvious spelling is
 *
 *     fileURLToPath(import.meta.url) === process.argv[1]
 *
 * and it is wrong in a way that fails silently. Node's ESM loader resolves the
 * module's own URL through `realpath` (symlinks are followed unless
 * `--preserve-symlinks` is set), but `process.argv[1]` is handed back exactly as
 * it was typed. Invoke a script through a symlinked checkout — a worktree
 * reached by a convenience link, a packaged tree, a CI cache that links its
 * source directory — and the two strings differ. The comparison is false, `main`
 * never runs, and the process exits **0 having done nothing and printed
 * nothing**.
 *
 * That is the worst possible failure for a gate. A verifier that exits non-zero
 * is a finding; a verifier that exits 0 with no output looks exactly like a
 * verifier that checked everything and was satisfied. Reproduced before the fix:
 * `node /tmp/link/repo/experiments/hac-316/bin/verify-packet.mjs` exited 0 with
 * 0 bytes of output, while the same file reached through its real path exited 1
 * with 2291 bytes.
 *
 * ## What this does instead
 *
 * Both sides are put through `realpath` before they are compared, so the
 * question asked is "are these the same file on disk", which is the question
 * that was always meant. A path that cannot be resolved (it was deleted between
 * launch and this call, or the argument was never a path at all) falls back to
 * the literal string rather than throwing: refusing to answer would turn a
 * missing file into a crash inside an entrypoint check.
 *
 * `test/entrypoint.test.mjs` runs a real verifier through a real symlink and
 * asserts it still does its work.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Resolve a path to its canonical location, or return it unchanged. */
export function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    // Unresolvable is not an error here. The caller is deciding whether to run
    // `main()`, and a throw would convert "the path moved" into a crash.
    return path;
  }
}

/**
 * True when `moduleUrl` names the same file on disk as the launched script.
 *
 * @param {string} moduleUrl `import.meta.url` of the calling module.
 * @param {string|undefined} [argv] the launched script path; defaults to
 *        `process.argv[1]`, which is absent when Node was given `-e` or a REPL.
 */
export function isDirectInvocation(moduleUrl, argv = process.argv[1]) {
  if (typeof argv !== 'string' || argv === '') return false;
  return canonicalPath(fileURLToPath(moduleUrl)) === canonicalPath(argv);
}
