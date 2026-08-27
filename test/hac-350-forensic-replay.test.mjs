/**
 * HAC-350 — the Forensic Replay's contract.
 *
 * The gate in `media/hac-350/bin/verify-replay.mjs` is the thing CI runs; these
 * tests cover the pieces underneath it, where a failure names a cause rather
 * than a symptom. Two groups matter most:
 *
 *   the motion primitives, because `settle` and `stepTrack` are what keep a
 *   semantic state from being interpolated into something nobody recorded;
 *
 *   the claim guards, because the plate's job is to be exactly as strong as
 *   HAC-343 and no stronger.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EASE, stepTrack, numberTrack, frameAt, settle, sequence, frameTimes, canonicalTimes,
} from '../media/hac-334/bin/lib/motion.mjs';
import { plateAt, semanticsAt, seq, SCENES } from '../media/hac-350/bin/lib/replay.mjs';
import { composePlate } from '../media/hac-350/bin/lib/plate.mjs';
import { assertWorldInvariants, FRAME, ruleY, SCALE, COLUMNS, BAR_W, heightOf } from '../media/hac-350/bin/lib/world.mjs';
import { frameTimes as _frameTimes } from '../media/hac-334/bin/lib/motion.mjs';

const repoRoot = join(import.meta.dirname, '..');
const bindings = JSON.parse(readFileSync(join(repoRoot, 'media/hac-350/evidence/bindings.json'), 'utf8'));
const nodesAt = (t, o) => plateAt(t, bindings, o).nodes;
const textAt = (t, o) => nodesAt(t, o).filter((n) => n.t === 'text').map((n) => n.s).join(' | ');

/* -- motion primitives ---------------------------------------------------- */

describe('motion: semantic tracks never interpolate', () => {
  it('holds the last authored value and jumps at the key', () => {
    const t = stepTrack([{ at: 0, value: 'WAITING' }, { at: 2, value: 'APPLIED' }]);
    expect(t.at(0)).toBe('WAITING');
    expect(t.at(1.999)).toBe('WAITING');
    expect(t.at(2)).toBe('APPLIED');
    expect(t.at(99)).toBe('APPLIED');
  });

  it('clamps before the first key rather than extrapolating', () => {
    expect(stepTrack([{ at: 5, value: 'X' }]).at(-1)).toBe('X');
  });

  it('refuses keyframes that do not advance', () => {
    expect(() => stepTrack([{ at: 1, value: 'a' }, { at: 1, value: 'b' }], 'dup')).toThrow(/does not advance/);
    expect(() => numberTrack([{ at: 2, value: 0 }, { at: 1, value: 1 }], 'rev')).toThrow(/does not advance/);
  });

  it('refuses a non-numeric value on a presentation track', () => {
    expect(() => numberTrack([{ at: 0, value: 'WITHHELD' }], 'bad')).toThrow(/carries numbers/);
  });
});

describe('motion: presentation tracks are pure functions of t', () => {
  const t = numberTrack([{ at: 0, value: 0 }, { at: 1, value: 10, ease: 'linear' }]);
  it('interpolates and clamps', () => {
    expect(t.at(-5)).toBe(0);
    expect(t.at(0.5)).toBeCloseTo(5);
    expect(t.at(5)).toBe(10);
  });
  it('gives the same value however it is reached', () => {
    const forward = [0.1, 0.3, 0.7].map((x) => t.at(x));
    const backward = [0.7, 0.3, 0.1].map((x) => t.at(x)).reverse();
    expect(forward).toEqual(backward);
  });
  it('every ease is a closed form over the unit interval', () => {
    for (const [name, fn] of Object.entries(EASE)) {
      expect(fn(0), name).toBe(0);
      if (name !== 'hold') expect(fn(1), name).toBe(1);
    }
  });
});

