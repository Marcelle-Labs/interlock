/**
 * The bounded Interlock proxy — the S2 fallback enforcement point.
 *
 * HAC-325 falsified the preferred insertion point: an Agent Gateway
 * `CONTENT_AUTHZ` extension never received a request, because binding an
 * `AGENT_TO_ANYWHERE` gateway broke Agent Runtime's own session establishment
 * under TLS interception. This is the fallback that hypothesis was replaced with:
 * an ordinary authenticated service the caller talks to on purpose, in front of
 * one protected operation.
 *
 * ## What the proxy is, and is not
 *
 * It is the place where an intent is registered, compared against what else is in
 * flight, decided on deterministically, and — only on `ALLOW` — issued a signed
 * receipt.
 *
 * It is **not** authority. The receipt it issues is checked by the target, and a
 * target that trusted the proxy's say-so would be back to trusting the network
 * path. This class can be entirely bypassed and the protected operation still
 * refuses to run, which is the property that makes the fallback defensible.
 *
 * ## Fail-closed is the default direction
 *
 * Every failure mode here — store unreachable, target unreachable, decision
 * exceeding its deadline, evidence missing or stale — produces a denial and no
 * receipt. There is no path that reaches `ALLOW` other than an arbitration that
 * returned `ALLOW_PARALLEL` within the deadline. Unavailable never means allow.
 */
import { randomUUID } from 'node:crypto';

import type { Intent } from '../authorization/intent.js';
import { intentDigest } from '../authorization/intent.js';
import type { ReceiptClaims, SignedReceipt, SigningKey } from '../authorization/receipt.js';
import { RECEIPT_DECISION_ALLOW, RECEIPT_VERSION, signReceipt } from '../authorization/receipt.js';
import type { Coupling } from '../broker/pairing/arbitrate.js';
import { Decision, arbitrate } from '../broker/pairing/arbitrate.js';
import type { PendingIntent, PendingIntentStore } from '../broker/pairing/store.js';
import type { TargetResponse } from '../target/service.js';

/** The caller-facing decision. Deliberately two-valued — see the S2 freeze note. */
export const CallerDecision = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
} as const;

export type CallerDecisionCode = (typeof CallerDecision)[keyof typeof CallerDecision];

/** Denial reasons the proxy adds on top of the arbitration vocabulary. */
export const ProxyReason = {
  DECISION_TIMEOUT: 'DECISION_TIMEOUT',
  TARGET_UNREACHABLE: 'TARGET_UNREACHABLE',
  STORE_WRITE_FAILED: 'STORE_WRITE_FAILED',
  TARGET_REJECTED: 'TARGET_REJECTED',
} as const;

/**
 * What the caller gets back.
 *
 * Structured first, prose second. `reasonCode` is what an agent branches on;
 * `message` is what a human reads; `evidenceRefs` is what makes the denial
 * actionable rather than merely final — it names the artifact and basis commit
 * the decision was made from, so the caller can go and look.
 */
export interface ProxyResponse {
  readonly decision: CallerDecisionCode;
  readonly reasonCode: string;
  readonly correlationId: string;
  readonly message: string;
  readonly evidenceRefs: readonly string[];
  /** Present when the denial was caused by observed couplings. */
  readonly couplings?: readonly Coupling[];
  /** Present only when the target executed. */
  readonly execution?: TargetResponse;
  /** Present only when a receipt was issued. Never on a denial. */
  readonly receiptId?: string;
}

export interface ProxyRequest {
  readonly correlationId: string;
  /** Identity the proxy actually observed for this caller. */
  readonly callerIdentity: string;
  /** How that identity was established. */
  readonly identitySource: string;
  readonly intent: Intent;
  /** Evidence-namespace paths this intent writes. */
  readonly targets: readonly string[];
}

/** How the proxy reaches the protected target. */
export interface TargetPort {
  /** The target's current state revision. */
  revision(): Promise<string>;
  /** Execute, presenting the receipt. */
  execute(input: {
    readonly correlationId: string;
    readonly receipt: SignedReceipt;
    readonly intent: Intent;
  }): Promise<TargetResponse>;
}

