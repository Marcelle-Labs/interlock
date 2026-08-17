/**
 * The deterministic identity of the surface a cockpit capture was taken from.
 *
 * The hole this closes: `capture-manifest.json` recorded `capturedFromSha`, but
 * nothing ever compared it to anything. A commit SHA is provenance — it says
 * which commit was served — and it cannot answer the question the package gate
 * actually needs answered, which is *are these PNGs still what the cockpit
 * renders?* Editing `cockpit.html` after a capture left four stale screenshots
 * in the judge package with no mechanical signal at all.
 *
 * A commit SHA also cannot be used for this: the capture is committed in the
 * same commit it would have to name, so binding to it is self-referential.
 * A digest over the render sources has neither problem — it is computable
 * before the commit exists, and it moves the moment any byte that can change a
 * captured pixel changes.
 *
 * The set is deliberately over- rather than under-inclusive. A font file cannot
 * change without changing every glyph in every frame, so it belongs here even
 * though it changes rarely; the token files are globbed rather than listed so a
 * newly added one is covered without anyone remembering to add it.
 *
 * Dependency-free and sorted, so CI and a laptop compute the same value.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Files named individually because they have no useful directory pattern. */
const EXPLICIT = [
  'media/hac-341/cockpit.html',
  'media/hac-341/evidence/view-model.json',
  'assets/styles.css',
];

/** Directories swept by extension, so a new member is covered automatically. */
const SWEPT = [
  ['media/hac-341/lib', /\.mjs$/],
  ['assets/tokens', /\.css$/],
  ['assets/fonts', /\.woff2$/],
];

/**
 * Byte-stable ordering.
 *
 * Deliberately **not** `localeCompare`, which is the usual advice for an
 * unparameterised `sort()`: this ordering feeds a digest that CI and a laptop
 * have to agree on, and locale-aware collation is not guaranteed identical
 * across environments or ICU builds. Comparing code units is.
 */
const byPath = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

/** Every file whose bytes can change what a capture looks like, sorted. */
export function captureSourceFiles(root) {
  const files = [...EXPLICIT];
  for (const [dir, pattern] of SWEPT) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (pattern.test(name)) files.push(`${dir}/${name}`);
    }
  }
  return files.sort(byPath);
}

/**
 * A digest over those files' paths and contents.
 *
 * Paths are folded in alongside the bytes so that renaming a file — which can
 * break a stylesheet reference without changing any content — also moves the
 * digest.
 */
export function captureSourceDigest(root) {
  const outer = createHash('sha256');
  for (const rel of captureSourceFiles(root)) {
    const abs = join(root, rel);
    if (!existsSync(abs)) throw new Error(`capture source is missing: ${rel}`);
    const inner = createHash('sha256').update(readFileSync(abs)).digest('hex');
    outer.update(`${rel}\0${inner}\n`);
  }
  return outer.digest('hex');
}
