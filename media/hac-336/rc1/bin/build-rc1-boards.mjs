#!/usr/bin/env node
/**
 * Rasterises RC1's own copies of the architecture boards.
 *
 * RC1 films a SECOND cloud run, in a different project from the one HAC-336's
 * frozen boards describe. IL-DIAG-020 names the run it explains, so reusing
 * HAC-336's copies would put two run identities and two projects in one act.
 *
 * `build-boards.mjs` renders the SVGs from whichever evidence it is pointed at
 * (see HAC336_FILMED_RUN / HAC336_CAPTURE_PACKAGE / HAC336_BOARDS_OUT); this
 * turns the two RC1 needs into frames, with the same rasteriser settings, so
 * the only difference from HAC-336's frames is the run they name.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const rc1 = join(here, '..');
const repoRoot = join(rc1, '..', '..', '..');
const W = 1920, H = 1080;

/*
 * Transcribed from build-frames.mjs, not invented here. These boards sit between
 * HAC-336 frames in the same cut; a different font stack would make RC1's two
 * architecture boards render in a different typeface from every other board and
 * the seam would be visible.
 */
const FONT = {
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica',
  sansSerifFamily: 'Helvetica',
  monospaceFamily: 'Courier',
};

const BOARDS = [
  { beatId: 'R12', master: 'IL-DIAG-020', state: 'path', file: 'IL-DIAG-020-filmed-run-path-path.svg' },
  { beatId: 'R13', master: 'IL-DIAG-020', state: 'boundary', file: 'IL-DIAG-020-filmed-run-path-boundary.svg' },
];

const framesDir = join(rc1, 'frames');
mkdirSync(framesDir, { recursive: true });
const run = JSON.parse(readFileSync(join(repoRoot, 'experiments/hac-324/evidence/live-capture-run.json'), 'utf8'));

for (const b of BOARDS) {
  const svg = readFileSync(join(rc1, 'masters', b.file), 'utf8');
  // The board must name the run the film actually shows, and must not name the other one.
  if (!svg.includes(run.correlationId)) throw new Error(`${b.file} does not name ${run.correlationId}`);
  for (const stale of ['1787536029323', 'interlock-film-260823']) {
    if (svg.includes(stale)) throw new Error(`${b.file} still names the first run (${stale})`);
  }
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: FONT }).render().asPng());
  const out = `${b.beatId}-${b.master}-${b.state}.png`;
  writeFileSync(join(framesDir, out), png);
  process.stderr.write(`  ${out}  ${png.length} bytes  sha256 ${createHash('sha256').update(png).digest('hex').slice(0, 16)}…\n`);
}
process.stderr.write(`${BOARDS.length} RC1 board frames, bound to ${run.correlationId}\n`);