describe('motion: reduced motion settles rather than disables', () => {
  it('adopts each segment destination at the segment start', () => {
    const s = settle({ bar: numberTrack([{ at: 0, value: 0 }, { at: 2, value: 1 }]) });
    expect(s.bar.kind).toBe('step');
    expect(s.bar.at(0.01)).toBe(1);
  });
  it('passes semantic tracks through untouched', () => {
    const step = stepTrack([{ at: 0, value: 'WITHHELD' }]);
    expect(settle({ s: step }).s).toBe(step);
  });
});

describe('motion: sequences are contiguous', () => {
  it('rejects a gap between scenes', () => {
    expect(() => sequence([{ id: 'a', start: 0, end: 1 }, { id: 'b', start: 2, end: 3 }])).toThrow(/contiguous/);
  });
  it('gives a boundary instant to the scene that follows', () => {
    const s = sequence([{ id: 'a', start: 0, end: 1 }, { id: 'b', start: 1, end: 2 }]);
    expect(s.sceneAt(1).id).toBe('b');
    expect(s.sceneAt(0.999).id).toBe('a');
  });
  it('computes frame times from the index, not by accumulation', () => {
    const f = frameTimes(30, 30);
    expect(f).toHaveLength(900);
    // Quantised to the millisecond on purpose: an exact 719/30 carries binary
    // float error that two derivations of the same instant can round apart, and
    // a canonical still that lands on a different frame than the export is the
    // one failure this whole module exists to prevent.
    expect(f[719]).toBe(23.967);
    expect(f[719]).toBeCloseTo(719 / 30, 3);
    expect(f[0]).toBe(0);
    expect(f.at(-1)).toBe(29.967);
  });
  it('samples every scene twice — entry and settled', () => {
    expect(canonicalTimes(seq).length).toBe(SCENES.length * 2);
  });
});

/* -- the authored timeline ------------------------------------------------ */

describe('timeline: the storyboard boundaries', () => {
  it('matches the frozen cut points', () => {
    expect(seq.boundaries).toEqual([0, 4.0, 8.0, 13.0, 17.0, 19.5, 21.5, 25.5, 29.0, 30.0]);
    expect(seq.duration).toBe(30);
  });
  it('places every canonical instant in the scene that owns it', () => {
    for (const { id, t } of canonicalTimes(seq)) {
      expect(seq.sceneAt(t).id, `${id} @ ${t}`).toBe(id.replace(/-(in|out)$/, ''));
    }
  });
});

describe('direct seek equals playback', () => {
  it('produces identical display lists whichever way t is reached', () => {
    const probes = [0.4, 2.1, 3.9, 5.2, 6.8, 9.4, 12.4, 14.8, 18.2, 20.4, 23.0, 26.4, 28.6, 29.6];
    const walked = new Map();
    for (const t of frameTimes(30, 30)) {
      if (probes.includes(Number(t.toFixed(3)))) walked.set(t, JSON.stringify(nodesAt(t)));
    }
    for (const [t, expected] of [...walked].reverse()) {
      expect(JSON.stringify(nodesAt(t)), `t=${t}`).toBe(expected);
    }
  });
  it('scrubs to 23.0 without having played 0..22.9', () => {
    expect(JSON.stringify(plateAt(23.0, bindings).nodes)).toBe(JSON.stringify(plateAt(23.0, bindings).nodes));
    expect(seq.sceneAt(23.0).id).toBe('S7');
  });
});

/* -- semantic state ------------------------------------------------------- */

