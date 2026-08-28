#!/usr/bin/env node
/**
 * HAC-335 — the deterministic Interlock authorization sequence.
 *
 * Two bounded Veo rounds established that a video model will not honour ordered
 * state transitions: round 1 (start+last frame) opened the gate at t=0.9s with
 * no authorization pause; round 2 (start frame only) replaced the mark with an
 * invented machine inside 0.2s. Both are recorded, with measurements, in
 * `evidence/generation-ledger.json`. The conclusion recorded there is that the
 * semantic state machine is not a thing to generate.
 *
 * So it is rendered. Every number below is read from repository authority:
 * geometry from `assets/brand/logo-geometry.js`, phase durations and easings
 * from `assets/tokens/motion.css`. Nothing here is an interpretation of the
 * motion grammar — it IS the motion grammar, evaluated frame by frame.
 *
 * The five-state model, in the order the product works:
 *
 *   P1 independent   560ms   the four trajectories converge   il-converge
 *   P2 constraint    340ms   the shared seam becomes legible  il-appear
 *   P3 coupling      440ms   the leaves engage, span appears  il-appear
 *   P4a HOLD         700ms   --dur-hold. Nothing moves.
 *   P4b gate         520ms   --dur-gate, on --ease-mech       il-gate-open
 *   P5 passage       520ms   the trajectories proceed         il-pass
 *   rest             380ms   the composition resolves
 *
 * P1..rest sum to exactly --mot-stinger-total (3460ms), and P4a+P4b sum to
 * exactly --mot-p4-authorization (1220ms). Both are asserted at build time, so
 * this file cannot drift from the stylesheet silently.
 *
 * The hold is absolute: during those 700ms every frame is byte-identical,
 * including the camera. That is the one property both generated rounds failed,
 * and it is free to guarantee here.
 *
 *     node media/hac-335/veo-hero/bin/build-sequence.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildExportName, validateExportName } from '../../../../scripts/export-naming.mjs';
import { canonicalArms, canonicalLeaves, repoRoot } from './lib/mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'exports');
const evidenceDir = join(here, '..', 'evidence');

const W = 1920;
const H = 1080;
const FPS = 24;

const INK = '#0b0d0e';
const PAPER = '#fbfbfa';
const PAPER_EDGE = '#e8e9e7';

/** Same staging as the keyframes, so the sequence and the stills agree. */
const MARK = 660;
const MARK_X = (W - MARK) / 2;
const MARK_Y = Math.round(H * 0.46) - MARK / 2;

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/* -- repository authority -------------------------------------------------- */

const motionCss = readFileSync(join(repoRoot, 'assets', 'tokens', 'motion.css'), 'utf8');
const geometryJs = readFileSync(join(repoRoot, 'assets', 'brand', 'logo-geometry.js'), 'utf8');

/** Read a duration token, in ms. Throws rather than defaulting: a missing token
 *  means the stylesheet moved and this file must be looked at, not guessed. */
