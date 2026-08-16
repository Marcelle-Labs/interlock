#!/usr/bin/env node
/**
 * Renders the canonical masters from the visual model: one SVG per board, plus
 * the vector PDF derived from the identical display list.
 *
 * One composition per asset, and the composition is the only place its geometry
 * exists. SVG, PDF, PNG, README and Devpost derivatives are encodings or
 * rasterisations of that one drawing, so a factual label cannot differ between a
 * README image and a Devpost upload — there is nothing for it to differ with.
 *
 * Nothing here reads frozen evidence. Every value arrives through
 * `evidence/visual-model.json`, which is what keeps the gate tractable: a board
 * can be wrong about layout, but it cannot be wrong about a number unless the
 * model is wrong first.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExportName, validateExportName } from '../../../scripts/export-naming.mjs';
import { toSvg } from './lib/svg.mjs';
import { toPdf } from './lib/pdf.mjs';
import {
  N, INK, PAPER, stateColor, text, paragraph, rect, line, arrow, chip, stateMark, wrap, measure,
} from './lib/draw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const model = JSON.parse(readFileSync(join(repoRoot, 'media', 'hac-334', 'evidence', 'visual-model.json'), 'utf8'));

const W = 1920;
const H = 1080;
const M = 88;
const flat = (a) => a.flat(Infinity).filter(Boolean);

/** Paper for class A and conceptual boards, ink for class B. HAC-333's split. */
const themeFor = (proofClass) => (proofClass === 'B'
  ? { bg: INK, fg: '#f2f3f2', muted: N[40], hair: N[70], dark: true }
  : { bg: PAPER, fg: INK, muted: N[50], hair: N[30], dark: false });

/** A titled panel. The workhorse of every board. */
const panel = (x, y, w, h, label, t, o = {}) => [
  rect(x, y, w, h, { stroke: o.stroke ?? t.hair, width: o.width ?? 1, dash: o.dash ?? null, fill: o.fill ?? null }),
  label ? text(x + 24, y + 36, label, { size: 17, mono: true, fill: t.muted, weight: 500, tracking: 2.2 }) : null,
];

/* -- boards --------------------------------------------------------------- */

const boards = {};

