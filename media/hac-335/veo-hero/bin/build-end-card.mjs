#!/usr/bin/env node
/**
 * HAC-335 — the deterministic end card that resolves the Veo hero sequence.
 *
 * Veo does not draw the Interlock wordmark. The generated clip ends on the open
 * gate and nothing else; the name arrives here, composited from
 * `assets/logo/interlock-lockup-horizontal-white.svg` on the same near-black
 * field the clip resolves to, so the cut lands on canonical typography rather
 * than on a model's impression of it.
 *
 * The card carries exactly one line of copy, and it is not new:
 *
 *     "Evidence-bound coordination before shared-state mutation."
 *
 * That sentence is already frozen in README.md, in HAC-333's scene manifest
 * (SB-08 editorialCopy), and on the HAC-335 title and open-graph cards. HAC-336
 * carries it too, in its B01 narration, but that is a downstream consumer on an
 * unmerged branch and is deliberately NOT cited as an authority here: HAC-335
 * may not depend on HAC-336 to establish its own copy. This card restates it; it does not
 * author it, sharpen it, or add a second proposition beside it. No figure, no
 * proof class, no run identity and no issue number appears here — those belong
 * to `IL-SCAF-011`, which remains the cut's evidence end card.
 *
 * This card is therefore a brand resolution, not a claim surface.
 *
 *     node media/hac-335/veo-hero/bin/build-end-card.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildExportName, validateExportName } from '../../../../scripts/export-naming.mjs';
import { repoRoot } from './lib/mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cardsDir = join(here, '..', 'cards');
const exportsDir = join(here, '..', 'exports');
const evidenceDir = join(here, '..', 'evidence');

const W = 1920;
const H = 1080;

const INK = '#0b0d0e';   // --il-n-99, the same field the clip resolves to
const PAPER = '#fbfbfa'; // --il-paper

/** HAC-334 convention: base-14 stacks, because that is what resvg rasterises. */
const SANS = "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";

/**
 * The one line of copy on this card, and the frozen sources that already carry
 * it. `verify-veo-hero.mjs` re-reads each of these and fails if the sentence
 * ever stops being authorised somewhere upstream — so the card cannot outlive
 * the language it restates.
 */
export const THESIS = 'Evidence-bound coordination before shared-state mutation.';
export const THESIS_AUTHORITIES = [
  'README.md',
  'media/hac-333/scene-manifest.json',
  'media/hac-335/devpost/01-short-description.md',
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s).replaceAll(/[&<>]/g, (c) => ENTITIES[c]);

/** The canonical lockup, embedded rather than redrawn. */
function lockup(x, y, width) {
  const file = join(repoRoot, 'assets', 'logo', 'interlock-lockup-horizontal-white.svg');
  const src = readFileSync(file, 'utf8');
  const open = src.match(/<svg[^>]*>/)?.[0] ?? '';
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // The symbol paths carry no fill of their own; they inherit it from the root
  // <svg>. Dropping that attribute while re-wrapping would paint the white
  // lockup black on an ink field, so carry it across explicitly.
  const rootFill = open.match(/\sfill="([^"]*)"/)?.[1];
  if (!rootFill) throw new Error(`${file}: root <svg> carries no fill; the embed would inherit black`);
  if (rootFill.toLowerCase() !== '#ffffff') {
    throw new Error(`${file}: expected the white lockup to declare #FFFFFF, found ${rootFill}`);
  }
  const height = (width * 48) / 190;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 190 48"`
    + ` fill="${rootFill}" overflow="visible">${inner}</svg>`;
}

function text(x, y, s, { size, weight = 400, fill = PAPER, anchor = 'middle', spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="${weight}"`
    + ` fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;
}

/* -- the card ------------------------------------------------------------- */

const cx = W / 2;
const LOCKUP_W = 460;

// The sentence sets on two lines at 58px. Splitting it is typographic, not
// editorial: the two halves concatenate back to THESIS, which the gate checks.
const LINE_1 = 'Evidence-bound coordination';
const LINE_2 = 'before shared-state mutation.';
if (`${LINE_1} ${LINE_2}` !== THESIS) {
  throw new Error('the two set lines no longer reconstruct the authorised sentence');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`
  + ` role="img" aria-labelledby="card-title card-desc">`
  + `<title id="card-title">IL-SCAF-012 Interlock hero end card</title>`
  + `<desc id="card-desc">Interlock. ${esc(THESIS)}</desc>`
  + `<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`
  + lockup(cx - LOCKUP_W / 2, 396, LOCKUP_W)
  + `<line x1="${cx - 60}" y1="576" x2="${cx + 60}" y2="576" stroke="#343a3a" stroke-width="2"/>`
  + text(cx, 664, LINE_1, { size: 58, weight: 600, spacing: -1 })
  + text(cx, 736, LINE_2, { size: 58, weight: 600, spacing: -1 })
  + `</svg>`;

mkdirSync(cardsDir, { recursive: true });
mkdirSync(exportsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const masterName = buildExportName({ id: 'IL-SCAF-012', slug: 'hero-end-card', ext: 'svg' });
const pngName = buildExportName({ id: 'IL-SCAF-012', slug: 'hero-end-card', width: W, height: H, ext: 'png' });
for (const n of [masterName, pngName]) {
  const v = validateExportName(n);
  if (!v.valid) throw new Error(`end-card filename violates the naming contract: ${n} — ${v.error}`);
}

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, background: INK }).render().asPng();
if (png.readUInt32BE(16) !== W || png.readUInt32BE(20) !== H) {
  throw new Error(`rasterised ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, expected ${W}x${H}`);
}

writeFileSync(join(cardsDir, masterName), `${svg}\n`);
writeFileSync(join(exportsDir, pngName), png);

writeFileSync(
  join(evidenceDir, 'end-card-manifest.json'),
  `${JSON.stringify({
    manifestId: 'IL-SCAF-012-hero-end-card',
    issue: 'HAC-335',
    role: 'Brand resolution for the Veo hero sequence. Not a claim surface.',
    note: 'IL-SCAF-011 remains the final cut\'s evidence end card. This card carries no '
      + 'figure, proof class, run identity or issue number, and restates one already-frozen sentence.',
    thesis: THESIS,
    thesisAuthorities: THESIS_AUTHORITIES,
    master: `media/hac-335/veo-hero/cards/${masterName}`,
    masterSha256: sha256(Buffer.from(`${svg}\n`)),
    export: {
      file: `media/hac-335/veo-hero/exports/${pngName}`,
      width: W,
      height: H,
      sha256: sha256(png),
    },
    lockupSource: 'assets/logo/interlock-lockup-horizontal-white.svg',
    lockupSourceSha256: sha256(readFileSync(join(repoRoot, 'assets', 'logo', 'interlock-lockup-horizontal-white.svg'))),
  }, null, 2)}\n`,
);

console.log(`  ${masterName}`);
console.log(`  ${pngName}  ${sha256(png).slice(0, 12)}…  ${(png.length / 1024).toFixed(0)} KiB`);
console.log('  end-card-manifest.json written');
