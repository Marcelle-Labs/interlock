/**
 * The Interlock decision function.
 *
 * One pure function, used unchanged by every arm of the HAC-330 experiment. It
 * takes pending intents and one co-change evidence artifact and answers a
 * single question: may these intents be composed without coordination?
 *
 * Pure by construction — no filesystem, no network, no clock, no randomness. The
 * only inputs are its arguments, which is what makes "the decision changed
 * because the evidence changed" a checkable claim rather than an assertion.
 *
 * ## Evidence is consumed, never invented
 *
 * `evidence.selection` is the verbatim output of the pinned upstream
 * `mine -> score -> select` pipeline in `@workspacejson/mining-core`. This
 * module reads it and does not construct, extend, or repair it. If it is
 * absent, unreadable, unpinned, stale, or carries a completeness state that is
 * not a claim about a real history, the answer is `INSUFFICIENT_EVIDENCE`.
 *
 * ## Absence is never permission
 *
 * The upstream package keeps four completeness states apart precisely so that
 * "we looked and found nothing" cannot be confused with "we never looked". This
 * function inherits that obligation: **no guard failure returns
 * `ALLOW_PARALLEL`.** A repository that was never successfully mined is unknown,
 * not safe. That is the empty-green failure HAC-330 forbids, and it is enforced
 * here by structure — every early return is `INSUFFICIENT_EVIDENCE`, and the
 * permissive answer is reachable only from the bottom of the function, after
 * every guard has passed.
 */

/** What Interlock decided to do with a set of pending intents. */
export const Decision = {
  /** Evidence establishes no qualifying coupling. The intents may compose freely. */
  ALLOW_PARALLEL: 'ALLOW_PARALLEL',
  /** Evidence shows a qualifying coupling. Withhold the composition and serialize. */
  WITHHOLD_SERIALIZE: 'WITHHOLD_SERIALIZE',
  /** The evidence does not support any claim. Fail closed; never treat as clean. */
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
};

/** Why a decision came out the way it did. Never only prose. */
export const Reason = {
  EVIDENCE_ABSENT: 'EVIDENCE_ABSENT',
  EVIDENCE_MALFORMED: 'EVIDENCE_MALFORMED',
  EVIDENCE_VERSION_UNSUPPORTED: 'EVIDENCE_VERSION_UNSUPPORTED',
  HISTORY_NOT_MINED: 'HISTORY_NOT_MINED',
  HISTORY_EVIDENCE_UNAVAILABLE: 'HISTORY_EVIDENCE_UNAVAILABLE',
  EVIDENCE_REPOSITORY_MISMATCH: 'EVIDENCE_REPOSITORY_MISMATCH',
  NO_BASIS_PIN: 'NO_BASIS_PIN',
  STALE_BASIS: 'STALE_BASIS',
  COUPLING_OBSERVED: 'COUPLING_OBSERVED',
  NO_QUALIFYING_COUPLING: 'NO_QUALIFYING_COUPLING',
};

/**
 * Completeness states that carry a claim about a real history.
 *
 * Mirrors `CompletenessState` in `@workspacejson/mining-core`. The strings are
 * the upstream contract; `assertCompletenessVocabulary` in the test suite checks
 * this set against the package's own export so a rename upstream fails loudly
 * here instead of silently widening what counts as mined.
 */
export const MINED_STATES = Object.freeze(['MINED_NO_QUALIFYING_RELATIONSHIP', 'QUALIFYING_RELATIONSHIP_OBSERVED']);

/** The `SelectionResult` shape this function understands. */
const SUPPORTED_SELECTION_VERSION = 1;

export const DEFAULT_POLICY = Object.freeze({
  /**
   * Distinct commits in which both files changed, required before a pair is
   * treated as a coupling. Matches the upstream `DEFAULT_MIN_SUPPORT`, which is
   * also the threshold `select` already applied; re-stating it here means a
   * consumer that loosens the upstream threshold cannot silently loosen this.
   */
  couplingMinSupport: 3,
});

const decision = (decision, reason, detail, extra = {}) => ({ decision, reason, detail, ...extra });

/**
 * A stable, order-independent key for an unordered pair of paths.
 *
 * NUL is the separator because it is the one byte a path cannot contain, so
 * two different pairs can never collide on it. It is written as an escape
 * rather than embedded literally: a raw control byte makes the source read as
 * binary, and `git grep` silently skips binary files, which would quietly
 * exempt this file from every repository-wide check that scans source.
 */
const SEP = '\u0000';
export const pairKey = (a, b) => (a < b ? `${a}${SEP}${b}` : `${b}${SEP}${a}`);

/** The pairs in the evidence that clear the coupling threshold, keyed for lookup. */
function qualifyingPairs(selection, minSupport) {
  const qualifying = new Map();
  for (const pair of selection.pairs) {
    if (!Array.isArray(pair.files) || pair.files.length !== 2) continue;
    if (!Number.isInteger(pair.support) || pair.support < minSupport) continue;
    qualifying.set(pairKey(pair.files[0], pair.files[1]), pair);
  }
  return qualifying;
}

/**
 * Every observed coupling that spans two *different* pending intents.
 *
 * Cross-intent only. A coupling between two paths inside a single intent is not
 * a composition hazard, because that intent's own write is already atomic. It is
 * the pair straddling two uncoordinated writers that matters.
 */
