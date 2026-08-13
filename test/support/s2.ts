/**
 * Shared scaffolding for the HAC-326 enforcement tests.
 *
 * Two rules this file exists to keep:
 *
 * 1. **The evidence is real.** Every test decides from the committed HAC-330
 *    artifact — the verbatim output of the pinned upstream miner over a real
 *    commit graph — not from a hand-written pairs list. A test that invented its
 *    own evidence would prove the decision function reads its argument, which is
 *    not the claim under test.
 * 2. **Keys are generated, never stored.** The signing key is created per test
 *    run and lives only in memory. No private key material is committed, which is
 *    also what `check:provenance` scans for.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { SigningKey, VerificationKeys } from '../../src/authorization/receipt.js';
import { reservationPath } from '../../src/target/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

/** The real co-change evidence produced by HAC-330 against a real commit graph. */
export const BASELINE_EVIDENCE: unknown = JSON.parse(
  readFileSync(join(repoRoot, 'experiments', 'hac-330', 'evidence', 'baseline.evidence.json'), 'utf8'),
);

/**
 * The commit the baseline evidence is pinned to.
 *
 * Read from the artifact rather than written here, so a regenerated packet
 * cannot leave the tests asserting against a revision that no longer exists.
 */
export const BASELINE_BASIS: string = (
  (BASELINE_EVIDENCE as { selection: { scoringBasis: { basisRevision: string } } }).selection
    .scoringBasis.basisRevision
);

export const ALPHA = reservationPath('alpha');
export const BETA = reservationPath('beta');
export const GAMMA = reservationPath('gamma');

/**
 * A fresh Ed25519 key pair and its verification registry.
 *
 * `keyId` is parameterised so a test can register one key and present a receipt
 * signed by another — the fabricated-receipt case.
 */
export function newKeyPair(keyId = 'interlock-s2-test'): {
  readonly signingKey: SigningKey;
  readonly keys: VerificationKeys;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signingKey: { keyId, privateKey },
    keys: new Map([[keyId, publicKey]]),
  };
}

/** A fixed instant, so expiry assertions do not depend on wall-clock speed. */
export const T0 = new Date('2026-08-13T12:00:00.000Z');

export const at = (offsetMs: number): Date => new Date(T0.getTime() + offsetMs);
