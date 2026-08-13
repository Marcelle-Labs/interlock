/**
 * The Interlock authorization receipt — S2 contract fixture.
 *
 * > **Not the production receipt schema.** This is the smallest set of bindings
 * > that lets a protected target distinguish a genuine authorization from an
 * > edited, fabricated, replayed or misdirected one. HAC-317 owns the production
 * > schema; freezing this one as final would be claiming more than S2 tested.
 *
 * ## Why the target verifies rather than trusts
 *
 * The proxy is not sufficient authority. If the target executed on the strength
 * of "the request arrived through the proxy", then anything that can reach the
 * target's network address — a misconfigured route, a retried queue message, a
 * second client, a future refactor that adds a bypass for convenience — becomes
 * an authorization path. The receipt exists so that the *target* can make the
 * decision locally, from the bytes in front of it, with no dependency on how the
 * request was routed.
 *
 * ## What each binding defends against
 *
 * | Binding | Attack it defeats |
 * | -- | -- |
 * | signature over canonical claims | fabricated or edited receipt |
 * | `intentDigest` | receipt lifted onto different arguments |
 * | `operation` | receipt lifted onto a different tool |
 * | `target.targetId` | receipt replayed against a different service |
 * | `target.expectedRevision` | receipt applied to state that has since moved |
 * | `expiresAt` | receipt hoarded and used later |
 * | `nonce` | the same authorization executed twice |
 * | `caller.identity` | receipt stolen and presented by someone else |
 *
 * Replay is the one binding this module cannot adjudicate alone: a nonce is only
 * meaningful against a record of nonces already spent. That state lives in
 * `broker/idempotency`, and the admission gate composes the two.
 */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import type { CanonicalValue } from './canonical.js';
import { canonicalBytes } from './canonical.js';

/** The only receipt shape this fixture understands. */
export const RECEIPT_VERSION = 'interlock.receipt.s2-fixture/1';

/** The only signature algorithm this fixture accepts. */
export const RECEIPT_ALGORITHM = 'Ed25519';

/**
 * The decision a receipt can carry.
 *
 * Only `ALLOW` is ever signed and transmitted — a denial does not need to be
 * carried to the target, because a denial means nothing was forwarded. The field
 * exists so the target can reject a receipt whose decision is anything else
 * rather than reading "a receipt exists" as "a receipt permits".
 */
export const RECEIPT_DECISION_ALLOW = 'ALLOW';

/** Everything the signature covers. */
export interface ReceiptClaims {
  readonly receiptVersion: typeof RECEIPT_VERSION;
  readonly receiptId: string;
  readonly correlationId: string;
  readonly caller: {
    /** The identity the proxy actually observed. Never inferred. */
    readonly identity: string;
    /** How that identity was established, e.g. `oidc-id-token:email`. */
    readonly identitySource: string;
  };
  readonly operation: string;
  readonly intentDigest: string;
  readonly target: {
    readonly targetId: string;
    /** The target state revision the decision was made against. */
    readonly expectedRevision: string;
  };
  readonly evidence: {
    /** Commit the co-change evidence is pinned to. */
    readonly basisRevision: string;
    /** Digest of the evidence artifact the decision read. */
    readonly artifactSha256: string;
    /** Revision of the producer that emitted it. */
    readonly producerSha: string;
  };
  readonly decision: typeof RECEIPT_DECISION_ALLOW;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Single-use identifier. Spent-nonce state lives outside this module. */
  readonly nonce: string;
}

/** A signed receipt as it travels on the wire. */
export interface SignedReceipt {
  readonly claims: ReceiptClaims;
  readonly alg: typeof RECEIPT_ALGORITHM;
  /** Which public key verifies this. */
  readonly keyId: string;
  /** base64url signature over the canonical claim bytes. */
  readonly signature: string;
}