function findCouplings(intents, qualifying) {
  const couplings = [];
  for (let i = 0; i < intents.length; i += 1) {
    for (let j = i + 1; j < intents.length; j += 1) {
      for (const left of intents[i].targets) {
        for (const right of intents[j].targets) {
          const observed = qualifying.get(pairKey(left, right));
          if (observed === undefined) continue;
          couplings.push({
            intents: [intents[i].id, intents[j].id],
            files: [...observed.files],
            support: observed.support,
            occurrences: observed.occurrences,
          });
        }
      }
    }
  }
  return couplings;
}

/**
 * Decide whether a set of pending intents may be composed without coordination.
 *
 * @param {object} input
 * @param {ReadonlyArray<{id: string, targets: ReadonlyArray<string>}>} input.intents
 * @param {object|null|undefined} input.evidence  Envelope carrying `selection`.
 * @param {string} input.targetRevision  The revision the intents will be applied to.
 * @param {object} [input.policy]
 */
export function decide({ intents, evidence, targetRevision, policy = DEFAULT_POLICY }) {
  // --- Guard 1: the evidence exists at all. ------------------------------
  if (evidence === null || evidence === undefined) {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.EVIDENCE_ABSENT,
      'no co-change evidence was supplied; absence of evidence is not evidence of independence',
    );
  }

  const selection = evidence.selection;
  if (selection === null || typeof selection !== 'object') {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.EVIDENCE_MALFORMED,
      'the evidence envelope carries no selection object',
    );
  }

  // --- Guard 2: it is the shape we know how to read. ---------------------
  const malformed =
    typeof selection.completeness !== 'object' ||
    selection.completeness === null ||
    typeof selection.completeness.state !== 'string' ||
    typeof selection.receipt !== 'object' ||
    selection.receipt === null ||
    !Array.isArray(selection.pairs);
  if (malformed) {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.EVIDENCE_MALFORMED,
      'the selection is missing completeness, receipt, or pairs; a partial artifact cannot be read as a clean one',
    );
  }

  if (selection.l0SelectionVersion !== SUPPORTED_SELECTION_VERSION) {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.EVIDENCE_VERSION_UNSUPPORTED,
      `selection version ${String(selection.l0SelectionVersion)} is not ${SUPPORTED_SELECTION_VERSION}; an unknown shape may mean different fields, not merely more of them`,
    );
  }

  // --- Guard 3: the history was actually mined. --------------------------
  //
  // The upstream package refuses to collapse these four states, and this is the
  // consumer that would otherwise undo that work. A shallow clone, a missing
  // repository and an unreadable history all yield zero pairs, and zero pairs
  // must not read as "analysed, nothing found".
  const state = selection.completeness.state;
  if (!MINED_STATES.includes(state)) {
    const unavailable = state === 'EVIDENCE_UNAVAILABLE';
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      unavailable ? Reason.HISTORY_EVIDENCE_UNAVAILABLE : Reason.HISTORY_NOT_MINED,
      `completeness is ${state} (${selection.completeness.reason}): ${selection.completeness.detail}`,
      { completeness: selection.completeness },
    );
  }

  // --- Guard 4: the evidence is about the repository we are mutating. ----
  //
  // Git resolves a path by walking up until it finds a repository, so mining a
  // directory that is not itself a repository succeeds against the nearest
  // ancestor and returns a well-formed MINED result about the wrong subject.
  // No completeness state covers this — the analysis really did run, which is
  // why this guard sits *after* the completeness check rather than before it — so
  // attribution is checked explicitly. Observed during HAC-330; recorded in the
  // packet as a producer limitation and defended here rather than upstream.
  if (evidence.source?.isRequestedRepository !== true) {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.EVIDENCE_REPOSITORY_MISMATCH,
      `the evidence is not attributed to the repository it names: requested ${evidence.source?.repository ?? '(none)'}, mined ${evidence.source?.toplevel ?? '(no repository)'}`,
      { source: evidence.source ?? null },
    );
  }

  // --- Guard 5: the claim is pinned to exactly one commit. ---------------
  const basisRevision = selection.scoringBasis?.basisRevision;
  if (typeof basisRevision !== 'string' || basisRevision === '') {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.NO_BASIS_PIN,
      'the selection carries no basisRevision; an unpinned observation cannot be recounted and asserts nothing',
    );
  }

  // --- Guard 6: the claim is about the state we are mutating. ------------
  //
  // A-009 defines "pin != current revision" as a reader state meaning *stale
  // observation*. Stale is unknown, not clean: the coupling this composition
  // would breach may have been introduced after the basis commit.
  if (basisRevision !== targetRevision) {
    return decision(
      Decision.INSUFFICIENT_EVIDENCE,
      Reason.STALE_BASIS,
      `evidence is pinned to ${basisRevision} but the intents target ${targetRevision}; a stale observation is unknown, not clean`,
      { basisRevision, targetRevision },
    );
  }

  // --- The claim is admissible. Read it. ---------------------------------
  const couplings = findCouplings(intents, qualifyingPairs(selection, policy.couplingMinSupport));

  if (couplings.length > 0) {
    return decision(
      Decision.WITHHOLD_SERIALIZE,
      Reason.COUPLING_OBSERVED,
      `${couplings.length} qualifying co-change coupling(s) between the pending intents at basis ${basisRevision}; the composition is withheld and the intents are serialized with revalidation`,
      { basisRevision, couplings },
    );
  }

  // Reachable only after every guard above passed, which is the point: this is
  // a positive finding from a mined history, not a fallback.
  return decision(
    Decision.ALLOW_PARALLEL,
    Reason.NO_QUALIFYING_COUPLING,
    `history at ${basisRevision} was mined (${state}) and shows no pair between the pending intents at support >= ${policy.couplingMinSupport}`,
    { basisRevision, pairsConsidered: selection.pairs.length },
  );
}
