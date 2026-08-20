/**
 * Proves the guided inspection layer over the HAC-341 cockpit.
 *
 * Two halves, for two different failure modes.
 *
 * The first half exercises the derivations directly. The walk's load-bearing
 * claim — that the ablation held four things constant and changed four others —
 * is not a sentence in a template; it is a comparison of two frozen arms, and
 * these tests hold it to that.
 *
 * The second half proves the gate *bites*. A gate that has never been seen to
 * fail is a gate nobody can trust, so each invariant added in this pass is
 * broken deliberately in a scratch copy of the repository and the gate is
 * required to notice.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUIDE_STEPS, GUIDE_STATES, GUIDE_CHOICE_STATE, GUIDE_FREE_STATE,
  guideRoute, guideView, ablationDelta, stepOfState, stateOfStep,
} from '../media/hac-341/lib/guide.mjs';
import { buildComparison, DIMENSIONS, STRATEGY_ARMS } from '../media/hac-341/lib/comparison.mjs';
import { armView } from '../media/hac-341/lib/arm-view.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => JSON.parse(readFileSync(join(repoRoot, ...p), 'utf8'));
const model = read('media', 'hac-341', 'evidence', 'view-model.json');
const local = model.runs.local;
const cockpit = readFileSync(join(repoRoot, 'media', 'hac-341', 'cockpit.html'), 'utf8');

const HAC343 = [
  'experiments/hac-343/evidence/results.json',
  'experiments/hac-343/evidence/execution-semantics.json',
  'experiments/hac-343/evidence/metric-definitions.json',
  'experiments/hac-343/evidence/judge-export.json',
];
const frozen343 = Object.fromEntries(HAC343.map((rel) => [rel, read(...rel.split('/'))]));

/* ── the walk itself ───────────────────────────────────────────────────── */

