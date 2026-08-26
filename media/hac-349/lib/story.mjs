/**
 * HAC-349 — the consequence-first judge story, bound to HAC-343.
 *
 * The landing surface explains. It does not measure, and it does not hold an
 * opinion about what the measurement was. Every figure a judge reads on `/`
 * resolves through this module to a pointer into a frozen artifact, and a
 * pointer that stops resolving renders as a visible `[BIND: …]` defect rather
 * than as a plausible number that used to be true.
 *
 * Three properties this module exists to hold:
 *
 * 1. **No retyped evidence.** The four-arm figures, the per-target-lock
 *    credibility strip and the ablation rows are read out of
 *    `experiments/hac-343/evidence/judge-export.json`. The L1 scene — two
 *    intents, two paths, one ceiling, one joint total — is read out of
 *    `raw-results.json`, so the picture on the front door is the experiment's
 *    own `budget/coupled/alpha-beta` scenario rather than an illustration
 *    somebody drew to look like it.
 *
 * 2. **Simplification is a hierarchy, not a discount.** The glosses below sit
 *    beside their exact terms; none replaces one. `WITHHOLD_SERIALIZE` is still
 *    `WITHHOLD_SERIALIZE` on screen, with a sentence next to it — never a
 *    friendlier token standing in its place. `FORBIDDEN_CLAIMS` is the
 *    mechanical half of that promise.
 *
 * 3. **Recorded, never live.** Nothing here describes a simulation, a run, or a
 *    replay. `ARM_FRAMING` is the vocabulary the surface is allowed to use
 *    about the two frozen conditions, and the gate refuses the alternatives.
 *
 * Pure and dependency-free, so the gate and the tests can assert against the
 * same derivation the build wrote.
 */

/** Repository-relative artifact paths. Keys are what `bind` is called with. */
export const EXPORT = 'experiments/hac-343/evidence/judge-export.json';
export const RAW = 'experiments/hac-343/evidence/raw-results.json';
export const VIEW_MODEL = 'media/hac-341/evidence/view-model.json';

export const ARTIFACTS = [EXPORT, RAW, VIEW_MODEL];

/**
 * The scenario the first frame is drawn from.
 *
 * Named as a constant rather than reached for inline: the L1 picture is a claim
 * that *this* recorded scenario looks like that, and the gate re-reads the same
 * id to check it.
 */
export const L1_SCENARIO = 'budget/coupled/alpha-beta';
/** The second hazard family, present so the corpus bound is not one topology. */
export const SECOND_FAMILY_SCENARIO = 'registry/coupled/retire-vs-route';

const at = (root, path) => String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), root);

/**
 * Read one bound field, or return the unresolved marker.
 *
 * The marker is a value, not a rendering concern, for the same reason it is one
 * in `media/hac-341/lib/comparison.mjs`: it travels in the model, so the page
 * prints it without knowing anything is missing and the gate finds it without
 * parsing markup.
 */
export function bind(sources, artifact, path) {
  const root = sources[artifact];
  const value = root == null ? undefined : at(root, path);
  if (value !== undefined && value !== null && value !== '') {
    return { value, source: `${artifact}#${path}`, resolved: true };
  }
  return { value: `[BIND: ${artifact}#${path}]`, source: `${artifact}#${path}`, resolved: false };
}

/**
 * One raw record, addressed the way the experiment addresses it.
 *
 * Order `AB` specifically. The corpus runs both orders and HAC-343 reports
 * twelve order disagreements, all of them A2; pinning the order here means the
 * front door shows one recorded record rather than an average over two.
 */
function record(sources, scenarioId, arm, order = 'AB') {
  const raw = sources[RAW];
  const records = Array.isArray(raw?.records) ? raw.records : [];
  const i = records.findIndex((r) => r.scenarioId === scenarioId && r.arm === arm && r.order === order);
  return i < 0 ? null : { index: i, value: records[i] };
}

