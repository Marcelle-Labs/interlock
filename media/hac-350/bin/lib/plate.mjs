/**
 * The production plate: what a judge sees, and nothing else.
 *
 * The storyboard ships two layers on every scene slide. The plate layer is
 * cinematic — targets, boundaries, the gutter, the coupling edge, the gauge,
 * the outcome, one sentence. The annotation layer is review apparatus — scene
 * ids, timings, motion notes, must-not-imply notes, manifest rows, receipt
 * figures. This module can only draw the first. `debug.mjs` draws the second,
 * into a separate overlay that no export path consumes.
 *
 * That split is structural on purpose. A single renderer with an `annotate`
 * flag is one wrong default away from shipping engineering notes to a judge,
 * and the failure would look like a rendering option rather than a disclosure
 * problem.
 *
 * Two vocabulary rules come straight from HAC-334 and are not relaxed here:
 *
 *   Colour is never the only channel. The invalid outcome carries a geometric
 *   `failed` mark as well as the `failed` hue, so the plate still says "invalid"
 *   in greyscale and in a rasteriser with no opinion about OKLCH.
 *
 *   Text is ASCII. The storyboard writes the outcome as a multiplication sign
 *   and the relationship as a double arrow; both arrive here as geometry, and
 *   the remaining punctuation goes through `asciify`. A glyph a base-14 font
 *   does not carry is a box on a plate nobody re-renders.
 */
import {
  N, INK, PAPER, rect, line, text, circle, path, stateColor, stateMark, measure,
} from '../../../hac-334/bin/lib/draw.mjs';
import { asciify, wrap } from '../../../hac-334/bin/lib/fonts.mjs';
import { toSvg } from '../../../hac-334/bin/lib/svg.mjs';
import {
  W, H, CONTENT, TYPE_FLOOR, SCALE, BASE_Y, topOf, heightOf,
  FRAME, FRAME_LABEL_Y, BAR_W, COLUMNS, ORDER, centreOf, ROWS, EDGE, GAUGE, ruleY,
  LEGEND_Y, LEGEND_STEP, NOTES, SCENE_LINE_Y, REPLAY, CONTENTION,
} from './world.mjs';

export const flat = (a) => a.flat(Infinity).filter(Boolean);

const FAILED = stateColor('failed');
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Mono label, at or above the type floor. The plate has no small print. */
const label = (x, y, s, o = {}) => text(x, y, asciify(s), {
  size: Math.max(TYPE_FLOOR, o.size ?? TYPE_FLOOR),
  mono: true,
  fill: o.fill ?? N[50],
  tracking: o.tracking ?? 2.2,
  anchor: o.anchor,
  opacity: o.opacity ?? 1,
});

/* -- semantic vocabulary -------------------------------------------------- */

/**
 * The semantic states a scene may assert about a target.
 *
 * Presentation never appears here, and this list never appears in an easing
 * curve. A renderer reads a state and chooses a treatment; it cannot read a
 * treatment and infer a state, which is what keeps an animation from becoming
 * the record of what was decided.
 */
export const TARGET_STATE = Object.freeze({
  APPLIED: 'APPLIED',
  NOT_APPLIED: 'NOT_APPLIED',
  WITHHELD: 'WITHHELD',
  WAITING: 'WAITING',
  UNCHANGED: 'UNCHANGED',
  HELD: 'HELD',
});

export const RELATIONSHIP = Object.freeze({
  PRESENT: 'RELATIONSHIP_PRESENT',
  ABSENT: 'RELATIONSHIP_ABSENT',
  UNOBSERVED: 'RELATIONSHIP_UNOBSERVED',
});

export const OUTCOME = Object.freeze({
  INVALID: 'INVALID_OUTCOME',
  VALID: 'VALID_RECORDED_OUTCOME',
  NONE: 'NO_OUTCOME',
});

/* -- plate furniture ------------------------------------------------------ */

/**
 * The path legend. Stem to full path, once per plate.
 *
 * Laid out from measured widths rather than a fixed pitch, so a longer path
 * cannot silently slide the last entry past the right margin.
 */
export function pathLegend(targets, names = ORDER) {
  return names.map((n, i) => label(
    CONTENT.x0, LEGEND_Y + i * LEGEND_STEP, `${n} - ${targets[n].path}`,
    { fill: N[50], tracking: 1.4 },
  ));
}

