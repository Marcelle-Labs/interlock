#!/usr/bin/env node
/**
 * Take 0 end card.
 *
 * The film's own end card (IL-SCAF-011) recaps figures. HAC-349's close asks
 * for a card that asserts nothing: the mark, the thesis line, and a pointer.
 * Built from assets/logo and the HAC-335 colour tokens so it carries the same
 * brand, not a second one. Provisional: if HAC-335 authors this card under an
 * IL-SCAF id, this file is deleted and the beat repoints.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const ROOT = resolve(PKG, '..');

const W = 1920, H = 1080;
const INK = '#0b0d0e';
const PAPER = '#fbfbfa';
const PAPER_MUTED = '#9ba2a2';
const RULE_DARK = '#343a3a';
const SANS = "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";
const MONO = "Courier, 'Courier New', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s).replaceAll(/[&<>]/g, (c) => ENTITIES[c]);

function lockup(x, y, width) {
  const src = readFileSync(join(ROOT, 'assets/logo/interlock-lockup-horizontal-white.svg'), 'utf8');
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const height = (width * 48) / 190;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 190 48" fill="#FFFFFF" overflow="visible">${inner}</svg>`;
}
const text = (x, y, s, o = {}) => {
  const { size = 24, weight = 400, fill = PAPER, family = SANS, anchor = 'middle', spacing = 0 } = o;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}"`
    + ` fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;
};

const cx = W / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  + `<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`
  + lockup(cx - 285, 372, 570)
  + text(cx, 618, 'Evidence-bound coordination', { size: 58, weight: 600, spacing: -1 })
  + text(cx, 690, 'for AI-assisted change.', { size: 58, weight: 600, spacing: -1 })
  + `<line x1="${cx - 60}" y1="760" x2="${cx + 60}" y2="760" stroke="${RULE_DARK}" stroke-width="2"/>`
  + text(cx, 824, 'Two runs, two proof classes. Neither is evidence for the other.', { size: 25, fill: PAPER_MUTED })
  + text(cx, 872, 'github.com/Marcelle-Labs/interlock', { size: 22, fill: PAPER_MUTED, family: MONO, spacing: 1 })
  + `</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
mkdirSync(join(PKG, 'deterministic'), { recursive: true });
const out = join(PKG, 'deterministic/TAKE0-end-card-1920x1080.png');
writeFileSync(out, png);
console.log(out, png.length + ' bytes', 'sha256 ' + createHash('sha256').update(png).digest('hex').slice(0, 16));