function ms(token) {
  const m = new RegExp(`${token}:\\s*(\\d+)ms`).exec(motionCss);
  if (!m) throw new Error(`assets/tokens/motion.css declares no ${token}`);
  return Number(m[1]);
}
/** Read a cubic-bezier easing token as its four control values. */
function ease(token) {
  const m = new RegExp(`${token}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(motionCss);
  if (!m) throw new Error(`assets/tokens/motion.css declares no ${token}`);
  const v = m[1].split(',').map((s) => Number(s.trim()));
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) throw new Error(`bad cubic-bezier for ${token}`);
  return v;
}
const num = (re, what) => {
  const m = re.exec(geometryJs);
  if (!m) throw new Error(`assets/brand/logo-geometry.js declares no ${what}`);
  return Number(m[1]);
};

const D = {
  p1: ms('--mot-p1-independent'),
  p2: ms('--mot-p2-constraint'),
  p3: ms('--mot-p3-coupling'),
  hold: ms('--dur-hold'),
  gate: ms('--dur-gate'),
  p5: ms('--mot-p5-passage'),
  rest: ms('--mot-rest'),
};
const AUTHORIZATION = ms('--mot-p4-authorization');
const STINGER_TOTAL = ms('--mot-stinger-total');
const GATE_TRAVEL = num(/GATE_TRAVEL\s*=\s*([\d.]+)/, 'GATE_TRAVEL');
const GRID = num(/export const GRID = (\d+)/, 'GRID');

/* The two assertions that keep this file honest against the stylesheet. */
if (D.hold + D.gate !== AUTHORIZATION) {
  throw new Error(`--dur-hold + --dur-gate = ${D.hold + D.gate}ms but --mot-p4-authorization is ${AUTHORIZATION}ms`);
}
const semantic = D.p1 + D.p2 + D.p3 + D.hold + D.gate + D.p5 + D.rest;
if (semantic !== STINGER_TOTAL) {
  throw new Error(`the semantic phases sum to ${semantic}ms but --mot-stinger-total is ${STINGER_TOTAL}ms`);
}
const AUTHORED_HOLD = D.hold;

/** Lead-in lets the cut breathe after the preceding board; settle holds the
 *  authorized state before the end card. Neither is a semantic phase, and
 *  neither is read from the stylesheet — they are edit, not grammar. */
const LEAD_IN = 500;
const SETTLE = 1540;

/**
 * Frame quantization of the hold.
 *
 * --dur-hold is 700ms, which is not representable at 24fps: the nearest whole
 * frame counts are 16 (666.7ms) and 17 (708.3ms). Rendering 16 would put a
 * *shorter* pause on screen than the motion grammar requires, and the pause is
 * the one thing this sequence exists to make felt. So it rounds up. The extra
 * 8.3ms is recorded in the manifest rather than absorbed silently.
 */
const HOLD_FRAMES = Math.ceil((D.hold / 1000) * FPS);
const HOLD_RENDERED = (HOLD_FRAMES / FPS) * 1000;
D.hold = HOLD_RENDERED;

const TOTAL = LEAD_IN + D.p1 + D.p2 + D.p3 + D.hold + D.gate + D.p5 + D.rest + SETTLE;
const FRAMES = Math.round((TOTAL / 1000) * FPS);

/** The timeline, as absolute ms boundaries. */
const T = {};
let cursor = LEAD_IN;
for (const [k, d] of [['p1', D.p1], ['p2', D.p2], ['p3', D.p3], ['hold', D.hold],
  ['gate', D.gate], ['p5', D.p5], ['rest', D.rest]]) {
  T[k] = { start: cursor, end: cursor + d, dur: d };
  cursor += d;
}

/* -- easing ---------------------------------------------------------------- */

/** Evaluate a CSS cubic-bezier at time t, by Newton-Raphson on x. */
function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
const EASE = {
  standard: bezier(ease('--ease-standard')),
  enter: bezier(ease('--ease-enter')),
  mech: bezier(ease('--ease-mech')),
};

/** Progress through a phase at time `t`, clamped to [0,1]. */
const phase = (t, p) => Math.min(1, Math.max(0, (t - T[p].start) / T[p].dur));

/* -- the frame ------------------------------------------------------------- */

const ARMS = canonicalArms();

/**
 * The gate leaves reshape; they do not translate.
 *
 * A first pass animated the leaves with `translateX(±GATE_TRAVEL)`, reading
 * `il-gate-open` literally. Comparing the two canonical files shows that is
 * wrong: the OUTER edge is fixed at 18.6 / 29.4 in both states, and only the
 * INNER edge moves — 23.2 -> 21.6 and 24.8 -> 26.4. Each leaf is a trapezoid
 * whose inner edge retracts by exactly GATE_TRAVEL. Translating instead
 * detaches the leaf from its arm and holds the leaf's width constant, which
 * lands on an aperture ratio of 1.048 rather than the canonical 1.600.
 *
 * So the inner edge is interpolated, and both endpoints are read out of the
 * canonical files rather than written down here.
 */
function leafInnerX(file) {
  const src = readFileSync(join(repoRoot, 'assets', 'logo', file), 'utf8');
  const pick = (outer) => {
    const m = new RegExp(`M${outer} 16\\.2 L([\\d.]+) 19\\.4`).exec(src);
    if (!m) throw new Error(`${file}: no leaf found at outer edge ${outer}`);
    return Number(m[1]);
  };
  return { l: pick('18\\.6'), r: pick('29\\.4') };
}
const LEAF_CLOSED = leafInnerX('interlock-symbol-white.svg');
const LEAF_OPEN = leafInnerX('interlock-symbol-open.svg');
for (const [side, a, b] of [['left', LEAF_CLOSED.l, LEAF_OPEN.l], ['right', LEAF_CLOSED.r, LEAF_OPEN.r]]) {
  if (Math.abs(Math.abs(b - a) - GATE_TRAVEL) > 1e-9) {
    throw new Error(`the ${side} leaf inner edge moves ${Math.abs(b - a)} but GATE_TRAVEL is ${GATE_TRAVEL}`);
  }
}
const leafL = (x) => `M18.6 16.2 L${x.toFixed(4)} 19.4 L${x.toFixed(4)} 28.6 L18.6 31.8 Z`;
const leafR = (x) => `M29.4 16.2 L${x.toFixed(4)} 19.4 L${x.toFixed(4)} 28.6 L29.4 31.8 Z`;
/** state-2's seam and state-4's coupled span, read from the state files. */
const seamPath = (() => {
  const s = readFileSync(join(repoRoot, 'assets', 'logo', 'interlock-state-2.svg'), 'utf8');
  const m = /<path d="(M23\.6[^"]+)"/.exec(s);
  if (!m) throw new Error('interlock-state-2.svg no longer carries the centre seam');
  return m[1];
})();
const spanPath = (() => {
  const s = readFileSync(join(repoRoot, 'assets', 'logo', 'interlock-state-4.svg'), 'utf8');
  const m = /<path d="(M23\.2[^"]+)"[^>]*opacity/.exec(s);
  if (!m) throw new Error('interlock-state-4.svg no longer carries the coupled span');
  return m[1];
})();

/** Each arm's own outward direction, so they converge from their own corner. */
const ARM_DIR = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const APPROACH = 6; // il-converge's --il-approach, in grid units
const PASS = 4;     // il-pass's --il-pass, in grid units

function frameSvg(tMs) {
  /* Camera: one slow pull-back. Camera time excludes the hold, so the camera is
     frozen for its full 700ms exactly as the trajectories are. */
  const preHold = Math.min(tMs, T.hold.start);
  const postHold = Math.max(0, tMs - T.hold.end);
  const camSpan = TOTAL - D.hold;
  const camScale = 1.06 + (1.00 - 1.06) * EASE.standard((preHold + postHold) / camSpan);

  const parts = [
    `<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" stop-color="${PAPER}"/><stop offset="62%" stop-color="${PAPER}"/>`
    + `<stop offset="100%" stop-color="${PAPER_EDGE}"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`,
  ];

  const g = [];

  /* P1 — the trajectories converge, each from its own corner. */
  const cP1 = EASE.enter(phase(tMs, 'p1'));
  const armOff = APPROACH * (1 - cP1);
  const armAlpha = cP1;

  /* P5 — passage: the trajectories proceed through the opened aperture, then
     the composition resolves over --mot-rest back to the canonical mark. */
  const cP5 = EASE.standard(phase(tMs, 'p5'));
  const cRest = EASE.standard(phase(tMs, 'rest'));
  const armPass = PASS * cP5 * (1 - cRest);

  for (let i = 0; i < ARMS.length; i++) {
    const [dx, dy] = ARM_DIR[i];
    const x = armOff * dx;
    const y = armOff * dy;
    g.push(`<g transform="translate(${x.toFixed(4)} ${y.toFixed(4)})" opacity="${armAlpha.toFixed(4)}">`
      + `<path d="${ARMS[i]}"/></g>`);
  }

  /* P2 — the shared constraint becomes legible. state-2 draws it at 0.3. */
  const seamIn = EASE.standard(phase(tMs, 'p2'));
  const seamOut = EASE.standard(phase(tMs, 'gate'));
  const seamAlpha = 0.3 * seamIn * (1 - seamOut);
  if (seamAlpha > 0.001) g.push(`<path d="${seamPath}" opacity="${seamAlpha.toFixed(4)}"/>`);

  /* P3 — the leaves engage. P4b — they open by exactly GATE_TRAVEL each. */
  const leafAlpha = EASE.standard(phase(tMs, 'p3'));
  const gateT = EASE.mech(phase(tMs, 'gate'));
  const innerL = LEAF_CLOSED.l + (LEAF_OPEN.l - LEAF_CLOSED.l) * gateT;
  const innerR = LEAF_CLOSED.r + (LEAF_OPEN.r - LEAF_CLOSED.r) * gateT;
  if (leafAlpha > 0.001) {
    g.push(`<g opacity="${leafAlpha.toFixed(4)}">`
      + `<path d="${leafL(innerL)}"/><path d="${leafR(innerR)}"/>`
      + `</g>`);
    /* state-4's coupled span: joint review. It is released when the gate opens. */
    const spanAlpha = 0.4 * leafAlpha * (1 - gateT);
    if (spanAlpha > 0.001) g.push(`<path d="${spanPath}" opacity="${spanAlpha.toFixed(4)}"/>`);
  }

  /* P5 passage: `il-pass` translates the element it is applied to. Applying it
     to the arms alone drove their inner tips (17.2) into the leaves' outer edge
     (18.6) — a collision, not a passage. It is applied to the whole mark, so
     the composition proceeds through the opened boundary as one body and
     resolves back to centre over --mot-rest. */
  const size = MARK * camScale;
  const x = (W - size) / 2;
  const y = MARK_Y + (MARK - size) / 2;
  parts.push(`<svg x="${(x + (armPass / GRID) * size).toFixed(3)}" y="${y.toFixed(3)}" width="${size.toFixed(3)}"`
    + ` height="${size.toFixed(3)}" viewBox="0 0 ${GRID} ${GRID}" fill="url(#m)" overflow="visible">`
    + g.join('') + `</svg>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"`
    + ` viewBox="0 0 ${W} ${H}" role="img" aria-label="Interlock">${parts.join('')}</svg>`;
}

/* -- render ---------------------------------------------------------------- */

mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const name = buildExportName({
  id: 'IL-MOT-031', slug: 'authorization-sequence', width: W, height: H, ext: 'mp4',
});
const check = validateExportName(name);
if (!check.valid) throw new Error(`filename violates the naming contract: ${name} — ${check.error}`);
const outFile = join(outDir, name);

const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const ff = spawn(FFMPEG, [
  '-v', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-an',                                   // HAC-333 froze the cut as muted
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  outFile,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const digests = [];
let holdDigests = new Set();

for (let f = 0; f < FRAMES; f++) {
  const tMs = (f / FPS) * 1000;
  const png = new Resvg(frameSvg(tMs), { fitTo: { mode: 'width', value: W }, background: INK })
    .render().asPng();
  digests.push(sha256(png));
  if (tMs >= T.hold.start && tMs < T.hold.end) holdDigests.add(digests[f]);
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

/* -- the hold is absolute, and that is checked rather than asserted -------- */

const holdFrames = digests.filter((_, f) => {
  const t = (f / FPS) * 1000;
  return t >= T.hold.start && t < T.hold.end;
}).length;
if (holdDigests.size !== 1) {
  throw new Error(`the hold spans ${holdDigests.size} distinct frames; it must be byte-identical throughout`);
}
if (holdFrames < HOLD_FRAMES) {
  throw new Error(`the hold covers ${holdFrames} frames; ${HOLD_FRAMES} are needed to reach ${AUTHORED_HOLD}ms`);
}

const mp4 = readFileSync(outFile);
writeFileSync(join(evidenceDir, 'sequence-manifest.json'), `${JSON.stringify({
  manifestId: 'IL-MOT-031-authorization-sequence',
  issue: 'HAC-335',
  note: 'Deterministic render of the Interlock authorization sequence. No generative model is '
    + 'involved. Supersedes the rejected Veo rounds for the semantic state machine.',
  authority: {
    geometry: 'assets/brand/logo-geometry.js',
    motion: 'assets/tokens/motion.css',
    gateTravelPerLeaf: GATE_TRAVEL,
    stingerTotalMs: STINGER_TOTAL,
    authorizationMs: AUTHORIZATION,
  },
  video: { file: `media/hac-335/veo-hero/exports/${name}`, width: W, height: H, fps: FPS,
    frames: FRAMES, durationMs: TOTAL, sha256: sha256(mp4), bytes: mp4.length, audio: 'none' },
  timeline: [
    { phase: 'lead-in', startMs: 0, durMs: LEAD_IN, semantic: false },
    ...Object.entries(T).map(([k, v]) => ({ phase: k, startMs: v.start, durMs: v.dur, semantic: true })),
    { phase: 'settle', startMs: cursor, durMs: SETTLE, semantic: false },
  ],
  holdIsByteIdentical: true,
  holdFrames,
  hold: {
    authoredMs: AUTHORED_HOLD,
    renderedMs: HOLD_RENDERED,
    frames: HOLD_FRAMES,
    quantization: `--dur-hold is ${AUTHORED_HOLD}ms, which is not representable at ${FPS}fps. `
      + `Rendered as ${HOLD_FRAMES} frames (${HOLD_RENDERED.toFixed(1)}ms), rounded UP so the pause `
      + 'on screen is never shorter than the motion grammar requires.',
  },
  frameDigests: digests,
}, null, 2)}\n`);

console.log(`  ${name}`);
console.log(`  ${FRAMES} frames @ ${FPS}fps = ${(TOTAL / 1000).toFixed(3)}s, no audio track`);
console.log(`  hold ${AUTHORED_HOLD}ms -> ${HOLD_RENDERED.toFixed(1)}ms = ${holdFrames} byte-identical frames (t=${(T.hold.start / 1000).toFixed(3)}-${(T.hold.end / 1000).toFixed(3)}s)`);
console.log(`  gate ${D.gate}ms on --ease-mech, travel ${GATE_TRAVEL}/leaf`);
console.log(`  ${(mp4.length / 1024 / 1024).toFixed(2)} MiB  ${sha256(mp4).slice(0, 12)}…`);