/** A drawn observation boundary, with the scope it observes named on it. */
export function boundary(box, scopeLabel, o = {}) {
  return [
    rect(box.x, box.y, box.w, box.h, {
      stroke: o.stroke ?? N[40],
      width: o.width ?? 1.5,
      dash: o.dash ?? null,
      opacity: o.opacity ?? 1,
    }),
    // Above the rule, not inside it. The interior top band belongs to the
    // coupling edge, and a scope label sharing that band with the edge's own
    // caption is how S6 and S7 first rendered two overlapping sentences.
    scopeLabel
      ? label(box.x + 24, o.labelY ?? (box.y - 20), scopeLabel, { fill: o.labelFill ?? N[50], opacity: o.opacity ?? 1 })
      : null,
  ];
}

/**
 * One target bar standing on the common baseline.
 *
 * `fill` is presentation — how far the bar has risen towards `value`. `state`
 * is semantic. A withheld target draws its outline at its unchanged height and
 * never fills, however far the scene's clock has run, because there is no
 * partial withholding to interpolate.
 */
export function targetBar(name, spec) {
  const {
    x = COLUMNS[name], w = BAR_W, value, from = value, fill = 1,
    state, delta, note, muted = false,
  } = spec;

  const shown = state === TARGET_STATE.WITHHELD || state === TARGET_STATE.WAITING
    ? from
    : from + (value - from) * clamp01(fill);
  const h = heightOf(shown);
  const y = BASE_Y - h;

  const unresolved = state === TARGET_STATE.WITHHELD || state === TARGET_STATE.NOT_APPLIED;
  const body = unresolved
    ? rect(x, y, w, h, { stroke: INK, width: 2, dash: '8 7' })
    : rect(x, y, w, h, { fill: muted ? N[30] : INK });

  const numeral = state === TARGET_STATE.UNCHANGED || state === TARGET_STATE.HELD
    ? null
    : text(x + w / 2, y + 40, asciify(String(Math.round(shown))), {
      size: 28, mono: true, anchor: 'middle', fill: unresolved ? INK : PAPER,
    });

  return [
    body,
    numeral,
    label(x + w / 2, ROWS.name, name, { fill: INK, anchor: 'middle', tracking: 2.4 }),
    delta ? label(x + w / 2, ROWS.delta, delta, { fill: INK, anchor: 'middle', tracking: 0.6 }) : null,
    note ? label(x + w / 2, ROWS.state, note, { fill: N[60], anchor: 'middle', tracking: 1 }) : null,
  ];
}

/**
 * The coupling edge between alpha and beta.
 *
 * `progress` draws it; `relationship` says whether there is anything to draw.
 * S8 is the reason those are two arguments: the edge does not fail to appear
 * because a timer did not reach it, it fails to appear because the history it
 * would have been extracted from does not contain the pair. So an absent
 * relationship renders an explicitly unresolved span — visible, terminated
 * short of both bars, and captioned — rather than nothing at all, which a
 * viewer would read as a scene that had not started yet.
 */
export function couplingEdge(relationship, progress, o = {}) {
  const a = centreOf('alpha');
  const b = centreOf('beta');
  const y = EDGE.y;

  if (relationship === RELATIONSHIP.ABSENT) {
    // Drawn, and drawn short. End ticks mark where the edge would have
    // terminated on each bar; the span between them never closes. A faint
    // nothing would read as a rendering artifact, and an absent edge has to be
    // as legible as a present one for the ablation to be a comparison.
    const inset = 34;
    return [
      line(a + inset, y, b - inset, y, { stroke: N[50], width: 2, dash: '4 10' }),
      line(a + inset, y - 9, a + inset, y + 9, { stroke: N[50], width: 2 }),
      line(b - inset, y - 9, b - inset, y + 9, { stroke: N[50], width: 2 }),
      label((a + b) / 2, y - 22, o.absentLabel ?? 'no qualifying relationship extracted', {
        fill: N[50], anchor: 'middle', tracking: 1.2,
      }),
    ];
  }
  if (relationship !== RELATIONSHIP.PRESENT) return [];

  const p = clamp01(progress);
  const x1 = a + (b - a) * p;
  const stem = clamp01((p - 0.75) / 0.25);
  return [
    line(a, y, x1, y, { stroke: INK, width: 2 }),
    stem > 0 ? line(a, y, a, y + (EDGE.stemTo - y) * stem, { stroke: INK, width: 2 }) : null,
    stem > 0 ? line(b, y, b, y + (EDGE.stemTo - y) * stem, { stroke: INK, width: 2 }) : null,
    p >= 1 && o.label ? label((a + b) / 2, y - 22, o.label, { fill: INK, anchor: 'middle', tracking: 1.2 }) : null,
  ];
}

/**
 * The gutter between two target-local lock scopes.
 *
 * Two rules and an empty band. Nothing is ever drawn crossing it, and nothing
 * ever will be: S4's claim is that no key represents the pair, and a decorative
 * connector in this gap would refute the scene it belongs to.
 */
