/**
 * The Forensic Replay, as data.
 *
 * Eight scenes and an end card, authored as semantic states plus timed tracks.
 * There is no `setTimeout` here and no elapsed-time variable: `plateAt(t)`
 * evaluates every track at `t` and returns a display list. Playback, a scrub to
 * 23.0, a canonical still and a frame of the export all take that one path, so
 * the question "is this the frame the gate checked" has a mechanical answer.
 *
 * Scene bodies read `world.mjs` for every coordinate and `bindings.json` for
 * every fact. They compute presentation — how far a bar has risen, how far an
 * edge has drawn — and nothing else. No scene may decide what was decided.
 *
 * Two devices are reserved, and reserved on purpose.
 *
 *   **Rewind** belongs to S2. The composition reverses along its own
 *   trajectories, through the same objects. Nothing else in the cut runs
 *   backwards, so when it happens the viewer reads it as forensic rather than
 *   as a transition.
 *
 *   **The ablation cut** at S8 is a hard re-entry, not a continuation. The world
 *   snaps to the pre-state under the perturbed history and both intents rise
 *   together, exactly as they did in S1. That is deliberate: if beta simply
 *   filled in from its withheld outline, the plate would be animating the
 *   withheld peer executing — which is the one thing S7 says did not happen in
 *   the recorded run.
 */
import {
  stepTrack, numberTrack, frameAt, sequence, settle,
} from '../../../hac-334/bin/lib/motion.mjs';
import {
  pathLegend, boundary, targetBar, couplingEdge, gutter, gauge, outcome, sceneLine,
  TARGET_STATE as TS, RELATIONSHIP as REL, OUTCOME as OUT,
  flat, label, noteBlock, rect, line, text, measure, asciify, N, INK, PAPER, FAILED,
  COLUMNS, BAR_W, BASE_Y, FRAME, ROWS, NOTES, GAUGE, REPLAY, CONTENTION, ORDER, clamp01, heightOf, topOf,
} from './plate.mjs';
import { CONTENT, FRAME_LABEL_Y, centreOf, W, H } from './world.mjs';

/* -- authored boundaries -------------------------------------------------- */

/** The storyboard's frozen timings. Nothing derives a duration by subtraction elsewhere. */
export const SCENES = [
  { id: 'S1', start: 0, end: 4.0, name: 'the anomaly' },
  { id: 'S2', start: 4.0, end: 8.0, name: 'forensic rewind' },
  { id: 'S3', start: 8.0, end: 13.0, name: 'the credible lock' },
  { id: 'S4', start: 13.0, end: 17.0, name: 'the miss' },
  { id: 'S5', start: 17.0, end: 19.5, name: 'environmental truth' },
  { id: 'S6', start: 19.5, end: 21.5, name: 'repository evidence' },
  { id: 'S7', start: 21.5, end: 25.5, name: 'coordination changes' },
  { id: 'S8', start: 25.5, end: 29.0, name: 'evidence ablation' },
  { id: 'END', start: 29.0, end: 30.0, name: 'end card' },
];

export const seq = sequence(SCENES);

const VERIFIER_NOTE = 'evaluated after execution by the independent fixture verifier';

/* -- track construction --------------------------------------------------- */

/**
 * Build every track for the cut, in absolute time.
 *
 * One flat table rather than per-scene closures: a track that spans a scene
 * boundary — the coupling edge, which resolves in S6 and is still resolved in
 * S7 — has to be expressible without one scene reaching into another's state.
 * Absolute time makes "resolves once and is not redrawn" a property of the
 * data instead of a rule someone has to remember.
 */
