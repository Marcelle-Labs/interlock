/**
 * The protected resource.
 *
 * A capacity pool with per-service reservations, carried over from the HAC-330
 * fixture so that S-1's counterfactual and S2's enforcement path are talking
 * about the same hazard. The shape matters less than one property: **each
 * mutation is individually valid, and a pair of them need not be.** That is what
 * makes the hazard invisible to any check that examines one request at a time,
 * and it is why an enforcement point that only validates single requests cannot
 * be the answer.
 *
 * The invariant here — reservations never exceed the pool — is the *ground
 * truth* for whether harm occurred. It is not the enforcement mechanism. A real
 * protected system usually cannot detect the harm locally at all; this fixture
 * can, which is what lets the experiment prove that the composition it withheld
 * would in fact have breached something.
 */
import type { CanonicalValue } from '../authorization/canonical.js';

export interface ReservationState {
  readonly totalReservable: number;
  /** Reserved units per service, keyed by service name. */
  readonly services: Readonly<Record<string, number>>;
}

/** One protected mutation: set a service's reservation. */
export interface SetReservation {
  readonly service: string;
  readonly reserved: number;
}

export const OPERATION_SET_RESERVATION = 'set_reservation';

/** The initial state every run of the experiment starts from. */
export const INITIAL_STATE: ReservationState = Object.freeze({
  totalReservable: 130,
  services: Object.freeze({ alpha: 40, beta: 40, gamma: 20 }),
});

/**
 * The evidence-namespace path a service's reservation lives at.
 *
 * This is the join between the protected resource and the co-change evidence:
 * the miner observed these paths co-changing in real commit history, and the
 * decision is expressed over the same strings.
 */
export function reservationPath(service: string): string {
  return `services/${service}/reservation.json`;
}

/** Total currently reserved across all services. */
export function totalReserved(state: ReservationState): number {
  return Object.values(state.services).reduce((sum, reserved) => sum + reserved, 0);
}

export interface InvariantReport {
  readonly holds: boolean;
  readonly total: number;
  readonly totalReservable: number;
  readonly detail: string;
}

/** The target's own integrity check. Ground truth for whether harm occurred. */
export function checkInvariant(state: ReservationState): InvariantReport {
  const total = totalReserved(state);
  const holds = total <= state.totalReservable;
  return {
    holds,
    total,
    totalReservable: state.totalReservable,
    detail: holds
      ? `total ${total} <= ${state.totalReservable}`
      : `total ${total} exceeds the pool of ${state.totalReservable}`,
  };
}

/** Read an untrusted value as a `set_reservation` argument set. */
export function readSetReservation(value: unknown): SetReservation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const service = source['service'];
  const reserved = source['reserved'];
  if (typeof service !== 'string' || service === '') return null;
  if (!Number.isInteger(reserved) || (reserved as number) < 0) return null;
  return { service, reserved: reserved as number };
}

/** Why a mutation was refused on integrity grounds, after it was authorized. */
export type MutationRejectionCode = 'UNKNOWN_SERVICE' | 'INVARIANT_BREACH';

export type MutationResult =
  | { readonly ok: true; readonly state: ReservationState; readonly invariant: InvariantReport }
  | { readonly ok: false; readonly reasonCode: MutationRejectionCode; readonly detail: string };

/**
 * Apply a mutation.
 *
 * Refuses an unknown service rather than creating one: a target that invents
 * resources on write turns a typo into a silent new allocation, and the
 * co-change evidence says nothing about a path that has no history.
 *
 * Refuses a mutation that would breach the invariant. This is integrity, not
 * authorization — it runs *after* the receipt has already been admitted, and a
 * request can be perfectly authorized and still be refused here.
 */
export function applyMutation(state: ReservationState, mutation: SetReservation): MutationResult {
  if (!Object.hasOwn(state.services, mutation.service)) {
    return {
      ok: false,
      reasonCode: 'UNKNOWN_SERVICE',
      detail: `no service named ${mutation.service} exists on this target`,
    };
  }

  const next: ReservationState = {
    totalReservable: state.totalReservable,
    services: { ...state.services, [mutation.service]: mutation.reserved },
  };

  const invariant = checkInvariant(next);
  if (!invariant.holds) {
    return {
      ok: false,
      reasonCode: 'INVARIANT_BREACH',
      detail: `refused: ${invariant.detail}`,
    };
  }

  return { ok: true, state: next, invariant };
}

/** The state as a canonical value, for revision computation and observation. */
export function asCanonical(state: ReservationState): CanonicalValue {
  return {
    totalReservable: state.totalReservable,
    services: { ...state.services },
  };
}