export interface ProxyOptions {
  readonly targetId: string;
  readonly store: PendingIntentStore;
  readonly target: TargetPort;
  readonly signingKey: SigningKey;
  /** Verbatim evidence envelope from the HAC-330 adapter. */
  readonly evidence: unknown;
  /** Revision of the source the intents apply to; must match the evidence basis. */
  readonly sourceRevision: string;
  /** How long a receipt stays usable. Short: it authorizes one specific revision. */
  readonly receiptTtlMs?: number;
  /** Budget for the whole authorization phase. Exceeding it denies. */
  readonly decisionTimeoutMs?: number;
  /** Injectable for deterministic tests. */
  readonly now?: () => Date;
  /** How long a recorded intent stays "in flight" absent a settle. */
  readonly pendingTtlMs?: number;
}

const DEFAULT_RECEIPT_TTL_MS = 30_000;
const DEFAULT_DECISION_TIMEOUT_MS = 2_000;
const DEFAULT_PENDING_TTL_MS = 60_000;

/** Thrown internally when the authorization phase exceeds its budget. */
class DeadlineExceeded extends Error {
  public constructor(public readonly phase: string) {
    super(`${phase} exceeded the decision deadline`);
    this.name = 'DeadlineExceeded';
  }
}

/**
 * Run `work` under a deadline.
 *
 * A timeout must produce a *denial*, never a hang and never an exception that
 * escapes as a 500 — a 500 is ambiguous, and an ambiguous answer about whether a
 * mutation was authorized is the thing that has to be impossible here.
 */