export function buildTracks(b) {
  const pre = b.targets;
  const preTotal = pre.alpha.pre + pre.beta.pre + pre.gamma.pre;

  return {
    /* S1 — both relevant bars rise together, the overflow resolves last. */
    s1Fill: numberTrack([{ at: 0.55, value: 0 }, { at: 2.3, value: 1, ease: 'inOut' }], 's1Fill'),
    s1Outcome: numberTrack([{ at: 2.6, value: 0 }, { at: 3.15, value: 1, ease: 'out' }], 's1Outcome'),

    /* S2 — the same objects reverse, then two single-intent replays resolve. */
    s2Rewind: numberTrack([{ at: 4.0, value: 1 }, { at: 5.3, value: 0, ease: 'inOut' }], 's2Rewind'),
    // A hard cut between the reversed composition and the replay pair, not a
    // crossfade. The two framings answer different questions and a blend of
    // them is a frame showing a state the record does not contain — and, less
    // abstractly, the two boundary labels sit on one baseline, so a dissolve
    // renders both sentences on top of each other.
    s2WorldOut: stepTrack([{ at: 4.0, value: 1 }, { at: 5.55, value: 0 }], 's2WorldOut'),
    s2ReplayIn: stepTrack([{ at: 4.0, value: 0 }, { at: 5.55, value: 1 }], 's2ReplayIn'),
    s2Fill: numberTrack([{ at: 5.7, value: 0 }, { at: 7.1, value: 1, ease: 'inOut' }], 's2Fill'),
    s2Outcome: numberTrack([{ at: 7.2, value: 0 }, { at: 7.6, value: 1, ease: 'out' }], 's2Outcome'),

    /* S3 — the second intent holds position while the first completes. */
    s3FirstFill: numberTrack([{ at: 8.9, value: 0 }, { at: 10.2, value: 1, ease: 'inOut' }], 's3FirstFill'),
    s3SecondState: stepTrack(
      [{ at: 8.0, value: TS.WAITING }, { at: 10.45, value: TS.APPLIED }],
      's3SecondState',
    ),
    s3SecondFill: numberTrack([{ at: 10.45, value: 0 }, { at: 11.6, value: 1, ease: 'inOut' }], 's3SecondFill'),
    s3Verdict: numberTrack([{ at: 11.8, value: 0 }, { at: 12.3, value: 1, ease: 'out' }], 's3Verdict'),

    /* S4 — the gutter opens between two correct boundaries. Nothing crosses it. */
    s4Gutter: numberTrack([{ at: 13.5, value: 0 }, { at: 14.6, value: 1, ease: 'inOut' }], 's4Gutter'),
    s4Outcome: numberTrack([{ at: 15.3, value: 0 }, { at: 15.9, value: 1, ease: 'out' }], 's4Outcome'),

    /* S5 — the rule sets on the unframed field. No boundary grows to reach it. */
    s5Rule: numberTrack([{ at: 17.15, value: 0 }, { at: 18.3, value: 1, ease: 'out' }], 's5Rule'),

    /* S6/S7 — the coupling edge resolves once, inside the Interlock boundary. */
    edgeDraw: numberTrack([{ at: 19.9, value: 0 }, { at: 21.1, value: 1, ease: 'inOut' }], 'edgeDraw'),
    relationship: stepTrack([
      { at: 0, value: REL.UNOBSERVED },
      { at: 19.5, value: REL.PRESENT },
      { at: 25.5, value: REL.ABSENT },
    ], 'relationship'),

    /* S7 — the leader proceeds; the peer holds its outline and never fills. */
    s7Leader: numberTrack([{ at: 21.9, value: 0 }, { at: 23.0, value: 1, ease: 'inOut' }], 's7Leader'),
    s7Gauge: numberTrack([
      { at: 21.9, value: preTotal / b.scenes.S7.total },
      { at: 23.0, value: 1, ease: 'inOut' },
    ], 's7Gauge'),
    s7Outcome: numberTrack([{ at: 23.3, value: 0 }, { at: 23.9, value: 1, ease: 'out' }], 's7Outcome'),
    s7PeerState: stepTrack([{ at: 21.5, value: TS.WITHHELD }], 's7PeerState'),

    /* S8 — a hard re-entry under a different frozen evidence condition. */
    s8Fill: numberTrack([{ at: 26.15, value: 0 }, { at: 27.3, value: 1, ease: 'inOut' }], 's8Fill'),
    s8Outcome: numberTrack([{ at: 27.6, value: 0 }, { at: 28.2, value: 1, ease: 'out' }], 's8Outcome'),

    /* End card. */
    endIn: numberTrack([{ at: 29.0, value: 0 }, { at: 29.45, value: 1, ease: 'out' }], 'endIn'),
  };
}

/* -- shared plate furniture ----------------------------------------------- */

const controlChips = (rows, y) => {
  const widths = rows.map((r) => measure(asciify(r), 24, { mono: true, tracking: 2.2 }) + 32);
  let x = CONTENT.x0;
  return rows.map((r, i) => {
    const node = [
      rect(x, y - 30, widths[i], 42, { stroke: N[30], width: 1 }),
      label(x + 16, y, r, { fill: N[60], tracking: 2.2 }),
    ];
    x += widths[i] + 20;
    return node;
  });
};