export function gutter(open, o = {}) {
  const x0 = o.x0 ?? COLUMNS.alpha + BAR_W + 24;
  const x1 = o.x1 ?? COLUMNS.beta - 24;
  const p = clamp01(open);
  if (p <= 0) return [];
  const mid = (x0 + x1) / 2;
  const half = ((x1 - x0) / 2) * p;
  const top = FRAME.y;
  const bottom = FRAME.y + FRAME.h;
  // Short ticks across the void, so the gap reads as a drawn absence rather
  // than as whitespace the layout happened to leave. Nothing spans it: the
  // ticks stop short of both rules on purpose.
  const ticks = [];
  for (let y = top + 40; y < bottom - 40; y += 46) {
    ticks.push(line(mid - half + 6, y, mid + half - 6, y, { stroke: N[20], width: 1 }));
  }
  return [
    line(mid - half, top, mid - half, bottom, { stroke: N[40], width: 1.5, dash: '6 8' }),
    line(mid + half, top, mid + half, bottom, { stroke: N[40], width: 1.5, dash: '6 8' }),
    ...(p >= 1 ? ticks : []),
    // Knocked out of the rules rather than drawn over them: the word names the
    // void, and a label the boundary rules run through reads as a connector.
    p >= 1 ? rect(mid - half - 2, (o.labelY ?? ROWS.name) - 24, half * 2 + 4, 34, { fill: PAPER }) : null,
    p >= 1 ? label(mid, o.labelY ?? ROWS.name, o.label ?? 'gutter', { fill: N[50], anchor: 'middle', tracking: 2.4 }) : null,
  ];
}

/**
 * The ceiling gauge: the stacked total, the dashed rule, and the caption that
 * says who evaluates it.
 *
 * The rule is drawn on the field, from left of the gauge to the right margin.
 * No scene passes it a boundary to sit inside, because there is no argument in
 * which the gauge belongs to a decision.
 */
export function gauge(spec) {
  const { total, ceiling, fill = 1, showRule = true, ruleOpacity = 1, verifierNote } = spec;
  const shown = total * clamp01(fill);
  const h = heightOf(shown);
  const overflow = Math.max(0, shown - ceiling);
  const y = ruleY(ceiling);

  return [
    rect(GAUGE.x, BASE_Y - h, GAUGE.w, h, { fill: INK }),
    overflow > 0
      ? rect(GAUGE.x, y - heightOf(overflow), GAUGE.w, heightOf(overflow), { fill: FAILED })
      : null,
    showRule ? line(GAUGE.ruleX0, y, GAUGE.ruleX1, y, {
      stroke: N[50], width: 2, dash: '10 8', opacity: ruleOpacity,
    }) : null,
    showRule ? label(GAUGE.captionX, y - 16, `ceiling ${ceiling}`, { fill: N[60], opacity: ruleOpacity }) : null,
    showRule && verifierNote
      ? captionLines(verifierNote).map((l, i) => label(GAUGE.captionX, y + 40 + i * 30, l, {
        fill: N[50], tracking: 1.2, opacity: ruleOpacity,
      }))
      : null,
  ];
}

/**
 * Wrap a gauge caption into the column beside the rule.
 *
 * Measured against the real margin rather than eyeballed: the caption is the
 * longest text on the plate and the only one whose length changes between
 * scenes, so it is the one line that would otherwise discover the right edge in
 * an export nobody re-read.
 */
export function captionLines(note) {
  const width = CONTENT.x1 - GAUGE.captionX;
  const lines = (Array.isArray(note) ? note : [note])
    .flatMap((s) => wrap(asciify(s), width, TYPE_FLOOR, { mono: true, tracking: 1.2 }));
  return lines;
}

/**
 * The recorded outcome.
 *
 * An invalid outcome gets the `failed` hue, the geometric `failed` mark and a
 * rule under the numeral: three channels, because this is the one figure a
 * viewer must not misread at a glance on a muted plate.
 */
export function outcome(spec) {
  const { kind, value, caption, opacity = 1 } = spec;
  if (kind === OUTCOME.NONE) {
    return caption ? noteBlock(GAUGE.outcomeX, BASE_Y, caption, { fill: N[60], opacity }) : [];
  }
  const invalid = kind === OUTCOME.INVALID;
  const colour = invalid ? FAILED : INK;
  const glyphX = GAUGE.outcomeX + 26;
  const numX = invalid ? GAUGE.outcomeX + 74 : GAUGE.outcomeX;
  const numeral = text(numX, BASE_Y, asciify(String(value)), {
    size: 76, mono: true, fill: colour, opacity,
  });
  const width = measure(String(value), 76, { mono: true });
  return flat([
    invalid ? stateMark('failed', glyphX, BASE_Y - 24, 22, colour).map((n) => ({ ...n, opacity })) : null,
    numeral,
    line(numX, BASE_Y + 16, numX + width, BASE_Y + 16, { stroke: colour, width: 2, opacity }),
    caption ? noteBlock(GAUGE.outcomeX, BASE_Y + 56, caption, { opacity }) : null,
  ]);
}