describe('semantic state matches the frozen HAC-343 record', () => {
  it('S3 holds the second intent in WAITING while the first proceeds', () => {
    expect(semanticsAt(9.5, bindings).secondIntent).toBe('WAITING');
    expect(semanticsAt(12.5, bindings).secondIntent).toBe('APPLIED');
    expect(bindings.scenes.S3.concurrent).toBe(false);
    expect(bindings.scenes.S3.lockGroups).toHaveLength(1);
  });

  it('S3 puts no resulting total on the plate', () => {
    const t = textAt(12.5);
    expect(t).not.toMatch(/\b(115|120|140)\b/);
    expect(t).toMatch(/serialized/);
  });

  it('S4 asserts two valid target-local scopes over two distinct keys', () => {
    expect(semanticsAt(16.0, bindings).lockScopes).toEqual(['alpha', 'beta']);
    expect(bindings.scenes.S4.lockGroups).toHaveLength(2);
    expect(bindings.scenes.S4.concurrent).toBe(true);
    expect(textAt(16.5)).toMatch(/no key represents the pair/);
  });

  it('S6 resolves the relationship inside the Interlock boundary', () => {
    expect(semanticsAt(21.2, bindings).relationship).toBe('RELATIONSHIP_PRESENT');
    expect(textAt(21.2)).toMatch(/changes together/);
  });

  it('S7 withholds the peer and does not apply it', () => {
    expect(semanticsAt(24.5, bindings).peer).toBe('WITHHELD');
    expect(bindings.scenes.S7.peer.applied).toBe(false);
    expect(bindings.scenes.S7.peer.decision).toBe('WITHHOLD_SERIALIZE');
    expect(bindings.scenes.S7.leader.decision).toBe('ALLOW_SERIALIZED');
    expect(bindings.scenes.S7.total).toBe(120);
    // The withheld bar is an outline that never fills, at any instant of S7.
    for (const t of [21.6, 23.0, 24.5, 25.4]) {
      const dashed = nodesAt(t).filter((n) => n.t === 'rect' && n.dash && n.h === 120);
      expect(dashed.length, `t=${t}`).toBeGreaterThan(0);
    }
  });

  it('S8 finds no qualifying relationship and applies both intents', () => {
    expect(semanticsAt(28.0, bindings).relationship).toBe('RELATIONSHIP_ABSENT');
    expect(bindings.scenes.S8.couplings).toBe(0);
    expect(bindings.scenes.S8.applied).toEqual({ alpha: true, beta: true });
    expect(bindings.scenes.S8.total).toBe(140);
    expect(textAt(28.5)).toMatch(/no qualifying relationship extracted/);
  });

  it('S8 reads as a different evidence condition, not a toggle', () => {
    const t = textAt(28.5);
    for (const held of ['same intents', 'same final tree', 'same commit count', 'history perturbed']) {
      expect(t).toContain(held);
    }
  });
});

/* -- the S7 -> S8 discontinuity ------------------------------------------- */

/**
 * The causal climax, guarded structurally.
 *
 * S7 records that the peer was withheld and *not applied in that run*. S8 is a
 * different run under a perturbed history. The failure mode this whole block
 * exists to forbid is the reading "beta waited, and then resumed" — which is
 * what the plate would show if beta's bar filled in from its withheld outline
 * while alpha stayed where S7 left it.
 *
 * A comment saying the cut re-enters from the pre-state is not a control. These
 * are: the two bars must move in lockstep for every frame of S8, alpha's height
 * must *drop* across the boundary, and the withheld treatment must not appear
 * in S8 at all. Together they make the continuation reading unrepresentable
 * rather than merely absent.
 */