/** Why a receipt was refused. Never only prose — the target logs the code. */
export const ReceiptRejection = {
  ABSENT: 'RECEIPT_ABSENT',
  MALFORMED: 'RECEIPT_MALFORMED',
  VERSION_UNSUPPORTED: 'RECEIPT_VERSION_UNSUPPORTED',
  ALGORITHM_UNSUPPORTED: 'RECEIPT_ALGORITHM_UNSUPPORTED',
  UNKNOWN_KEY: 'RECEIPT_UNKNOWN_KEY',
  SIGNATURE_INVALID: 'RECEIPT_SIGNATURE_INVALID',
  DECISION_NOT_ALLOW: 'RECEIPT_DECISION_NOT_ALLOW',
  EXPIRED: 'RECEIPT_EXPIRED',
  NOT_YET_VALID: 'RECEIPT_NOT_YET_VALID',
  WRONG_TARGET: 'RECEIPT_WRONG_TARGET',
  WRONG_OPERATION: 'RECEIPT_WRONG_OPERATION',
  INTENT_MISMATCH: 'RECEIPT_INTENT_MISMATCH',
  STALE_REVISION: 'RECEIPT_STALE_REVISION',
  WRONG_CALLER: 'RECEIPT_WRONG_CALLER',
} as const;

export type ReceiptRejectionCode = (typeof ReceiptRejection)[keyof typeof ReceiptRejection];

export type ReceiptVerdict =
  | { readonly ok: true; readonly claims: ReceiptClaims }
  | { readonly ok: false; readonly reasonCode: ReceiptRejectionCode; readonly detail: string };

const reject = (reasonCode: ReceiptRejectionCode, detail: string): ReceiptVerdict => ({
  ok: false,
  reasonCode,
  detail,
});

/** A named Ed25519 key pair. The private half never leaves the proxy. */
export interface SigningKey {
  readonly keyId: string;
  readonly privateKey: KeyObject;
}

/** The public halves a verifier will accept, by key id. */
export type VerificationKeys = ReadonlyMap<string, KeyObject>;

/**
 * What the target asserts must be true of a receipt it is willing to act on.
 *
 * `callerIdentity` is optional on purpose. HAC-326 must record what the running
 * path actually delivers rather than what would be convenient, and a target that
 * cannot observe its caller must not pretend to check one. When it is absent the
 * caller binding is not verified, and that gap is recorded in the evidence packet
 * rather than papered over with a value invented at the target.
 */
