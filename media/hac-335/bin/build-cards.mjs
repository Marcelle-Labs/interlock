#!/usr/bin/env node
/**
 * HAC-335 — video title and end cards.
 *
 * Builds the two source-editable SVG masters and their PNG derivatives. HAC-336
 * performs the final media assembly; this issue only freezes the cards.
 *
 * Three things this deliberately does not do:
 *
 *   - It does not redraw the mark. The lockup is read out of
 *     `assets/logo/interlock-lockup-horizontal*.svg` at build time and embedded
 *     verbatim, so canonical geometry cannot drift here.
 *   - It does not invent copy. The card text derives from HAC-333's frozen
 *     SB-00 and SB-08 `editorialCopy`, and the claim boundary from the frozen
 *     public evidence — not from a fresh reading of the run.
 *   - It does not make a stronger claim than the sequence's first proof
 *     supports. The end card names both proof classes and keeps them apart.
 *
 * Typography follows the HAC-334 convention: base-14 family stacks rather than
 * the vendored variable fonts, because that is what rasterises deterministically
 * under resvg. The lockup's own font stack already falls through Geist to
 * Helvetica, so the embed needs no rewriting.
 *
 *     node media/hac-335/bin/build-cards.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildExportName, validateExportName } from '../../../scripts/export-naming.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const cardsDir = join(here, '..', 'cards');
const exportsDir = join(here, '..', 'exports');

const W = 1920;
const H = 1080;
/** HAC-333 caption contract: a 1680x200 caption-safe foot. Content stays above it. */
const CAPTION_FOOT = 200;
const SIDE = (W - 1680) / 2; // 120

const SANS = "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";
const MONO = "Courier, 'Courier New', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

const INK = '#0b0d0e';
const PAPER = '#fbfbfa';
const MUTED = '#737b7b';
const RULE = '#c2c7c7';
const RULE_DARK = '#343a3a';
const PAPER_MUTED = '#9ba2a2';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s).replaceAll(/[&<>]/g, (c) => ENTITIES[c]);

/** The canonical lockup, embedded rather than redrawn. */
function lockup(variant, x, y, width, resolveCurrentColor = INK) {
  const file = join(repoRoot, 'assets', 'logo', `interlock-lockup-horizontal${variant}.svg`);
  const src = readFileSync(file, 'utf8');
  const open = src.match(/<svg[^>]*>/)?.[0] ?? '';
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // The symbol paths carry no fill of their own — they inherit it from the root
  // <svg>. Dropping that root attribute while re-wrapping would silently paint
  // the white lockup black on an ink field, so carry it across explicitly.
  const rootFill = open.match(/\sfill="([^"]*)"/)?.[1];
  if (!rootFill) throw new Error(`${file}: root <svg> carries no fill; the embed would inherit black`);
  // `currentColor` has no inherited value to resolve against inside a static
  // board, so bind it rather than letting it default.
  const fill = rootFill === 'currentColor' ? resolveCurrentColor : rootFill;
  const body = inner.replaceAll('fill="currentColor"', `fill="${fill}"`);
  const height = (width * 48) / 190;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 190 48" fill="${fill}" overflow="visible">${body}</svg>`;
}

function text(x, y, s, { size = 24, weight = 400, fill = INK, family = SANS, anchor = 'start', spacing = 0 } = {}) {
  const anchorAttr = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  const spacingAttr = spacing ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}"`
    + ` font-weight="${weight}" fill="${fill}"${anchorAttr}${spacingAttr}>${esc(s)}</text>`;
}

/* -- title card ----------------------------------------------------------- */