/* V1 — the causal counterfactual. The hero: behaviour change before architecture. */
boards['IL-PROOF-010'] = (a, t) => {
  const c = a.composition;
  const o = [];

  // Setup strip: two locally valid intents over one coupled environment.
  const chipY = 244;
  let x = M;
  for (const i of c.intents) {
    const ch = chip(x, chipY, i.state, 'local', { dark: t.dark });
    o.push(text(x, chipY - 14, i.label, { size: 21, fill: t.fg, weight: 500 }), ch.nodes);
    x += ch.width + 30;
  }
  const env = chip(x + 24, chipY, c.environment.state, 'coupled', { dark: t.dark });
  o.push(text(x + 24, chipY - 14, c.environment.label, { size: 21, fill: t.fg, weight: 500 }), env.nodes);

  o.push(
    text(W - M, chipY - 14, 'JOINT BOUND', { size: 17, mono: true, fill: t.muted, tracking: 2.2, anchor: 'end' }),
    text(W - M, chipY + 30, c.constraint.value, { size: 25, mono: true, fill: t.fg, anchor: 'end' }),
  );

  // Two arms at equal weight, so the delta is the only difference between them.
  const top = 340;
  const ph = 542;
  const pw = (W - M * 2 - 40) / 2;
  c.arms.forEach((arm, i) => {
    const px = M + i * (pw + 40);
    const isBaseline = arm.armId === 'baseline';
    const key = arm.holds ? 'observed' : 'failed';
    const col = stateColor(key, t.dark);
    o.push(panel(px, top, pw, ph, arm.label.toUpperCase(), t, {
      width: isBaseline ? 1 : 2, stroke: isBaseline ? t.hair : t.fg,
    }));
    o.push(text(px + 24, top + 92, isBaseline ? 'Interlock disabled' : 'Interlock enabled',
      { size: 22, fill: t.muted }));
    o.push(text(px + 24, top + 152, 'DECISION', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
    o.push(arm.decision
      ? text(px + 24, top + 198, arm.decision, { size: 33, mono: true, fill: t.fg, weight: 600 })
      : text(px + 24, top + 194, 'no decision - Interlock disabled', { size: 21, fill: t.muted }));

    // The bounded outcome, at the size that carries the board.
    o.push(text(px + 24, top + 344, arm.expression,
      { size: 104, mono: true, fill: col, weight: 600, tracking: -2 }));
    o.push(chip(px + 24, top + 392, arm.verdict.toUpperCase(), key, { dark: t.dark, size: 18 }).nodes);
    if (arm.armId === 'treatment') {
      o.push(text(px + 24, top + ph - 30, `checks ${c.checks.value}`,
        { size: 25, mono: true, fill: t.fg, weight: 500 }));
    }
  });

  o.push(text(M, top + ph + 48, 'Same intents. Same environment. Different coordination decision.',
    { size: 25, fill: t.muted }));
  return o;
};

/* V1 brief — one proposition, readable across a room. */
boards['IL-PROOF-010:brief'] = (a, t) => {
  const c = a.composition;
  const [baseline, treatment] = c.arms;
  return [
    text(M, 296, c.constraint.value, { size: 32, mono: true, fill: t.muted }),
    text(W - M, 296, 'JOINT BOUND', { size: 22, mono: true, fill: t.muted, tracking: 3, anchor: 'end' }),
    text(M, 468, baseline.expression,
      { size: 160, mono: true, fill: stateColor('failed', t.dark), weight: 600, tracking: -4 }),
    text(W - M, 424, 'WITHOUT INTERLOCK', { size: 24, mono: true, fill: t.muted, tracking: 3, anchor: 'end' }),
    text(M, 604, treatment.decision, { size: 56, mono: true, fill: t.fg, weight: 600 }),
    text(M, 792, treatment.expression,
      { size: 160, mono: true, fill: stateColor('observed', t.dark), weight: 600, tracking: -4 }),
    text(W - M, 748, 'WITH INTERLOCK', { size: 24, mono: true, fill: t.muted, tracking: 3, anchor: 'end' }),
  ];
};

/* V2 — the evidence is load-bearing. */
boards['IL-PROOF-011'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 272;
  const ph = 520;
  const pw = (W - M * 2 - 40) / 2;
  const heads = ['ORIGINAL EVIDENCE', 'PERTURBED EVIDENCE'];
  c.comparison.forEach((arm, i) => {
    const px = M + i * (pw + 40);
    const key = arm.holds ? 'observed' : 'failed';
    const col = stateColor(key, t.dark);
    o.push(panel(px, top, pw, ph, heads[i], t, { width: 2, stroke: i === 0 ? t.fg : t.hair }));
    o.push(text(px + 24, top + 90, arm.label, { size: 22, fill: t.muted }));
    o.push(text(px + 24, top + 150, 'DECISION', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
    o.push(text(px + 24, top + 196, arm.decision, { size: 38, mono: true, fill: t.fg, weight: 600 }));
    o.push(text(px + 24, top + 236, arm.decisionReason, { size: 18, mono: true, fill: t.muted }));
    o.push(text(px + 24, top + 370, arm.expression,
      { size: 96, mono: true, fill: col, weight: 600, tracking: -2 }));
    o.push(chip(px + 24, top + 414, arm.verdict.toUpperCase(), key, { dark: t.dark, size: 18 }).nodes);
    o.push(text(px + 24, top + ph - 26, `basis ${arm.basisRevision.slice(0, 12)}`,
      { size: 17, mono: true, fill: t.muted }));
  });
  o.push(text(M, top + ph + 68, c.proposition, { size: 38, fill: t.fg, weight: 600 }));
  o.push(paragraph(M, top + ph + 110, c.selectionNote, W - M * 2, { size: 20, fill: t.muted }).nodes);
  return o;
};

/* V3 — conceptual mechanism. Where does Interlock intervene? */
boards['IL-DIAG-010'] = (a, t) => {
  const c = a.composition;
  // The class label in the header already says CONCEPTUAL; repeating it here
  // would be the board asserting the same thing twice.
  const o = [];

  const nodeW = 286;
  const nodeH = 92;
  const laneY = [300, 476];
  const envX = 600;
  const envY = 376;
  const envH = 156;
  const envW = 388;

  c.intents.forEach((label, i) => {
    const y = laneY[i];
    o.push(rect(M, y, nodeW, nodeH, { stroke: t.fg, width: 1.5 }));
    o.push(text(M + 22, y + 54, label, { size: 26, fill: t.fg, weight: 500 }));
    o.push(arrow(M + nodeW, y + nodeH / 2, envX - 6, envY + envH / 2, 'intent', t.muted));
  });

  o.push(rect(envX, envY, envW, envH, { stroke: t.fg, width: 1, dash: '1 3' }));
  o.push(text(envX + 24, envY + 52, 'Shared environment', { size: 24, fill: t.fg, weight: 500 }));
  o.push(text(envX + 24, envY + 84, 'evidence', { size: 24, fill: t.fg, weight: 500 }));
  o.push(text(envX + 24, envY + 126, c.constraint.value, { size: 17, mono: true, fill: t.muted }));

  const boundX = 1132;
  o.push(arrow(envX + envW, envY + envH / 2, boundX - 6, envY + envH / 2, 'coupling', t.fg));
  o.push(rect(boundX, envY - 22, 300, envH + 44, { stroke: t.fg, width: 3 }));
  ['Interlock', 'coordination', 'boundary'].forEach((l, i) => {
    o.push(text(boundX + 24, envY + 34 + i * 36, l, { size: 27, fill: t.fg, weight: 600 }));
  });

  const outX = 1590;
  // The coordination decision is the heaviest edge in the grammar; `mutation`
  // and `coupling` share a weight, so reusing it here would draw two different
  // relationships identically.
  o.push(arrow(boundX + 300, envY + envH / 2, outX - 6, envY + envH / 2, 'authorization', t.fg));
  o.push(rect(outX, envY, W - M - outX, envH, { stroke: t.fg, width: 2 }));
  o.push(paragraph(outX + 22, envY + 52, c.outcome, W - M - outX - 44, { size: 22, fill: t.fg, weight: 500 }).nodes);

  o.push(paragraph(M, 672, c.note, W - M * 2, { size: 21, fill: t.muted }).nodes);

  // The board says which line means what, rather than assuming it is obvious.
  const legY = 760;
  o.push(text(M, legY, 'READING', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
  [['intent', 'independent intent'], ['evidence', 'environment evidence'],
    ['coupling', 'coupling'], ['authorization', 'coordination decision']].forEach(([kind, label], i) => {
    const ly = legY + 34 + i * 32;
    o.push(arrow(M, ly, M + 88, ly, kind, t.muted));
    o.push(text(M + 106, ly + 6, label, { size: 18, fill: t.muted }));
  });
  return o;
};

/* V4 — did the product actually traverse Google infrastructure? */
boards['IL-DIAG-011'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 254;
  const cols = 3;
  const gap = 26;
  const cw = (W - M * 2 - gap * (cols - 1)) / cols;
  const rh = 112;

  c.path.forEach((hop, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cw + gap);
    const y = top + row * (rh + gap);
    const key = { decision: 'local', effect: 'executed', observation: 'observed' }[hop.role];
    o.push(rect(x, y, cw, rh, { stroke: key ? t.fg : t.hair, width: key ? 2 : 1 }));
    o.push(text(x + 20, y + 32, String(hop.n).padStart(2, '0'),
      { size: 16, mono: true, fill: t.muted, tracking: 2 }));
    if (key) o.push(stateMark(key, x + cw - 30, y + 30, 12, stateColor(key, t.dark)));
    wrap(hop.label, cw - 44, 23).slice(0, 2).forEach((l, k) => {
      o.push(text(x + 20, y + 66 + k * 28, l, { size: 23, fill: t.fg, weight: key ? 600 : 400 }));
    });
    if (col < cols - 1 && i < c.path.length - 1) {
      o.push(arrow(x + cw + 3, y + rh / 2, x + cw + gap - 3, y + rh / 2, 'mutation', t.muted));
    }
  });

  const obsY = top + 3 * (rh + gap) + 30;
  o.push(text(M, obsY, 'INDEPENDENTLY AUTHENTICATED READ-BACK',
    { size: 17, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(M, obsY + 84, c.observed.value,
    { size: 92, mono: true, fill: stateColor('observed', t.dark), weight: 600, tracking: -2 }));

  const px = 720;
  o.push(text(px, obsY, 'RUNTIME SOURCE', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(px, obsY + 34, c.runtimeSourceSha.value, { size: 19, mono: true, fill: t.fg }));
  o.push(text(px, obsY + 76, 'CORRELATION', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(px, obsY + 110, c.correlationId.value, { size: 19, mono: true, fill: t.fg }));

  const nx = 1400;
  o.push(panel(nx, obsY - 30, W - M - nx, 146, 'NOT ON THE RECORDED PATH', t, { dash: '3 3' }));
  c.notOnPath.forEach((label, i) => {
    o.push(text(nx + 24, obsY + 32 + i * 30, label, { size: 20, mono: true, fill: t.muted }));
  });
  return o;
};

/* V4 brief */
boards['IL-DIAG-011:brief'] = (a, t) => {
  const c = a.composition;
  const pick = (role) => c.path.find((h) => h.role === role).label;
  const steps = [pick('model'), pick('host'), pick('control'), pick('decision'), pick('effect')];
  const o = [];
  const bw = (W - M * 2 - 4 * 22) / 5;
  steps.forEach((label, i) => {
    const x = M + i * (bw + 22);
    o.push(rect(x, 300, bw, 156, { stroke: i >= 2 ? t.fg : t.hair, width: i >= 2 ? 2 : 1 }));
    wrap(label, bw - 34, 24).slice(0, 3).forEach((l, k) => {
      o.push(text(x + 17, 346 + k * 30, l, { size: 24, fill: t.fg, weight: i >= 2 ? 600 : 400 }));
    });
    if (i < steps.length - 1) o.push(arrow(x + bw + 3, 378, x + bw + 19, 378, 'mutation', t.muted));
  });
  o.push(text(M, 660, 'INDEPENDENT READ-BACK', { size: 26, mono: true, fill: t.muted, tracking: 3 }));
  o.push(text(M, 800, c.observed.value,
    { size: 144, mono: true, fill: stateColor('observed', t.dark), weight: 600, tracking: -3 }));
  return o;
};

/* V5 — exact deployment, and the two provenance vocabularies. */
boards['IL-DIAG-012'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 244;
  const rowH = 58;
  const zoneW = 1010;
  c.layers.forEach((layer, i) => {
    const y = top + i * rowH;
    o.push(line(M, y, M + zoneW, y, { stroke: t.hair, width: 1 }));
    o.push(text(M, y + 38, layer.zone, { size: 15, mono: true, fill: t.muted, tracking: 2 }));
    o.push(text(M + 430, y + 38, layer.nodes.join(' - '), { size: 22, fill: t.fg, weight: 500 }));
  });
  const zoneBottom = top + c.layers.length * rowH;
  o.push(line(M, zoneBottom, M + zoneW, zoneBottom, { stroke: t.hair, width: 1 }));

  // The identity boundary. Dashed is transport, solid is application receipt;
  // the third panel exists so the two are never read as one.
  const px = M + zoneW + 44;
  const pw = W - M - px;
  o.push(panel(px, top, pw, 172, 'TRANSPORT PROVENANCE', t, { dash: '5 4', width: 1.5, stroke: t.fg }));
  o.push(text(px + 22, top + 72, c.transportProvenance.identitySource, { size: 18, mono: true, fill: t.fg }));
  o.push(paragraph(px + 22, top + 104, c.transportProvenance.note, pw - 44, { size: 16, fill: t.muted }).nodes);

  o.push(panel(px, top + 196, pw, 172, 'APPLICATION / RECEIPT PROVENANCE', t, { width: 3, stroke: t.fg }));
  o.push(text(px + 22, top + 268, `${c.applicationProvenance.receiptDigest.slice(0, 28)}...`,
    { size: 17, mono: true, fill: t.fg }));
  o.push(paragraph(px + 22, top + 300, c.applicationProvenance.note, pw - 44, { size: 16, fill: t.muted }).nodes);

  o.push(panel(px, top + 392, pw, 174, 'THESE DO NOT COLLAPSE', t, { dash: '1 3' }));
  o.push(paragraph(px + 22, top + 462, c.separationRule, pw - 44, { size: 17, fill: t.muted }).nodes);

  o.push(text(M, zoneBottom + 46, 'EVIDENCED DEPLOYMENT REVISION',
    { size: 15, mono: true, fill: t.muted, tracking: 2 }));
  o.push(text(M, zoneBottom + 84, c.evidencedRevision.value, { size: 25, mono: true, fill: t.fg, weight: 500 }));
  o.push(paragraph(M, zoneBottom + 118, c.revisionNote, zoneW, { size: 17, fill: t.muted }).nodes);

  // Naming what is absent from the deployment is part of the deployment
  // drawing, not a footnote to it. It sits under the provenance column, which
  // is where a reader is already asking what did and did not participate.
  const ny = top + 590;
  o.push(panel(px, ny, pw, 110, 'ABSENT FROM THIS DEPLOYMENT', t, { dash: '3 3' }));
  o.push(text(px + 22, ny + 76, c.notOnPath.join('   '), { size: 19, mono: true, fill: t.muted, tracking: 1 }));
  return o;
};

/* V5 brief — three boundaries only. */
boards['IL-DIAG-012:brief'] = (a, t) => {
  const c = a.composition;
  return [
    ['TRANSPORT PROVENANCE', c.transportProvenance.identitySource, '5 4', 1.5],
    ['INTERLOCK CONTROL BOUNDARY', 'ALLOW plus authorization receipt', null, 3],
    ['RECEIPT-BOUND PROTECTED TARGET', 'the mutation executes only against a receipt', null, 2],
  ].map(([head, body, dash, wgt], i) => {
    const y = 286 + i * 198;
    return [
      rect(M, y, W - M * 2, 158, { stroke: t.fg, width: wgt, dash }),
      text(M + 30, y + 58, head, { size: 23, mono: true, fill: t.muted, tracking: 2.4 }),
      text(M + 30, y + 114, body, { size: 33, fill: t.fg, weight: 500 }),
    ];
  });
};

/* V6 — decision, effect, observation. Three records, never one. */
boards['IL-PROOF-012'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 258;
  const pw = (W - M * 2 - 52 * 2) / 3;
  const keys = { DECISION: 'local', EFFECT: 'executed', OBSERVATION: 'observed' };
  c.stages.forEach((st, i) => {
    const x = M + i * (pw + 52);
    const key = keys[st.stage];
    const col = stateColor(key, t.dark);
    o.push(panel(x, top, pw, 396, st.stage, t, { width: 2, stroke: t.fg }));
    o.push(stateMark(key, x + pw - 40, top + 30, 14, col));
    o.push(text(x + 24, top + 122, st.value, { size: 50, mono: true, fill: col, weight: 600 }));
    o.push(paragraph(x + 24, top + 176, st.detail, pw - 48, { size: 20, fill: t.fg }).nodes);
    o.push(paragraph(x + 24, top + 312, st.note, pw - 48, { size: 17, fill: t.muted }).nodes);
    if (i < 2) o.push(arrow(x + pw + 6, top + 198, x + pw + 46, top + 198, 'mutation', t.muted));
  });

  const y2 = top + 448;
  o.push(text(M, y2, 'RECEIPT DIGEST', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(M, y2 + 36, `${c.receiptDigest.value.slice(0, 44)}...`, { size: 20, mono: true, fill: t.fg }));
  o.push(text(M, y2 + 80, 'CORRELATION', { size: 16, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(M, y2 + 116, c.correlationId.value, { size: 20, mono: true, fill: t.fg }));

  // Absent states are named, not drawn. HAC-317 owns them and this run has none.
  const ax = M + 900;
  o.push(panel(ax, y2 - 38, W - M - ax, 186, 'NOT PRESENT IN THIS RUN', t, { dash: '3 3' }));
  o.push(text(ax + 24, y2 + 14, c.absentStates.join('   '),
    { size: 21, mono: true, fill: t.muted, tracking: 1.2 }));
  o.push(paragraph(ax + 24, y2 + 52, c.absentStatesNote, W - M - ax - 48, { size: 17, fill: t.muted }).nodes);
  return o;
};

/* V7 — three recorded refusals, and one control that is not a cloud result. */
boards['IL-PROOF-013'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 262;
  const rowH = 126;
  c.cloudControls.forEach((ctl, i) => {
    const y = top + i * rowH;
    o.push(line(M, y, W - M, y, { stroke: t.hair, width: 1 }));
    o.push(stateMark('blocked', M + 24, y + rowH / 2, 16, stateColor('blocked', t.dark)));
    o.push(text(M + 72, y + 58, ctl.label, { size: 31, fill: t.fg, weight: 500 }));
    o.push(text(M + 72, y + 92, ctl.id, { size: 18, mono: true, fill: t.muted }));
    o.push(text(W - M, y + 80, String(ctl.status),
      { size: 70, mono: true, fill: stateColor('blocked', t.dark), weight: 600, anchor: 'end' }));
  });
  const bottom = top + 3 * rowH;
  o.push(line(M, bottom, W - M, bottom, { stroke: t.hair, width: 1 }));
  o.push(paragraph(M, bottom + 40, c.cloudControlsNote, 900, { size: 21, fill: t.muted }).nodes);

  // Visibly separate. This one is local parity and is not a cloud result.
  const ly = bottom + 84;
  o.push(panel(M, ly, W - M * 2, 150, c.localParity.heading, t, { dash: '3 3', stroke: t.fg }));
  o.push(paragraph(M + 24, ly + 70, c.localParity.note, W - M * 2 - 48, { size: 18, fill: t.muted }).nodes);
  return o;
};

/* V8 — the claim boundary. Not-claimed is the widest region, at the same size. */
boards['IL-PROOF-014'] = (a, t) => {
  const c = a.composition;
  const o = [];
  const top = 246;
  const gap = 32;
  const ph = 636;
  // Not-claimed is deliberately the widest region and set at the same type size
  // as the other two: it is a trust surface, not fine print.
  const widths = [0.27, 0.27, 0.46];
  let x = M;
  c.regions.forEach((r, i) => {
    const pw = (W - M * 2 - gap * 2) * widths[i];
    const last = i === 2;
    o.push(panel(x, top, pw, ph, null, t, { width: last ? 2 : 1, stroke: last ? t.fg : t.hair }));
    const heads = wrap(r.heading, pw - 48, 25, { weight: 600 });
    heads.forEach((l, k) => o.push(text(x + 24, top + 48 + k * 30, l, { size: 25, fill: t.fg, weight: 600 })));
    let y = top + 54 + heads.length * 30;
    if (r.sourceIssue) {
      o.push(text(x + 24, y, r.sourceIssue, { size: 17, mono: true, fill: t.muted, tracking: 1.6 }));
      y += 34;
    }
    y += 14;
    // The not-claimed region flows in two columns so every entry fits at the
    // same type size as the other two regions. Shrinking the type or dropping a
    // line would turn the claim boundary into the fine print it must not be.
    const cols = last ? 2 : 1;
    const colGap = 26;
    const colW = (pw - 48 - colGap * (cols - 1)) / cols;
    const startY = y;
    const bottom = top + ph - 22;
    let col = 0;
    let dropped = 0;
    for (const item of r.supports) {
      const cx = x + 24 + col * (colW + colGap);
      const p = paragraph(cx + 20, y, item, colW - 20, { size: 17, fill: last ? t.muted : t.fg, lineHeight: 1.38 });
      if (y + p.height > bottom) {
        col += 1;
        if (col >= cols) { dropped += 1; continue; }
        y = startY;
        const cx2 = x + 24 + col * (colW + colGap);
        const p2 = paragraph(cx2 + 20, y, item, colW - 20, { size: 17, fill: last ? t.muted : t.fg, lineHeight: 1.38 });
        o.push(text(cx2, y, 'x', { size: 17, mono: true, fill: stateColor('failed', t.dark), weight: 600 }));
        o.push(p2.nodes);
        y += p2.height + 11;
        continue;
      }
      o.push(text(cx, y, last ? 'x' : '-',
        { size: 17, mono: true, fill: last ? stateColor('failed', t.dark) : t.muted, weight: 600 }));
      o.push(p.nodes);
      y += p.height + 11;
    }
    // A truncated claim boundary is a defect, not a layout compromise.
    if (dropped) throw new Error(`${a.id}: ${dropped} claim-boundary line(s) did not fit in region "${r.heading}"`);
    x += pw + gap;
  });
  o.push(text(M, top + ph + 46, 'Two runs, two proof classes. Neither is evidence for the other.',
    { size: 23, fill: t.muted }));
  return o;
};

/* V9 — a reserved surface that must stay obviously empty. */
boards['IL-DIAG-013'] = (a, t) => {
  const c = a.composition;
  // The header class label already reads DESIGN SHELL - AWAITING HAC-319.
  const o = [
    text(M, 264, c.message.toUpperCase(), { size: 40, mono: true, fill: t.fg, weight: 600, tracking: 1 }),
  ];
  const top = 330;
  const ph = 392;
  const pw = (W - M * 2 - 40 * 2) / 3;
  c.regimes.forEach((regime, i) => {
    const x = M + i * (pw + 40);
    o.push(rect(x, top, pw, ph, { stroke: t.hair, width: 1, dash: '3 3' }));
    o.push(text(x + 24, top + 50, regime, { size: 25, fill: t.fg, weight: 500 }));
    // No mark of any kind. A bar, dot or proportional area here would state a
    // comparison that has not been run.
    o.push(text(x + pw / 2, top + ph / 2 + 8, 'NOT BOUND',
      { size: 22, mono: true, fill: t.muted, tracking: 3, anchor: 'middle' }));
  });
  const wy = top + ph + 56;
  o.push(text(M, wy, 'METRICS WITHHELD', { size: 17, mono: true, fill: t.muted, tracking: 2.2 }));
  o.push(text(M, wy + 38, c.metricsWithheld.join('   '), { size: 23, mono: true, fill: t.muted }));
  o.push(paragraph(M, wy + 78, c.rule, W - M * 2, { size: 18, fill: t.muted }).nodes);
  return o;
};

/* -- rails ---------------------------------------------------------------- */

/** Each board states what is frozen on it and what it does not claim. */
function railFor(a) {
  const c = a.composition;
  const frozen = [];
  let nonClaim = '';
  switch (a.id) {
    case 'IL-PROOF-010':
      frozen.push(...c.arms.map((x) => x.expression), c.arms.find((x) => x.decision).decision, `checks ${c.checks.value}`);
      nonClaim = 'not safe, approved, verified, authorized or certified; this experiment ran locally, not on Google Cloud';
      break;
    case 'IL-PROOF-011':
      frozen.push(...c.comparison.map((x) => `${x.decision} ${x.expression}`));
      nonClaim = 'both arms are recorded results; the perturbation is a frozen arm, not a live re-run';
      break;
    case 'IL-DIAG-010':
      frozen.push(c.constraint.value);
      nonClaim = 'conceptual mechanism only; no deployment topology, cloud runtime or receipt is asserted here';
      break;
    case 'IL-DIAG-011':
      frozen.push(c.observed.value, c.correlationId.value);
      nonClaim = 'one recorded traversal; does not reproduce the controlled local counterfactual in Google Cloud';
      break;
    case 'IL-DIAG-012':
      frozen.push(c.evidencedRevision.value);
      nonClaim = 'service accounts establish transport provenance only; internal Interlock roles are not Google-managed identities';
      break;
    case 'IL-PROOF-012':
      frozen.push(...c.stages.map((s) => s.value));
      nonClaim = 'ALLOW is a decision, not a verification; OBSERVED is an observation, not a safety property; a receipt is not exactly-once';
      break;
    case 'IL-PROOF-013':
      frozen.push(...c.cloudControls.map((x) => String(x.status)));
      nonClaim = 'not secure, not unbypassable, not comprehensive attack coverage; three recorded controls only';
      break;
    case 'IL-PROOF-014':
      frozen.push('two proof classes, recorded separately');
      nonClaim = 'no claim crosses between the two runs';
      break;
    case 'IL-DIAG-013':
      frozen.push('none - evaluation not yet bound');
      nonClaim = 'no value, no mark and no proportional geometry until a frozen evaluation packet exists';
      break;
    default:
      throw new Error(`no rail defined for ${a.id}`);
  }
  return [`Frozen evidence: ${frozen.join('  ')}`, `Non-claim: ${nonClaim}`];
}

/* -- frame ---------------------------------------------------------------- */

function compose(asset, brief) {
  const t = themeFor(asset.proofClass);
  const render = boards[brief ? `${asset.id}:brief` : asset.id];
  if (!render) throw new Error(`no board renderer for ${asset.id}${brief ? ' (brief)' : ''}`);
  const title = brief ? `${asset.assetName} - brief` : asset.assetName;
  const rail = railFor(asset);

  const railY = 962;
  const content = flat([render(asset, t)]);
  const nodes = flat([
    text(M, 90, asset.proofClassLabel, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 3 }),
    text(W - M, 90, asset.id, { size: 18, mono: true, fill: t.muted, weight: 500, tracking: 2, anchor: 'end' }),
    line(M, 116, W - M, 116, { stroke: t.hair, width: 1 }),
    text(M, 184, title, { size: 50, weight: 600, fill: t.fg, tracking: -0.8 }),
    content,
    line(M, railY, W - M, railY, { stroke: t.hair, width: 1 }),
    rail.map((r, i) => text(M, railY + 34 + i * 26, r, { size: 16, mono: true, fill: t.muted })),
  ]);

  const where = `${asset.id}${brief ? ' (brief)' : ''}`;

  // A label wider than the board, or one the rail rule runs through, is a
  // defect the model cannot see: both look fine as data and wrong as a picture.
  for (const node of nodes) {
    if (node.t !== 'text') continue;
    const w = measure(node.s, node.size, node);
    const left = node.anchor === 'end' ? node.x - w : node.anchor === 'middle' ? node.x - w / 2 : node.x;
    if (left < M - 2 || left + w > W - M + 2) {
      throw new Error(
        `${where}: text overflows the safe area `
        + `[${Math.round(left)}..${Math.round(left + w)}] outside [${M}..${W - M}]: ${JSON.stringify(node.s.slice(0, 60))}`,
      );
    }
  }
  for (const node of content) {
    const bottom = node.t === 'text' ? node.y + node.size * 0.24
      : node.t === 'rect' ? node.y + node.h
        : node.t === 'line' ? Math.max(node.y1, node.y2)
          : node.t === 'circle' ? node.cy + node.r : 0;
    if (bottom > railY - 8) {
      throw new Error(
        `${where}: content reaches y=${Math.round(bottom)}, past the rail rule at ${railY}`
        + `${node.t === 'text' ? `: ${JSON.stringify(node.s.slice(0, 60))}` : ` (${node.t})`}`,
      );
    }
  }

  return {
    nodes,
    page: {
      width: W,
      height: H,
      background: t.bg,
      title: `${asset.id} ${title}`,
      desc: `${asset.proofClassLabel}. ${rail.join(' ')}`,
    },
  };
}

/* -- emit ----------------------------------------------------------------- */

const mastersDir = join(repoRoot, 'media', 'hac-334', 'masters');
const exportsDir = join(repoRoot, 'media', 'hac-334', 'exports');
for (const dir of [mastersDir, exportsDir]) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.svg') || f.endsWith('.pdf')) rmSync(join(dir, f));
  }
}

const named = (asset, ex, ext) => {
  const name = buildExportName({
    id: asset.id,
    slug: ex.slug,
    ext,
    ...(ex.width ? { width: ex.width, height: ex.height } : {}),
    ...(asset.run ? { run: asset.run } : {}),
  });
  const check = validateExportName(name);
  if (!check.valid) throw new Error(`built an unparseable export name ${name}: ${check.error}`);
  return name;
};

let svgCount = 0;
let pdfCount = 0;
for (const asset of model.assets) {
  for (const role of [undefined, '5s']) {
    const group = asset.exports.filter((e) => e.presentationRole === role);
    if (!group.length) continue;
    const { nodes, page } = compose(asset, role === '5s');

    for (const ex of group.filter((e) => e.ext === 'svg')) {
      writeFileSync(join(mastersDir, named(asset, ex, 'svg')), toSvg(nodes, page));
      svgCount += 1;
    }
    for (const ex of group.filter((e) => e.ext === 'pdf')) {
      writeFileSync(join(exportsDir, named(asset, ex, 'pdf')), toPdf(nodes, page));
      pdfCount += 1;
    }
  }
}

process.stdout.write(
  'HAC-334 masters rendered\n'
  + `  ${svgCount} SVG masters in media/hac-334/masters\n`
  + `  ${pdfCount} vector PDFs in media/hac-334/exports\n`,
);
