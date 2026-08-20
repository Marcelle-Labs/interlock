/**
 * HAC-341 — the guided inspection layer over the existing local cockpit.
 *
 * This is an attention layer, not a second cockpit. It changes *emphasis* over
 * the four-stage causal spine the cockpit already draws; it adds no run, no
 * arm, no number and no claim. Every fact it surfaces is read back out of the
 * same normalized view model `cockpit.html` already renders, through the same
 * `arm-view.mjs` derivation, so a guided step cannot show a value the free
 * cockpit would contradict.
 *
 * It lives here rather than inside the HTML for the reason `arm-view.mjs`
 * does: the ablation's held-constant and changed claims are the load-bearing
 * part of step 5, and a claim like "the joint bound is held constant" has to be
 * *checked against the frozen arms* rather than typed into markup. `ablationDelta`
 * reads both arms and reports what actually moved; the gate then refuses a
 * held-constant marker on a field that moved and a changed marker on one that
 * did not.
 *
 * Pure and dependency-free apart from the sibling arm derivation.
 */
import { armView } from './arm-view.mjs';

/** Mode is explicit and total: there is no "guided-ish" in-between. */
export const GUIDE_MODES = ['choice', 'guided', 'free'];

/**
 * The stable guided state ids. They are addresses first and UI states second:
 * each one is a URL the cockpit can be opened at and a capture target, exactly
 * as `run.local.*` is. `guide.local.free` is the cockpit's own addition for the
 * expert path, declared here rather than left implicit so that an unknown
 * `guide=` value can be refused instead of silently resolving to something.
 */
export const GUIDE_CHOICE_STATE = 'guide.local.choice';
export const GUIDE_FREE_STATE = 'guide.local.free';

/**
 * The six beats. `focus` names the cockpit regions the step is about; every
 * other stage simply stops being marked. Emphasis is carried by surface,
 * border, accent edge, stage number and connector — never by text opacity,
 * which composites readable content toward the background and compounds
 * through every ancestor that sets it.
 *
 * The copy is editorial presentation, classified as such wherever it is
 * rendered. It states relationships between recorded values; it never states a
 * value, so it cannot drift away from the evidence.
 */
export const GUIDE_STEPS = [
  {
    no: '01',
    stateId: 'guide.local.validity',
    name: 'Local validity',
    title: 'Each action is valid alone',
    copy: 'Each reservation change passes its local rules.',
    focus: ['intents'],
  },
  {
    no: '02',
    stateId: 'guide.local.shared-environment',
    name: 'Shared bound',
    title: 'But they share something',
    copy: 'They touch one bounded environment. Local validity does not prove joint safety.',
    focus: ['intents', 'evidence'],
  },
  {
    no: '03',
    stateId: 'guide.local.evidence-decision',
    name: 'Coupling evidence',
    title: 'Interlock sees the composition',
    copy: 'At this pinned revision, the frozen evidence establishes coupling, so Interlock withholds parallel execution.',
    focus: ['evidence', 'decision'],
  },
  {
    no: '04',
    stateId: 'guide.local.outcome',
    name: 'Bounded outcome',
    title: 'The decision changes the bounded outcome',
    copy: 'The selected coordination keeps the joint state within its recorded bound.',
    focus: ['decision', 'outcome'],
  },
  {
    no: '05',
    stateId: 'guide.local.ablation',
    name: 'Ablation',
    title: 'Is the evidence causal?',
    copy: 'With a different frozen evidence basis, the decision flips to ALLOW_PARALLEL, and the same joint bound fails.',
    focus: ['evidence', 'decision', 'outcome', 'control'],
  },
  {
    no: '06',
    stateId: 'guide.local.handoff',
    name: 'Handoff',
    title: 'You have the causal claim. Inspect the proof.',
    copy: 'Verify the decision, compare coordination strategies, or take the complete cockpit.',
    focus: [],
  },
];

export const GUIDE_STATES = [
  GUIDE_CHOICE_STATE,
  ...GUIDE_STEPS.map((s) => s.stateId),
  GUIDE_FREE_STATE,
];

/** 1-based step for a guided state id, or `null` if the id is not a step. */
export function stepOfState(stateId) {
  const i = GUIDE_STEPS.findIndex((s) => s.stateId === stateId);
  return i < 0 ? null : i + 1;
}

/** The guided state id for a 1-based step, clamped to the declared range. */
export function stateOfStep(step) {
  const n = Math.max(1, Math.min(GUIDE_STEPS.length, Number(step) || 1));
  return GUIDE_STEPS[n - 1].stateId;
}

/**
 * Resolve a `guide=` address to `{ mode, step }`, or `null` for an address the
 * cockpit must refuse. Refusing is the point: a guided address that does not
 * name a declared state is not quietly corrected to step one.
 */
export function guideRoute(value) {
  if (value === null || value === undefined || value === '') return { mode: 'choice', step: null };
  if (value === GUIDE_CHOICE_STATE) return { mode: 'choice', step: null };
  if (value === GUIDE_FREE_STATE) return { mode: 'free', step: null };
  const step = stepOfState(value);
  return step ? { mode: 'guided', step } : null;
}

/**
 * What the ablation actually holds constant and what it actually changes.
 *
 * Derived by reading both recorded arms rather than asserted in copy. The four
 * "held" rows are properties of the *experiment* — the two intents, the shared
 * environment and its bound — and the four "changed" rows are properties of the
 * *arm*. `differs` reports what the frozen record says, so a marker that has
 * stopped being true becomes a mechanical failure instead of a confident lie.
 */