describe('mode is explicit, and the entry preselects nothing', () => {
  it('an address with no guided state resolves to the choice', () => {
    expect(guideRoute(null)).toEqual({ mode: 'choice', step: null });
    expect(guideRoute('')).toEqual({ mode: 'choice', step: null });
    expect(guideRoute(GUIDE_CHOICE_STATE)).toEqual({ mode: 'choice', step: null });
  });

  it('renders both paths with neither marked as chosen', () => {
    const choice = /const choiceHtml[\s\S]*?`;\n/.exec(cockpit)[0];
    expect(choice).toContain('Walk the proof');
    expect(choice).toContain('Explore freely');
    expect(choice).not.toMatch(/aria-pressed="true"|aria-current="(step|true|page)"|autofocus/);
  });

  it('free inspection is a declared address, not the absence of one', () => {
    expect(guideRoute(GUIDE_FREE_STATE)).toEqual({ mode: 'free', step: null });
    expect(model.guide.states).toContain(GUIDE_FREE_STATE);
  });

  it('refuses a guided address it does not declare', () => {
    expect(guideRoute('guide.local.nope')).toBeNull();
    expect(guideRoute('run.local.treatment')).toBeNull();
    expect(guideRoute('guide.cloud.overview')).toBeNull();
  });
});

describe('the walk starts at one and moves under the reader', () => {
  it('starts at step one', () => {
    expect(stateOfStep(1)).toBe('guide.local.validity');
    expect(guideView(local, { mode: 'guided', step: 1 }).step).toBe(1);
    expect(guideView(local, { mode: 'guided', step: 1 }).isFirst).toBe(true);
  });

  it('walks all six beats in the approved order', () => {
    expect(GUIDE_STEPS.map((s) => s.stateId)).toEqual([
      'guide.local.validity',
      'guide.local.shared-environment',
      'guide.local.evidence-decision',
      'guide.local.outcome',
      'guide.local.ablation',
      'guide.local.handoff',
    ]);
    for (const [i, step] of GUIDE_STEPS.entries()) expect(stepOfState(step.stateId)).toBe(i + 1);
  });

  it('clamps rather than wrapping, so Back at one and Next at six do nothing', () => {
    expect(stateOfStep(0)).toBe(GUIDE_STEPS[0].stateId);
    expect(stateOfStep(99)).toBe(GUIDE_STEPS.at(-1).stateId);
    expect(guideView(local, { mode: 'guided', step: 6 }).isLast).toBe(true);
  });

  it('emphasises the step it is about without hiding anything else', () => {
    const g = guideView(local, { mode: 'guided', step: 1 });
    expect(g.emphasis.intents).toBe(1);
    expect(g.emphasis.outcome).toBeGreaterThan(0);
    expect(g.emphasis.outcome).toBeLessThan(1);
    for (const value of Object.values(g.emphasis)) expect(value).toBeGreaterThan(0);
  });

  it('leaves every region at full emphasis outside guided mode', () => {
    for (const mode of ['choice', 'free']) {
      const g = guideView(local, { mode });
      expect(Object.values(g.emphasis)).toEqual([1, 1, 1, 1, 1]);
      expect(g.showMarkers).toBe(false);
    }
  });
});

describe('the ablation reports what the frozen arms actually did', () => {
  const delta = ablationDelta(local);

  it('holds the intents, the environment and the bound constant', () => {
    expect(delta.held.map((r) => r.id)).toEqual(['intent.a', 'intent.b', 'environment', 'bound']);
    for (const row of delta.held) expect(row.differs).toBe(false);
  });

  it('changes the evidence basis, finding, decision and outcome', () => {
    expect(delta.changed.map((r) => r.id))
      .toEqual(['evidence.basis', 'evidence.finding', 'decision', 'outcome']);
    for (const row of delta.changed) expect(row.differs).toBe(true);
  });

  it('is truthful about every marker it would draw', () => {
    expect(delta.truthful).toBe(true);
  });

  it('reports a held marker as untruthful when the record stops supporting it', () => {
    // The bound is the marker a reader trusts most, so it is the one worth
    // proving cannot be asserted past the evidence. It is read off each arm's
    // own recorded outcome, so an arm judged against a different bound stops
    // being reported as held.
    const drifted = structuredClone(local);
    drifted.arms.find((a) => a.armId === 'perturbed').outcome.bound = 131;
    const d0 = ablationDelta(drifted);
    expect(d0.truthful).toBe(false);
    expect(d0.held.find((r) => r.id === 'bound').differs).toBe(true);

    // An arm whose evidence stopped moving must stop being reported as changed.
    const unperturbed = structuredClone(local);
    const perturbedArm = unperturbed.arms.find((a) => a.armId === 'perturbed');
    perturbedArm.basisRevision = unperturbed.arms.find((a) => a.armId === 'treatment').basisRevision;
    const d = ablationDelta(unperturbed);
    expect(d.truthful).toBe(false);
    expect(d.changed.find((r) => r.id === 'evidence.basis').differs).toBe(false);
  });

  it('selects the recorded perturbed arm rather than editing anything', () => {
    const g = guideView(local, { mode: 'guided', step: 5, armId: 'treatment' });
    expect(g.ablation.targetArm).toBe('perturbed');
    expect(g.ablation.label).toBe('Remove or perturb the evidence');
    const back = guideView(local, { mode: 'guided', step: 5, armId: 'perturbed' });
    expect(back.ablation.targetArm).toBe(local.defaultArm);
    expect(back.ablation.label).toBe('Restore the original evidence');
  });

  it('shows the perturbed arm the values the frozen record holds', () => {
    const v = armView(local, 'perturbed');
    expect(v.evidence.basis).toBe('db8a63ec9405191bdd40d0ed0fc69684fca5d17b');
    expect(v.coupled).toBe(false);
    expect(v.arm.decision).toBe('ALLOW_PARALLEL');
    expect(v.arm.outcome.expression).toBe('140 > 130');
    expect(v.arm.outcome.holds).toBe(false);
    expect(v.arm.outcome.verdict).toBe('invalid joint state');
  });

  it('shows the treatment arm the values the frozen record holds', () => {
    const v = armView(local, 'treatment');
    expect(v.evidence.basis).toBe('eb67a6f56b3bf7e71846e7324d21af44565c0b70');
    expect(v.coupled).toBe(true);
    expect(v.arm.decision).toBe('WITHHOLD_SERIALIZE');
    expect(v.arm.outcome.expression).toBe('120 <= 130');
    expect(v.comparison[0].outcome.expression).toBe('140 > 130');
  });

  it('draws markers only on the ablation step, and only once the arm has moved', () => {
    expect(guideView(local, { mode: 'guided', step: 5, armId: 'treatment' }).showMarkers).toBe(false);
    expect(guideView(local, { mode: 'guided', step: 5, armId: 'perturbed' }).showMarkers).toBe(true);
    expect(guideView(local, { mode: 'guided', step: 4, armId: 'perturbed' }).showMarkers).toBe(false);
    expect(guideView(local, { mode: 'free', armId: 'perturbed' }).showMarkers).toBe(false);
  });
});

describe('reduced motion changes the transition, never the information', () => {
  it('keeps every step, marker and line of copy under reduction', () => {
    for (const step of [1, 5, 6]) {
      const moving = guideView(local, { mode: 'guided', step, armId: 'perturbed', reducedMotion: false });
      const still = guideView(local, { mode: 'guided', step, armId: 'perturbed', reducedMotion: true });
      expect({ ...still, reducedMotion: null }).toEqual({ ...moving, reducedMotion: null });
    }
  });

  it('withdraws the manual control rather than offering an override', () => {
    const control = /function motionControlHtml\(\)[\s\S]*?\n}/.exec(cockpit)[0];
    const osBranch = control.slice(0, control.indexOf('const label'));
    expect(osBranch).toContain('Reduced motion \\u00b7 system preference');
    expect(osBranch).not.toContain('<button');
    expect(osBranch).not.toContain('Enable motion');
  });

  it('names the action the manual control will perform', () => {
    const control = /function motionControlHtml\(\)[\s\S]*?\n}/.exec(cockpit)[0];
    expect(control).toContain("manualReduced ? 'Enable motion' : 'Reduce motion'");
    expect(control).toContain('aria-pressed="${manualReduced}"');
  });

  it('lets the system preference win over the manual one', () => {
    expect(cockpit).toMatch(/reducedMotion = \(\) => osReduced\(\) \|\| manualReduced/);
  });

  it('stores no preference, because there is no pattern here to follow', () => {
    expect(cockpit).not.toMatch(/localStorage|sessionStorage/);
  });

  it('stages the ablation inside the frozen motion budget', () => {
    const tokens = readFileSync(join(repoRoot, 'assets', 'tokens', 'motion.css'), 'utf8');
    const ms = (n) => Number(new RegExp(String.raw`${n}:\s*(\d+)ms`).exec(tokens)[1]);
    expect(ms('--delay-step') * 2 + ms('--dur-base')).toBeLessThanOrEqual(ms('--dur-hold'));
  });
});

describe('the cockpit stays a cockpit at every step', () => {
  it('never advances on its own', () => {
    expect(cockpit).not.toMatch(/setInterval\s*\(/);
    expect(cockpit).not.toMatch(/setTimeout\s*\([^)]*goStep/);
  });

  it('never scrolls the evidence out of view to make room for a step', () => {
    expect(cockpit).not.toMatch(/scrollIntoView/);
    expect(cockpit).toMatch(/focus\(\{ preventScroll: true \}\)/);
  });

  it('marks the current stage up rather than marking the others down', () => {
    const rules = cockpit.match(/\[data-guide-em[^\]]*\]\s*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    expect(cockpit).toMatch(/\[data-guide-em="focus"\]/);
    for (const rule of rules) {
      expect(rule).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/);
      // The defect this whole mechanism was rebuilt to remove.
      expect(rule).not.toMatch(/(^|[^-\w])opacity\s*:/);
      expect(rule).not.toMatch(/filter\s*:/);
      // Emphasis may not participate in layout, or the run moves between steps.
      expect(rule).not.toMatch(/(^|;|\{)\s*(width|height|padding|margin|border-width|font-size|transform)\s*:/);
    }
  });

  it('carries no text opacity anywhere on the surface', () => {
    const NON_TEXT = new Set([
      '.cxn .e-intent', '.cxn .e-couple', '.res .cause .cxl', '.evidence-band::before',
      '.hops::before', '.guide-bar__controls button[disabled]',
      '.cxn[data-guide-edge="on"] .e-intent', '.cxn[data-guide-edge="on"] .e-couple',
    ]);
    const style = (/<style>([\s\S]*?)<\/style>/.exec(cockpit)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    for (const rule of style.match(/[^{}]+\{[^}]*\}/g) ?? []) {
      const selector = rule.slice(0, rule.indexOf('{')).trim();
      const body = rule.slice(rule.indexOf('{'));
      if (!/(^|[^-\w])opacity\s*:/.test(body)) continue;
      if (/^@/.test(selector) || /^:root/.test(selector)) continue;
      if (selector.split(',').every((x) => NON_TEXT.has(x.trim()))) continue;
      offenders.push(selector);
    }
    expect(offenders).toEqual([]);
  });

  it('declares both measured text tiers, in both fields', () => {
    expect(cockpit).toMatch(/--text-body:var\(--ink\)/);
    expect(cockpit).toMatch(/--text-muted:var\(--n60\)/);
    const cloud = /body\[data-proof="cloud"\]\{[\s\S]*?\}/.exec(cockpit)[0];
    expect(cloud).toMatch(/--text-body:var\(--paper\)/);
    expect(cloud).toMatch(/--text-muted:var\(--n40\)/);
  });

  it('moves focus with a ref, not with the prototype timeout', () => {
    expect(cockpit).not.toMatch(/setTimeout\([^)]*\.focus\(\)/);
  });

  it('keeps arrow keys inside the two roving groups', () => {
    expect(cockpit).toMatch(/if \(!rail && !strats\) return;/);
    expect(cockpit).toMatch(/data-guide-rail/);
    expect(cockpit).toMatch(/data-strat-group/);
    expect(cockpit).toMatch(/tabindex="\$\{current \? 0 : -1\}"/);
  });

  it('has exactly one side panel element, so only one can be open', () => {
    expect((cockpit.match(/<aside/g) ?? []).length).toBe(1);
    expect(cockpit).toMatch(/if \(openPanel === kind\) return closeDrawer\(\)/);
  });

  it('does not recompute a recorded value', () => {
    expect(cockpit).not.toMatch(/outcome\.total\s*[-+*/<>]/);
    expect(cockpit).not.toMatch(/\.reduce\([^)]*reserved/);
  });
});

/* ── the HAC-343 comparison ────────────────────────────────────────────── */

describe('the comparison binds to HAC-343 or says that it did not', () => {
  const bound = buildComparison(frozen343);

  it('answers all six dimensions for all four strategies', () => {
    expect(bound.dimensions).toEqual(DIMENSIONS);
    expect(bound.strategies.map((s) => s.armId)).toEqual(STRATEGY_ARMS);
    for (const s of bound.strategies) expect(s.cells.map((c) => c.dimension)).toEqual(DIMENSIONS);
  });

  it('resolves every cell against the frozen packet in this tree', () => {
    expect(bound.unresolved).toEqual([]);
    expect(bound.resolved).toBe(true);
    for (const s of bound.strategies) {
      for (const cell of s.cells) {
        expect(cell.value).not.toMatch(/\[BIND:/);
        expect(cell.source).toMatch(/^experiments\/hac-343\/evidence\/[a-z-]+\.json#/);
      }
    }
  });

  it('reads the values HAC-343 recorded, not values derived here', () => {
    const results = frozen343['experiments/hac-343/evidence/results.json'].report.aggregate;
    const cell = (arm, dim) => bound.strategies.find((s) => s.armId === arm).cells
      .find((c) => c.dimension === dim).value;
    expect(cell('A4_interlock', 'Safety result')).toBe(results.A4_interlock.unsafeJointState.display);
    expect(cell('A1_uncoordinated', 'Safety result')).toBe(results.A1_uncoordinated.unsafeJointState.display);
    expect(cell('A4_interlock', 'Evidence sensitivity')).toBe(results.A4_interlock.evidenceSensitivity.display);
    expect(cell('A3_per_target_lock', 'Concurrency cost')).toBe(results.A3_per_target_lock.spr.rendering);
  });

  it('leaves an unresolvable field visibly unbound rather than plausible', () => {
    const none = buildComparison({});
    expect(none.resolved).toBe(false);
    expect(none.unresolved.length).toBeGreaterThan(0);
    for (const s of none.strategies) {
      for (const cell of s.cells) {
        expect(cell.value).toMatch(/^\[BIND: experiments\/hac-343\/evidence\/.+#.+\]$/);
        expect(cell.resolved).toBe(false);
      }
    }
    expect(none.unresolvedLabel).toBe('Unresolved binding scaffold · not evidence');
  });

  it('leaves a single missing field unbound while the rest stay bound', () => {
    const partial = structuredClone(frozen343);
    delete partial['experiments/hac-343/evidence/execution-semantics.json'].arms.A2_global_lock.note;
    const c = buildComparison(partial);
    const cell = c.strategies.find((s) => s.armId === 'A2_global_lock').cells
      .find((x) => x.dimension === 'Scope of coordination');
    expect(cell.resolved).toBe(false);
    expect(cell.value).toBe('[BIND: experiments/hac-343/evidence/execution-semantics.json#arms.A2_global_lock.note]');
    expect(c.resolved).toBe(false);
    // Everything else still resolves; one gap does not condemn the panel.
    expect(c.strategies.find((s) => s.armId === 'A4_interlock').cells.every((x) => x.resolved)).toBe(true);
  });

  it('carries no HAC-330 value across into the HAC-343 panel', () => {
    const text = JSON.stringify(bound.strategies);
    for (const forbidden of ['140 > 130', '120 <= 130', 'WITHHOLD_SERIALIZE', 'hac330']) {
      expect(text).not.toContain(forbidden);
    }
    expect(bound.separateExperiment).toMatch(/different experiment/i);
  });

  it('keeps the local and cloud proof classes out of the comparison entirely', () => {
    expect(JSON.stringify(bound)).not.toMatch(/hac340|GOOGLE CLOUD|receipt/i);
  });
});

/* ── the gate bites ────────────────────────────────────────────────────── */

const NEEDED = [
  'media/hac-341',
  'media/hac-333',
  'assets',
  'experiments/hac-330/evidence',
  'experiments/hac-342/evidence',
  'experiments/hac-343/evidence',
  // The gate reads the HAC-343 verifier to confirm each cited artifact is
  // covered by something, and the workflow to confirm the derived one is
  // reproduced. A copy without them is not a copy of this repository.
  'experiments/hac-343/bin',
  '.github',
];

let pristine;
const scratch = [];
beforeAll(() => {
  pristine = mkdtempSync(join(tmpdir(), 'hac341-walk-pristine-'));
  for (const rel of NEEDED) cpSync(join(repoRoot, rel), join(pristine, rel), { recursive: true });
});
afterAll(() => { for (const d of [pristine, ...scratch]) rmSync(d, { recursive: true, force: true }); });

const gate = (dir) => {
  const r = spawnSync(process.execPath, [join(dir, 'media/hac-341/bin/verify-cockpit.mjs')], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function broken(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'hac341-walk-case-'));
  scratch.push(dir);
  cpSync(pristine, dir, { recursive: true });
  mutate({
    read: (f) => readFileSync(join(dir, f), 'utf8'),
    write: (f, s) => writeFileSync(join(dir, f), s),
    json(f, fn) {
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      fn(v);
      writeFileSync(join(dir, f), JSON.stringify(v, null, 2) + '\n');
    },
    edit(f, from, to) {
      const s = readFileSync(join(dir, f), 'utf8');
      if (!s.includes(from)) throw new Error(`anchor not found in ${f}: ${from.slice(0, 60)}`);
      writeFileSync(join(dir, f), s.replace(from, to));
    },
    json(f, fn) {
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      fn(v);
      writeFileSync(join(dir, f), JSON.stringify(v, null, 2));
    },
  });
  return gate(dir);
}

const COCKPIT = 'media/hac-341/cockpit.html';
const MODEL = 'media/hac-341/evidence/view-model.json';

describe('the gate accepts the surface as built', () => {
  it('passes unmodified', () => {
    const r = gate(pristine);
    expect(r.out).toContain('HAC-341 cockpit verified');
    expect(r.out).toContain('4 held / 4 changed verified against the frozen arms');
    expect(r.code).toBe(0);
  });
});

describe('the gate refuses a walk that has stopped being an attention layer', () => {
  it('fails when a held-constant marker stops matching the frozen arms', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      // The perturbed arm quietly acquires its own bound. The walk would still
      // print "joint bound 130 · held constant" beside an arm judged against a
      // different one — the exact shape of the defect arm-view.mjs was written
      // for, moved one field along.
      m.runs.local.arms.find((x) => x.armId === 'perturbed').outcome.bound = 131;
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/held constant, but it changes|judged against bound 131/);
  });

  it('fails when the perturbation stops perturbing the evidence', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      const arms = m.runs.local.arms;
      arms.find((x) => x.armId === 'perturbed').basisRevision =
        arms.find((x) => x.armId === 'treatment').basisRevision;
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/perturb|basis/i);
  });

  it('fails when the entry preselects a path', () => {
    const r = broken((a) => a.edit(COCKPIT, '<button data-guide-start>Walk the proof</button>',
      '<button data-guide-start autofocus aria-pressed="true">Walk the proof</button>'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/preselects a path/);
  });

  it('fails when a step hides the cockpit under it', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '[data-guide-em="focus"]{box-shadow:inset 3px 0 0 0 var(--coupled),0 1px 3px rgba(11,13,14,.10)}',
      '[data-guide-em="quiet"]{display:none}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/hidden or made unreachable/);
  });

  it('fails when a non-current stage stops being operable', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '[data-guide-em="focus"]{box-shadow:inset 3px 0 0 0 var(--coupled),0 1px 3px rgba(11,13,14,.10)}',
      '[data-guide-em="quiet"]{pointer-events:none}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/hidden or made unreachable/);
  });

  it('fails when emphasis is paid for out of text opacity again', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '[data-guide-em="focus"]{box-shadow:inset 3px 0 0 0 var(--coupled),0 1px 3px rgba(11,13,14,.10)}',
      '[data-guide-em="quiet"]{opacity:.62}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/composites text below the contrast floor/);
  });

  it('fails when emphasis is paid for out of a filter', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '[data-guide-em="focus"]{box-shadow:inset 3px 0 0 0 var(--coupled),0 1px 3px rgba(11,13,14,.10)}',
      '[data-guide-em="quiet"]{filter:grayscale(1) opacity(.6)}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/alters rendered text colour/);
  });

  it('fails when emphasis starts moving the run between steps', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '[data-guide-em="focus"]{box-shadow:inset 3px 0 0 0 var(--coupled),0 1px 3px rgba(11,13,14,.10)}',
      '[data-guide-em="focus"]{border-width:4px;padding:8px}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/changes layout, which shifts the run/);
  });

  it('fails when a label returns to muting text with opacity', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '.res .n{font-size:11.5px;color:var(--text-muted);margin-top:3px}',
      '.res .n{font-size:11.5px;opacity:.55;margin-top:3px}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/opacity mutes text in/);
  });

  it('fails when a label returns to the sub-floor grey', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '.intent-card .intent-id{font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:var(--text-muted)}',
      '.intent-card .intent-id{font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:var(--n50)}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--n50, which is under the contrast floor/);
  });

  it('fails when the cloud field loses its own muted tier', () => {
    const r = broken((a) => a.edit(COCKPIT, '--text-muted:var(--n40)}', '}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cloud field does not redeclare --text-muted/);
  });

  it('fails when the cloud raw-proof surface stops following its field', () => {
    const r = broken((a) => a.edit(COCKPIT,
      'body[data-proof="cloud"] pre.shiki-proof{background:var(--n95);border-color:var(--border-default)}', ''));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/cloud raw-proof surface does not follow the dark field/);
  });

  it('fails when the walk stops demoting the persistent action row', () => {
    const r = broken((a) => a.edit(COCKPIT,
      `data-guide-weight="\${g.mode === 'guided' ? 'secondary' : 'primary'}"`,
      'data-guide-weight="primary"'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not demoted while the walk is running/);
  });

  it('fails when the handoff duplicates its own actions in the row', () => {
    const r = broken((a) => a.edit(COCKPIT,
      "const duplicated = g.isHandoff ? new Set(['verify', 'compare']) : new Set();",
      'const duplicated = new Set();'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/handoff step duplicates its own actions/);
  });

  /**
   * The evidence basis is what step 5's whole argument turns on. It was the one
   * arm field compared view-model-to-view-model rather than against
   * `arms.json`, so editing the frozen record reached the judge with every gate
   * green. The frozen experiment is copied into the fixture and mutated there;
   * this repository's own `experiments/` is never touched.
   */
  it('fails when only a frozen arm basisRevision is changed', () => {
    const r = broken((a) => a.json('experiments/hac-330/evidence/arms.json', (arms) => {
      arms.perturbedControl.decision.basisRevision = 'deadbeef'.repeat(5);
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/arm perturbed records basis .* but the frozen arm records deadbeef/);
  });

  it('fails when a frozen arm decision reason is changed', () => {
    const r = broken((a) => a.json('experiments/hac-330/evidence/arms.json', (arms) => {
      arms.treatment.decision.reason = 'COUPLING_ASSUMED';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/arm treatment records reason .* but the frozen arm records COUPLING_ASSUMED/);
  });

  it('fails when the HAC-343 panel labels itself with the HAC-330 run', () => {
    const r = broken((a) => a.edit(COCKPIT,
      "? `${esc(c.sourceIssue)} · frozen evaluation · canonical result ${esc(short(c.canonicalResultCommit))}`",
      '? `${esc(run.proofLabel)} · ${esc(run.runIdentity)}`'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/labels itself with the HAC-330 run/);
  });

  it('fails when guided copy names a decision no frozen arm records', () => {
    // The one value on this surface that is stated rather than derived.
    const r = broken((a) => a.edit('media/hac-341/lib/guide.mjs',
      'the decision flips to ALLOW_PARALLEL',
      'the decision flips to ALLOW_SERIALIZED'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/names "ALLOW_SERIALIZED", which no frozen arm records/);
  });

  it('fails when a guided state id is stamped on the cloud proof class', () => {
    const r = broken((a) => a.edit(COCKPIT,
      "document.documentElement.dataset.guideState = 'none';",
      'document.documentElement.dataset.guideState = GUIDE_CHOICE_STATE;'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/stamps a local-namespaced guided state id/);
  });

  it('fails when the disabled-control exemption is widened to live controls', () => {
    // The exemption is 1.4.3's, and it is only 1.4.3's while the selector
    // actually requires the disabled state.
    const r = broken((a) => a.edit(COCKPIT,
      '.guide-bar__controls button[disabled]{opacity:.4;cursor:not-allowed}',
      '.guide-bar__controls button{opacity:.4;cursor:not-allowed}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/opacity mutes text in/);
  });

  it('fails when demotion dims the control text instead of its chrome', () => {
    const r = broken((a) => a.edit(COCKPIT,
      '.actions[data-guide-weight="secondary"] button{border-width:1px;border-color:var(--border-default);\n  font-weight:500}',
      '.actions[data-guide-weight="secondary"] button{opacity:.6}'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/demoted action must stay as readable/);
  });

  it('fails when the walk can advance without the reader', () => {
    const r = broken((a) => a.edit(COCKPIT, 'const goStep = (n) => go({ guide: stateOfStep(n) }, true);',
      'const goStep = (n) => go({ guide: stateOfStep(n) }, true);\nsetInterval(() => goStep(currentStep() + 1), 4000);'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/advance without the reader/);
  });

  it('fails when a step change scrolls the evidence away', () => {
    const r = broken((a) => a.edit(COCKPIT, 'if (key) app.querySelector(`[data-focus-key="${key}"]`)?.focus({ preventScroll: true });',
      'if (key) app.querySelector(`[data-focus-key="${key}"]`)?.scrollIntoView();'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/scrolls the page/);
  });

  it('fails when an unknown guided address stops being refused', () => {
    const r = broken((a) => a.edit(COCKPIT, 'if (!guide) return { missing: `guide=${guideParam}` };',
      'if (!guide) return { proof, state, armId: MODEL.runs.local.defaultArm, guide: { mode: "choice", step: null } };'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/unknown guided address/);
  });

  it('fails when arrow keys stop being scoped to their groups', () => {
    const r = broken((a) => a.edit(COCKPIT, 'if (!rail && !strats) return;', 'if (false) return;'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/outside the two roving groups/);
  });

  it('fails when a second side panel appears', () => {
    const r = broken((a) => a.edit(COCKPIT, '<p aria-live="polite" class="sr" id="live"></p>',
      '<aside id="compare" data-open="false"></aside>\n<p aria-live="polite" class="sr" id="live"></p>'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/only one panel may be open/);
  });

  it('fails when verification stops naming the arm it explains', () => {
    const r = broken((a) => a.edit(COCKPIT, '` · selected arm ${esc(selected.label)}`', "''"));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not name the recorded arm/);
  });

  it('fails when the motion control survives the system preference', () => {
    const r = broken((a) => a.edit(COCKPIT,
      "return `<span class=\"guide-motion\" role=\"status\">Reduced motion \\u00b7 system preference</span>",
      "return `<button class=\"guide-motion\">Enable motion</button><span class=\"guide-motion\" role=\"status\">Reduced motion \\u00b7 system preference</span>"));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/survives the OS reduced-motion preference|override it cannot deliver/);
  });

  it('fails when the manual preference outranks the system one', () => {
    const r = broken((a) => a.edit(COCKPIT,
      'const reducedMotion = () => osReduced() || manualReduced;',
      'const reducedMotion = () => manualReduced;'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not let the OS preference win/);
  });

  it('fails when the surface starts recomputing a recorded outcome', () => {
    const r = broken((a) => a.edit(COCKPIT, 'const isBaseline = v.arm.armId === v.baseline?.armId;',
      'const isBaseline = v.arm.armId === v.baseline?.armId;\n  const headroom = v.arm.outcome.bound - v.arm.outcome.total;'));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/arithmetic/);
  });
});

