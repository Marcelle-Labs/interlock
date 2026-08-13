/**
 * The baseline arm: an issuer that cannot see composition.
 *
 * ## Why the baseline is an issuer and not an unsafe target
 *
 * Preflight V1 made the baseline a second, "unsafe" protected target. That is
 * not buildable from an unchanged `ProtectedTarget` — the target enforces its
 * own pool, so it refuses the composed state rather than reaching it — and
 * building a deliberately weakened target would have measured the weakening
 * instead of the hazard.
 *
 * So the baseline keeps the *same two unchanged protected targets* and removes
 * the only thing the treatment arm adds: awareness of what else is in flight.
 * This issuer validates each action on its own merits, reads the revision of the
 * target that action belongs to, mints the frozen S2 receipt with the same
 * cryptographic machinery, and forwards. Every request it sees is valid, and it
 * is right about every one of them individually. It is wrong about the pair,
 * and it has no way to be otherwise, because it is looking at one request at a
 * time — which is the entire argument for Interlock.
 *
 * ## What is structurally absent
 *
 * There is no pending-intent store here, no arbitration, no reading of a peer
 * request, no co-change reasoning of any kind (X-16). Those are not switched
 * off behind a flag; they are not imported, so there is no configuration of
 * this file that acquires them.
 *
 * `receiptProvenance` deserves a note, because it looks like an exception and is
 * not. The frozen receipt shape carries a provenance sub-object that the target
 * verifies the *signature* over. This issuer copies whatever it is handed into
 * the claims verbatim and never reads a field of it. That is deliberate: the
 * baseline receipt has to be byte-shape-identical to the treatment receipt, or
 * a difference in outcome could be attributed to a difference in receipts. The
 * issuer is a courier for that block, not a consumer of it.
 */
import { randomUUID } from 'node:crypto';

import { intentDigest } from '../../../dist/authorization/intent.js';
import {
  RECEIPT_DECISION_ALLOW,
  RECEIPT_VERSION,
  signReceipt,
  signingKeyFromPem,
} from '../../../dist/authorization/receipt.js';
import { HttpTargetPort } from '../../../dist/proxy/target-port.js';
import { OPERATION_SET_RESERVATION, readSetReservation } from '../../../dist/target/state.js';

/** How long a baseline receipt stays usable. Matches the proxy's default. */
const RECEIPT_TTL_MS = 30_000;

/** Refusals the issuer itself can produce, all of them single-request checks. */
export const IssuerRejection = {
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  MALFORMED_ARGUMENTS: 'MALFORMED_ARGUMENTS',
  UNROUTABLE_SERVICE: 'UNROUTABLE_SERVICE',
  TARGET_UNREACHABLE: 'TARGET_UNREACHABLE',
};

export class CompositionUnawareIssuer {
  /**
   * @param options.targetIds        service -> targetId
   * @param options.targetUrls       service -> base URL of that service's target
   * @param options.signingKeyPem    PEM of the key this issuer signs with
   * @param options.keyId            key identifier the target resolves
   * @param options.receiptProvenance opaque provenance block copied into claims
   */
  constructor(options) {
    this.targetIds = options.targetIds;
    this.signingKey = signingKeyFromPem(options.keyId, options.signingKeyPem);
    this.receiptProvenance = options.receiptProvenance;
    this.now = options.now ?? (() => new Date());
    this.ports = Object.fromEntries(
      Object.entries(options.targetUrls).map(([service, baseUrl]) => [
        service,
        new HttpTargetPort({ baseUrl }),
      ]),
    );
  }

  /** Which service this request writes, or `null` if it does not say. */
  static serviceOf(intent) {
    const mutation = readSetReservation(intent.arguments);
    return mutation === null ? null : mutation.service;
  }

  /**
   * Authorize and forward one request, on its own merits.
   *
   * The order mirrors the proxy's: recognise the operation, read the arguments,
   * read the target revision the receipt will bind to, mint, forward. What the
   * proxy does between reading the revision and minting — comparing this intent
   * against everything else in flight — has no counterpart here.
   */
  async issue(request) {
    const { correlationId, intent, callerIdentity, identitySource } = request;

    if (intent.operation !== OPERATION_SET_RESERVATION) {
      return this.#refuse(
        correlationId,
        IssuerRejection.UNSUPPORTED_OPERATION,
        `this issuer fronts ${OPERATION_SET_RESERVATION} only, received ${intent.operation}`,
      );
    }

    const service = CompositionUnawareIssuer.serviceOf(intent);
    if (service === null) {
      return this.#refuse(
        correlationId,
        IssuerRejection.MALFORMED_ARGUMENTS,
        'arguments must be { service: string, reserved: non-negative integer }',
      );
    }

    const port = Object.hasOwn(this.ports, service) ? this.ports[service] : undefined;
    if (port === undefined) {
      return this.#refuse(
        correlationId,
        IssuerRejection.UNROUTABLE_SERVICE,
        `no protected target fronts service ${service}`,
      );
    }

    let targetRevision;
    try {
      targetRevision = await port.revision();
    } catch (error) {
      return this.#refuse(
        correlationId,
        IssuerRejection.TARGET_UNREACHABLE,
        `the target for ${service} could not be reached (${error.message}); no receipt was issued`,
      );
    }

    const issuedAt = this.now();
    const receipt = signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: `rcpt-${randomUUID()}`,
        correlationId,
        caller: { identity: callerIdentity, identitySource },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: this.targetIds[service], expectedRevision: targetRevision },
        // Copied, never read. See the note in this module's header.
        ...this.receiptProvenance,
        decision: RECEIPT_DECISION_ALLOW,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + RECEIPT_TTL_MS).toISOString(),
        nonce: `nonce-${randomUUID()}`,
      },
      this.signingKey,
    );

    const execution = await port.execute({ correlationId, receipt, intent });

    return {
      authorized: true,
      correlationId,
      service,
      receiptId: receipt.claims.receiptId,
      intentDigest: receipt.claims.intentDigest,
      targetRevisionAtIssue: targetRevision,
      execution,
    };
  }

  #refuse(correlationId, reasonCode, detail) {
    return { authorized: false, correlationId, reasonCode, detail };
  }
}
