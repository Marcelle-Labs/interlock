/**
 * A deterministic display list, and the drawing vocabulary that builds it.
 *
 * Boards emit nodes, not markup. Two backends consume the same nodes: `svg.mjs`
 * writes the canonical master, `pdf.mjs` writes the vector PDF. That is what
 * makes "one factual master, many derivatives" true rather than aspirational —
 * the SVG and the PDF are not two drawings of the same facts, they are two
 * encodings of one drawing, and no label can drift between them.
 *
 * Zero dependencies, following the reasoning HAC-341 recorded: a bundler
 * between frozen evidence and the rendered frame buys nothing and costs
 * reproducibility.
 *
 * Two rules shape the vocabulary.
 *
 * Colour is never the only channel. `stateMark` draws its glyph as geometry
 * rather than a font glyph, so a board keeps its second encoding in greyscale,
 * in projection, and in a rasteriser that has never heard of U+29BF.
 *
 * Colour arrives as OKLCH because that is how HAC-332 froze it, and leaves as
 * sRGB hex because neither SVG rasterisers nor PDF implement CSS Color 4. The
 * conversion is exact and happens once, here.
 */
import { measure, assertAscii, wrap } from './fonts.mjs';

export { measure, assertAscii, wrap };

/* -- HAC-332 tokens, transcribed ----------------------------------------- */

export const N = {
  '00': '#ffffff', '05': '#f7f8f8', 10: '#eef0f0', 20: '#dde0e0', 30: '#c2c7c7',
  40: '#9ba2a2', 50: '#737b7b', 60: '#515858', 70: '#343a3a', 80: '#1e2323',
  90: '#141818', 99: '#0b0d0e',
};
export const INK = '#0b0d0e';
export const PAPER = '#fbfbfa';

const STATE_OKLCH = {
  local: [0.58, 0.005, 240], coupled: [0.58, 0.130, 250], blocked: [0.58, 0.150, 28],
  review: [0.62, 0.130, 78], authorized: [0.56, 0.130, 150], executed: [0.52, 0.130, 300],
  observed: [0.60, 0.100, 205], failed: [0.46, 0.170, 22],
};
const STATE_OKLCH_DARK = {
  local: [0.72, 0.005, 240], coupled: [0.74, 0.120, 250], blocked: [0.72, 0.150, 32],
  review: [0.80, 0.120, 82], authorized: [0.74, 0.130, 152], executed: [0.70, 0.130, 300],
  observed: [0.76, 0.090, 205], failed: [0.64, 0.170, 25],
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const toSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp01(v) * 255);
};

/** OKLCH -> sRGB hex. Exact, so a token change moves the board's colour. */
export function oklch([L, C, hDeg]) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return `#${[r, g, bl].map((c) => toSrgb(c).toString(16).padStart(2, '0')).join('')}`;
}

export const stateColor = (key, dark = false) => oklch((dark ? STATE_OKLCH_DARK : STATE_OKLCH)[key]);

/* -- nodes --------------------------------------------------------------- */

/*
 * Every node carries `opacity`, defaulting to 1.
 *
 * `text` and `rect` always did; `line`, `path` and `circle` did not, so a caller
 * that faded a stroke got a fully opaque one and no error. That is invisible in
 * a still suite, where nothing fades, and it is a floating rule under a numeral
 * that has not appeared yet in a cut, where things do. The backends emit the
 * attribute only when it is not 1, so a board that never fades encodes exactly
 * as it did before.
 */

export const rect = (x, y, w, h, o = {}) => ({
  t: 'rect', x, y, w, h,
  fill: o.fill ?? null, stroke: o.stroke ?? null, width: o.width ?? 1,
  dash: o.dash ?? null, opacity: o.opacity ?? 1,
});

export const line = (x1, y1, x2, y2, o = {}) => ({
  t: 'line', x1, y1, x2, y2,
  stroke: o.stroke ?? N[30], width: o.width ?? 1, dash: o.dash ?? null, cap: o.cap ?? 'butt',
  opacity: o.opacity ?? 1,
});

/** `d` is restricted to absolute M/L commands, which both backends implement. */
export const path = (d, o = {}) => ({
  t: 'path', d,
  fill: o.fill ?? null, stroke: o.stroke ?? null, width: o.width ?? 1,
  dash: o.dash ?? null, cap: o.cap ?? 'butt', join: o.join ?? 'miter',
  opacity: o.opacity ?? 1,
});

export const circle = (cx, cy, r, o = {}) => ({
  t: 'circle', cx, cy, r,
  fill: o.fill ?? null, stroke: o.stroke ?? null, width: o.width ?? 1, dash: o.dash ?? null,
  opacity: o.opacity ?? 1,
});

