#!/usr/bin/env node
/**
 * Derives the HAC-349 landing model from frozen evidence.
 *
 * The landing surface renders this file and computes no meaning of its own,
 * exactly as the cockpit renders `media/hac-341/evidence/view-model.json`.
 * Running this after the evidence changes moves the front door with it; running
 * it when nothing changed rewrites the same bytes.
 *
 * Reads only frozen, main-resident artifacts. Writes one file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStory, ARTIFACTS } from '../lib/story.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/**
 * Load one artifact, or leave it absent.
 *
 * Absent is legitimate — HAC-343 is a sibling experiment and this surface has
 * to build without it, in which case every figure it would have carried renders
 * as `[BIND: …]`. Corrupt is not legitimate: a truncated artifact takes the
 * same branch and silently unbinds the whole front door while the build stays
 * green. Only ENOENT may pass. Same reasoning as `readOptional` in
 * media/hac-341/bin/build-view-model.mjs.
 */
function load(rel) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new Error(`${rel} exists but could not be read as JSON: ${error.message}`, { cause: error });
    }
    return undefined;
  }
}

const sources = Object.fromEntries(
  ARTIFACTS.map((rel) => [rel, load(rel)]).filter(([, v]) => v !== undefined),
);

const story = buildStory(sources);

const out = join(repoRoot, 'media', 'hac-349', 'evidence', 'landing-model.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(story, null, 2)}\n`);

const missing = ARTIFACTS.filter((rel) => sources[rel] === undefined);
console.log(`HAC-349 landing model written to media/hac-349/evidence/landing-model.json`);
console.log(`  artifacts read: ${ARTIFACTS.length - missing.length}/${ARTIFACTS.length}`);
if (missing.length) console.log(`  absent: ${missing.join(', ')}`);
console.log(`  bindings: ${story.resolved ? 'all resolved' : `${story.unresolved.length} unresolved`}`);
for (const u of story.unresolved) console.log(`    [BIND] ${u}`);