/* -- scenes --------------------------------------------------------------- */

/**
 * Every scene is `(state, bindings) -> nodes`. `state` is the evaluated track
 * table; scenes never see `t`, which is what stops one from reaching for a
 * clock and reintroducing playback dependence through the back door.
 */
const RENDER = {
  S1: (s, b) => {
    const f = s.s1Fill;
    const total = b.targets.alpha.pre + b.targets.beta.pre + b.targets.gamma.pre;
    const shownTotal = total + (b.scenes.S1.total - total) * f;
    return [
      pathLegend(b.targets),
      boundary(FRAME, 'no coordination boundary drawn', { dash: '8 8' }),
      targetBar('alpha', {
        from: b.targets.alpha.pre, value: b.targets.alpha.intent, fill: f,
        state: TS.APPLIED, delta: `${b.targets.alpha.pre} -> ${b.targets.alpha.intent}`, note: 'applied',
      }),
      targetBar('beta', {
        from: b.targets.beta.pre, value: b.targets.beta.intent, fill: f,
        state: TS.APPLIED, delta: `${b.targets.beta.pre} -> ${b.targets.beta.intent}`, note: 'applied',
      }),
      targetBar('gamma', {
        from: b.targets.gamma.pre, value: b.targets.gamma.pre, fill: 1,
        state: TS.UNCHANGED, delta: 'unchanged', muted: true,
      }),
      gauge({ total: shownTotal, ceiling: b.invariant.ceiling, verifierNote: VERIFIER_NOTE }),
      outcome({
        kind: OUT.INVALID, value: b.scenes.S1.total, opacity: s.s1Outcome,
        caption: 'recorded joint total',
      }),
      sceneLine('Two applied changes. One invalid total.'),
    ];
  },

  S2: (s, b) => {
    const rewind = s.s2Rewind;
    const worldA = s.s2WorldOut;
    const replayA = s.s2ReplayIn;
    const total = b.targets.alpha.pre + b.targets.beta.pre + b.targets.gamma.pre;
    const nodes = [pathLegend(b.targets)];

    if (worldA > 0) {
      // The composition reversing along its own path. Same objects, same
      // geometry, run backwards — never a new entrance.
      const shownTotal = total + (b.scenes.S1.total - total) * rewind;
      nodes.push(
        boundary(FRAME, 'no coordination boundary drawn', { dash: '8 8', opacity: worldA }),
        ORDER.map((n) => targetBar(n, {
          from: b.targets[n].pre, value: b.targets[n].intent, fill: n === 'gamma' ? 1 : rewind,
          state: n === 'gamma' ? TS.UNCHANGED : TS.APPLIED,
          delta: n === 'gamma' ? 'unchanged' : `${b.targets[n].pre} -> ${b.targets[n].intent}`,
          muted: n === 'gamma',
        })),
        gauge({ total: shownTotal, ceiling: b.invariant.ceiling, verifierNote: VERIFIER_NOTE }),
      );
    }

    if (replayA > 0) {
      const raised = ['alpha', 'beta'];
      REPLAY.frames.forEach((frame, i) => {
        const one = raised[i];
        nodes.push(
          boundary({ x: frame.x, y: REPLAY.y, w: frame.w, h: REPLAY.h }, `replay - ${one} alone`, { opacity: replayA }),
          ORDER.map((n) => targetBar(n, {
            x: frame.cols[n], w: REPLAY.barW,
            from: b.targets[n].pre,
            value: n === one ? b.targets[n].intent : b.targets[n].pre,
            fill: n === one ? s.s2Fill : 1,
            state: n === one ? TS.APPLIED : TS.HELD,
            delta: n === one ? `${b.targets[n].pre} -> ${b.targets[n].intent}` : 'held',
            muted: n !== one,
          })),
        );
      });
      nodes.push(
        gauge({
          total: total + (b.scenes.S2.total - total) * s.s2Fill,
          ceiling: b.invariant.ceiling,
          verifierNote: 'each replay stays under the rule',
        }),
        outcome({
          kind: OUT.VALID, value: b.scenes.S2.total, opacity: s.s2Outcome,
          caption: 'either intent alone',
        }),
      );
    }

    nodes.push(sceneLine('Neither intent is individually invalid.'));
    return nodes;
  },

  S3: (s, b) => {
    const secondWaiting = s.s3SecondState === TS.WAITING;
    const box = CONTENTION;
    const blockOf = (pos, filled, tag, note) => [
      rect(pos.x, pos.y, box.blockW, box.blockH, filled
        ? { fill: INK }
        : { stroke: INK, width: 2, dash: '8 7' }),
      text(pos.x + 24, pos.y + 50, asciify(tag), { size: 28, mono: true, fill: filled ? PAPER : INK }),
      label(pos.x + box.blockW + 32, pos.y + 50, note, { fill: N[60], tracking: 1.6 }),
    ];
    return [
      pathLegend(b.targets),
      boundary(box.frame, 'per-target lock - observes one key - alpha'),
      blockOf(box.first, s.s3FirstFill >= 1, '1st', s.s3FirstFill >= 1 ? 'applied' : 'proceeding'),
      blockOf(box.second, s.s3SecondFill >= 1, '2nd', secondWaiting ? 'waiting - holds position' : 'applied in order'),
      label(CONTENT.x0, box.notes[0], 'two intents contend - serialized in order', { fill: N[60] }),
      label(CONTENT.x0, box.notes[1], 'no interleaving recorded - the lock never breaks', { fill: N[60] }),
      label(CONTENT.x0, box.notes[2], 'beta and gamma are not in this scene', { fill: N[50] }),
      // No total on this plate. The same-target scenario resolves to a figure
      // that answers a different question than the cross-target one, and two
      // numbers on one baseline invite the comparison the record does not make.
      outcome({ kind: OUT.NONE, opacity: s.s3Verdict }),
      s.s3Verdict > 0
        ? text(GAUGE.outcomeX, BASE_Y, asciify('serialized'), {
          size: 44, mono: true, fill: INK, opacity: s.s3Verdict,
        })
        : null,
      s.s3Verdict > 0
        ? noteBlock(GAUGE.outcomeX, BASE_Y + 44, 'same-target contention coordinated correctly', { opacity: s.s3Verdict })
        : null,
      sceneLine('The lock is correct about the key it holds.'),
    ];
  },

  S4: (s, b) => {
    // Padded outward, not inward: alpha and beta stay on their canonical
    // columns, so the space the two boundaries leave between them is the real
    // distance between the two targets rather than a gap the layout invented.
    const pad = { out: 100, in: 8 };
    const boxA = { x: COLUMNS.alpha - pad.out, y: FRAME.y, w: BAR_W + pad.out + pad.in, h: FRAME.h };
    const boxB = { x: COLUMNS.beta - pad.in, y: FRAME.y, w: BAR_W + pad.out + pad.in, h: FRAME.h };
    const void_ = { x0: boxA.x + boxA.w + 8, x1: boxB.x - 8 };
    return [
      pathLegend(b.targets),
      // One shared statement of what the discipline is, then a scope name per
      // boundary. Two full labels do not fit side by side at the type floor,
      // and the pair of them abbreviated to fit would say less than this does.
      label(CONTENT.x0, FRAME.y - 56, 'per-target lock - each boundary observes one key', { fill: N[60] }),
      boundary(boxA, 'lock - alpha', { labelY: FRAME.y - 20 }),
      boundary(boxB, 'lock - beta', { labelY: FRAME.y - 20 }),
      gutter(s.s4Gutter, void_),
      targetBar('alpha', {
        from: b.targets.alpha.intent, value: b.targets.alpha.intent, fill: 1,
        state: TS.APPLIED, delta: `${b.targets.alpha.pre} -> ${b.targets.alpha.intent}`, note: 'applied',
      }),
      targetBar('beta', {
        from: b.targets.beta.intent, value: b.targets.beta.intent, fill: 1,
        state: TS.APPLIED, delta: `${b.targets.beta.pre} -> ${b.targets.beta.intent}`, note: 'applied',
      }),
      label(CONTENT.x0, NOTES[0], 'both boundaries correct - no key represents the pair - gamma unchanged at 20', { fill: N[60] }),
      gauge({ total: b.scenes.S4.total, ceiling: b.invariant.ceiling, verifierNote: 'the total belongs to neither key' }),
      outcome({ kind: OUT.INVALID, value: b.scenes.S4.total, opacity: s.s4Outcome, caption: 'recorded joint total' }),
      sceneLine('Different keys. Both locks correct. The total belongs to neither key.'),
    ];
  },

  S5: (s, b) => [
    pathLegend(b.targets),
    boundary(FRAME, 'coordination decision - observes target keys only'),
    ORDER.map((n) => targetBar(n, {
      from: b.targets[n].intent, value: b.targets[n].intent, fill: 1,
      state: n === 'gamma' ? TS.UNCHANGED : TS.APPLIED,
      delta: n === 'gamma' ? 'unchanged' : `${b.targets[n].pre} -> ${b.targets[n].intent}`,
      muted: n === 'gamma',
    })),
    // The rule is already on the field; S5 raises the caption that says whose
    // it is. The boundary above is the same rectangle S4 and S6 draw, and it
    // does not move — nothing grows to include the ceiling.
    gauge({
      total: b.scenes.S4.total, ceiling: b.invariant.ceiling,
      ruleOpacity: 0.35 + 0.65 * s.s5Rule,
      verifierNote: ['not available to the coordination decision', VERIFIER_NOTE],
    }),
    outcome({ kind: OUT.INVALID, value: b.scenes.S4.total, opacity: 1, caption: 'recorded joint total' }),
    sceneLine('The ceiling is real. The deciding mechanism does not receive it.'),
  ],

  S6: (s, b) => [
    pathLegend(b.targets),
    boundary(FRAME, 'interlock - observes target keys + extracted transitions'),
    couplingEdge(s.relationship, s.edgeDraw, { label: 'alpha <-> beta - changes together' }),
    // Declared, not decided. The record at this point in the run carries no
    // verdict, so the plate must not draw the applied treatment: at two seconds
    // with the eye on the edge drawing, a filled bar at the intent height reads
    // as "both of these have executed", which is the scene's own must-not-imply.
    ORDER.map((n) => targetBar(n, {
      from: b.targets[n].intent, value: b.targets[n].intent, fill: 1,
      state: n === 'gamma' ? TS.UNCHANGED : TS.PENDING,
      delta: n === 'gamma' ? 'unchanged' : `${b.targets[n].pre} -> ${b.targets[n].intent}`,
      note: n === 'gamma' ? null : 'pending',
      muted: n === 'gamma',
    })),
    label(CONTENT.x0, NOTES[0], 'says nothing about the arithmetic - the ceiling is still outside the boundary', { fill: N[60] }),
    gauge({ total: 0, ceiling: b.invariant.ceiling, verifierNote: VERIFIER_NOTE }),
    outcome({ kind: OUT.NONE }),
    text(GAUGE.outcomeX, BASE_Y, asciify('no decision'), { size: 44, mono: true, fill: N[50] }),
    noteBlock(GAUGE.outcomeX, BASE_Y + 44, 'evidence read - coordination not yet decided'),
    sceneLine('Repository-derived evidence that the two targets move together.'),
  ],

  S7: (s, b) => {
    const total = b.targets.alpha.pre + b.targets.beta.pre + b.targets.gamma.pre;
    return [
      pathLegend(b.targets),
      boundary(FRAME, 'interlock - observes target keys + extracted transitions'),
      couplingEdge(s.relationship, 1, { label: 'qualifying relationship' }),
      targetBar('alpha', {
        from: b.targets.alpha.pre, value: b.targets.alpha.intent, fill: s.s7Leader,
        state: TS.APPLIED, delta: `${b.targets.alpha.pre} -> ${b.targets.alpha.intent}`, note: 'applied',
      }),
      targetBar('beta', {
        from: b.targets.beta.pre, value: b.targets.beta.intent, fill: 0,
        state: s.s7PeerState, delta: `${b.targets.beta.pre} - unchanged`, note: 'not applied',
      }),
      targetBar('gamma', {
        from: b.targets.gamma.pre, value: b.targets.gamma.pre, fill: 1,
        state: TS.UNCHANGED, delta: 'unchanged', muted: true,
      }),
      // The recorded decisions get their own band rather than a caption row.
      // Side by side under their columns the two tokens overlap at the type
      // floor, and abbreviating a decision to make it fit would be editing the
      // record to suit a layout.
      label(CONTENT.x0, NOTES[0], `alpha  ${b.scenes.S7.leader.decision}  -  applied`, { fill: INK }),
      label(CONTENT.x0, NOTES[1], `beta   ${b.scenes.S7.peer.decision}  -  not applied in this recorded run`, { fill: INK }),
      gauge({
        total: total + (b.scenes.S7.total - total) * s.s7Gauge,
        ceiling: b.invariant.ceiling,
        verifierNote: 'the ceiling is still not a decision input',
      }),
      outcome({
        kind: OUT.VALID, value: b.scenes.S7.total, opacity: s.s7Outcome,
        caption: 'recorded resulting total',
      }),
      sceneLine('One intent proceeds. The peer is withheld and not applied.'),
    ];
  },

  S8: (s, b) => {
    const f = s.s8Fill;
    const total = b.targets.alpha.pre + b.targets.beta.pre + b.targets.gamma.pre;
    return [
      pathLegend(b.targets),
      // The identical boundary S7 drew. Same policy, same rectangle, same label
      // stem: the only thing this scene changes is the history it reads.
      boundary(FRAME, 'interlock - same boundary - same policy'),
      couplingEdge(s.relationship, 0),
      ORDER.map((n) => targetBar(n, {
        from: b.targets[n].pre, value: b.targets[n].intent,
        fill: n === 'gamma' ? 1 : f,
        state: n === 'gamma' ? TS.UNCHANGED : TS.APPLIED,
        delta: n === 'gamma' ? 'unchanged' : `${b.targets[n].pre} -> ${b.targets[n].intent}`,
        note: n === 'gamma' ? null : 'applied',
        muted: n === 'gamma',
      })),
      controlChips(
        ['same intents', 'same final tree', 'same commit count', 'history perturbed'],
        NOTES[0],
      ),
      gauge({
        total: total + (b.scenes.S8.total - total) * f,
        ceiling: b.invariant.ceiling,
        verifierNote: 'the hazard was never removed',
      }),
      outcome({ kind: OUT.INVALID, value: b.scenes.S8.total, opacity: s.s8Outcome, caption: 'recorded joint total' }),
      sceneLine('Same geometry. The qualifying relationship is not there, and the decision reverses.'),
    ];
  },

  END: (s) => [
    text(W / 2, 520, 'INTERLOCK', {
      size: 96, weight: 600, fill: PAPER, anchor: 'middle', tracking: 14, opacity: s.endIn,
    }),
    line(W / 2 - 220, 566, W / 2 + 220, 566, { stroke: N[70], width: 1, opacity: s.endIn }),
    text(W / 2, 626, asciify('Controlled coordination for safe, reliable AI-assisted change.'), {
      size: 32, fill: N[30], anchor: 'middle', opacity: s.endIn,
    }),
  ],
};