function titleCard() {
  const cx = W / 2;
  const parts = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>`,
    // Lockup, optically centred above the thesis line.
    lockup('', cx - 260, 380, 520),
    text(cx, 640, 'Evidence-bound coordination', { size: 62, weight: 600, anchor: 'middle', spacing: -1 }),
    text(cx, 716, 'before shared-state mutation.', { size: 62, weight: 600, anchor: 'middle', spacing: -1 }),
    `<line x1="${cx - 60}" y1="784" x2="${cx + 60}" y2="784" stroke="${RULE}" stroke-width="2"/>`,
    text(cx, 840, 'CONTROLLED LOCAL EXPERIMENT  ·  GOOGLE CLOUD PARTICIPATION', {
      size: 20, fill: MUTED, family: MONO, anchor: 'middle', spacing: 3,
    }),
  ];
  return svgDoc(
    'IL-SCAF-010 Interlock title card',
    'Interlock. Evidence-bound coordination before shared-state mutation. Two proof classes named separately: controlled local experiment and Google Cloud participation.',
    parts,
  );
}

/* -- end card ------------------------------------------------------------- */

function endCard() {
  const colW = (1680 - 2 * 56) / 3;
  const colX = (i) => SIDE + i * (colW + 56);
  const top = 300;

  /** Three columns, in the sequence's own order: proof, participation, verification. */
  const columns = [
    {
      kicker: 'CONTROLLED CAUSAL PROOF',
      issue: 'HAC-330',
      lines: ['Local. Evidence changed the', 'decision and the bounded outcome.'],
      figures: ['140 > 130', '120 <= 130'],
    },
    {
      kicker: 'REAL GOOGLE CLOUD PARTICIPATION',
      issue: 'HAC-340',
      lines: ['One traversal, receipt-bound', 'mutation, independent read-back.'],
      figures: ['ALLOW + receipt', 'OBSERVED alpha=45'],
    },
    {
      kicker: 'VERIFY THE EVIDENCE',
      issue: 'HAC-342',
      lines: ['Immutable, commit-pinned,', 'readable without an account.'],
      figures: ['cloud-run.public.json', '75253e38791e…'],
    },
  ];

  const parts = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`,
    lockup('-white', SIDE, 120, 260),
    `<line x1="${SIDE}" y1="248" x2="${W - SIDE}" y2="248" stroke="${RULE_DARK}" stroke-width="1"/>`,
  ];

  columns.forEach((c, i) => {
    const x = colX(i);
    const divX = x + colW + 28;
    parts.push(
      text(x, top + 34, c.kicker, { size: 19, fill: PAPER_MUTED, family: MONO, spacing: 2 }),
      text(x, top + 72, c.issue, { size: 17, fill: MUTED, family: MONO, spacing: 1.6 }),
      ...c.lines.map((l, j) => text(x, top + 138 + j * 40, l, { size: 30, weight: 500, fill: PAPER })),
      ...c.figures.map((f, j) => text(x, top + 258 + j * 46, f, { size: 30, fill: PAPER, family: MONO })),
      ...(i < columns.length - 1
        ? [`<line x1="${divX}" y1="${top}" x2="${divX}" y2="${top + 320}" stroke="${RULE_DARK}" stroke-width="1"/>`]
        : []),
    );
  });

  // Claim boundary, above the caption-safe foot.
  const boundaryY = H - CAPTION_FOOT - 96;
  parts.push(
    `<line x1="${SIDE}" y1="${boundaryY - 44}" x2="${W - SIDE}" y2="${boundaryY - 44}" stroke="${RULE_DARK}" stroke-width="1"/>`,
    text(SIDE, boundaryY, 'Two runs, two proof classes. Neither is evidence for the other.', {
      size: 26, weight: 500, fill: PAPER,
    }),
    text(SIDE, boundaryY + 40, 'Not on the recorded path — Agent Runtime · Agent Gateway · CONTENT_AUTHZ', {
      size: 20, fill: PAPER_MUTED, family: MONO, spacing: 1,
    }),
  );

  return svgDoc(
    'IL-SCAF-011 Interlock end card',
    'Three columns kept separate: controlled causal proof HAC-330, real Google Cloud participation HAC-340, and immutable evidence published under HAC-342. Two runs, two proof classes, neither evidence for the other. Agent Runtime, Agent Gateway and CONTENT_AUTHZ are not on the recorded path.',
    parts,
  );
}

/* -- social / open-graph card --------------------------------------------- */

/**
 * Built after the judge-critical set was frozen, from the same visual system —
 * same tokens, same type stacks, same numerals out of the same frozen arms. It
 * carries one proposition, not an architecture. No generated imagery: a clean
 * deterministic derivative beats a decorative one, and factual state may not be
 * generated at all.
 */
