/**
 * The spent-nonce ledger — the target's replay defence.
 *
 * A receipt is a bearer token. Everything else about it can be perfect —
 * authentic signature, matching intent, current revision, unexpired — and it is
 * still exactly as valid the second time it is presented as the first. Only a
 * record of what has already been spent can tell those two apart.
 *
 * The ledger lives at the *target*, not the proxy. A proxy-side ledger would only
 * stop a replay that came back through the proxy, which is not the interesting
 * case: the interesting case is a receipt captured and presented directly to the
 * target, and only the target can refuse that.
 *
 * ## Claim before execute, always
 *
 * `claim` is the commit point. The nonce is recorded as spent *before* the
 * mutation runs, never after, because the window between "executed" and
 * "recorded" is precisely a replay window — a crash inside it leaves an
 * authorization that has taken effect and is still spendable. Failing the other
 * way costs at most one refused legitimate retry, which is recoverable; failing
 * this way costs a duplicated mutation, which may not be.
 */

/** What happened when a nonce was claimed. */
export const ClaimOutcome = {
  /** First presentation. The caller may proceed. */
  CLAIMED: 'CLAIMED',
  /** Already spent. This is a replay; refuse. */
  ALREADY_SPENT: 'ALREADY_SPENT',
  /** The ledger could not answer. Refuse — an unanswerable question is not a yes. */
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type ClaimOutcomeCode = (typeof ClaimOutcome)[keyof typeof ClaimOutcome];

export interface ClaimResult {
  readonly outcome: ClaimOutcomeCode;
  readonly detail: string;
}

/**
 * Records which authorizations have been spent.
 *
 * An interface rather than a concrete class because the chaos arm needs a
 * backend that fails, and a fake that throws from a subclass would be testing the
 * test rather than the contract.
 */
export interface ReplayLedger {
  /** Atomically record `nonce` as spent, reporting whether it already was. */
  claim(nonce: string): ClaimResult;
}

/**
 * In-memory ledger.
 *
 * Sufficient for a single-instance S2 target and honest about it: this does not
 * survive a restart and does not coordinate between instances. HAC-327 owns
 * restart safety and HAC-317 owns the durable ledger. Recording that boundary
 * here keeps a reader from mistaking the fixture for the production answer.
 */
export class InMemoryReplayLedger implements ReplayLedger {
  private readonly spent = new Set<string>();

  public claim(nonce: string): ClaimResult {
    if (this.spent.has(nonce)) {
      return {
        outcome: ClaimOutcome.ALREADY_SPENT,
        detail: `nonce ${nonce} was already spent; this authorization has been used`,
      };
    }
    this.spent.add(nonce);
    return { outcome: ClaimOutcome.CLAIMED, detail: `nonce ${nonce} recorded as spent` };
  }

  /** How many authorizations have been spent. For the evidence packet. */
  public get size(): number {
    return this.spent.size;
  }
}

/**
 * A ledger that cannot answer, for the chaos arm.
 *
 * Returns `UNAVAILABLE` rather than throwing so the failure travels as a value
 * through the same path a real outage would take — a thrown exception could be
 * caught somewhere that turns it into a generic 500, which is exactly the sort of
 * accidental bypass this arm is meant to detect.
 */
export class UnavailableReplayLedger implements ReplayLedger {
  public constructor(private readonly reason = 'ledger backend unreachable') {}

  public claim(nonce: string): ClaimResult {
    return {
      outcome: ClaimOutcome.UNAVAILABLE,
      detail: `cannot determine whether nonce ${nonce} was spent: ${this.reason}`,
    };
  }
}
