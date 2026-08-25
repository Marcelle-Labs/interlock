/**
 * The film board frame: the HAC-334 board grammar, held at video geometry.
 *
 * HAC-336 does not own a visual system. It owns an edit. Every board it renders
 * therefore composes with the same header rail, title, safe area and evidence
 * rail that `media/hac-334/bin/render-masters.mjs` established, drawn with the
 * same display-list vocabulary from `media/hac-334/bin/lib/draw.mjs`. What is
 * new here is only what the edit needs and the static suite does not have: a
 * board that resolves to more than one state, so a crossfade between two holds
 * can carry a state change instead of decoration.
 *
 * Why a shared composer rather than copying HAC-334's `compose()`: the safe-area
 * and rail-collision assertions are the reason a label cannot silently run off a
 * 1080p frame. A second copy of them would drift, and the copy that drifted
 * would be the one that stopped catching anything.
 *
 * Reusing HAC-334's `lib/` across issue boundaries is deliberate and narrow. The
 * import is one direction only — HAC-336 reads HAC-334, never the reverse — so
 * regenerating the static suite cannot be broken by the film.
 */
import { join } from 'node:path';
import {
  N, INK, PAPER, text, line, measure,
} from '../../../hac-334/bin/lib/draw.mjs';
import { toSvg } from '../../../hac-334/bin/lib/svg.mjs';

export const W = 1920;
export const H = 1080;
/** The HAC-334 margin, unchanged: a film frame and a still share one safe area. */
export const M = 88;
/** Where the evidence rail rule sits. Content must end above it. */
export const RAIL_Y = 962;

export const flat = (a) => a.flat(Infinity).filter(Boolean);

/**
 * Paper for the controlled local classes, ink for Google Cloud participation.
 * HAC-333's split, transcribed rather than reinvented, so the proof-class reset
 * at B09 reads as the same inversion the storyboard froze.
 */
export function themeFor(proofClass) {
  return proofClass === 'B'
    ? { bg: INK, fg: '#f2f3f2', muted: N[40], hair: N[70], dark: true }
    : { bg: PAPER, fg: INK, muted: N[50], hair: N[30], dark: false };
}

/** A titled panel, the workhorse. Same shape as HAC-334's. */
export const panel = (x, y, w, h, label, t, o = {}) => [
  {
    t: 'rect', x, y, w, h,
    fill: o.fill ?? null, stroke: o.stroke ?? t.hair, width: o.width ?? 1,
    dash: o.dash ?? null, opacity: o.opacity ?? 1,
  },
  label
    ? text(x + 24, y + 36, label, { size: 17, mono: true, fill: o.labelFill ?? t.muted, weight: 500, tracking: 2.2 })
    : null,
];

/**
 * Refuse a frame whose text leaves the safe area or crosses the rail rule.
 *
 * Both failures look fine as data and wrong as a picture, and a video makes them
 * worse than a still does: nobody scrubs a 4-minute cut frame by frame looking
 * for a clipped label.
 */
function assertInside(nodes, content, where) {
  for (const node of nodes) {
    if (node.t !== 'text') continue;
    const w = measure(node.s, node.size, node);
    const left = node.anchor === 'end' ? node.x - w : node.anchor === 'middle' ? node.x - w / 2 : node.x;
    if (left < M - 2 || left + w > W - M + 2) {
      throw new Error(
        `${where}: text overflows the safe area [${Math.round(left)}..${Math.round(left + w)}] `
        + `outside [${M}..${W - M}]: ${JSON.stringify(node.s.slice(0, 60))}`,
      );
    }
  }
  for (const node of content) {
    const bottom = node.t === 'text' ? node.y + node.size * 0.24
      : node.t === 'rect' ? node.y + node.h
        : node.t === 'line' ? Math.max(node.y1, node.y2)
          : node.t === 'circle' ? node.cy + node.r : 0;
    if (bottom > RAIL_Y - 8) {
      throw new Error(
        `${where}: content reaches y=${Math.round(bottom)}, past the rail rule at ${RAIL_Y}`
        + `${node.t === 'text' ? `: ${JSON.stringify(node.s.slice(0, 60))}` : ` (${node.t})`}`,
      );
    }
  }
}

/**
 * Compose one board state into an SVG master.
 *
 * @param {object} spec
 * @param {string} spec.id            registry id, `IL-{FAMILY}-{NNN}`
 * @param {string} spec.state         state name; part of the master's slug
 * @param {string} spec.proofClass    keys `themeFor`
 * @param {string} spec.classLabel    the header rail's left-hand label
 * @param {string} spec.title         the board title
 * @param {string[]} spec.rail        evidence rail lines, already `Frozen evidence:` / `Non-claim:` shaped
 * @param {(t:object)=>object[]} spec.render body, given the resolved theme
 */
export function composeBoard(spec) {
  const t = themeFor(spec.proofClass);
  const content = flat([spec.render(t)]);
  const nodes = flat([
    text(M, 90, spec.classLabel, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 3 }),
    text(W - M, 90, spec.id, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 2, anchor: 'end' }),
    line(M, 116, W - M, 116, { stroke: t.hair, width: 1 }),
    text(M, 184, spec.title, { size: 50, weight: 600, fill: t.fg, tracking: -0.8 }),
    content,
    line(M, RAIL_Y, W - M, RAIL_Y, { stroke: t.hair, width: 1 }),
    spec.rail.map((r, i) => text(M, RAIL_Y + 34 + i * 26, r, { size: 16, mono: true, fill: t.muted })),
  ]);

  assertInside(nodes, content, `${spec.id}:${spec.state}`);

  return toSvg(nodes, {
    width: W,
    height: H,
    background: t.bg,
    title: `${spec.id} ${spec.title} - ${spec.state}`,
    desc: `${spec.classLabel}. ${spec.rail.join(' ')}`,
  });
}

/** Repository root, resolved from this module rather than from the caller's cwd. */
export const repoRootFrom = (here) => join(here, '..', '..', '..', '..');
