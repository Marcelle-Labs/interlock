/**
 * HAC-343 — the frozen scenario corpus.
 *
 * Declarative on purpose. A scenario says which family it belongs to, which
 * fixture history it is evaluated against, what the two intents write, and which
 * ground-truth class it carries. It says nothing about what any arm should
 * decide: the labels are properties of the fixture and the intents, assigned by
 * construction, and every arm is scored against them without the arm being
 * consulted.
 *
 * Two families, so a result is not one hazard shape repeated:
 *
 * - `budget`   — arithmetic. Composing two valid increases overshoots a ceiling.
 *                Fixtures reused verbatim from HAC-330; nothing is rebuilt here.
 * - `registry` — referential. One intent removes a referent the other starts
 *                pointing at. No arithmetic, and the hazard is asymmetric.
 *
 * Both families carry all five ground-truth classes, so any per-family
 * divergence in the results is about hazard shape rather than about one family
 * having been given an easier set of cases.
 *
 * @see evidence/metric-definitions.json — frozen first, in its own commit.
 */

/** Ground-truth classes. Must match groundTruthLabels in the metric manifest. */
export const Label = Object.freeze({
  COUPLED: 'COUPLED',
  INDEPENDENT: 'INDEPENDENT',
  SAME_TARGET_CONTENTION: 'SAME_TARGET_CONTENTION',
  EVIDENCE_PERTURBED: 'EVIDENCE_PERTURBED',
  EVIDENCE_INADMISSIBLE: 'EVIDENCE_INADMISSIBLE',
});

/**
 * Inadmissible-evidence sources, reused from the HAC-330 packet rather than
 * re-derived. Each is a real artifact the miner or its absence produced, not a
 * hand-written malformed blob: that is what makes a refusal on them meaningful.
 */
export const INADMISSIBLE_EVIDENCE = Object.freeze({
  absent: { file: null, expectedReason: 'EVIDENCE_ABSENT' },
  shallow: { file: 'shallow.evidence.json', expectedReason: 'HISTORY_NOT_MINED' },
  noRepository: { file: 'no-repository.evidence.json', expectedReason: 'HISTORY_EVIDENCE_UNAVAILABLE' },
  misattributed: { file: 'misattributed.evidence.json', expectedReason: 'EVIDENCE_REPOSITORY_MISMATCH' },
});

// ---------------------------------------------------------------------------
// Family 1 — budget (arithmetic hazard), fixtures from HAC-330
// ---------------------------------------------------------------------------

const reservation = (service, reserved) => ({
  op: 'set-reservation',
  path: `services/${service}/reservation.json`,
  service,
  reserved,
});

const BUDGET = [
  {
    id: 'budget/coupled/alpha-beta',
    family: 'budget',
    label: Label.COUPLED,
    fixture: 'baseline',
    rationale:
      'alpha and beta are historical counterparties at support 8. Each raise is valid alone (120 <= 130); composed they reach 140 > 130.',
    intents: [reservation('alpha', 60), reservation('beta', 60)],
    composeViolatesInvariant: true,
  },
  {
    id: 'budget/independent/alpha-gamma',
    family: 'budget',
    label: Label.INDEPENDENT,
    fixture: 'baseline',
    rationale:
      'alpha and gamma never appear in one commit in the baseline history. Composed they reach 128 <= 130, so permitting both is correct.',
    intents: [reservation('alpha', 60), reservation('gamma', 28)],
    composeViolatesInvariant: false,
  },
  {
    id: 'budget/same-target/alpha-alpha',
    family: 'budget',
    label: Label.SAME_TARGET_CONTENTION,
    fixture: 'baseline',
    rationale:
      'Both intents write services/alpha/reservation.json. Any real lock must serialize this; it exists to prove the lock arms lock.',
    intents: [reservation('alpha', 60), reservation('alpha', 55)],
    composeViolatesInvariant: false,
  },
  {
    id: 'budget/perturbed/alpha-beta',
    family: 'budget',
    label: Label.EVIDENCE_PERTURBED,
    fixture: 'perturbed',
    rationale:
      'Identical intents and identical final tree to budget/coupled/alpha-beta, against a history where alpha and beta never co-occur. The composition is still arithmetically unsafe; only the evidence changed.',
    intents: [reservation('alpha', 60), reservation('beta', 60)],
    composeViolatesInvariant: true,
    perturbationOf: 'budget/coupled/alpha-beta',
  },
  ...Object.entries(INADMISSIBLE_EVIDENCE).map(([key, source]) => ({
    id: `budget/inadmissible/${key}`,
    family: 'budget',
    label: Label.EVIDENCE_INADMISSIBLE,
    fixture: 'baseline',
    rationale: `The coupled intents against ${key} evidence. Correct behavior is explicit refusal with reason ${source.expectedReason}, never a permit.`,
    intents: [reservation('alpha', 60), reservation('beta', 60)],
    composeViolatesInvariant: true,
    evidenceOverride: key,
    expectedRefusalReason: source.expectedReason,
  })),
];