export function ablationDelta(run, fromArmId = run.defaultArm, toArmId = 'perturbed') {
  const from = armView(run, fromArmId);
  const to = armView(run, toArmId);
  const env = run.environmentEvidence?.[0] ?? {};
  const bound = run.constraints?.[0]?.bound;

  const finding = (v) => (v.coupled ? 'COUPLED' : v.evidence.consulted ? 'NO QUALIFYING COUPLING' : 'EVIDENCE NOT CONSULTED');
  const intent = (id) => run.actors?.find((a) => a.id === id) ?? {};

  const rows = [
    // Held: experiment-level. Neither arm can move these, and the marker says so.
    { id: 'intent.a', kind: 'held', label: 'Intent A', from: `${intent('intent.a').label} · ${intent('intent.a').state}`, to: `${intent('intent.a').label} · ${intent('intent.a').state}` },
    { id: 'intent.b', kind: 'held', label: 'Intent B', from: `${intent('intent.b').label} · ${intent('intent.b').state}`, to: `${intent('intent.b').label} · ${intent('intent.b').state}` },
    { id: 'environment', kind: 'held', label: 'Shared environment', from: env.source ?? '', to: env.source ?? '' },
    // Read from each arm's own recorded outcome rather than from the shared
    // constraint. The claim is that the two arms were judged against the same
    // bound, and that is only true if their frozen outcomes say so.
    { id: 'bound', kind: 'held', label: `Joint bound ${bound}`, from: String(from.arm.outcome.bound), to: String(to.arm.outcome.bound) },
    // Changed: arm-level. These are what the perturbation moves.
    { id: 'evidence.basis', kind: 'changed', label: 'Evidence basis', from: from.evidence.basis ?? '', to: to.evidence.basis ?? '' },
    { id: 'evidence.finding', kind: 'changed', label: 'Evidence finding', from: finding(from), to: finding(to) },
    { id: 'decision', kind: 'changed', label: 'Coordination decision', from: from.arm.decision ?? '', to: to.arm.decision ?? '' },
    { id: 'outcome', kind: 'changed', label: 'Bounded outcome', from: from.arm.outcome.expression, to: to.arm.outcome.expression },
  ].map((r) => ({ ...r, differs: r.from !== r.to }));

  return {
    fromArmId,
    toArmId,
    rows,
    held: rows.filter((r) => r.kind === 'held'),
    changed: rows.filter((r) => r.kind === 'changed'),
    /** True when every marker matches what the frozen arms actually did. */
    truthful: rows.every((r) => (r.kind === 'held' ? !r.differs : r.differs)),
  };
}

/**
 * Everything the guided layer renders for one address.
 *
 * `emphasis` is a per-region number the cockpit maps onto *positive* marking:
 * 1 means "this stage is what the step is about". It never reaches zero and
 * never carries `disabled` — a non-current stage is unmarked, not unavailable,
 * and its text is exactly as readable as the current one's.
 */
export function guideView(run, { mode = 'choice', step = null, armId = run.defaultArm, reducedMotion = false } = {}) {
  const guided = mode === 'guided';
  const current = guided ? GUIDE_STEPS[Math.max(1, Math.min(GUIDE_STEPS.length, step || 1)) - 1] : null;
  const focus = current?.focus ?? [];
  const arm = armView(run, armId);
  const isPerturbed = armId === 'perturbed';
  const delta = ablationDelta(run);

  const emphasis = (region) => (!guided || focus.length === 0 || focus.includes(region) ? 1 : 0.62);

  return {
    mode,
    stateId: guided ? current.stateId : mode === 'free' ? GUIDE_FREE_STATE : GUIDE_CHOICE_STATE,
    step: guided ? GUIDE_STEPS.indexOf(current) + 1 : null,
    total: GUIDE_STEPS.length,
    stepNo: current?.no ?? '',
    title: current?.title ?? '',
    copy: current?.copy ?? '',
    name: current?.name ?? '',
    focus,
    emphasis: {
      intents: emphasis('intents'),
      evidence: emphasis('evidence'),
      decision: emphasis('decision'),
      outcome: emphasis('outcome'),
      control: emphasis('control'),
    },
    isFirst: guided && step <= 1,
    isLast: guided && step >= GUIDE_STEPS.length,
    isAblation: guided && current?.stateId === 'guide.local.ablation',
    isHandoff: guided && current?.stateId === 'guide.local.handoff',
    /** Markers are shown on the ablation step, and only once the arm has moved. */
    showMarkers: guided && current?.stateId === 'guide.local.ablation' && isPerturbed,
    delta,
    ablation: {
      /** The label names the action that will occur, in both directions. */
      label: isPerturbed ? 'Restore the original evidence' : 'Remove or perturb the evidence',
      targetArm: isPerturbed ? run.defaultArm : 'perturbed',
      note: isPerturbed
        ? 'This is the recorded perturbed arm, not a recomputation. Select the original evidence to return.'
        : 'Selects the recorded perturbed arm. The intents, the shared environment and the bound stay as they are.',
    },
    reducedMotion,
    announce: guided
      ? `Step ${current.no} of ${String(GUIDE_STEPS.length).padStart(2, '0')}. ${current.title}`
      : mode === 'free'
        ? 'Free inspection. The complete cockpit is active.'
        : 'Inspect the run. Walk the proof, or explore freely.',
    armAnnounce: `${arm.arm.label}. Decision ${arm.arm.decision ?? 'none — Interlock disabled'}. Outcome ${arm.arm.outcome.expression}, ${arm.arm.outcome.verdict}.`,
  };
}