/** A record field, bound by its real index so the pointer is checkable. */
function fromRecord(sources, scenarioId, arm, path, order = 'AB') {
  const hit = record(sources, scenarioId, arm, order);
  if (!hit) {
    const where = `records[scenarioId=${scenarioId},arm=${arm},order=${order}]`;
    return { value: `[BIND: ${RAW}#${where}.${path}]`, source: `${RAW}#${where}.${path}`, resolved: false };
  }
  return bind(sources, RAW, `records.${hit.index}.${path}`);
}

/**
 * The verifier's own output for a record, parsed.
 *
 * The oracle is an independent process whose stdout is frozen in the packet.
 * Parsing it here rather than restating its numbers is the difference between
 * quoting the verifier and agreeing with it from memory.
 */
function oracle(sources, scenarioId, arm, order = 'AB') {
  const hit = record(sources, scenarioId, arm, order);
  const stdout = hit?.value?.oracle?.stdout;
  if (typeof stdout !== 'string') return null;
  try {
    return { report: JSON.parse(stdout), index: hit.index };
  } catch {
    return null;
  }
}

function fromOracle(sources, scenarioId, arm, field) {
  const o = oracle(sources, scenarioId, arm);
  const where = `records.${o?.index}.oracle.stdout#${field}`;
  if (!o || o.report[field] === undefined) {
    const miss = `records[scenarioId=${scenarioId},arm=${arm}].oracle.stdout#${field}`;
    return { value: `[BIND: ${RAW}#${miss}]`, source: `${RAW}#${miss}`, resolved: false };
  }
  return { value: o.report[field], source: `${RAW}#${where}`, resolved: true };
}

/**
 * The exact tokens, and the sentence each one is allowed to be glossed with.
 *
 * A gloss sits *beside* its token on screen. The forbidden direction is
 * replacement: `WITHHOLD_SERIALIZE` rendered as "Paused for safety" is the
 * simplification HAC-349 names, because it converts a coordination decision
 * into a safety verdict the evidence does not support.
 */
export const GLOSSES = [
  {
    term: 'WITHHOLD_SERIALIZE',
    gloss: 'this intent is held back; the other one proceeds alone',
    forbidden: ['Paused for safety', 'Blocked for safety', 'Approved'],
  },
  {
    term: 'ALLOW_PARALLEL',
    gloss: 'both intents proceed at the same time',
    forbidden: ['Approved', 'Safe to proceed'],
  },
  {
    term: 'ALLOW_SERIALIZED',
    gloss: 'this intent proceeds alone, ahead of the one it is coupled to',
    forbidden: ['Approved'],
  },
];

/**
 * How the two frozen conditions may be described.
 *
 * `recordedLabel` and `recordedNote` are the vocabulary; `forbiddenControlNames`
 * is what a control on this surface may never be called. None of those words is
 * available to the page, because nothing on it recomputes anything — and it
 * offers no control over the conditions at all, which is why both are simply
 * rendered side by side.
 */
export const ARM_FRAMING = {
  recordedLabel: 'RECORDED CONDITION · NOT RECOMPUTED',
  /* Both conditions are rendered side by side rather than behind a selector.
     A control is the thing most likely to be read as "run it again": the
     comparison is the whole point, so showing both at once costs nothing and
     removes the affordance a reader could mistake for execution. */
  recordedNote: 'Both conditions were run once, offline, and frozen, and are shown side by side above. Nothing on this page is executed, recomputed or simulated.',
  forbiddenControlNames: ['Simulate', 'Run experiment', 'Replay experiment', 'Re-run', 'Live', 'Execute'],
};

/**
 * Claims this surface may never make, as patterns.
 *
 * Transcribed from HAC-343's `mustNotClaim` and `panel2.forbiddenRendering`,
 * plus the simplifications HAC-349 names. Patterns rather than sentences,
 * because the failure mode is paraphrase: "safe and parallel" and "0% unsafe"
 * are the same overclaim written two ways.
 *
 * Each entry is `[pattern, why]`, or `[pattern, why, { absolute: true }]`.
 *
 * The negation window exists so this surface can print its own limitations —
 * it has to be able to say "not production-ready". But two of the phrases below
 * *contain* a negation, and a window that reads "do not" as a disclaimer would
 * excuse the very claim it is looking for: "Locks do not work" disclaims itself,
 * and "Without coordination the result is a catastrophic failure" is negated by
 * its own opening word. Neither phrase has a legitimate disclaimed form on a
 * judge surface, so both are absolute: a match is a failure, full stop.
 *
 * Exported so the gate and `test/hac-349-landing-gates.test.mjs` check one list
 * rather than two that drift.
 */