// ---------------------------------------------------------------------------
// Family 2 — registry (referential hazard)
// ---------------------------------------------------------------------------

const removeService = (service) => ({
  op: 'remove-service',
  path: 'registry/services.json',
  service,
});

const addRoute = (path, service) => ({
  op: 'add-route',
  path: 'routing/routes.json',
  route: path,
  service,
});

const bumpDashboards = (revision) => ({
  op: 'bump-dashboards',
  path: 'observability/dashboards.json',
  revision,
});

const REGISTRY = [
  {
    id: 'registry/coupled/retire-vs-route',
    family: 'registry',
    label: Label.COUPLED,
    fixture: 'baseline',
    rationale:
      'services and routes are historical counterparties at support 9. Retiring the unrouted legacy-pricing service is valid alone; routing to it is valid alone; composed the route dangles.',
    intents: [removeService('legacy-pricing'), addRoute('/pricing', 'legacy-pricing')],
    composeViolatesInvariant: true,
  },
  {
    id: 'registry/independent/route-vs-dashboards',
    family: 'registry',
    label: Label.INDEPENDENT,
    fixture: 'baseline',
    rationale:
      'dashboards co-changes only with the runbook, never with services or routes. Adding a route to an existing service and bumping a dashboard revision compose safely.',
    intents: [addRoute('/health', 'checkout'), bumpDashboards(99)],
    composeViolatesInvariant: false,
  },
  {
    id: 'registry/same-target/route-vs-route',
    family: 'registry',
    label: Label.SAME_TARGET_CONTENTION,
    fixture: 'baseline',
    rationale:
      'Both intents write routing/routes.json. Any real lock must serialize this; it exists to prove the lock arms lock.',
    intents: [addRoute('/a', 'checkout'), addRoute('/b', 'inventory')],
    composeViolatesInvariant: false,
  },
  {
    id: 'registry/perturbed/retire-vs-route',
    family: 'registry',
    label: Label.EVIDENCE_PERTURBED,
    fixture: 'perturbed',
    rationale:
      'Identical intents and identical final tree to registry/coupled/retire-vs-route, against a history where services and routes never co-occur. The composition still dangles; only the evidence changed.',
    intents: [removeService('legacy-pricing'), addRoute('/pricing', 'legacy-pricing')],
    composeViolatesInvariant: true,
    perturbationOf: 'registry/coupled/retire-vs-route',
  },
  ...Object.entries(INADMISSIBLE_EVIDENCE).map(([key, source]) => ({
    id: `registry/inadmissible/${key}`,
    family: 'registry',
    label: Label.EVIDENCE_INADMISSIBLE,
    fixture: 'baseline',
    rationale: `The coupled intents against ${key} evidence. Correct behavior is explicit refusal with reason ${source.expectedReason}, never a permit.`,
    intents: [removeService('legacy-pricing'), addRoute('/pricing', 'legacy-pricing')],
    composeViolatesInvariant: true,
    evidenceOverride: key,
    expectedRefusalReason: source.expectedReason,
  })),
];

export const SCENARIOS = Object.freeze([...BUDGET, ...REGISTRY]);

export const FAMILIES = Object.freeze(['budget', 'registry']);

// ---------------------------------------------------------------------------
// Mechanical validation of the corpus requirements
// ---------------------------------------------------------------------------

/**
 * Check every requirement the frozen metric manifest places on the corpus.
 *
 * Returns a list of failures. An empty list is the only acceptable result, and
 * the caller exits non-zero otherwise: a corpus that cannot produce a class
 * silently reports that class's metric as a green zero, which is exactly the
 * "missing-run green state" HAC-319 forbids.
 */
