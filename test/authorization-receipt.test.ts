/**
 * The receipt contract, attacked directly.
 *
 * Each test here is one of HAC-326 §6's rejection classes. They construct
 * receipts a well-behaved proxy would never emit and present them to the
 * verification function, because the claim under test is not "the proxy behaves"
 * — it is "the target refuses everything except a genuine authorization for this
 * exact request".
 */
import { describe, expect, it } from 'vitest';

import { intentDigest } from '../src/authorization/intent.js';
import type { Intent } from '../src/authorization/intent.js';
import type { ReceiptClaims, ReceiptExpectations } from '../src/authorization/receipt.js';
import {
  RECEIPT_VERSION,
  ReceiptRejection,
  readSignedReceipt,
  signReceipt,
  signingKeyFromPem,
  verificationKeysFromPem,
  verifyReceipt,
} from '../src/authorization/receipt.js';
import { at, newKeyPair, T0 } from './support/s2.js';
import { generateKeyPairSync } from 'node:crypto';

const INTENT: Intent = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 60 } };
const REVISION = 'sha256:revision-zero';

function claimsFor(overrides: Partial<ReceiptClaims> = {}): ReceiptClaims {
  return {
    receiptVersion: RECEIPT_VERSION,
    receiptId: 'rcpt-1',
    correlationId: 'ilk-abcdefgh',
    caller: { identity: 'agent@example.test', identitySource: 'oidc-id-token/platform-verified:email' },
    operation: INTENT.operation,
    intentDigest: intentDigest(INTENT),
    target: { targetId: 'interlock-s2-target', expectedRevision: REVISION },
    evidence: { basisRevision: 'eb67a6f', artifactSha256: '2c021d0', producerSha: 'defac1e' },
    decision: 'ALLOW',
    issuedAt: T0.toISOString(),
    expiresAt: at(30_000).toISOString(),
    nonce: 'nonce-1',
    ...overrides,
  } as ReceiptClaims;
}

function expectationsFor(
  keys: ReceiptExpectations['keys'],
  overrides: Partial<ReceiptExpectations> = {},
): ReceiptExpectations {
  return {
    targetId: 'interlock-s2-target',
    currentRevision: REVISION,
    operation: INTENT.operation,
    intentDigest: intentDigest(INTENT),
    now: at(1_000),
    keys,
    ...overrides,
  };
}

describe('verifyReceipt — a genuine authorization', () => {
  it('accepts a receipt that binds to exactly this request', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));

    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.claims.receiptId).toBe('rcpt-1');
  });

  it('accepts when the caller identity matches the one it was issued to', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(
      receipt,
      expectationsFor(keys, { callerIdentity: 'agent@example.test' }),
    );

    expect(verdict.ok).toBe(true);
  });
});

