/**
 * The deterministic Interlock decision for the S2 fallback proxy.
 *
 * One pure function. No filesystem, no network, no clock beyond the instant it
 * is handed, no randomness — and, load-bearing for this gate, **no model**. A
 * language model may propose an intent or explain a denial; nothing a model emits
 * reaches this function, and nothing this function decides depends on one. That
 * is what makes "the decision changed because the evidence changed" checkable.
 *
 * ## Relationship to the S-1 decision function
 *
 * HAC-330 established the semantics this reuses: co-change evidence from the
 * pinned upstream miner, four completeness states kept apart, absence never
 * meaning permission. This is a distinct implementation rather than a shared one,
 * because the S2 question is different. S-1 asked about a fixed set of intents
 * submitted together; S2 asks about *one arriving intent against whatever else is
 * currently in flight*, where the answer depends on a store that can itself fail.
 * The vocabulary is deliberately kept aligned so a decision from either reads the
 * same way in a receipt.
 *
 * ## Absence is never permission
 *
 * Every guard below returns `INSUFFICIENT_EVIDENCE`. `ALLOW_PARALLEL` is
 * reachable only from the last line of the function, after every guard has
 * passed. This is structural, not a convention: there is no early return that
 * permits, so no future edit can accidentally add one without moving the
 * permissive answer upward past a guard, which is visible in review.
 */
import { byCodeUnit } from '../../authorization/canonical.js';
import type { PendingIntent, StoreResult } from './store.js';

/** What Interlock decided about an arriving intent. */
export const Decision = {
  /** Evidence establishes no qualifying coupling with anything in flight. */
  ALLOW_PARALLEL: 'ALLOW_PARALLEL',
  /**
   * A coupling exists, and this intent holds precedence within it.
   *
   * Serialization needs someone to go first. Without this, two simultaneous
   * coupled intents each observe the other and both withhold — safe, but nothing
   * ever proceeds. See `precedenceOf` for why the ordering is deterministic.
   */
  ALLOW_SERIALIZED: 'ALLOW_SERIALIZED',
  /** Evidence shows a qualifying coupling this intent does not lead. Withhold. */
  WITHHOLD_SERIALIZE: 'WITHHOLD_SERIALIZE',
  /** The evidence supports no claim. Fail closed; never read as clean. */
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
} as const;

export type DecisionCode = (typeof Decision)[keyof typeof Decision];

/** Why the decision came out the way it did. Machine-readable, never only prose. */
export const Reason = {
  STORE_UNAVAILABLE: 'STORE_UNAVAILABLE',
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
  SERIALIZED_PRECEDENCE: 'SERIALIZED_PRECEDENCE',
} as const;

export type ReasonCode = (typeof Reason)[keyof typeof Reason];

/** One observed coupling that straddles two uncoordinated writers. */
export interface Coupling {
  readonly correlationIds: readonly [string, string];
  readonly files: readonly [string, string];
  readonly support: number;
  readonly occurrences: number;
}

export interface Verdict {
  readonly decision: DecisionCode;
  readonly reasonCode: ReasonCode;
  readonly detail: string;
  readonly couplings: readonly Coupling[];
  /** Evidence the decision was made from, for the receipt and the record. */
  readonly evidenceRefs: readonly string[];
}

/**
 * Completeness states that carry a claim about a real history.
 *
 * Mirrors `CompletenessState` in `@workspacejson/mining-core`. A state outside
 * this set means the history was not successfully mined, and zero pairs from an
 * unmined history is not "analysed, nothing found".
 */
export const MINED_STATES: readonly string[] = Object.freeze([
  'MINED_NO_QUALIFYING_RELATIONSHIP',
  'QUALIFYING_RELATIONSHIP_OBSERVED',
]);

/** The `SelectionResult` shape this function understands. */
const SUPPORTED_SELECTION_VERSION = 1;

export const DEFAULT_POLICY = Object.freeze({
  /**
   * Distinct commits in which both files changed, required before a pair counts
   * as a coupling. Matches the upstream `DEFAULT_MIN_SUPPORT`, restated here so a
   * consumer that loosens the upstream threshold cannot silently loosen this.
   */
  couplingMinSupport: 3,
});

