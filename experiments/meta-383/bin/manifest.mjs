#!/usr/bin/env node
/** META-383 — SHA-256 over every preserved file in the evidence package. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXP = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP = new Set(['.work', 'MANIFEST.json', '.gitignore']);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir).sort()) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(EXP).map((p) => {
  const buf = readFileSync(p);
  return { path: relative(EXP, p), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
});

writeFileSync(
  join(EXP, 'MANIFEST.json'),
  JSON.stringify(
    {
      experiment: 'META-383',
      disposition: 'BOUNDED_SEARCH_EXHAUSTED',
      stage1: 'MECHANISM_TRANSFER_ONLY',
      stagesReached: [0, 1, 2],
      stagesNotReached: [3, 4, 5],
      modelRuns: 0,
      fileCount: files.length,
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(files.length + ' files hashed');
