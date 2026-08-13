/**
 * The pending-intent store.
 *
 * Interlock's decision is not about one request. A single intent is, by
 * construction, valid — that is what makes the hazard invisible to every check
 * that examines requests one at a time. The decision is about a request *in the
 * company of the other requests currently in flight*, and this is the only place
 * that company is known.
 *
 * ## Why unavailability is a first-class value
 *
 * If this store cannot answer, the proxy does not know what else is in flight. It
 * is not that there is nothing in flight — it is that the question was not
 * answered. Those two states must never collapse, so every method returns an
 * explicit result and the "empty" answer is unreachable from a failure path. A
 * store that returned `[]` on error would turn its own outage into a permit,
 * which is the exact failure mode HAC-326's chaos arm exists to detect.
 */

/** An intent submitted to the proxy and not yet settled. */
export interface PendingIntent {
  readonly correlationId: string;
  /** Caller identity as observed by the proxy. */
  readonly agent: string;
  readonly operation: string;
  /**
   * Paths in the evidence namespace this intent writes.
   *
   * These are what co-change evidence is expressed over, which is why they are
   * carried separately from the operation arguments.
   */
  readonly targets: readonly string[];
  readonly intentDigest: string;
  readonly recordedAt: string;
  readonly expiresAt: string;
}

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly detail: string };

export interface PendingIntentStore {
  /** Record an intent as in flight. */
  record(intent: PendingIntent): StoreResult<void>;
  /** Every intent still in flight at `now`, excluding `exceptCorrelationId`. */
  active(now: Date, exceptCorrelationId: string): StoreResult<readonly PendingIntent[]>;
  /** Mark an intent as no longer in flight, whatever its outcome. */
  settle(correlationId: string): StoreResult<void>;
}

/**
 * In-memory store, scoped to one proxy instance.
 *
 * Honest about its limits: a second proxy instance has a second store and would
 * not see the first one's pending intents. That is a real constraint on the
 * fallback topology and is recorded in the HAC-326 evidence packet rather than
 * hidden — a distributed store is HAC-317's problem, and pretending this one is
 * distributed would be the kind of claim S2 exists to prevent.
 */
export class InMemoryPendingIntentStore implements PendingIntentStore {
  private readonly intents = new Map<string, PendingIntent>();

  public record(intent: PendingIntent): StoreResult<void> {
    this.intents.set(intent.correlationId, intent);
    return { ok: true, value: undefined };
  }

  public active(now: Date, exceptCorrelationId: string): StoreResult<readonly PendingIntent[]> {
    const active: PendingIntent[] = [];
    for (const intent of this.intents.values()) {
      if (intent.correlationId === exceptCorrelationId) continue;
      // An expired intent is not in flight. Its TTL is a bound on how long a
      // crashed or abandoned caller can keep blocking its neighbours, not a
      // statement that it completed.
      if (Date.parse(intent.expiresAt) <= now.getTime()) continue;
      active.push(intent);
    }
    // Sorted so the decision — and therefore every recorded rationale — is
    // reproducible regardless of insertion order.
    active.sort((left, right) => left.correlationId.localeCompare(right.correlationId));
    return { ok: true, value: active };
  }

  public settle(correlationId: string): StoreResult<void> {
    this.intents.delete(correlationId);
    return { ok: true, value: undefined };
  }

  /** Number of intents held, expired or not. For the evidence packet. */
  public get size(): number {
    return this.intents.size;
  }
}

/**
 * A store that cannot answer, for the chaos arm.
 *
 * `record` fails too, not just `active`. A store that accepted writes while
 * unable to serve reads would let one request believe it had registered its
 * intent while the next request could not see it — two callers each convinced
 * they are alone, which is worse than either failing outright.
 */
export class UnavailablePendingIntentStore implements PendingIntentStore {
  public constructor(private readonly reason = 'pending-intent store unreachable') {}

  public record(): StoreResult<void> {
    return { ok: false, detail: `cannot record pending intent: ${this.reason}` };
  }

  public active(): StoreResult<readonly PendingIntent[]> {
    return { ok: false, detail: `cannot read pending intents: ${this.reason}` };
  }

  public settle(): StoreResult<void> {
    return { ok: false, detail: `cannot settle pending intent: ${this.reason}` };
  }
}