export interface ReceiptExpectations {
  readonly targetId: string;
  /** The target's current state revision, read at admission time. */
  readonly currentRevision: string;
  readonly operation: string;
  /** Digest the target computed from the request body it received. */
  readonly intentDigest: string;
  readonly now: Date;
  readonly keys: VerificationKeys;
  readonly callerIdentity?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Claims as a canonical value, for signing and verifying. */
function claimsAsCanonical(claims: ReceiptClaims): CanonicalValue {
  return {
    receiptVersion: claims.receiptVersion,
    receiptId: claims.receiptId,
    correlationId: claims.correlationId,
    caller: { identity: claims.caller.identity, identitySource: claims.caller.identitySource },
    operation: claims.operation,
    intentDigest: claims.intentDigest,
    target: { targetId: claims.target.targetId, expectedRevision: claims.target.expectedRevision },
    evidence: {
      basisRevision: claims.evidence.basisRevision,
      artifactSha256: claims.evidence.artifactSha256,
      producerSha: claims.evidence.producerSha,
    },
    decision: claims.decision,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    nonce: claims.nonce,
  };
}

/** Sign a set of claims. Called only after a decision has come out `ALLOW`. */
export function signReceipt(claims: ReceiptClaims, key: SigningKey): SignedReceipt {
  const signature = sign(null, canonicalBytes(claimsAsCanonical(claims)), key.privateKey);
  return {
    claims,
    alg: RECEIPT_ALGORITHM,
    keyId: key.keyId,
    signature: signature.toString('base64url'),
  };
}

/**
 * Parse an untrusted value into a `SignedReceipt`.
 *
 * Structural only — nothing here is trusted, and no claim is believed until the
 * signature check in `verifyReceipt` passes.
 */
export function readSignedReceipt(value: unknown): SignedReceipt | null {
  if (!isRecord(value)) return null;

  const claimsValue = value['claims'];
  const alg = readString(value, 'alg');
  const keyId = readString(value, 'keyId');
  const signature = readString(value, 'signature');
  if (!isRecord(claimsValue) || alg === null || keyId === null || signature === null) return null;

  const caller = claimsValue['caller'];
  const target = claimsValue['target'];
  const evidence = claimsValue['evidence'];
  if (!isRecord(caller) || !isRecord(target) || !isRecord(evidence)) return null;

  const scalars = {
    receiptVersion: readString(claimsValue, 'receiptVersion'),
    receiptId: readString(claimsValue, 'receiptId'),
    correlationId: readString(claimsValue, 'correlationId'),
    operation: readString(claimsValue, 'operation'),
    intentDigest: readString(claimsValue, 'intentDigest'),
    decision: readString(claimsValue, 'decision'),
    issuedAt: readString(claimsValue, 'issuedAt'),
    expiresAt: readString(claimsValue, 'expiresAt'),
    nonce: readString(claimsValue, 'nonce'),
    identity: readString(caller, 'identity'),
    identitySource: readString(caller, 'identitySource'),
    targetId: readString(target, 'targetId'),
    expectedRevision: readString(target, 'expectedRevision'),
    basisRevision: readString(evidence, 'basisRevision'),
    artifactSha256: readString(evidence, 'artifactSha256'),
    producerSha: readString(evidence, 'producerSha'),
  };
  if (Object.values(scalars).includes(null)) return null;

  return {
    claims: {
      receiptVersion: scalars.receiptVersion as typeof RECEIPT_VERSION,
      receiptId: scalars.receiptId as string,
      correlationId: scalars.correlationId as string,
      caller: {
        identity: scalars.identity as string,
        identitySource: scalars.identitySource as string,
      },
      operation: scalars.operation as string,
      intentDigest: scalars.intentDigest as string,
      target: {
        targetId: scalars.targetId as string,
        expectedRevision: scalars.expectedRevision as string,
      },
      evidence: {
        basisRevision: scalars.basisRevision as string,
        artifactSha256: scalars.artifactSha256 as string,
        producerSha: scalars.producerSha as string,
      },
      decision: scalars.decision as typeof RECEIPT_DECISION_ALLOW,
      issuedAt: scalars.issuedAt as string,
      expiresAt: scalars.expiresAt as string,
      nonce: scalars.nonce as string,
    },
    alg: alg as typeof RECEIPT_ALGORITHM,
    keyId,
    signature,
  };
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Adjudicate a receipt against what the target expects.
 *
 * Order matters. Integrity is established first — version, algorithm, key,
 * signature — because every later check reads a claim, and reading a claim from
 * an unverified receipt is reading attacker-controlled input. Only once the bytes
 * are known to be authentic do the bindings get compared.
 */
/**
 * Establish that a presented value is a genuine, unaltered receipt.
 *
 * Separated from the binding checks because the two answer different questions —
 * "are these bytes authentic" and "do they authorize *this* request" — and
 * because every binding check below reads a claim. Reading a claim from a receipt
 * whose signature has not been verified is reading attacker-controlled input, so
 * the ordering is part of the contract rather than a stylistic choice.
 */
function authenticate(
  value: unknown,
  keys: VerificationKeys,
): { readonly ok: true; readonly receipt: SignedReceipt } | { readonly ok: false; readonly verdict: ReceiptVerdict } {
  const no = (reasonCode: ReceiptRejectionCode, detail: string) =>
    ({ ok: false, verdict: reject(reasonCode, detail) }) as const;

  if (value === null || value === undefined) {
    return no(ReceiptRejection.ABSENT, 'no authorization receipt accompanied the request');
  }

  const receipt = readSignedReceipt(value);
  if (receipt === null) {
    return no(ReceiptRejection.MALFORMED, 'the receipt is not a structurally complete signed receipt');
  }

  if (receipt.claims.receiptVersion !== RECEIPT_VERSION) {
    return no(
      ReceiptRejection.VERSION_UNSUPPORTED,
      `receipt version ${receipt.claims.receiptVersion} is not ${RECEIPT_VERSION}`,
    );
  }

  if (receipt.alg !== RECEIPT_ALGORITHM) {
    return no(
      ReceiptRejection.ALGORITHM_UNSUPPORTED,
      `signature algorithm ${receipt.alg} is not ${RECEIPT_ALGORITHM}`,
    );
  }

  const publicKey = keys.get(receipt.keyId);
  if (publicKey === undefined) {
    return no(
      ReceiptRejection.UNKNOWN_KEY,
      `no verification key registered under key id ${receipt.keyId}`,
    );
  }

  const signatureValid = verify(
    null,
    canonicalBytes(claimsAsCanonical(receipt.claims)),
    publicKey,
    Buffer.from(receipt.signature, 'base64url'),
  );
  if (!signatureValid) {
    return no(
      ReceiptRejection.SIGNATURE_INVALID,
      'the signature does not verify over the canonical claims; the receipt was edited or fabricated',
    );
  }

  return { ok: true, receipt };
}

export function verifyReceipt(value: unknown, expected: ReceiptExpectations): ReceiptVerdict {
  const authentic = authenticate(value, expected.keys);
  if (!authentic.ok) return authentic.verdict;

  const receipt = authentic.receipt;

  // --- The bytes are authentic. Now: do they authorize *this* request? ------

  if (receipt.claims.decision !== RECEIPT_DECISION_ALLOW) {
    return reject(
      ReceiptRejection.DECISION_NOT_ALLOW,
      `receipt carries decision ${receipt.claims.decision}; only ${RECEIPT_DECISION_ALLOW} authorizes execution`,
    );
  }

  const issuedAt = parseInstant(receipt.claims.issuedAt);
  const expiresAt = parseInstant(receipt.claims.expiresAt);
  if (issuedAt === null || expiresAt === null) {
    return reject(
      ReceiptRejection.MALFORMED,
      'issuedAt or expiresAt is not a parseable instant; an unbounded lifetime is not a lifetime',
    );
  }

  const now = expected.now.getTime();
  if (now >= expiresAt) {
    return reject(
      ReceiptRejection.EXPIRED,
      `receipt expired at ${receipt.claims.expiresAt}; now ${expected.now.toISOString()}`,
    );
  }
  if (now < issuedAt) {
    return reject(
      ReceiptRejection.NOT_YET_VALID,
      `receipt is issued at ${receipt.claims.issuedAt}, in the future of ${expected.now.toISOString()}`,
    );
  }

  if (receipt.claims.target.targetId !== expected.targetId) {
    return reject(
      ReceiptRejection.WRONG_TARGET,
      `receipt authorizes target ${receipt.claims.target.targetId}, presented to ${expected.targetId}`,
    );
  }

  if (receipt.claims.operation !== expected.operation) {
    return reject(
      ReceiptRejection.WRONG_OPERATION,
      `receipt authorizes operation ${receipt.claims.operation}, presented for ${expected.operation}`,
    );
  }

  if (receipt.claims.intentDigest !== expected.intentDigest) {
    return reject(
      ReceiptRejection.INTENT_MISMATCH,
      `receipt authorizes intent ${receipt.claims.intentDigest}, but the request body digests to ${expected.intentDigest}`,
    );
  }

  // Stale revision is the concurrency guard, and it is why the target must check
  // rather than the proxy: the proxy decided against a revision that was current
  // *then*. Only the target knows what is current now.
  if (receipt.claims.target.expectedRevision !== expected.currentRevision) {
    return reject(
      ReceiptRejection.STALE_REVISION,
      `receipt expects target revision ${receipt.claims.target.expectedRevision}, target is at ${expected.currentRevision}`,
    );
  }

  if (expected.callerIdentity !== undefined && receipt.claims.caller.identity !== expected.callerIdentity) {
    return reject(
      ReceiptRejection.WRONG_CALLER,
      `receipt was issued to ${receipt.claims.caller.identity}, presented by ${expected.callerIdentity}`,
    );
  }

  return { ok: true, claims: receipt.claims };
}

/** Load a signing key from PEM. Values come from the environment, never source. */
export function signingKeyFromPem(keyId: string, pem: string): SigningKey {
  return { keyId, privateKey: createPrivateKey(pem) };
}

/** Load a verification key registry from `keyId -> PEM`. */
export function verificationKeysFromPem(entries: Readonly<Record<string, string>>): VerificationKeys {
  return new Map(
    Object.entries(entries).map(([keyId, pem]) => [keyId, createPublicKey(pem)] as const),
  );
}