export const FORBIDDEN_CLAIMS = [
  [/\b(0|zero)\s*%?\s*unsafe\b/i, 'HAC-343 forbids a 0% unsafe headline; the ablation arm produced invalid outcomes by design'],
  [/\b100\s*%\s*(safe|of\s+hazards)/i, 'a 100% headline collapses a heterogeneous sixteen-scenario corpus into one denominator'],
  [/\bsafe\s+and\s+parallel\b/i, 'the Panel 1 result is bounded to the coupled and independent conditions; unqualified it is a global claim'],
  [/\bsafer\s+than\s+(locking|locks|a\s+lock)\b/i, 'per-target locking is correct for the hazard it addresses'],
  [/\bprevents\s+(all\s+)?(composition\s+)?(hazards?|collisions?)\b/i, 'Interlock withheld the hazardous compositions in this corpus; it does not prevent hazards'],
  [/\block(s|ing)?\s+(do\s+not|don.t|doesn.t|never)\s+work\b/i, 'the per-target lock is a credible baseline and is not a straw man', { absolute: true }],
  [/\bpaused\s+for\s+safety\b/i, 'WITHHOLD_SERIALIZE is a coordination decision, not a safety verdict'],
  [/\bcatastroph/i, 'an invalid joint state is not characterised as a catastrophe', { absolute: true }],
  [/\bthe\s+route\s+is\s+secure\b/i, 'three recorded controls are three controls, not general security coverage'],
  [/statistical(ly)?\s+significan/i, 'the corpus is an exhaustive deterministic enumeration, not a sample'],
  [/confidence\s+interval/i, 'no interval is claimed'],
  [/\bproduction[- ]ready\b/i, 'production readiness was not tested'],
  [/\bexactly[- ]once\b/i, 'exactly-once is not claimed'],
  [/\brestart[- ]saf(e|ety)\b/i, 'restart safety is not claimed'],
  [/\bagent\s+runtime\b/i, 'Agent Runtime did not participate'],
  [/\bagent\s+gateway\b/i, 'Agent Gateway did not participate'],
  [/\bCONTENT_AUTHZ\b/, 'CONTENT_AUTHZ is not on the recorded path'],
];

/**
 * Model fields whose entire content is, by construction, a list of things that
 * are *not* claimed.
 *
 * Scanning these for forbidden claims is scanning a prohibition list for
 * prohibitions: `mustNotClaim` says "Interlock is 0% unsafe" precisely in order
 * to forbid it. They are excluded from the phrase scan and covered instead by
 * two stronger checks — each must be byte-identical to its frozen source, and
 * each must render under a heading that negates it. A tampered disclaimer fails
 * the first; a disclaimer relabelled as a claim fails the second.
 */
export const DISCLAIMER_FIELDS = [
  ['boundary.mustNotClaim', EXPORT, 'mustNotClaim'],
  ['boundary.outsideScope', EXPORT, 'limitations.outsideScope'],
  ['cloud.notClaimed', VIEW_MODEL, 'runs.cloud.claimBoundary.notClaimed'],
  ['cloud.notOnPath', VIEW_MODEL, 'runs.cloud.notOnPath'],
];

/**
 * The heading each disclaimer list must appear under, so a reader meets it as a
 * limitation rather than as a result.
 */
export const DISCLAIMER_HEADINGS = [
  'What this evaluation does not claim',
  'Outside the scope of this experiment',
  'Not claimed by this run',
  'Not on the recorded path',
];

/**
 * Words that turn a forbidden phrase into the disclaimer it is required to be.
 *
 * This surface has to be able to *say* "not production-ready" and "these three
 * controls are not a security claim". A gate that could not tell the negation
 * from the assertion would force the limitations off the page, which is the
 * opposite of what the claim boundary is for.
 */
