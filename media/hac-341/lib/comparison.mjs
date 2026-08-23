/**
 * HAC-341 — the coordination-strategy comparison, bound to HAC-343.
 *
 * The judge's second question after "what changed?" is "compared with what?".
 * This module answers it by *binding* to HAC-343's frozen evaluation packet
 * rather than by writing a comparison table. Every cell carries the exact
 * artifact and field path it was read from, and a field this module cannot
 * resolve renders as a visible `[BIND: …]` defect instead of a plausible value.
 *
 * Two properties matter more than the table itself:
 *
 * 1. **One experiment per panel.** HAC-330 (the run on screen) and HAC-343 (the
 *    four-arm evaluation) are different experiments on different corpora. Every
 *    row here comes from HAC-343 and none from the arm the cockpit is showing,
 *    so the panel cannot be read as a continuation of the run beside it. That is
 *    the same separation the proof classes already enforce.
 * 2. **Unresolved stays unresolved.** When the HAC-343 artifacts are absent —
 *    they are a sibling experiment and this surface must build without them —
 *    every cell resolves to `[BIND: …]` and the panel labels itself as an
 *    unresolved scaffold rather than as evidence. No substitute value is
 *    derived from HAC-330 to fill the gap.
 */

/** The dimensions the comparison must answer, in reading order. */
export const DIMENSIONS = [
  'Safety result',
  'Concurrency cost',
  'Scope of coordination',
  'Evidence sensitivity',
  'Recorded outcome',
  'Limitation',
];

/** The four coordination strategies, by their frozen HAC-343 arm ids. */
export const STRATEGY_ARMS = ['A1_uncoordinated', 'A2_global_lock', 'A3_per_target_lock', 'A4_interlock'];

const RESULTS = 'experiments/hac-343/evidence/results.json';
const SEMANTICS = 'experiments/hac-343/evidence/execution-semantics.json';
const METRICS = 'experiments/hac-343/evidence/metric-definitions.json';
const EXPORT = 'experiments/hac-343/evidence/judge-export.json';

/**
 * Where each cell comes from. One table, so a binding cannot be added in the
 * renderer without appearing here, and the gate can walk it.
 *
 * `Limitation` is the one asymmetric row: HAC-343 records a per-arm limitation
 * under a different key for each arm — `canFail` for the arms that could
 * falsify the thesis, `knownWeakness` for the arm whose weakness is structural,
 * `namingRule` for the arm most likely to be mis-described, and the export's
 * own `forbiddenRendering` for Interlock. Flattening them to one key would mean
 * inventing three sentences.
 */
export const BINDINGS = {
  'Safety result': (arm) => [RESULTS, `report.aggregate.${arm}.unsafeJointState.display`],
  'Concurrency cost': (arm) => [RESULTS, `report.aggregate.${arm}.spr.rendering`],
  'Scope of coordination': (arm) => [SEMANTICS, `arms.${arm}.note`],
  'Evidence sensitivity': (arm) => [RESULTS, `report.aggregate.${arm}.evidenceSensitivity.display`],
  'Recorded outcome': (arm) => [RESULTS, `report.aggregate.${arm}.permit.display`],
  Limitation: (arm) => ({
    A1_uncoordinated: [METRICS, 'arms.A1_uncoordinated.canFail'],
    A2_global_lock: [METRICS, 'arms.A2_global_lock.knownWeakness'],
    A3_per_target_lock: [METRICS, 'arms.A3_per_target_lock.namingRule'],
    A4_interlock: [EXPORT, 'panel2.forbiddenRendering'],
  }[arm]),
};

/** What each dimension is asking, bound to the frozen metric definitions. */
const CAPTIONS = {
  'Safety result': [METRICS, 'metrics.unsafeJointStateRate.question'],
  'Concurrency cost': [METRICS, 'metrics.falseBlockRate.question'],
  'Scope of coordination': [SEMANTICS, 'concurrencyModel.criticalSection.rule'],
  'Evidence sensitivity': [METRICS, 'metrics.evidenceSensitivityRate.question'],
  'Recorded outcome': [METRICS, 'metrics.permitRate.question'],
  Limitation: [EXPORT, 'limitations.corpusBound'],
};

const at = (root, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), root);