describe('verifyReceipt — refusals', () => {
  it('refuses an absent receipt: this is the bypass case', () => {
    const { keys } = newKeyPair();

    for (const absent of [null, undefined]) {
      const verdict = verifyReceipt(absent, expectationsFor(keys));
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.ABSENT);
    }
  });

  it.each([
    ['a string', 'not-a-receipt'],
    ['an array', []],
    ['an empty object', {}],
    ['claims that are not an object', { claims: 'x', alg: 'Ed25519', keyId: 'k', signature: 's' }],
    ['a missing signature', { claims: {}, alg: 'Ed25519', keyId: 'k' }],
  ])('refuses %s as malformed', (_label, value) => {
    const { keys } = newKeyPair();
    const verdict = verifyReceipt(value, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.MALFORMED);
  });

  it('refuses an edited receipt — the signature no longer covers the claims', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    // The exact attack the intent binding exists to stop: keep the signature,
    // change what is being asked for.
    const edited = {
      ...receipt,
      claims: { ...receipt.claims, target: { ...receipt.claims.target, targetId: 'other-target' } },
    };

    const verdict = verifyReceipt(edited, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.SIGNATURE_INVALID);
  });

  it('refuses a receipt fabricated with an unregistered key', () => {
    const { keys } = newKeyPair('trusted-key');
    const attacker = newKeyPair('attacker-key');
    const receipt = signReceipt(claimsFor(), attacker.signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.UNKNOWN_KEY);
  });

  it('refuses a receipt signed by a different key under a trusted key id', () => {
    // Same key id, wrong private half — the impersonation that would succeed if
    // the key id alone were treated as identity.
    const { keys } = newKeyPair('interlock-s2-test');
    const impostor = newKeyPair('interlock-s2-test');
    const receipt = signReceipt(claimsFor(), impostor.signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.SIGNATURE_INVALID);
  });

  it('refuses an unsupported receipt version', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor({ receiptVersion: 'something/2' as never }), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.VERSION_UNSUPPORTED);
  });

  it('refuses an unsupported algorithm before touching the key registry', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = { ...signReceipt(claimsFor(), signingKey), alg: 'HS256' as never };

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.ALGORITHM_UNSUPPORTED);
  });

  it('refuses a receipt whose decision is not ALLOW', () => {
    const { signingKey, keys } = newKeyPair();
    // Properly signed, so this is not a forgery — it is a receipt that records a
    // decision which does not authorize anything.
    const receipt = signReceipt(claimsFor({ decision: 'DENY' as never }), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.DECISION_NOT_ALLOW);
  });

  it('refuses an expired receipt', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys, { now: at(30_001) }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.EXPIRED);
  });

  it('refuses at the instant of expiry, not one millisecond after', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    expect(verifyReceipt(receipt, expectationsFor(keys, { now: at(29_999) })).ok).toBe(true);
    expect(verifyReceipt(receipt, expectationsFor(keys, { now: at(30_000) })).ok).toBe(false);
  });

  it('refuses a receipt issued in the future', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor({ issuedAt: at(60_000).toISOString() }), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys, { now: at(1_000) }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.NOT_YET_VALID);
  });

  it('refuses unparseable timestamps: an unbounded lifetime is not a lifetime', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor({ expiresAt: 'never' }), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.MALFORMED);
  });

  it('refuses a receipt presented to a different target', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys, { targetId: 'a-different-target' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.WRONG_TARGET);
  });

  it('refuses a receipt lifted onto a different operation', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(receipt, expectationsFor(keys, { operation: 'delete_everything' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.WRONG_OPERATION);
  });

  it('refuses a receipt whose arguments were changed after signing', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    // The receipt authorized reserved=60; the request body says 120.
    const tampered = intentDigest({
      operation: 'set_reservation',
      arguments: { service: 'alpha', reserved: 120 },
    });

    const verdict = verifyReceipt(receipt, expectationsFor(keys, { intentDigest: tampered }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.INTENT_MISMATCH);
  });

  it('refuses a receipt bound to a revision the target has moved past', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(
      receipt,
      expectationsFor(keys, { currentRevision: 'sha256:revision-one' }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.STALE_REVISION);
  });

  it('refuses a receipt presented by someone other than its holder', () => {
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    const verdict = verifyReceipt(
      receipt,
      expectationsFor(keys, { callerIdentity: 'someone-else@example.test' }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe(ReceiptRejection.WRONG_CALLER);
  });

  it('does not check the caller binding when the target cannot observe an identity', () => {
    // The honest behaviour when a transport supplies no principal: verify what is
    // real, record the gap, and never invent an identity to compare against.
    const { signingKey, keys } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    expect(verifyReceipt(receipt, expectationsFor(keys, { callerIdentity: undefined })).ok).toBe(true);
  });
});

describe('readSignedReceipt', () => {
  it('returns null for structurally incomplete receipts', () => {
    expect(readSignedReceipt({ claims: { caller: {}, target: {}, evidence: {} }, alg: 'Ed25519', keyId: 'k', signature: 's' })).toBeNull();
    expect(readSignedReceipt({ claims: { caller: 'x', target: {}, evidence: {} }, alg: 'a', keyId: 'k', signature: 's' })).toBeNull();
    expect(readSignedReceipt(null)).toBeNull();
  });

  it('round-trips a signed receipt through JSON', () => {
    const { signingKey } = newKeyPair();
    const receipt = signReceipt(claimsFor(), signingKey);

    expect(readSignedReceipt(JSON.parse(JSON.stringify(receipt)))).toEqual(receipt);
  });
});

describe('key loading', () => {
  it('loads a signing key and its verification key from PEM', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const signing = signingKeyFromPem(
      'from-pem',
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    const keys = verificationKeysFromPem({
      'from-pem': publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });

    const receipt = signReceipt(claimsFor(), signing);
    expect(verifyReceipt(receipt, expectationsFor(keys)).ok).toBe(true);
  });
});