export const NEGATORS = /\b(no|not|never|without|neither|nor|none|absent|outside|excluded|refus\w+|forbid\w+|cannot|can.t|does\s+not|is\s+not|are\s+not)\b/i;
export const NEGATION_WINDOW = 120;

/**
 * Every forbidden-claim hit in `copy`, honouring each pattern's own rule about
 * whether a nearby negation excuses it.
 *
 * The single entry point for both the gate and the tests. Applying the
 * negation window at each call site is how `absolute` gets honoured in one
 * place and quietly forgotten in the other.
 */
export function forbiddenHits(copy, patterns = FORBIDDEN_CLAIMS) {
  return patterns.flatMap(([pattern, why, opts]) => {
    const hits = opts?.absolute
      ? [...String(copy).matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))]
        .map((m) => ({
          text: m[0],
          context: String(copy).slice(Math.max(0, m.index - NEGATION_WINDOW),
            m.index + m[0].length + NEGATION_WINDOW).replace(/\s+/g, ' ').trim(),
        }))
      : assertedWithoutNegation(pattern, copy);
    return hits.map((h) => ({ ...h, why }));
  });
}

/** Occurrences of `pattern` in `copy` that nothing nearby negates. */
export function assertedWithoutNegation(pattern, copy) {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  const hits = [];
  for (const m of String(copy).matchAll(global)) {
    const from = Math.max(0, m.index - NEGATION_WINDOW);
    const to = Math.min(copy.length, m.index + m[0].length + NEGATION_WINDOW);
    const context = copy.slice(from, to);
    if (!NEGATORS.test(context)) hits.push({ text: m[0], context: context.replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

/**
 * Build the whole judge story from whatever frozen artifacts are readable.
 *
 * `sources` is keyed by repository-relative path. A missing artifact is simply
 * absent and every value it would have carried becomes an unresolved binding —
 * never a substitute drawn from somewhere else.
 */
export function buildStory(sources = {}) {
  /* ---- L1: the composition problem, as the corpus records it ------------ */

  const intentA = fromRecord(sources, L1_SCENARIO, 'A1_uncoordinated', 'intents.0');
  const intentB = fromRecord(sources, L1_SCENARIO, 'A1_uncoordinated', 'intents.1');
  const ceiling = fromOracle(sources, L1_SCENARIO, 'A1_uncoordinated', 'totalReservable');
  const invariant = fromOracle(sources, L1_SCENARIO, 'A1_uncoordinated', 'invariant');
  const jointTotal = fromOracle(sources, L1_SCENARIO, 'A1_uncoordinated', 'total');
  const jointHolds = fromOracle(sources, L1_SCENARIO, 'A1_uncoordinated', 'holds');
  /* The A4 record is the one where exactly one of the two intents applied, so
     its verifier total is what either action projects on its own. Derived from
     the oracle rather than from the human-readable `detail` string, which is
     prose the executor formats and not a measured field. */
  const aloneTotal = fromOracle(sources, L1_SCENARIO, 'A4_interlock', 'total');
  const aloneHolds = fromOracle(sources, L1_SCENARIO, 'A4_interlock', 'holds');

  const scene = {
    scenario: L1_SCENARIO,
    scenarioSource: `${RAW}#records[scenarioId=${L1_SCENARIO}]`,
    invariant: invariant.value,
    invariantSource: invariant.source,
    ceiling: ceiling.value,
    ceilingSource: ceiling.source,
    actions: [
      {
        actor: 'Agent A',
        path: intentA.value?.path ?? intentA.value,
        target: intentA.value?.service ?? '',
        change: intentA.value?.reserved,
        source: intentA.source,
      },
      {
        actor: 'Agent B',
        path: intentB.value?.path ?? intentB.value,
        target: intentB.value?.service ?? '',
        change: intentB.value?.reserved,
        source: intentB.source,
      },
    ],
    alone: { total: aloneTotal.value, holds: aloneHolds.value, source: aloneTotal.source },
    joint: { total: jointTotal.value, holds: jointHolds.value, source: jointTotal.source },
  };

  /* ---- L2a: the per-target lock, credible first ------------------------- */

  const crossKeys = fromRecord(sources, L1_SCENARIO, 'A3_per_target_lock', 'lockGroups');
  const crossConcurrent = fromRecord(sources, L1_SCENARIO, 'A3_per_target_lock', 'concurrent');
  const sameKeys = fromRecord(sources, 'budget/same-target/alpha-alpha', 'A3_per_target_lock', 'lockGroups');
  const sameConcurrent = fromRecord(sources, 'budget/same-target/alpha-alpha', 'A3_per_target_lock', 'concurrent');

  const credPath = 'panel1.perTargetLockCredibility';
  const serialized = bind(sources, EXPORT, `${credPath}.serializedSameTargetContention.display`);
  const parallelised = bind(sources, EXPORT, `${credPath}.parallelisedCrossTarget.display`);
  const missed = bind(sources, EXPORT, `${credPath}.missedCrossTargetHazards.display`);
  const credClaim = bind(sources, EXPORT, `${credPath}.claim`);
  const credNote = bind(sources, EXPORT, `${credPath}.note`);

  const lock = {
    /* Three beats, in the order that keeps the baseline credible: the lock
       works, then the lock is not engaged, then the hazard crosses it. Removing
       the first turns A3 into a straw man; removing the second makes the third
       look like a lock failure rather than a visibility boundary. */
    sameTarget: {
      keys: sameKeys.value,
      concurrent: sameConcurrent.value,
      figure: serialized.value,
      figureSource: serialized.source,
      reading: 'One key, so the second intent waits. The lock is correct here.',
    },
    crossTarget: {
      keys: crossKeys.value,
      concurrent: crossConcurrent.value,
      figure: parallelised.value,
      figureSource: parallelised.source,
      reading: 'Two different keys, so ordinary per-key discipline lets both proceed.',
    },
    missed: {
      figure: missed.value,
      figureSource: missed.source,
      reading: 'The constraint they share is not either key. It is the environment both keys sit in.',
    },
    claim: credClaim.value,
    claimSource: credClaim.source,
    note: credNote.value,
    noteSource: credNote.source,
  };

  /* ---- L2b: the four-arm contrast --------------------------------------- */

  const strategies = [0, 1, 2, 3].map((i) => {
    const label = bind(sources, EXPORT, `panel1.rows.${i}.label`);
    const arm = bind(sources, EXPORT, `panel1.rows.${i}.arm`);
    const unsafeN = bind(sources, EXPORT, `panel1.rows.${i}.coupledUnsafe.numerator`);
    const unsafeD = bind(sources, EXPORT, `panel1.rows.${i}.coupledUnsafe.denominator`);
    const unsafe = bind(sources, EXPORT, `panel1.rows.${i}.coupledUnsafe.display`);
    const parN = bind(sources, EXPORT, `panel1.rows.${i}.safeParallelism.numerator`);
    const parD = bind(sources, EXPORT, `panel1.rows.${i}.safeParallelism.denominator`);
    const par = bind(sources, EXPORT, `panel1.rows.${i}.safeParallelism.display`);
    return {
      armId: arm.value,
      label: label.value,
      labelSource: label.source,
      /* Two dimensions, always together. Either one alone ranks the arms
         wrongly: A1 wins on parallelism and A2 wins on safety, and each is the
         worst possible choice on the axis it is not being read on. */
      invalidCoupled: {
        display: unsafe.value,
        numerator: unsafeN.value,
        denominator: unsafeD.value,
        source: unsafe.source,
      },
      safeParallelRetained: {
        display: par.value,
        numerator: parN.value,
        denominator: parD.value,
        source: par.source,
      },
    };
  });

  const panel1Reading = bind(sources, EXPORT, 'panel1.reading');
  const panel1Scope = bind(sources, EXPORT, 'panel1.scope');
  const corpusBound = bind(sources, EXPORT, 'limitations.corpusBound');

  /* ---- L2c: the evidence ablation --------------------------------------- */

  const ablationRows = [0, 1].map((i) => {
    const condition = bind(sources, EXPORT, `panel2.rows.${i}.condition`);
    const invalid = bind(sources, EXPORT, `panel2.rows.${i}.invalidOutcomes.display`);
    const decision = bind(sources, EXPORT, `panel2.rows.${i}.decision`);
    return {
      condition: condition.value,
      conditionSource: condition.source,
      invalidOutcomes: invalid.value,
      invalidOutcomesSource: invalid.source,
      decisions: Array.isArray(decision.value) ? decision.value : [decision.value],
      decisionSource: decision.source,
    };
  });

  const ablationDesign = bind(sources, EXPORT, 'panel2.design');
  const ablationQuestion = bind(sources, EXPORT, 'panel2.question');
  const ablationReading = bind(sources, EXPORT, 'panel2.reading');
  const forbiddenRendering = bind(sources, EXPORT, 'panel2.forbiddenRendering');

  const ablation = {
    question: ablationQuestion.value,
    questionSource: ablationQuestion.source,
    design: ablationDesign.value,
    designSource: ablationDesign.source,
    /* What the perturbation holds and what it moves, stated as the pair it is.
       "Different evidence" alone is not a controlled comparison; it is only one
       when the intents and the resulting tree are the same on both sides. */
    heldConstant: ['the two intents', 'the final file tree', 'the verifier that judges the outcome'],
    changed: ['the commit history the coupling evidence is mined from'],
    rows: ablationRows,
    reading: ablationReading.value,
    readingSource: ablationReading.source,
    forbiddenRendering: forbiddenRendering.value,
    /* Only the two strings the page renders. `forbiddenControlNames` stays an
       exported constant and never ships in the model: the gate scans the model
       for the phrases a judge must never read, and a list of banned phrases
       travelling inside the artifact being scanned would trip its own check. */
    framing: { recordedLabel: ARM_FRAMING.recordedLabel, recordedNote: ARM_FRAMING.recordedNote },
  };

  /* ---- L3: routes into the verification surface -------------------------
     Addresses live in the model, not in the page, for the reason every other
     value does: the gate can then check each one against the cockpit's own
     declared deep-link contract instead of parsing template literals out of a
     script tag. An address the contract does not declare fails here rather
     than 404-ing in front of a judge. */

  const deepLink = sources[VIEW_MODEL]?.deepLink;
  const cockpitHref = (run, proof, state, guide) => {
    const q = `run=${run}&proof=${proof}&state=${state}${guide ? `&guide=${guide}` : ''}`;
    return `/cockpit?${q}`;
  };
  const ROUTES = [
    {
      id: 'evidence',
      icon: 'evidence',
      title: 'Inspect the frozen evidence',
      blurb: 'The revision the coupling evidence is bound to, and the decision taken on it.',
      run: 'hac330-local', proof: 'local', state: 'run.local.treatment', guide: 'guide.local.evidence-decision',
    },
    {
      id: 'why-changed',
      icon: 'comparison',
      title: 'Why did this decision change?',
      blurb: 'The two recorded conditions side by side, with what was held and what moved.',
      run: 'hac330-local', proof: 'local', state: 'run.local.perturbed', guide: 'guide.local.ablation',
    },
    {
      id: 'raw',
      icon: 'artifact',
      title: 'View the four-arm record and the raw proof',
      blurb: 'The full cockpit: strategy comparison, evidence drawers and raw JSON.',
      run: 'hac330-local', proof: 'local', state: 'run.local.treatment', guide: 'guide.local.free',
    },
    {
      /* Lives only in the cloud section, after the reset. Offering it beside
         the local verification routes would make a different proof class read
         as a peer of the evaluation the reader has just been shown. */
      id: 'cloud',
      icon: 'evidence',
      title: 'Inspect the cloud evidence',
      blurb: 'Receipt digest, revisions, transport provenance, Cloud Logging correlation.',
      run: 'hac340-cloud', proof: 'cloud', state: 'run.cloud.overview',
    },
  ];
  const routeOf = (r) => ({
    id: r.id,
    icon: r.icon,
    title: r.title,
    blurb: r.blurb,
    href: cockpitHref(r.run, r.proof, r.state, r.guide),
    run: r.run,
    proof: r.proof,
    state: r.state,
    guide: r.guide ?? null,
    /* Whether the cockpit's own contract declares this address. False renders
       nothing rather than a link into a refused state. */
    declared: Boolean(deepLink
      && (deepLink.runIds ?? []).includes(r.run)
      && (deepLink.proofClasses ?? []).includes(r.proof)
      && (!r.guide || (deepLink.guideStates ?? []).includes(r.guide))),
  });
  const routes = ROUTES.map(routeOf);
  const verify = {
    heading: 'Now go and check it',
    lead: 'Every figure above resolves to a pointer into a frozen artifact. The cockpit is where those artifacts are opened, compared and read raw.',
    routes: routes.filter((r) => r.declared),
    undeclared: routes.filter((r) => !r.declared).map((r) => r.href),
    contractSource: `${VIEW_MODEL}#deepLink`,
  };

  /* ---- the separate cloud proof ----------------------------------------- */

  const cloudActors = bind(sources, VIEW_MODEL, 'runs.cloud.actors');
  const cloudDecision = bind(sources, VIEW_MODEL, 'runs.cloud.decision.value');
  const cloudObserved = bind(sources, VIEW_MODEL, 'runs.cloud.observation.observed');
  const cloudControls = bind(sources, VIEW_MODEL, 'runs.cloud.negativeControls');
  const cloudControlsNote = bind(sources, VIEW_MODEL, 'runs.cloud.negativeControlsNote');
  const cloudNotOnPath = bind(sources, VIEW_MODEL, 'runs.cloud.notOnPath');
  const cloudNotClaimed = bind(sources, VIEW_MODEL, 'runs.cloud.claimBoundary.notClaimed');
  const cloudProves = bind(sources, VIEW_MODEL, 'runs.cloud.claimBoundary.proves');

  const cloud = {
    /* A different proof class, and the reset is the point. This block carries
       no value from the local evaluation and the local blocks carry none from
       here — the same separation the cockpit enforces between its two runs. */
    heading: 'Separate deployment proof',
    lead: 'One recorded Gemini + Google ADK + Cloud Run traversal through Interlock. A different proof from the evaluation above: it demonstrates participation, not the causal result.',
    actors: cloudActors.value,
    actorsSource: cloudActors.source,
    decision: cloudDecision.value,
    decisionSource: cloudDecision.source,
    observed: cloudObserved.value,
    observedSource: cloudObserved.source,
    controls: cloudControls.value,
    controlsSource: cloudControls.source,
    controlsNote: cloudControlsNote.value,
    notOnPath: cloudNotOnPath.value,
    notOnPathSource: cloudNotOnPath.source,
    proves: cloudProves.value,
    notClaimed: cloudNotClaimed.value,
    notClaimedSource: cloudNotClaimed.source,
  };

  /* ---- boundary ---------------------------------------------------------- */

  const boundedClaim = bind(sources, EXPORT, 'boundedClaim');
  const mustNotClaim = bind(sources, EXPORT, 'mustNotClaim');
  const commit = bind(sources, EXPORT, 'derivedFrom.canonicalResultCommit');
  const experiment = bind(sources, EXPORT, 'experiment');
  const families = bind(sources, EXPORT, 'provenance.families');
  const refusalMismatch = bind(sources, EXPORT, 'limitations.inadmissibleEvidence.exactReasonAgreement.display');
  const refusalStatement = bind(sources, EXPORT, 'limitations.inadmissibleEvidence.statement');
  const outsideScope = bind(sources, EXPORT, 'limitations.outsideScope');

  const boundary = {
    experiment: experiment.value,
    experimentSource: experiment.source,
    canonicalResultCommit: commit.value,
    boundedClaim: boundedClaim.value,
    boundedClaimSource: boundedClaim.source,
    corpusBound: corpusBound.value,
    corpusBoundSource: corpusBound.source,
    families: families.value,
    scope: panel1Scope.value,
    scopeSource: panel1Scope.source,
    /* The negative findings travel with the result. They are one level down
       from L1, not off the page: a claim boundary a reader cannot reach is a
       claim boundary that is not being made. */
    refusalAgreement: refusalMismatch.value,
    refusalStatement: refusalStatement.value,
    outsideScope: outsideScope.value,
    mustNotClaim: mustNotClaim.value,
    mustNotClaimSource: mustNotClaim.source,
  };

  /* ---- unresolved bindings ---------------------------------------------- */

  const probes = [
    intentA, intentB, ceiling, invariant, jointTotal, jointHolds, aloneTotal, aloneHolds,
    crossKeys, crossConcurrent, sameKeys, sameConcurrent,
    serialized, parallelised, missed, credClaim, credNote,
    panel1Reading, panel1Scope, corpusBound,
    ablationDesign, ablationQuestion, ablationReading, forbiddenRendering,
    cloudActors, cloudDecision, cloudObserved, cloudControls, cloudControlsNote,
    cloudNotOnPath, cloudNotClaimed, cloudProves,
    boundedClaim, mustNotClaim, commit, experiment, families,
    refusalMismatch, refusalStatement, outsideScope,
  ];
  const unresolved = probes.filter((p) => !p.resolved).map((p) => p.source);
  for (const s of strategies) {
    for (const [key, cell] of [['label', { source: s.labelSource, value: s.label }],
      ['invalidCoupled', s.invalidCoupled], ['safeParallelRetained', s.safeParallelRetained]]) {
      if (String(cell.value ?? cell.display).startsWith('[BIND:')) unresolved.push(cell.source ?? s.labelSource);
      else if (key !== 'label' && String(cell.display).startsWith('[BIND:')) unresolved.push(cell.source);
    }
  }
  for (const href of verify.undeclared) unresolved.push(`${VIEW_MODEL}#deepLink → ${href}`);
  for (const r of ablationRows) {
    for (const v of [[r.condition, r.conditionSource], [r.invalidOutcomes, r.invalidOutcomesSource]]) {
      if (String(v[0]).startsWith('[BIND:')) unresolved.push(v[1]);
    }
  }

  return {
    issue: 'HAC-349',
    kind: 'judge landing model (derived, presentation only)',
    artifacts: ARTIFACTS,
    scene,
    lock,
    comparison: {
      question: 'Under the co-change evidence that was available, how do four coordination strategies compare?',
      strategies,
      reading: panel1Reading.value,
      readingSource: panel1Reading.source,
      scope: panel1Scope.value,
    },
    ablation,
    verify,
    cloud,
    boundary,
    /* Term and gloss only, for the same reason: `forbidden` is the gate's list,
       not the page's content. */
    glosses: GLOSSES.map(({ term, gloss }) => ({ term, gloss })),
    unresolved,
    resolved: unresolved.length === 0,
    unresolvedLabel: 'Unresolved binding scaffold · not evidence',
    unresolvedNote:
      'A frozen HAC-343 artifact was not readable at build time. The unresolved values render as bindings; no substitute figure is derived from any other run.',
  };
}

/**
 * Every field of the story a judge can read, as one object.
 *
 * Deep-compared by the gate against a rebuild from the frozen artifacts, so a
 * value edited into the model without moving the evidence under it fails rather
 * than shipping.
 */
export function judgeFacing(story) {
  if (!story) return null;
  return {
    issue: story.issue,
    artifacts: story.artifacts,
    scene: story.scene,
    lock: story.lock,
    comparison: story.comparison,
    ablation: story.ablation,
    verify: story.verify,
    cloud: story.cloud,
    boundary: story.boundary,
    glosses: story.glosses,
    resolved: story.resolved,
    unresolved: story.unresolved,
  };
}

/** The fields `judgeFacing` must carry; adding a rendered field without covering it fails the gate. */
export const JUDGE_FACING_FIELDS = [
  'issue', 'artifacts', 'scene', 'lock', 'comparison', 'ablation', 'verify',
  'cloud', 'boundary', 'glosses', 'resolved', 'unresolved',
];