/**
 * Read one bound field, or return the unresolved marker.
 *
 * The marker is a *value*, not a rendering concern: it travels in the view
 * model so the cockpit prints it without knowing that anything is missing, and
 * so the gate can find it without parsing markup.
 */
function bind(sources, artifact, path) {
  const root = sources[artifact];
  const value = root == null ? undefined : at(root, path);
  if (typeof value === 'string' && value.length > 0) {
    return { value, source: `${artifact}#${path}`, resolved: true };
  }
  return { value: `[BIND: ${artifact}#${path}]`, source: `${artifact}#${path}`, resolved: false };
}

/**
 * Build the comparison from whatever HAC-343 artifacts are readable.
 *
 * `sources` is keyed by repository-relative artifact path; a missing or
 * unreadable artifact is simply absent, and every cell that needed it becomes
 * an unresolved binding.
 */
export function buildComparison(sources = {}) {
  const label = (arm, i) => {
    const frozen = at(sources[EXPORT], `panel1.rows.${i}.label`);
    return typeof frozen === 'string' && frozen ? frozen : `[BIND: ${EXPORT}#panel1.rows.${i}.label]`;
  };

  const strategies = STRATEGY_ARMS.map((arm, i) => ({
    armId: arm,
    label: label(arm, i),
    labelSource: `${EXPORT}#panel1.rows.${i}.label`,
    cells: DIMENSIONS.map((dim) => {
      const [artifact, path] = BINDINGS[dim](arm);
      return { dimension: dim, ...bind(sources, artifact, path) };
    }),
  }));

  const captions = DIMENSIONS.map((dim) => {
    const [artifact, path] = CAPTIONS[dim];
    return { dimension: dim, ...bind(sources, artifact, path) };
  });

  // A3 is the arm a skeptical judge proposes instead of Interlock, so "credible"
  // has to be shown rather than claimed. This is the frozen figure that shows it.
  // The experiment names itself; typing "HAC-343" here would be the one value
  // on this panel that came from nowhere.
  const experiment = bind(sources, EXPORT, 'experiment');
  const credibilityClaim = bind(sources, EXPORT, 'panel1.perTargetLockCredibility.claim');
  const credibility = bind(sources, EXPORT, 'panel1.perTargetLockCredibility.serializedSameTargetContention.display');
  const parallelised = bind(sources, EXPORT, 'panel1.perTargetLockCredibility.parallelisedCrossTarget.display');
  const missed = bind(sources, EXPORT, 'panel1.perTargetLockCredibility.missedCrossTargetHazards.display');
  const credibilityNote = bind(sources, EXPORT, 'panel1.perTargetLockCredibility.note');
  const scope = bind(sources, EXPORT, 'panel1.scope');
  const commit = bind(sources, EXPORT, 'derivedFrom.canonicalResultCommit');

  /* Panel 2 travels with Panel 1 or not at all.
   *
   * Panel 1 alone reads as "Interlock is the safe one". The frozen export
   * forbids exactly that reading: the 0/2 is bounded to COUPLED scenarios and
   * is a property of the evidence being present, not of Interlock. Panel 2 is
   * the arm of the same experiment that shows the dependency — remove the
   * coupling evidence and the same core produces 2/2 invalid. Binding them in
   * one object is what makes "adjacent" a mechanical property of the panel
   * rather than a layout habit a later edit can quietly separate. */
  const panel2Rows = [0, 1].map((i) => ({
    condition: bind(sources, EXPORT, `panel2.rows.${i}.condition`),
    invalidOutcomes: bind(sources, EXPORT, `panel2.rows.${i}.invalidOutcomes.display`),
  }));
  const panel2 = {
    question: bind(sources, EXPORT, 'panel2.question'),
    reading: bind(sources, EXPORT, 'panel2.reading'),
    forbiddenRendering: bind(sources, EXPORT, 'panel2.forbiddenRendering'),
  };

  const cells = strategies.flatMap((s) => s.cells);
  const unresolved = [
    ...cells, ...captions, experiment,
    credibilityClaim, credibility, parallelised, missed, credibilityNote,
    scope, commit,
    ...Object.values(panel2),
    ...panel2Rows.flatMap((r) => [r.condition, r.invalidOutcomes]),
  ]
    .filter((c) => !c.resolved)
    .map((c) => c.source);
  for (const s of strategies) if (String(s.label).startsWith('[BIND:')) unresolved.push(s.labelSource);

  return {
    title: 'Coordination strategies',
    sourceIssue: experiment.value,
    sourceIssueSource: experiment.source,
    /* The separation that keeps this panel honest. */
    separateExperiment:
      'A different experiment from the run on screen. HAC-343 evaluates four coordination strategies over its own sixteen-scenario corpus; HAC-330 is the single bounded counterfactual beside it. No value is carried between them.',
    artifacts: [RESULTS, SEMANTICS, METRICS, EXPORT],
    canonicalResultCommit: commit.value,
    scopeNote: scope.value,
    dimensions: DIMENSIONS,
    captions,
    strategies,
    /* Three figures, not one. `2/2 serialized` alone shows the lock ran; it does
       not show what the lock cost or what it still missed. The judge's question
       is whether A3 is a credible alternative to Interlock, and that is only
       answerable with all three: it serialized every same-target contention,
       kept every cross-target pair concurrent, and still missed both
       cross-target hazards. Dropping either of the last two lets the strip read
       as a clean bill of health for per-target locking. */
    perTargetLockCredibility: {
      claim: credibilityClaim.value,
      serializedSameTargetContention: credibility.value,
      parallelisedCrossTarget: parallelised.value,
      missedCrossTargetHazards: missed.value,
      note: credibilityNote.value,
    },
    evidenceAblation: {
      question: panel2.question.value,
      rows: panel2Rows.map((r) => ({
        condition: r.condition.value,
        invalidOutcomes: r.invalidOutcomes.value,
      })),
      reading: panel2.reading.value,
      forbiddenRendering: panel2.forbiddenRendering.value,
    },
    unresolved,
    resolved: unresolved.length === 0,
    /* Shown verbatim whenever anything is unbound. Never shown when everything
       resolved: a scaffold banner over real evidence is its own kind of lie. */
    unresolvedLabel: 'Unresolved binding scaffold · not evidence',
    unresolvedNote:
      'HAC-343 has no readable frozen artifact at this read. The unresolved dimensions render as bindings; no substitute value is derived from HAC-330 or from any other run.',
  };
}