function withDeadline<T>(work: Promise<T>, budgetMs: number, phase: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceeded(phase)), budgetMs);
    // `unref` so a pending timer never holds the process open after the answer
    // has already been given.
    timer.unref?.();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export class InterlockProxy {
  private readonly options: Required<Omit<ProxyOptions, 'evidence'>> & { readonly evidence: unknown };

  public constructor(options: ProxyOptions) {
    this.options = {
      targetId: options.targetId,
      store: options.store,
      target: options.target,
      signingKey: options.signingKey,
      evidence: options.evidence,
      sourceRevision: options.sourceRevision,
      receiptTtlMs: options.receiptTtlMs ?? DEFAULT_RECEIPT_TTL_MS,
      decisionTimeoutMs: options.decisionTimeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS,
      now: options.now ?? (() => new Date()),
      pendingTtlMs: options.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS,
    };
  }

  private deny(
    correlationId: string,
    reasonCode: string,
    message: string,
    extra: {
      readonly evidenceRefs?: readonly string[];
      readonly couplings?: readonly Coupling[];
    } = {},
  ): ProxyResponse {
    return {
      decision: CallerDecision.DENY,
      reasonCode,
      correlationId,
      message,
      evidenceRefs: extra.evidenceRefs ?? [],
      ...(extra.couplings !== undefined && extra.couplings.length > 0
        ? { couplings: extra.couplings }
        : {}),
    };
  }

  private mintClaims(request: ProxyRequest, targetRevision: string): ReceiptClaims {
    const issuedAt = this.options.now();
    const evidence = this.evidenceIdentifiers();
    return {
      receiptVersion: RECEIPT_VERSION,
      receiptId: `rcpt-${randomUUID()}`,
      correlationId: request.correlationId,
      caller: { identity: request.callerIdentity, identitySource: request.identitySource },
      operation: request.intent.operation,
      intentDigest: intentDigest(request.intent),
      target: { targetId: this.options.targetId, expectedRevision: targetRevision },
      evidence: {
        basisRevision: evidence.basisRevision,
        artifactSha256: evidence.artifactSha256,
        producerSha: evidence.producerSha,
      },
      decision: RECEIPT_DECISION_ALLOW,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + this.options.receiptTtlMs).toISOString(),
      nonce: `nonce-${randomUUID()}`,
    };
  }

  /** Provenance of the evidence this proxy decides from, for the receipt. */
  private evidenceIdentifiers(): {
    readonly basisRevision: string;
    readonly artifactSha256: string;
    readonly producerSha: string;
  } {
    const envelope = this.options.evidence as Record<string, unknown> | null;
    const artifact = (envelope?.['artifact'] ?? {}) as Record<string, unknown>;
    const producer = (envelope?.['producer'] ?? {}) as Record<string, unknown>;
    return {
      basisRevision: this.options.sourceRevision,
      artifactSha256: typeof artifact['sha256'] === 'string' ? artifact['sha256'] : 'unknown',
      producerSha: typeof producer['observedSha'] === 'string' ? producer['observedSha'] : 'unknown',
    };
  }

  /**
   * Decide on one intent and, if allowed, forward it under a signed receipt.
   *
   * The pending intent is recorded *before* the decision and settled in a
   * `finally`, so a request is visible to its concurrent neighbour for exactly
   * the window in which it is genuinely in flight. Recording after the decision
   * would let two simultaneous requests each decide while invisible to the other
   * — which is precisely the race this component exists to close.
   */
  public async handle(request: ProxyRequest): Promise<ProxyResponse> {
    const now = this.options.now();
    const pending: PendingIntent = {
      correlationId: request.correlationId,
      agent: request.callerIdentity,
      operation: request.intent.operation,
      targets: request.targets,
      intentDigest: intentDigest(request.intent),
      recordedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.options.pendingTtlMs).toISOString(),
    };

    const recorded = this.options.store.record(pending);
    if (!recorded.ok) {
      return this.deny(
        request.correlationId,
        ProxyReason.STORE_WRITE_FAILED,
        `the pending-intent store could not record this intent (${recorded.detail}); ` +
          'refusing rather than deciding while blind to concurrent work',
      );
    }

    try {
      return await this.decideAndForward(request, pending);
    } finally {
      // Settle whatever happened. A failure to settle cannot be allowed to
      // change the answer already given, so its result is deliberately not
      // consulted; a stuck intent expires by TTL.
      this.options.store.settle(request.correlationId);
    }
  }

  private async decideAndForward(
    request: ProxyRequest,
    pending: PendingIntent,
  ): Promise<ProxyResponse> {
    let targetRevision: string;
    try {
      targetRevision = await withDeadline(
        this.options.target.revision(),
        this.options.decisionTimeoutMs,
        'reading the target revision',
      );
    } catch (error) {
      const timedOut = error instanceof DeadlineExceeded;
      return this.deny(
        request.correlationId,
        timedOut ? ProxyReason.DECISION_TIMEOUT : ProxyReason.TARGET_UNREACHABLE,
        timedOut
          ? `the authorization decision exceeded its ${this.options.decisionTimeoutMs}ms budget while reading the ` +
            'target revision; no receipt was issued and the protected operation was not contacted'
          : `the target could not be reached (${(error as Error).message}); no receipt was issued`,
      );
    }

    const verdict = arbitrate({
      candidate: pending,
      others: this.options.store.active(this.options.now(), request.correlationId),
      evidence: this.options.evidence,
      sourceRevision: this.options.sourceRevision,
    });

    const permitted =
      verdict.decision === Decision.ALLOW_PARALLEL || verdict.decision === Decision.ALLOW_SERIALIZED;
    if (!permitted) {
      return this.deny(request.correlationId, verdict.reasonCode, verdict.detail, {
        evidenceRefs: verdict.evidenceRefs,
        couplings: verdict.couplings,
      });
    }

    const receipt = signReceipt(this.mintClaims(request, targetRevision), this.options.signingKey);

    let execution: TargetResponse;
    try {
      execution = await withDeadline(
        this.options.target.execute({
          correlationId: request.correlationId,
          receipt,
          intent: request.intent,
        }),
        this.options.decisionTimeoutMs,
        'executing at the target',
      );
    } catch (error) {
      const timedOut = error instanceof DeadlineExceeded;
      return this.deny(
        request.correlationId,
        timedOut ? ProxyReason.DECISION_TIMEOUT : ProxyReason.TARGET_UNREACHABLE,
        `the protected operation could not be completed (${(error as Error).message}). ` +
          'Whether the mutation ran is UNKNOWN to the proxy — re-read the target to find out. ' +
          'This response is not an observation.',
        { evidenceRefs: verdict.evidenceRefs },
      );
    }

    if (execution.status !== 'EXECUTED') {
      return {
        decision: CallerDecision.DENY,
        reasonCode: ProxyReason.TARGET_REJECTED,
        correlationId: request.correlationId,
        message:
          `the target refused the authorized request: ${execution.reasonCode} — ${execution.detail}. ` +
          'The proxy allowed; the target is the enforcement boundary and it declined.',
        evidenceRefs: verdict.evidenceRefs,
        execution,
      };
    }

    return {
      decision: CallerDecision.ALLOW,
      reasonCode: verdict.reasonCode,
      correlationId: request.correlationId,
      message: verdict.detail,
      evidenceRefs: verdict.evidenceRefs,
      execution,
      receiptId: receipt.claims.receiptId,
      ...(verdict.couplings.length > 0 ? { couplings: verdict.couplings } : {}),
    };
  }
}