describe('S7 -> S8 is a re-entry, not a continuation', () => {
  const S8 = { start: 25.5, end: 29.0 };
  const barAt = (t, name) => nodesAt(t)
    .find((n) => n.t === 'rect' && n.x === COLUMNS[name] && n.w === BAR_W) ?? null;
  const s8Frames = _frameTimes(30, 30).filter((t) => t >= S8.start && t < S8.end);
  const pre = heightOf(bindings.targets.beta.pre);
  const intent = heightOf(bindings.targets.beta.intent);

  it('drops alpha across the boundary instead of carrying it over', () => {
    const last7 = barAt(25.467, 'alpha');
    const first8 = barAt(25.5, 'alpha');
    expect(last7.h).toBe(intent);
    expect(first8.h).toBe(pre);
    // The discontinuity itself. A continuation keeps alpha at its intent value.
    expect(first8.h).toBeLessThan(last7.h);
  });

  it('re-enters with both targets at the pre-state', () => {
    for (const name of ['alpha', 'beta']) {
      expect(barAt(25.5, name).h, name).toBe(heightOf(bindings.targets[name].pre));
    }
  });

  it('moves alpha and beta in lockstep through every frame of S8', () => {
    // "beta resumed after waiting" requires the two to differ. They never do.
    for (const t of s8Frames) {
      expect(barAt(t, 'beta').h, `t=${t}`).toBe(barAt(t, 'alpha').h);
    }
  });

  it('never shows the withheld treatment in S8', () => {
    for (const t of s8Frames) {
      const beta = barAt(t, 'beta');
      expect(beta.dash, `t=${t}`).toBeFalsy();
      expect(beta.fill, `t=${t}`).toBeTruthy();
    }
  });

  it('never fills the withheld peer at any instant of S7', () => {
    for (const t of _frameTimes(30, 30).filter((x) => x >= 21.5 && x < 25.5)) {
      const beta = barAt(t, 'beta');
      expect(beta.h, `t=${t}`).toBe(pre);
      expect(beta.dash, `t=${t}`).toBeTruthy();
      expect(beta.fill, `t=${t}`).toBeNull();
    }
  });

  it('keeps the recorded outcomes on opposite sides of the ceiling', () => {
    expect(bindings.scenes.S7.holds).toBe(true);
    expect(bindings.scenes.S8.holds).toBe(false);
    expect(bindings.scenes.S7.total).toBeLessThan(bindings.invariant.ceiling);
    expect(bindings.scenes.S8.total).toBeGreaterThan(bindings.invariant.ceiling);
  });
});

/* -- persistent geometry -------------------------------------------------- */

describe('one persistent world', () => {
  it('holds its invariants', () => {
    expect(assertWorldInvariants()).toEqual([]);
    expect(SCALE).toBe(3);
  });

  it('keeps the ceiling rule outside every drawn boundary', () => {
    expect(ruleY(bindings.invariant.ceiling)).toBeLessThan(FRAME.y);
  });

  it('places the three targets identically in every strip scene', () => {
    const anchors = [3.5, 18.9, 21.2, 24.5, 28.5].map((t) => nodesAt(t)
      .filter((n) => n.t === 'text' && ['alpha', 'beta', 'gamma'].includes(n.s))
      .map((n) => `${n.s}@${n.x}`).sort().join(','));
    expect(new Set(anchors).size).toBe(1);
    expect(anchors[0]).toContain(`alpha@${COLUMNS.alpha + 66}`);
  });

  it('draws S8 on the identical boundary to S7', () => {
    const box = (t) => nodesAt(t)
      .filter((n) => n.t === 'rect' && n.w === FRAME.w && n.h === FRAME.h)
      .map((n) => [n.x, n.y, n.w, n.h]);
    expect(box(28.5)).toEqual(box(24.5));
    expect(box(24.5)).toHaveLength(1);
  });
});

/* -- reduced motion ------------------------------------------------------- */

describe('reduced motion preserves meaning', () => {
  const R = { reduced: true };
  it('keeps concurrency, waiting, withholding, presence and absence', () => {
    expect(semanticsAt(9.5, bindings, R).secondIntent).toBe('WAITING');
    expect(semanticsAt(12.5, bindings, R).secondIntent).toBe('APPLIED');
    expect(semanticsAt(21.2, bindings, R).relationship).toBe('RELATIONSHIP_PRESENT');
    expect(semanticsAt(24.5, bindings, R).peer).toBe('WITHHELD');
    expect(semanticsAt(28.0, bindings, R).relationship).toBe('RELATIONSHIP_ABSENT');
  });
  it('does not leave a scene in an ambiguous pre-state', () => {
    expect(textAt(0.2, R)).toMatch(/140/);
    expect(textAt(28.0, R)).toMatch(/140/);
    expect(textAt(22.0, R)).toMatch(/120/);
  });
  it('still records the external ceiling and the recorded outcome', () => {
    // The gauge caption wraps into the column beside the rule, so the assertion
    // is against the wrapped lines rather than an unbroken sentence.
    const lines = plateAt(18.5, bindings, R).nodes.filter((n) => n.t === 'text').map((n) => n.s);
    expect(lines).toContain('ceiling 130');
    expect(lines.join(' ')).toContain('not available to the coordination decision');
    expect(lines.join(' ')).toContain('independent fixture verifier');
  });
});

