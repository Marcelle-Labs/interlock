/**
 * The target-side admission gate — the final enforcement boundary.
 *
 * Everything upstream of this is advice. The proxy decided, the receipt records
 * that decision, the network delivered it; none of that is authority. This
 * function is where a protected side effect is permitted or refused, and it
 * answers from the bytes in front of it alone.
 *
 * ## Why "the proxy would never send that" is not a defence
 *
 * The HAC-326 test suite attacks this gate *directly*, with requests the proxy
 * would never emit: no receipt, a receipt for another target, a receipt whose
 * arguments were edited after signing, a receipt presented twice. Those requests
 * are not hypothetical — a protected service is reachable by anything that can
 * route to it, and a system whose safety depends on every client being
 * well-behaved has no safety property at all, only a convention.
 *
 * ## Order is part of the contract
 *
 * Authenticity first, then bindings, then replay, and only then the side effect:
 *
 * 1. `verifyReceipt` establishes the receipt is genuine and authorizes *this*
 *    request against *this* revision.
 * 2. The nonce is claimed, which is the commit point — recorded spent before the
 *    mutation runs, so a crash mid-mutation cannot leave a spendable
 *    authorization behind.
 * 3. Only then does the caller execute.
 *
 * The gate itself never executes anything. It returns a verdict and the caller
 * performs the mutation, so that "was it authorized" and "what did it do" stay
 * separable in the record — which is what keeps acknowledgement distinct from
 * observation.
 */
import type { ReceiptClaims, ReceiptExpectations, ReceiptRejectionCode } from '../../authorization/receipt.js';
import { ReceiptRejection, verifyReceipt } from '../../authorization/receipt.js';
import type { ReplayLedger } from '../idempotency/ledger.js';
import { ClaimOutcome } from '../idempotency/ledger.js';

/** Refusal codes the gate can add beyond the receipt's own. */
export const AdmissionRejection = {
  REPLAYED: 'RECEIPT_REPLAYED',
  LEDGER_UNAVAILABLE: 'REPLAY_LEDGER_UNAVAILABLE',
} as const;

export type AdmissionRejectionCode =
  | ReceiptRejectionCode
  | (typeof AdmissionRejection)[keyof typeof AdmissionRejection];

export type AdmissionVerdict =
  | { readonly admitted: true; readonly claims: ReceiptClaims }
  | {
      readonly admitted: false;
      readonly reasonCode: AdmissionRejectionCode;
      readonly detail: string;
    };

export interface AdmissionInput {
  /** The receipt as presented, or `null`/`undefined` when none was. */
  readonly presented: unknown;
  readonly expectations: ReceiptExpectations;
  readonly ledger: ReplayLedger;
}

/**
 * Decide whether a protected mutation may proceed.
 *
 * @returns `admitted: true` only when the receipt is authentic, binds to exactly
 * this request and revision, is unexpired, and has not been spent before.
 */
export function admit(input: AdmissionInput): AdmissionVerdict {
  const verdict = verifyReceipt(input.presented, input.expectations);
  if (!verdict.ok) {
    return { admitted: false, reasonCode: verdict.reasonCode, detail: verdict.detail };
  }

  const claim = input.ledger.claim(verdict.claims.nonce);

  switch (claim.outcome) {
    case ClaimOutcome.CLAIMED:
      return { admitted: true, claims: verdict.claims };

    case ClaimOutcome.ALREADY_SPENT:
      return {
        admitted: false,
        reasonCode: AdmissionRejection.REPLAYED,
        detail: claim.detail,
      };

    // An unanswerable replay question is not a "no replay". Refuse.
    case ClaimOutcome.UNAVAILABLE:
    default:
      return {
        admitted: false,
        reasonCode: AdmissionRejection.LEDGER_UNAVAILABLE,
        detail: `${claim.detail}; refusing rather than risking a duplicate protected mutation`,
      };
  }
}

/**
 * Whether a refusal means "no receipt was presented at all".
 *
 * Kept explicit because this is the bypass case — the request that skipped the
 * proxy entirely — and the evidence packet reports it separately from receipts
 * that were presented and found wanting.
 */
export function isBypassAttempt(verdict: AdmissionVerdict): boolean {
  return !verdict.admitted && verdict.reasonCode === ReceiptRejection.ABSENT;
}