export function validateCorpus(scenarios = SCENARIOS) {
  const failures = [];
  const require = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const byLabel = (label) => scenarios.filter((s) => s.label === label);
  const inFamily = (family) => scenarios.filter((s) => s.family === family);

  // Every class must be populated, or its metric has an empty denominator.
  for (const label of Object.values(Label)) {
    require(byLabel(label).length > 0, `no scenario carries label ${label}`);
  }

  // Two-family breadth: the corpus must not be one hazard shape repeated.
  require(FAMILIES.length >= 2, 'fewer than two families declared');
  for (const family of FAMILIES) {
    require(inFamily(family).length > 0, `family ${family} contributes no scenarios`);
  }

  // Each family must carry every class, or a per-family result is not
  // comparable and a divergence could be class coverage rather than hazard shape.
  for (const family of FAMILIES) {
    for (const label of Object.values(Label)) {
      require(
        inFamily(family).some((s) => s.label === label),
        `family ${family} has no ${label} scenario, so its per-family result is not comparable`,
      );
    }
  }

  // COUPLED must be cross-target, or per-target locking would see it and the
  // experiment would not be testing the distinction it exists to test.
  for (const scenario of byLabel(Label.COUPLED)) {
    const paths = new Set(scenario.intents.map((i) => i.path));
    require(
      paths.size === scenario.intents.length,
      `${scenario.id} is labelled COUPLED but its intents share a path; COUPLED must be cross-target`,
    );
    require(
      scenario.composeViolatesInvariant === true,
      `${scenario.id} is labelled COUPLED but does not violate the invariant when composed`,
    );
  }

  // SAME_TARGET_CONTENTION must genuinely share a path, or the lock validity
  // gate proves nothing.
  for (const scenario of byLabel(Label.SAME_TARGET_CONTENTION)) {
    const paths = new Set(scenario.intents.map((i) => i.path));
    require(
      paths.size === 1,
      `${scenario.id} is labelled SAME_TARGET_CONTENTION but its intents write different paths`,
    );
  }

  // INDEPENDENT must be safe to compose, or permitting it would not be correct.
  for (const scenario of byLabel(Label.INDEPENDENT)) {
    require(
      scenario.composeViolatesInvariant === false,
      `${scenario.id} is labelled INDEPENDENT but violates the invariant when composed`,
    );
  }

  // A perturbation must hold its intents fixed against its counterpart, or the
  // evidence-sensitivity metric measures the intents rather than the evidence.
  for (const scenario of byLabel(Label.EVIDENCE_PERTURBED)) {
    const origin = scenarios.find((s) => s.id === scenario.perturbationOf);
    require(Boolean(origin), `${scenario.id} names no perturbationOf counterpart`);
    if (origin) {
      require(
        JSON.stringify(origin.intents) === JSON.stringify(scenario.intents),
        `${scenario.id} does not hold its intents identical to ${origin.id}; the perturbation is not controlled`,
      );
      require(
        origin.fixture !== scenario.fixture,
        `${scenario.id} uses the same fixture as ${origin.id}; nothing was perturbed`,
      );
    }
  }

  // Every distinct refusal reason the corpus claims must be represented once.
  const reasons = new Set(
    byLabel(Label.EVIDENCE_INADMISSIBLE).map((s) => s.expectedRefusalReason),
  );
  require(
    reasons.size === Object.keys(INADMISSIBLE_EVIDENCE).length,
    `expected ${Object.keys(INADMISSIBLE_EVIDENCE).length} distinct refusal reasons, found ${reasons.size}`,
  );

  // Ids must be unique, or results cannot be joined back to scenarios.
  const ids = scenarios.map((s) => s.id);
  require(new Set(ids).size === ids.length, 'scenario ids are not unique');

  return failures;
}

/** Scenario counts per label and per family, for the manifest and the report. */
export function corpusCounts(scenarios = SCENARIOS) {
  const counts = { total: scenarios.length, byLabel: {}, byFamily: {}, byFamilyAndLabel: {} };
  for (const label of Object.values(Label)) {
    counts.byLabel[label] = scenarios.filter((s) => s.label === label).length;
  }
  for (const family of FAMILIES) {
    const rows = scenarios.filter((s) => s.family === family);
    counts.byFamily[family] = rows.length;
    counts.byFamilyAndLabel[family] = Object.fromEntries(
      Object.values(Label).map((label) => [label, rows.filter((s) => s.label === label).length]),
    );
  }
  return counts;
}
