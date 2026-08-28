#!/usr/bin/env node
/**
 * HAC-335 — deterministic first/last keyframes for the Veo hero sequence.
 *
 * Veo is never asked to invent the Interlock mark. It is handed two exact
 * 1920x1080 frames built from the canonical SVG geometry and told to connect
 * them. What the model may author is the environment, the material, the camera
 * and the mechanics of the transition between the two states — never the
 * identity, and never a factual claim.
 *
 * The two states are the frozen endpoints of the five-state motion model in
 * `assets/tokens/motion.css`:
 *
 *   start  interlock-symbol-white.svg   leaves meet at 23.2 / 24.8   (closed)
 *   end    interlock-symbol-open.svg    leaves stand at 21.6 / 26.4  (authorized)
 *
 * GATE_TRAVEL in `assets/brand/logo-geometry.js` is 1.6 units per leaf, and the
 * gate check below asserts the two frames actually differ by 3.2 units of
 * aperture rather than merely looking different.
 *
 * No wordmark appears in either frame. The canonical lockup is composited
 * deterministically after the generated clip, by build-end-card.mjs — a
 * generative model may not draw the Interlock name.
 *
 *     node media/hac-335/veo-hero/bin/build-keyframes.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildExportName, validateExportName } from '../../../../scripts/export-naming.mjs';
import { markPaths, assertCanonical, leafExtents, repoRoot } from './lib/mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'keyframes');
const evidenceDir = join(here, '..', 'evidence');

const W = 1920;
const H = 1080;

/* Field and material, from assets/tokens/colors.css. The environment is the
   canonical ink; the mark is the canonical paper. No brand hue is introduced —
   "the identity carries no brand hue: the mark is ink on paper, or paper on
   ink." This is paper on ink. */
const INK = '#0b0d0e';       // --il-n-99
// INK_DEEP retired with the radial lift; the field is flat ink.
const PAPER = '#fbfbfa';     // --il-paper
const PAPER_EDGE = '#e8e9e7'; // restrained specular falloff on the mark's lower half

/**
 * Monumental staging. 660px of a 1080px frame is a little under two thirds:
 * large enough to read as architecture, small enough that the negative space
 * is the composition rather than the leftovers.
 */
const MARK = 660;
const MARK_X = (W - MARK) / 2;         // 630
const MARK_Y = Math.round(H * 0.46) - MARK / 2; // optically centred, seated slightly high

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * The environment Veo extends: a flat near-black field.
 *
 * An earlier pass lifted the field with a wide radial gradient. At 8 bits over
 * 1080 rows that spread six code values across hundreds of pixels and rasterised
 * as visible concentric banding — a defect in the one frame the model is told to
 * reproduce exactly, and the kind of low-amplitude structure a video model
 * happily amplifies into noise. The field is therefore flat: it is the cleanest
 * possible instruction, and lighting is Veo's job rather than the keyframe's.
 *
 * The material gradient on the mark stays. It spans 660px of ivory rather than
 * 1920px of near-black, so it resolves smoothly, and it tells the model the mark
 * is a lit physical object rather than a flat vector fill.
 */
function environment() {
  return `
  <defs>
    <linearGradient id="material" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PAPER}"/>
      <stop offset="62%" stop-color="${PAPER}"/>
      <stop offset="100%" stop-color="${PAPER_EDGE}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`;
}

/** Embed the canonical paths verbatim, scaled into the staged rectangle. */
function mark(paths) {
  const body = paths
    .map((p) => `<path d="${p.d}"${p.opacity ? ` opacity="${p.opacity}"` : ''}></path>`)
    .join('');
  return `<svg x="${MARK_X}" y="${MARK_Y}" width="${MARK}" height="${MARK}"`
    + ` viewBox="0 0 48 48" fill="url(#material)" overflow="visible">${body}</svg>`;
}

function frame(file) {
  const paths = markPaths(file);
  assertCanonical(file, paths);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"`
    + ` viewBox="0 0 ${W} ${H}" role="img" aria-label="Interlock">`
    + environment() + mark(paths) + '</svg>';
  return { svg, paths };
}

function render(svg) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, background: INK }).render().asPng();
  // resvg reports what it actually wrote; trust the header, not the request.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== W || height !== H) throw new Error(`rasterised ${width}x${height}, expected ${W}x${H}`);
  return png;
}

/* -- build ---------------------------------------------------------------- */

mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const SPEC = [
  { role: 'start', slug: 'veo-hero-start', source: 'assets/logo/interlock-symbol-white.svg',
    state: 'closed', semantic: 'shared boundary, unauthorized' },
  { role: 'end', slug: 'veo-hero-end', source: 'assets/logo/interlock-symbol-open.svg',
    state: 'open', semantic: 'gate fully open, authorized' },
];

const rows = [];
for (const spec of SPEC) {
  const { svg, paths } = frame(spec.source);
  const name = buildExportName({ id: 'IL-MOT-030', slug: spec.slug, width: W, height: H, ext: 'png' });
  const check = validateExportName(name);
  if (!check.valid) throw new Error(`keyframe filename violates the naming contract: ${name} — ${check.error}`);

  const png = render(svg);
  writeFileSync(join(outDir, name), png);
  writeFileSync(join(outDir, name.replace(/\.png$/, '.svg')), svg);

  rows.push({
    role: spec.role,
    state: spec.state,
    semanticState: spec.semantic,
    sourceAsset: spec.source,
    sourceSha256: sha256(readFileSync(join(repoRoot, spec.source))),
    master: `media/hac-335/veo-hero/keyframes/${name.replace(/\.png$/, '.svg')}`,
    file: `media/hac-335/veo-hero/keyframes/${name}`,
    width: W,
    height: H,
    sha256: sha256(png),
    canonicalPaths: paths.map((p) => p.d),
    leaves: leafExtents(paths),
  });
  console.log(`  ${name}  ${sha256(png).slice(0, 12)}…  ${(png.length / 1024).toFixed(0)} KiB`);
}

/* -- the gate travelled, and by exactly the frozen amount ------------------ */

const [start, end] = rows;
const travel = Number((end.leaves.aperture - start.leaves.aperture).toFixed(4));
const geometry = readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8');
const declared = Number(/GATE_TRAVEL\s*=\s*([\d.]+)/.exec(geometry)?.[1]);
if (!Number.isFinite(declared)) throw new Error('could not read GATE_TRAVEL from assets/brand/logo-geometry.js');
if (travel !== declared * 2) {
  throw new Error(`aperture opened by ${travel} units; GATE_TRAVEL declares ${declared} per leaf, so ${declared * 2} was expected`);
}
if (start.sha256 === end.sha256) throw new Error('the two keyframes are byte-identical; there is no state change to animate');

writeFileSync(
  join(evidenceDir, 'keyframe-manifest.json'),
  `${JSON.stringify({
    manifestId: 'IL-MOT-030-keyframes',
    issue: 'HAC-335',
    note: 'Deterministic first/last frames for the Veo hero sequence. Built from canonical '
      + 'SVG geometry; carries no factual claim and no typography.',
    geometry: { grid: 48, gateTravelPerLeaf: declared, apertureDelta: travel },
    stage: { width: W, height: H, markSize: MARK, markX: MARK_X, markY: MARK_Y },
    palette: { field: INK, material: PAPER, materialEdge: PAPER_EDGE },
    containsTypography: false,
    keyframes: rows,
  }, null, 2)}\n`,
);

console.log(`\n  aperture ${start.leaves.aperture} -> ${end.leaves.aperture} units (+${travel}, GATE_TRAVEL ${declared}/leaf)`);
console.log('  keyframe-manifest.json written');