function ogCard() {
  const w = 1200;
  const h = 630;
  const m = 80;
  const parts = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${PAPER}"/>`,
    lockup('', m, 72, 260),
    `<line x1="${m}" y1="192" x2="${w - m}" y2="192" stroke="${RULE}" stroke-width="1"/>`,
    text(m, 268, 'Evidence-bound coordination', { size: 46, weight: 600, spacing: -0.8 }),
    text(m, 322, 'before shared-state mutation.', { size: 46, weight: 600, spacing: -0.8 }),
    text(m, 404, 'WITHOUT INTERLOCK', { size: 16, fill: MUTED, family: MONO, spacing: 2.4 }),
    text(m, 462, '140 > 130', { size: 52, fill: '#a4133c', family: MONO }),
    text(w / 2 + 40, 404, 'WITH INTERLOCK', { size: 16, fill: MUTED, family: MONO, spacing: 2.4 }),
    text(w / 2 + 40, 462, '120 <= 130', { size: 52, fill: '#0f7d86', family: MONO }),
    text(m, 540, 'CONTROLLED LOCAL EXPERIMENT · HAC-330', {
      size: 15, fill: MUTED, family: MONO, spacing: 2,
    }),
  ];
  return {
    width: w,
    height: h,
    svg: svgDoc(
      'IL-SOC-010 Interlock open-graph card',
      'Interlock. Evidence-bound coordination before shared-state mutation. Without Interlock 140 is greater than 130; with Interlock 120 is within 130. Controlled local experiment HAC-330.',
      parts,
      w,
      h,
    ),
  };
}

function svgDoc(title, desc, parts, w = W, h = H) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="card-title card-desc">`
    + `<title id="card-title">${esc(title)}</title><desc id="card-desc">${esc(desc)}</desc>`
    + parts.join('')
    + '</svg>'
  );
}

/* -- run ------------------------------------------------------------------ */

const og = ogCard();
const CARDS = [
  { id: 'IL-SCAF-010', slug: 'video-title-card', svg: titleCard(), width: W, height: H },
  { id: 'IL-SCAF-011', slug: 'video-end-card', svg: endCard(), width: W, height: H },
  { id: 'IL-SOC-010', slug: 'open-graph-card', svg: og.svg, width: og.width, height: og.height },
];

const FONT = {
  loadSystemFonts: true,
  defaultFontFamily: 'Helvetica',
  sansSerifFamily: 'Helvetica',
  monospaceFamily: 'Courier',
};

mkdirSync(cardsDir, { recursive: true });
mkdirSync(exportsDir, { recursive: true });

const manifest = [];

for (const card of CARDS) {
  const { width: cw, height: ch } = card;
  const svgName = buildExportName({ id: card.id, slug: card.slug, ext: 'svg' });
  const pngName = buildExportName({
    id: card.id, slug: card.slug, width: cw, height: ch, ext: 'png',
  });
  for (const n of [svgName, pngName]) {
    const v = validateExportName(n);
    if (!v.valid) throw new Error(`export name rejected by the frozen naming contract: ${n} — ${v.error}`);
  }

  writeFileSync(join(cardsDir, svgName), `${card.svg}\n`);

  const png = new Resvg(card.svg, { fitTo: { mode: 'width', value: cw }, font: FONT }).render().asPng();
  // Real pixel size out of the PNG header, not the size we asked for.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== cw || height !== ch) {
    throw new Error(`${pngName}: rasterised ${width}x${height}, declared ${cw}x${ch}`);
  }
  writeFileSync(join(exportsDir, pngName), png);

  manifest.push({
    assetId: card.id,
    master: `media/hac-335/cards/${svgName}`,
    masterSha256: sha256(`${card.svg}\n`),
    export: `media/hac-335/exports/${pngName}`,
    exportSha256: sha256(png),
    width: cw,
    height: ch,
  });

  console.log(`  ${svgName}\n  ${pngName}  (${width}x${height})`);
}

writeFileSync(
  join(here, '..', 'evidence', 'card-manifest.json'),
  `${JSON.stringify(
    {
      manifestId: 'HAC-335-card-manifest',
      issue: 'HAC-335',
      generator: 'media/hac-335/bin/build-cards.mjs',
      note:
        'Source-editable masters and their derivatives. masterSha256 binds each PNG to the '
        + 'SVG it came from, so a stale derivative is a mechanical finding rather than something '
        + 'a reviewer has to catch by eye. Copy derives from HAC-333 SB-00 and SB-08.',
      geometry: { width: W, height: H, captionSafeFoot: CAPTION_FOOT, sideMargin: SIDE },
      cards: manifest,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nbuilt ${manifest.length} cards`);