/**
 * A wrapped note in the outcome column.
 *
 * Same measured discipline as the gauge caption: any text that starts at the
 * outcome column and runs right has one place it can go wrong, and it goes
 * wrong silently.
 */
export function noteBlock(x, y, str, o = {}) {
  const lines = wrap(asciify(str), CONTENT.x1 - x, TYPE_FLOOR, { mono: true, tracking: o.tracking ?? 1.4 });
  return lines.map((l, i) => label(x, y + i * 30, l, { fill: o.fill ?? N[50], tracking: o.tracking ?? 1.4, opacity: o.opacity ?? 1 }));
}

/** The single large sentence. One line, one baseline, every plate. */
export const sceneLine = (s, o = {}) => text(CONTENT.x0, SCENE_LINE_Y, asciify(s), {
  size: 44, fill: INK, weight: 400, opacity: o.opacity ?? 1,
});

/* -- safe area ------------------------------------------------------------ */

/**
 * Refuse a plate whose text leaves the clean-plate margins.
 *
 * Checked at compose time rather than reviewed by eye: a 30-second cut is 900
 * frames, and a label that clips for eleven of them is exactly the defect a
 * human reviewer scrubbing at 2x will not find.
 */
function assertInside(nodes, where) {
  for (const n of nodes) {
    if (n.t !== 'text') continue;
    const w = measure(n.s, n.size, n);
    const left = n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x;
    if (left < CONTENT.x0 - 2 || left + w > CONTENT.x1 + 2) {
      throw new Error(
        `${where}: text [${Math.round(left)}..${Math.round(left + w)}] leaves the plate margins `
        + `[${CONTENT.x0}..${CONTENT.x1}]: ${JSON.stringify(n.s.slice(0, 56))}`,
      );
    }
    if (n.y > CONTENT.y1 + 2 || n.y - n.size < CONTENT.y0 - 2) {
      throw new Error(`${where}: text baseline y=${n.y} leaves the plate margins: ${JSON.stringify(n.s.slice(0, 56))}`);
    }
    if (n.size < TYPE_FLOOR && n.size !== 76) {
      throw new Error(`${where}: ${n.size}px is under the ${TYPE_FLOOR}px type floor: ${JSON.stringify(n.s.slice(0, 56))}`);
    }
  }
  assertNoCollision(nodes, where);
}

/**
 * Refuse two labels that share a baseline and overlap horizontally.
 *
 * The margin check above only sees the outermost edge, which is exactly why the
 * first pass of the path legend shipped three paths overlapping each other
 * while the rightmost one ended obediently at the margin. A layout that packs
 * by measured width needs the collision checked, not the envelope.
 */
function assertNoCollision(nodes, where) {
  const boxes = [];
  for (const n of nodes) {
    if (n.t !== 'text' || (n.opacity ?? 1) < 0.05) continue;
    const w = measure(n.s, n.size, n);
    const left = n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x;
    // A text node's ink band, not its baseline. Two labels 8px apart do not
    // share a baseline and do overlap, which is exactly the pair the first
    // version of this check waved through.
    boxes.push({
      left, right: left + w, top: n.y - n.size * 0.74, bottom: n.y + n.size * 0.22, s: n.s,
    });
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
        throw new Error(
          `${where}: two labels overlap: ${JSON.stringify(a.s.slice(0, 40))} and ${JSON.stringify(b.s.slice(0, 40))}`,
        );
      }
    }
  }
}

/**
 * Compose one plate into an SVG master.
 *
 * `background` is a parameter only so the end card can invert to the ink ground
 * the storyboard specifies for it. Every other plate is paper.
 */
export function composePlate(spec) {
  const nodes = flat([spec.render()]);
  assertInside(nodes, `${spec.id}@${spec.t.toFixed(2)}`);
  return toSvg(nodes, {
    width: W,
    height: H,
    background: spec.background ?? PAPER,
    title: spec.title,
    desc: spec.desc,
  });
}

export { NOTES, REPLAY, CONTENTION, ORDER, COLUMNS, BAR_W, BASE_Y, FRAME, N, INK, PAPER, label, rect, line, text, circle, path, measure, asciify, stateColor, FAILED, SCALE, topOf, heightOf, ROWS, GAUGE, ruleY, clamp01 };