/* -- evaluation ----------------------------------------------------------- */

/**
 * The one entry point. Everything — playback, scrub, still, export frame —
 * comes through here.
 *
 * @param {number} t seconds from the head of the cut
 * @param {object} bindings `evidence/bindings.json`
 * @param {{reduced?:boolean}} [opts]
 */
export function plateAt(t, bindings, opts = {}) {
  const tracks = opts.reduced ? settle(buildTracks(bindings)) : buildTracks(bindings);
  const scene = seq.sceneAt(t);
  const state = frameAt(tracks, t);
  return {
    scene,
    t,
    state,
    background: scene.id === 'END' ? INK : PAPER,
    nodes: flat([RENDER[scene.id](state, bindings)]),
  };
}

/** The semantic state a scene asserts at `t`, with no presentation in it. */
export function semanticsAt(t, bindings, opts = {}) {
  const tracks = opts.reduced ? settle(buildTracks(bindings)) : buildTracks(bindings);
  const s = frameAt(tracks, t);
  const scene = seq.sceneAt(t);
  // Target treatments are read back off the rendered plate rather than
  // re-declared here. A second table of what each scene "means" would be a
  // second source of truth, and the first thing it would do is drift from the
  // one that draws — which is exactly how S6 came to say three different things.
  const nodes = plateAt(t, bindings, opts).nodes;
  const treatment = (name) => {
    const bar = nodes.find((n) => n.t === 'rect' && n.x === COLUMNS[name] && n.w === BAR_W);
    if (!bar) return null;
    if (bar.fill) return bar.fill === INK ? 'APPLIED_OR_PENDING_FILLED' : 'MUTED';
    return bar.dash ? 'OPEN_BROKEN' : 'OPEN_CONTINUOUS';
  };

  return {
    scene: scene.id,
    relationship: s.relationship,
    secondIntent: scene.id === 'S3' ? s.s3SecondState : null,
    peer: scene.id === 'S7' ? s.s7PeerState : null,
    treatment: { alpha: treatment('alpha'), beta: treatment('beta'), gamma: treatment('gamma') },
    lockScopes: {
      S3: ['alpha'],
      S4: ['alpha', 'beta'],
    }[scene.id] ?? [],
  };
}
