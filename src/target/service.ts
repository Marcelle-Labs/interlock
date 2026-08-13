/**
 * The protected target as a transport-independent service.
 *
 * Separated from its HTTP adapter so that the enforcement tests can attack the
 * service *directly* — with receipts no well-behaved proxy would ever emit — and
 * so the same object can be driven over a real socket without a second copy of
 * the rules. If the rules lived in the HTTP handler, the direct attacks would be
 * testing something other than what production runs.
 *
 * ## The one invariant this file exists to hold
 *
 * **No protected side effect happens before admission succeeds.** Every refusal
 * path returns without touching state, and the mutation is the last thing that
 * runs. The tests assert the state and revision are unchanged after every
 * rejection, because "rejected" and "rejected without side effect" are different
 * claims and only the second one is worth anything.
 */
import type { Intent } from '../authorization/intent.js';
import { intentDigest } from '../authorization/intent.js';
import type { VerificationKeys } from '../authorization/receipt.js';
import type { AdmissionRejectionCode } from '../broker/bypass/guard.js';
import { admit } from '../broker/bypass/guard.js';
import type { ReplayLedger } from '../broker/idempotency/ledger.js';
import { genesisRevision, nextRevision } from '../broker/revision/revision.js';
import type { InvariantReport, ReservationState } from './state.js';
import {
  INITIAL_STATE,
  OPERATION_SET_RESERVATION,
  applyMutation,
  asCanonical,
  readSetReservation,
} from './state.js';

/**
 * Refusals the target itself adds, beyond the admission gate's.
 *
 * Enumerated rather than widened to `string`: a union with `string` in it is
 * just `string`, which would let a typo in a refusal code compile and would stop
 * the compiler from telling a caller which codes it has to handle.
 */
export const TargetRejection = {
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  MALFORMED_ARGUMENTS: 'MALFORMED_ARGUMENTS',
  UNKNOWN_SERVICE: 'UNKNOWN_SERVICE',
  INVARIANT_BREACH: 'INVARIANT_BREACH',
} as const;

export type TargetRejectionCode =
  | AdmissionRejectionCode
  | (typeof TargetRejection)[keyof typeof TargetRejection];

export interface TargetRequest {
  readonly correlationId: string;
  /** The receipt as presented, if any. `null` is the bypass case. */
  readonly presented: unknown;
  readonly intent: Intent;
  /** Caller identity the target itself observed, when the transport supplies one. */
  readonly callerIdentity?: string | undefined;
  readonly now: Date;
}

export type TargetResponse =
  | {
      readonly status: 'EXECUTED';
      readonly correlationId: string;
      readonly receiptId: string;
      readonly revisionBefore: string;
      readonly revisionAfter: string;
      readonly state: ReservationState;
      readonly invariant: InvariantReport;
    }
  | {
      readonly status: 'REJECTED';
      readonly correlationId: string;
      readonly reasonCode: TargetRejectionCode;
      readonly detail: string;
      /** Unchanged. Returned so a caller can see nothing moved. */
      readonly revision: string;
    };

export interface ProtectedTargetOptions {
  readonly targetId: string;
  /** Public halves of the keys whose receipts this target will honour. */
  readonly keys: VerificationKeys;
  readonly ledger: ReplayLedger;
  readonly initialState?: ReservationState;
}

export class ProtectedTarget {
  private currentState: ReservationState;
  private currentRevision: string;
  private readonly targetId: string;
  private readonly keys: VerificationKeys;
  private readonly ledger: ReplayLedger;

  public constructor(options: ProtectedTargetOptions) {
    this.targetId = options.targetId;
    this.keys = options.keys;
    this.ledger = options.ledger;
    this.currentState = options.initialState ?? INITIAL_STATE;
    this.currentRevision = genesisRevision(this.targetId, asCanonical(this.currentState));
  }

  public get revision(): string {
    return this.currentRevision;
  }

  public get state(): ReservationState {
    return this.currentState;
  }

  /** An independent read of the target's state. Used by the verifier arm. */
  public read(): { readonly state: ReservationState; readonly revision: string } {
    return { state: this.currentState, revision: this.currentRevision };
  }

  private refuse(
    correlationId: string,
    reasonCode: TargetRejectionCode,
    detail: string,
  ): TargetResponse {
    return { status: 'REJECTED', correlationId, reasonCode, detail, revision: this.currentRevision };
  }

  /**
   * Execute a protected mutation, if and only if it is authorized.
   *
   * The order is the contract: operation recognised, arguments readable, receipt
   * admitted, and only then the mutation. Reordering any of these — in
   * particular, applying the mutation before admission and rolling back on
   * refusal — would create a window in which the protected effect exists.
   */
  public mutate(request: TargetRequest): TargetResponse {
    if (request.intent.operation !== OPERATION_SET_RESERVATION) {
      return this.refuse(
        request.correlationId,
        'UNSUPPORTED_OPERATION',
        `this target implements ${OPERATION_SET_RESERVATION} only, received ${request.intent.operation}`,
      );
    }

    const mutation = readSetReservation(request.intent.arguments);
    if (mutation === null) {
      return this.refuse(
        request.correlationId,
        'MALFORMED_ARGUMENTS',
        'arguments must be { service: string, reserved: non-negative integer }',
      );
    }

    // The digest is computed from what *this* service received, never taken from
    // the receipt. That is what makes the intent binding meaningful.
    const verdict = admit({
      presented: request.presented,
      ledger: this.ledger,
      expectations: {
        targetId: this.targetId,
        currentRevision: this.currentRevision,
        operation: request.intent.operation,
        intentDigest: intentDigest(request.intent),
        now: request.now,
        keys: this.keys,
        callerIdentity: request.callerIdentity,
      },
    });

    if (!verdict.admitted) {
      return this.refuse(request.correlationId, verdict.reasonCode, verdict.detail);
    }

    // --- Admitted. Everything below this line is the protected side effect. ---

    const result = applyMutation(this.currentState, mutation);
    if (!result.ok) {
      return this.refuse(request.correlationId, result.reasonCode, result.detail);
    }

    const revisionBefore = this.currentRevision;
    this.currentState = result.state;
    this.currentRevision = nextRevision(
      revisionBefore,
      { operation: request.intent.operation, service: mutation.service, reserved: mutation.reserved },
      asCanonical(result.state),
    );

    return {
      status: 'EXECUTED',
      correlationId: request.correlationId,
      receiptId: verdict.claims.receiptId,
      revisionBefore,
      revisionAfter: this.currentRevision,
      state: result.state,
      invariant: result.invariant,
    };
  }
}