/**
 * Everything on this panel that a judge can read, as one object.
 *
 * The gate used to deep-compare `strategies` alone and then report that "the
 * comparison is not what its cited artifacts produce" — a claim that was true
 * of twenty-four cells and false of four more. `perTargetLockCredibility`,
 * `scopeNote` and `canonicalResultCommit` sit outside `strategies`, so
 * inverting the figure that establishes the per-target lock was credible, or
 * widening the panel's scope boundary, passed every gate.
 *
 * One projection, deep-compared against the deterministic rebuild, so a field
 * added to the panel is covered the moment it is rendered rather than the next
 * time somebody remembers to extend a list.
 */
export function judgeFacing(comparison) {
  if (!comparison) return null;
  return {
    title: comparison.title,
    sourceIssue: comparison.sourceIssue,
    separateExperiment: comparison.separateExperiment,
    artifacts: comparison.artifacts,
    canonicalResultCommit: comparison.canonicalResultCommit,
    scopeNote: comparison.scopeNote,
    dimensions: comparison.dimensions,
    captions: comparison.captions,
    strategies: comparison.strategies,
    perTargetLockCredibility: comparison.perTargetLockCredibility,
    evidenceAblation: comparison.evidenceAblation,
    resolved: comparison.resolved,
    unresolved: comparison.unresolved,
    unresolvedLabel: comparison.unresolvedLabel,
    unresolvedNote: comparison.unresolvedNote,
  };
}

/**
 * The fields `judgeFacing` must carry, named separately so that adding a
 * rendered field without covering it is itself a gate failure rather than a
 * silent hole of the kind this function exists to close.
 */
export const JUDGE_FACING_FIELDS = [
  'title', 'sourceIssue', 'separateExperiment', 'artifacts', 'canonicalResultCommit',
  'scopeNote', 'dimensions', 'captions', 'strategies', 'perTargetLockCredibility',
  'evidenceAblation',
  'resolved', 'unresolved', 'unresolvedLabel', 'unresolvedNote',
];