export interface ArbitrationInput {
  /** The intent that just arrived. */
  readonly candidate: PendingIntent;
  /** Whatever else is in flight — or the store's failure to say. */
  readonly others: StoreResult<readonly PendingIntent[]>;
  /** The evidence envelope, verbatim from the HAC-330 adapter. */
  readonly evidence: unknown;
  /** Revision of the source the intents are being applied against. */
  readonly sourceRevision: string;
  readonly policy?: { readonly couplingMinSupport: number };
}

const NO_COUPLINGS: readonly Coupling[] = Object.freeze([]);

function insufficient(reasonCode: ReasonCode, detail: string, evidenceRefs: readonly string[] = []): Verdict {
  return {
    decision: Decision.INSUFFICIENT_EVIDENCE,
    reasonCode,
    detail,
    couplings: NO_COUPLINGS,
    evidenceRefs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A stable, order-independent key for an unordered pair of paths.
 *
 * NUL separates, because it is the one byte a path cannot contain, so two
 * different pairs cannot collide on it. Written as an escape rather than embedded
 * literally: a raw control byte makes the file read as binary to `git grep`,
 * which would quietly exempt it from every repository-wide scan. That is not
 * hypothetical — it happened during HAC-330 and CI now checks for it.
 */
const SEP = '\u0000';
export const pairKey = (left: string, right: string): string =>
  left < right ? `${left}${SEP}${right}` : `${right}${SEP}${left}`;

interface QualifyingPair {
  readonly files: readonly [string, string];
  readonly support: number;
  readonly occurrences: number;
}

/** Pairs in the evidence that clear the coupling threshold, keyed for lookup. */
function qualifyingPairs(pairs: readonly unknown[], minSupport: number): Map<string, QualifyingPair> {
  const qualifying = new Map<string, QualifyingPair>();
  for (const pair of pairs) {
    if (!isRecord(pair)) continue;
    const files = pair['files'];
    const support = pair['support'];
    const occurrences = pair['occurrences'];
    if (!Array.isArray(files) || files.length !== 2) continue;
    const [left, right] = files as unknown[];
    if (typeof left !== 'string' || typeof right !== 'string') continue;
    if (!Number.isInteger(support) || (support as number) < minSupport) continue;
    qualifying.set(pairKey(left, right), {
      files: [left, right],
      support: support as number,
      occurrences: Number.isInteger(occurrences) ? (occurrences as number) : 0,
    });
  }
  return qualifying;
}

/**
 * Every observed coupling spanning the candidate and something else in flight.
 *
 * Cross-intent only. A coupling between two paths *inside* one intent is not a
 * composition hazard: that intent's own write is atomic. It is the pair
 * straddling two uncoordinated writers that matters.
 */
function findCouplings(
  candidate: PendingIntent,
  others: readonly PendingIntent[],
  qualifying: ReadonlyMap<string, QualifyingPair>,
): Coupling[] {
  const couplings: Coupling[] = [];
  for (const other of others) {
    for (const left of candidate.targets) {
      for (const right of other.targets) {
        const observed = qualifying.get(pairKey(left, right));
        if (observed === undefined) continue;
        couplings.push({
          correlationIds: [candidate.correlationId, other.correlationId],
          files: observed.files,
          support: observed.support,
          occurrences: observed.occurrences,
        });
      }
    }
  }
  return couplings;
}

/**
 * Precedence key for an intent within a coupled set.
 *
 * Earliest recorded wins; correlation id breaks a tie. Both components are
 * already-recorded facts about the intent, so every participant computes the
 * same winner from the same pending set without any further coordination — which
 * is what lets serialization work without a lock service.
 *
 * The tie-break is not decoration. Timestamps collide at millisecond resolution
 * under exactly the conditions this rule exists for, and two intents that both
 * believed they had precedence would compose the pair the decision just refused.
 */
function precedenceOf(intent: PendingIntent): string {
  return `${intent.recordedAt}|${intent.correlationId}`;
}

/** Read a member that is only useful if it is a string, for a failure message. */
function describe(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * The guards that adjudicate whether the evidence may be read at all.
 *
 * Split out of `arbitrate` so that the coupling logic and the admissibility
 * logic can each be followed on their own. Returns a `Verdict` when the evidence
 * is inadmissible, or the facts the caller needs when it is.
 */
function admitEvidence(
  evidence: unknown,
  sourceRevision: string,
):
  | { readonly ok: false; readonly verdict: Verdict }
  | {
      readonly ok: true;
      readonly pairs: readonly unknown[];
      readonly state: string;
      readonly basisRevision: string;
      readonly evidenceRefs: readonly string[];
    } {
  const no = (verdict: Verdict) => ({ ok: false, verdict }) as const;

  // --- Guard 1: the evidence exists at all. ------------------------------
  if (evidence === null || evidence === undefined) {
    return no(
      insufficient(
        Reason.EVIDENCE_ABSENT,
        'no co-change evidence was supplied; absence of evidence is not evidence of independence',
      ),
    );
  }

  if (!isRecord(evidence)) {
    return no(insufficient(Reason.EVIDENCE_MALFORMED, 'the evidence envelope is not an object'));
  }

  const selection = evidence['selection'];
  if (!isRecord(selection)) {
    return no(
      insufficient(Reason.EVIDENCE_MALFORMED, 'the evidence envelope carries no selection object'),
    );
  }

  // --- Guard 2: it is a shape we know how to read. -----------------------
  const completeness = selection['completeness'];
  const pairs = selection['pairs'];
  if (!isRecord(completeness) || typeof completeness['state'] !== 'string' || !Array.isArray(pairs)) {
    return no(
      insufficient(
        Reason.EVIDENCE_MALFORMED,
        'the selection is missing completeness or pairs; a partial artifact cannot be read as a clean one',
      ),
    );
  }

  if (selection['l0SelectionVersion'] !== SUPPORTED_SELECTION_VERSION) {
    return no(
      insufficient(
        Reason.EVIDENCE_VERSION_UNSUPPORTED,
        `selection version ${describe(selection['l0SelectionVersion'], 'of an unreadable type')} is not ` +
          `${SUPPORTED_SELECTION_VERSION}; an unknown shape may mean different fields, not merely more of them`,
      ),
    );
  }

  // --- Guard 3: the history was actually mined. --------------------------
  //
  // A shallow clone, a missing repository and an unreadable history all yield
  // zero pairs. Zero pairs must not read as "analysed, nothing found".
  const state = completeness['state'];
  if (!MINED_STATES.includes(state)) {
    return no(
      insufficient(
        state === 'EVIDENCE_UNAVAILABLE'
          ? Reason.HISTORY_EVIDENCE_UNAVAILABLE
          : Reason.HISTORY_NOT_MINED,
        `completeness is ${state}; the history behind this evidence was not successfully mined`,
      ),
    );
  }

  // --- Guard 4: the evidence is about the repository being mutated. ------
  //
  // Git resolves a path by walking up until it finds a repository, so mining a
  // directory that is not itself a repository succeeds against the nearest
  // ancestor and returns a well-formed MINED result about the wrong subject. No
  // completeness state covers this — the analysis really did run — which is why
  // this sits after the completeness check. Observed during HAC-330.
  const source = isRecord(evidence['source']) ? evidence['source'] : null;
  if (source?.['isRequestedRepository'] !== true) {
    return no(
      insufficient(
        Reason.EVIDENCE_REPOSITORY_MISMATCH,
        'the evidence is not attributed to the repository it names: requested ' +
          `${describe(source?.['repository'], '(none)')}, mined ${describe(source?.['toplevel'], '(no repository)')}`,
      ),
    );
  }

  // --- Guard 5: the claim is pinned to exactly one commit. ---------------
  const scoringBasis = isRecord(selection['scoringBasis']) ? selection['scoringBasis'] : null;
  const basisRevision = scoringBasis?.['basisRevision'];
  if (typeof basisRevision !== 'string' || basisRevision === '') {
    return no(
      insufficient(
        Reason.NO_BASIS_PIN,
        'the selection carries no basisRevision; an unpinned observation cannot be recounted and asserts nothing',
      ),
    );
  }

  const artifact = isRecord(evidence['artifact']) ? evidence['artifact'] : null;
  const evidenceRefs = [
    `basis:${basisRevision}`,
    // `unknown` rather than an omitted reference: a reader of the receipt must
    // be able to tell "not recorded" from "not checked".
    `artifact:sha256:${describe(artifact?.['sha256'], 'unknown')}`,
  ];

  // --- Guard 6: the claim is about the state being mutated. --------------
  //
  // A stale observation is unknown, not clean: the coupling this composition
  // would breach may have been introduced after the basis commit.
  if (basisRevision !== sourceRevision) {
    return no(
      insufficient(
        Reason.STALE_BASIS,
        `evidence is pinned to ${basisRevision} but the intents target ${sourceRevision}; ` +
          'a stale observation is unknown, not clean',
        evidenceRefs,
      ),
    );
  }

  return { ok: true, pairs, state, basisRevision, evidenceRefs };
}

/**
 * Decide whether an arriving intent may proceed alongside what is in flight.
 *
 * @returns a verdict that is safe to serialize into a receipt or a denial. The
 * caller mints a receipt only for `ALLOW_PARALLEL`; every other outcome stops
 * before the protected operation is contacted at all.
 */
export function arbitrate(input: ArbitrationInput): Verdict {
  const policy = input.policy ?? DEFAULT_POLICY;

  // --- Guard 0: we know what else is in flight. --------------------------
  //
  // First, because it is the guard most likely to be got wrong by omission: a
  // store failure that fell through to "no other intents" would read as safe.
  if (!input.others.ok) {
    return insufficient(
      Reason.STORE_UNAVAILABLE,
      `the pending-intent store could not be read (${input.others.detail}); ` +
        'an unanswered question about what else is in flight is not an answer of "nothing"',
    );
  }

  // --- Guards 1-6: is this evidence admissible at all? -------------------
  //
  // Extracted so that admissibility and coupling can each be read on their
  // own. Every failure inside it returns INSUFFICIENT_EVIDENCE.
  const admissible = admitEvidence(input.evidence, input.sourceRevision);
  if (!admissible.ok) return admissible.verdict;

  const { pairs, state, basisRevision, evidenceRefs } = admissible;

  // --- The claim is admissible. Read it. ---------------------------------
  const couplings = findCouplings(
    input.candidate,
    input.others.value,
    qualifyingPairs(pairs, policy.couplingMinSupport),
  );

  if (couplings.length > 0) {
    // Serialization, not mutual refusal. Exactly one member of a coupled set
    // proceeds; every other member withholds and revalidates later. The
    // composition still never happens, which is the safety property — what this
    // adds is that the system makes progress while holding it.
    const contended = new Set(couplings.flatMap((coupling) => coupling.correlationIds));
    const leader = [input.candidate, ...input.others.value.filter((other) => contended.has(other.correlationId))]
      .map(precedenceOf)
      .sort(byCodeUnit)[0];

    if (leader !== precedenceOf(input.candidate)) {
      return {
        decision: Decision.WITHHOLD_SERIALIZE,
        reasonCode: Reason.COUPLING_OBSERVED,
        detail:
          `${couplings.length} qualifying co-change coupling(s) between this intent and ${input.others.value.length} ` +
          `intent(s) already in flight at basis ${basisRevision}; this intent does not hold precedence, so the ` +
          'composition is withheld and it must be resubmitted once the leading intent settles',
        couplings,
        evidenceRefs,
      };
    }

    return {
      decision: Decision.ALLOW_SERIALIZED,
      reasonCode: Reason.SERIALIZED_PRECEDENCE,
      detail:
        `${couplings.length} qualifying co-change coupling(s) at basis ${basisRevision}; this intent holds ` +
        'precedence within the coupled set and proceeds alone while the others are withheld',
      couplings,
      evidenceRefs,
    };
  }

  // Reachable only after every guard passed, which is the point: a positive
  // finding from a mined history, not a fallback.
  return {
    decision: Decision.ALLOW_PARALLEL,
    reasonCode: Reason.NO_QUALIFYING_COUPLING,
    detail:
      `history at ${basisRevision} was mined (${state}) and shows no pair between this intent and the ` +
      `${input.others.value.length} intent(s) in flight at support >= ${policy.couplingMinSupport}`,
    couplings: NO_COUPLINGS,
    evidenceRefs,
  };
}
