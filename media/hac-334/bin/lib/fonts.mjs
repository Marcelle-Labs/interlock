/**
 * Font metrics and text hygiene, shared by every backend.
 *
 * The widths are the standard Adobe base-14 advances, in 1/1000 em. The PDF
 * backend needs them to place right-anchored text without embedding a font; the
 * SVG backend uses the same numbers so a paragraph wraps to the same lines in
 * both encodings. Courier is monospace at a flat 600.
 *
 * Both stacks name only families that are base-14 in PDF and near-universal on
 * a rasterising host, so the two encodings agree on metrics as well as content.
 */

export const FONT_STACKS = {
  sans: "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif",
  mono: "Courier, 'Courier New', Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace",
};

/** PDF base-14 names, indexed by [mono][bold]. */
export const PDF_FONTS = {
  sans: { 400: 'Helvetica', 700: 'Helvetica-Bold' },
  mono: { 400: 'Courier', 700: 'Courier-Bold' },
};

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Map the punctuation the frozen records use into ASCII, deliberately. */
export function asciify(s) {
  return String(s)
    .replace(/…/g, '...')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, ' -- ')
    .replace(/[–·]/g, '-')
    .replace(/→/g, '->')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/ /g, ' ');
}

/**
 * Refuse anything a rasteriser or a base-14 font might not carry.
 *
 * Silent font substitution is the failure this guards: a board that looks right
 * in a browser and rasterises with tofu where a numeral should be. Rather than
 * hope, non-ASCII is rejected where it enters the display list.
 */
export function assertAscii(str) {
  const s = asciify(str);
  const bad = [...s].find((ch) => ch.charCodeAt(0) > 126 || ch.charCodeAt(0) < 32);
  if (bad !== undefined) {
    throw new Error(
      `non-ASCII character ${JSON.stringify(bad)} `
      + `(U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) in board text `
      + `${JSON.stringify(s.slice(0, 80))}. Rasterised and PDF output cannot be trusted to carry it; `
      + 'restate it in ASCII or extend asciify() deliberately.',
    );
  }
  return s;
}

/** Advance width of a string, in user units. Exact for the base-14 fonts. */
export function measure(str, size, { mono = false, weight = 400, tracking = 0 } = {}) {
  const s = asciify(str);
  const extra = Math.max(0, s.length - 1) * tracking;
  if (mono) return s.length * size * 0.6 + extra;
  const table = weight >= 500 ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    w += (code >= 32 && code <= 126 ? table[code - 32] : 556) / 1000;
  }
  return w * size + extra;
}

export function wrap(str, maxWidth, size, opts = {}) {
  const words = asciify(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next, size, opts) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