export const text = (x, y, s, o = {}) => ({
  t: 'text', x, y, s: assertAscii(s),
  size: o.size ?? 20, fill: o.fill ?? INK, mono: o.mono ?? false, weight: o.weight ?? 400,
  anchor: o.anchor ?? 'start', tracking: o.tracking ?? 0, opacity: o.opacity ?? 1,
});

/** A wrapped paragraph. Returns nodes and the height consumed. */
export function paragraph(x, y, str, maxWidth, o = {}) {
  const size = o.size ?? 18;
  const lineHeight = o.lineHeight ?? 1.5;
  const lines = wrap(str, maxWidth, size, o);
  const step = size * lineHeight;
  return {
    nodes: lines.map((l, i) => text(x, y + i * step, l, o)),
    height: lines.length * step,
    lines: lines.length,
  };
}

/* -- grammar ------------------------------------------------------------- */

/** The HAC-332 edge grammar: relationship kind carried by dash and weight. */
export const EDGE = {
  intent: { dash: '5 4', width: 1.5 },
  evidence: { dash: '1 3', width: 1 },
  coupling: { dash: null, width: 2 },
  authorization: { dash: null, width: 3 },
  mutation: { dash: null, width: 2 },
  observation: { dash: '2 5', width: 1 },
  refusal: { dash: null, width: 2 },
  bypass: { dash: '3 3', width: 2 },
};

export function arrow(x1, y1, x2, y2, kind = 'intent', color = N[60]) {
  const g = EDGE[kind];
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = 9;
  const lx = x2 - head * Math.cos(ang - 0.42);
  const ly = y2 - head * Math.sin(ang - 0.42);
  const rx = x2 - head * Math.cos(ang + 0.42);
  const ry = y2 - head * Math.sin(ang + 0.42);
  const sx = x2 - head * 0.9 * Math.cos(ang);
  const sy = y2 - head * 0.9 * Math.sin(ang);
  return [
    line(x1, y1, sx, sy, { stroke: color, width: g.width, dash: g.dash }),
    path(`M${lx} ${ly} L${x2} ${y2} L${rx} ${ry}`, { stroke: color, width: g.width, join: 'round' }),
  ];
}

/**
 * A semantic state mark drawn as geometry rather than a font glyph.
 *
 * The shapes echo the HAC-332 glyph table closely enough to be recognised
 * beside it, but they are paths: no font on the rendering host has to own
 * U+29C9 for a board to keep its non-colour channel.
 */
export function stateMark(kind, cx, cy, r, color) {
  const w = 1.8;
  switch (kind) {
    case 'failed':
      return [
        path(`M${cx - r} ${cy - r} L${cx + r} ${cy + r}`, { stroke: color, width: w + 0.4, cap: 'round' }),
        path(`M${cx + r} ${cy - r} L${cx - r} ${cy + r}`, { stroke: color, width: w + 0.4, cap: 'round' }),
      ];
    case 'executed':
      return [circle(cx, cy, r, { stroke: color, width: w }), circle(cx, cy, r * 0.42, { fill: color })];
    case 'observed':
      return [circle(cx, cy, r, { stroke: color, width: w }), circle(cx, cy, r * 0.5, { stroke: color, width: w })];
    case 'coupled':
      return [
        rect(cx - r, cy - r, r * 1.5, r * 1.5, { stroke: color, width: w }),
        rect(cx - r * 0.5, cy - r * 0.5, r * 1.5, r * 1.5, { stroke: color, width: w }),
      ];
    case 'blocked':
      return [
        path(`M${cx - r * 0.45} ${cy - r} L${cx - r * 0.45} ${cy + r}`, { stroke: color, width: w + 0.6, cap: 'round' }),
        path(`M${cx + r * 0.45} ${cy - r} L${cx + r * 0.45} ${cy + r}`, { stroke: color, width: w + 0.6, cap: 'round' }),
      ];
    case 'local':
    default:
      return [circle(cx, cy, r * 0.34, { fill: color })];
  }
}

/** A state chip: colour, geometric glyph and stroke weight, plus the word. */
export function chip(x, y, label, kind, o = {}) {
  const { dark = false, size = 19 } = o;
  const color = stateColor(kind, dark);
  const h = size * 2.1;
  const labelW = measure(label, size, { mono: true, tracking: 1.1 });
  const w = labelW + h + size * 0.9;
  const cy = y + h / 2;
  return {
    nodes: [
      rect(x, y, w, h, { stroke: color, width: kind === 'local' ? 1 : 2 }),
      ...stateMark(kind, x + h * 0.5, cy, size * 0.42, color),
      text(x + h, cy + size * 0.36, label, { size, mono: true, fill: color, weight: 500, tracking: 1.1 }),
    ],
    width: w,
    height: h,
  };
}