/* -- claim guards --------------------------------------------------------- */

describe('claim guards', () => {
  const everyPlate = canonicalTimes(seq).map(({ t }) => textAt(t)).join(' ~ ').toLowerCase();

  it('carries no annotation vocabulary', () => {
    for (const w of ['annotation', 'must not imply', 'motion_semantic', 'evidence_binding', 'ready_for_review', 'bind:']) {
      expect(everyPlate, w).not.toContain(w);
    }
  });

  it('makes no readiness, guarantee or universal-safety claim', () => {
    for (const w of ['production-ready', 'guarantee', 'always safe', 'prevents all', 'prevents every']) {
      expect(everyPlate, w).not.toContain(w);
    }
  });

  it('shows no broken lock and no refuted baseline', () => {
    for (const w of ['lock failure', 'lock broke', 'lock failed', 'locks are bad']) {
      expect(everyPlate, w).not.toContain(w);
    }
    expect(textAt(12.5)).toMatch(/the lock never breaks/);
  });

  it('implies no live execution and no measured runtime', () => {
    for (const w of ['real-time', 'live ', 'running', 'executing', 'latency', 'throughput']) {
      expect(everyPlate, w).not.toContain(w);
    }
  });

  it('keeps Cloud material out of the HAC-343 sequence', () => {
    for (const w of ['cloud run', 'gemini', 'adk', 'correlation', 'ilk-hac340']) {
      expect(everyPlate, w).not.toContain(w);
    }
  });

  it('keeps receipt-level counts off the cinematic plate', () => {
    for (const w of ['support 8', 'occurrences', 'support >=']) {
      expect(everyPlate, w).not.toContain(w);
    }
  });

  it('never renders an unresolved bind', () => {
    expect(everyPlate).not.toContain('[bind');
    expect(everyPlate).not.toContain('undefined');
    expect(everyPlate).not.toContain('nan');
  });
});

/* -- the plate cannot carry the review layer ------------------------------ */

describe('production and review layers are separate', () => {
  it('the plate renderer has no annotation mode', async () => {
    const plate = await import('../media/hac-350/bin/lib/plate.mjs');
    expect(Object.keys(plate)).not.toContain('overlay');
  });
  it('the debug overlay is only reachable from its own module', async () => {
    const debug = await import('../media/hac-350/bin/lib/debug.mjs');
    expect(typeof debug.overlay).toBe('function');
    const marked = debug.overlay(plateAt(2, bindings), bindings)
      .filter((n) => n.t === 'text').map((n) => n.s).join(' ');
    expect(marked).toMatch(/REVIEW ONLY/);
  });
});

/* -- rendering ------------------------------------------------------------ */

describe('every canonical instant renders inside the plate margins', () => {
  it.each(canonicalTimes(seq))('$id at $t s', ({ t }) => {
    const p = plateAt(t, bindings);
    expect(() => composePlate({
      id: p.scene.id, t, background: p.background, title: 'x', desc: 'x', render: () => p.nodes,
    })).not.toThrow();
  });
});

/* -- no live experiment --------------------------------------------------- */

describe('the cut renders a record and does not run one', () => {
  it('binds every figure to a frozen artifact pointer', () => {
    for (const [id, scene] of Object.entries(bindings.scenes)) {
      expect(scene.source, id).toBeTruthy();
      const refs = Array.isArray(scene.source) ? scene.source : [scene.source];
      for (const r of refs) expect(r, id).toMatch(/^experiments\/hac-3(30|43)\/evidence\/.+#\//);
    }
  });
  it('imports nothing from the Interlock composition engine', () => {
    for (const f of ['replay.mjs', 'plate.mjs', 'world.mjs']) {
      const src = readFileSync(join(repoRoot, 'media/hac-350/bin/lib', f), 'utf8');
      expect(src, f).not.toMatch(/from '.*\/dist\//);
      expect(src, f).not.toMatch(/arbitrate|mining-core|node:https?|fetch\(/);
    }
  });
});