describe('the gate refuses a comparison that is not what HAC-343 recorded', () => {
  it('fails when a cell is edited away from its cited field', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      const cell = m.comparison.strategies.find((s) => s.armId === 'A4_interlock').cells
        .find((c) => c.dimension === 'Safety result');
      cell.value = '0/16 (0.0%)';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not what its cited HAC-343 artifacts produce/);
  });

  it('fails when an unbound cell is dressed up as a value', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      const cell = m.comparison.strategies.find((s) => s.armId === 'A2_global_lock').cells
        .find((c) => c.dimension === 'Recorded outcome');
      cell.resolved = false;
      cell.value = 'serialized every scenario';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/does not render as a binding|not what its cited HAC-343 artifacts produce/);
  });

  it('fails when a HAC-330 value is carried into the comparison', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      m.comparison.strategies.find((s) => s.armId === 'A4_interlock').cells
        .find((c) => c.dimension === 'Recorded outcome').value = '120 <= 130';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/HAC-330 value appears inside the HAC-343 comparison|not what its cited/);
  });

  it('fails when a binding placeholder escapes the comparison scaffold', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      m.runs.local.verification.hac330VerifyCommand = '[BIND: experiments/hac-330/command]';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/outside the comparison scaffold/);
  });

  it('fails when the scaffold reports itself resolved while still unbound', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      m.comparison.strategies[1].cells[0].value = '[BIND: experiments/hac-343/evidence/results.json#nope]';
      m.comparison.strategies[1].cells[0].resolved = true;
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/resolved while carrying binding placeholders|claims to be bound while rendering a placeholder/);
  });

  it('fails when the not-evidence label is removed from the scaffold', () => {
    const r = broken((a) => a.json(MODEL, (m) => {
      m.comparison.unresolvedLabel = 'Coordination strategies';
    }));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not labelled as not-evidence/);
  });

  it('fails when a cell stops showing the field it was read from', () => {
    const r = broken((a) => a.edit(COCKPIT, '<p class="cmp-src">${esc(cell.source)}</p>', ''));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/without the field it was read from/);
  });
});
