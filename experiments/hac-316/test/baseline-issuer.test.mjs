/**
 * The composition-unaware issuer.
 *
 * What has to be shown is not that it works — a broken baseline would make the
 * treatment look better, which is the wrong direction of error. What has to be
 * shown is that it is *fair*: it uses the same receipt machinery, binds the same
 * fields, and is refused by the target for the same reasons. The only thing it
 * lacks is knowledge of what else is in flight.
 *
 * So these tests check that its receipts are genuinely admitted by an unchanged
 * target, that it authorizes each of the two intents on its own merits, and that
 * it produces the composed breach when given both — the baseline behaviour the
 * counterfactual is measured against.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { intentDigest } from '../../../dist/authorization/intent.js';
import { newCorrelationId } from '../../../dist/correlation.js';
import { createTargetServer } from '../../../dist/target/http.js';
import { INITIAL_STATE, OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

import { CompositionUnawareIssuer, IssuerRejection } from '../src/baseline-issuer.mjs';
import { httpReread, verifyComposition } from '../src/global-verifier.mjs';
import { PARTITIONED_SERVICES, TARGET_IDS, createPartitionedTargets } from '../src/partition.mjs';

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));

async function topology() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'baseline-issuer-test';
  const targets = createPartitionedTargets({ keys: new Map([[keyId, publicKey]]) });
  const servers = {};
  const urls = {};
  for (const service of PARTITIONED_SERVICES) {
    servers[service] = createTargetServer({ target: targets[service] });
    urls[service] = await listen(servers[service]);
  }
  const issuer = new CompositionUnawareIssuer({
    targetIds: TARGET_IDS,
    targetUrls: urls,
    keyId,
    signingKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    receiptProvenance: {
      evidence: { basisRevision: 'basis', artifactSha256: 'sha', producerSha: 'producer' },
    },
  });
  return {
    issuer,
    urls,
    targets,
    stop: async () => {
      for (const server of Object.values(servers)) await close(server);
    },
  };
}

const call = (issuer, service) =>
  issuer.issue({
    correlationId: newCorrelationId(),
    callerIdentity: 'baseline-issuer-test',
    identitySource: 'test',
    intent: { operation: OPERATION_SET_RESERVATION, arguments: { service, reserved: 60 } },
  });

describe('the composition-unaware issuer', () => {
  it('mints a receipt an unchanged protected target admits', async () => {
    const built = await topology();
    try {
      const result = await call(built.issuer, 'alpha');
      expect(result.authorized).toBe(true);
      expect(result.execution.status).toBe('EXECUTED');
      expect(result.intentDigest).toBe(
        intentDigest({ operation: OPERATION_SET_RESERVATION, arguments: { service: 'alpha', reserved: 60 } }),
      );
      expect(result.execution.revisionAfter).not.toBe(result.execution.revisionBefore);
    } finally {
      await built.stop();
    }
  });

  it('authorizes each intent on its own merits and produces the composed breach', async () => {
    const built = await topology();
    try {
      for (const service of PARTITIONED_SERVICES) {
        const result = await call(built.issuer, service);
        expect(result.authorized).toBe(true);
        expect(result.execution.status).toBe('EXECUTED');
        // Each is individually valid at its own target, which is exactly why
        // no single-request check can see the problem.
        expect(result.execution.invariant.holds).toBe(true);
      }

      const verdict = await verifyComposition({
        readers: Object.fromEntries(
          PARTITIONED_SERVICES.map((service) => [service, httpReread(built.urls[service])]),
        ),
      });
      expect(verdict.total).toBe(140);
      expect(verdict.cap).toBe(INITIAL_STATE.totalReservable);
      expect(verdict.holds).toBe(false);
    } finally {
      await built.stop();
    }
  });

  it('refuses an operation it does not front, without contacting a target', async () => {
    const built = await topology();
    try {
      const result = await built.issuer.issue({
        correlationId: newCorrelationId(),
        callerIdentity: 'baseline-issuer-test',
        identitySource: 'test',
        intent: { operation: 'delete_everything', arguments: { service: 'alpha', reserved: 60 } },
      });
      expect(result.authorized).toBe(false);
      expect(result.reasonCode).toBe(IssuerRejection.UNSUPPORTED_OPERATION);
      expect(built.targets.alpha.read().state.services.alpha).toBe(INITIAL_STATE.services.alpha);
    } finally {
      await built.stop();
    }
  });

  it('refuses malformed arguments and an unroutable service', async () => {
    const built = await topology();
    try {
      const malformed = await built.issuer.issue({
        correlationId: newCorrelationId(),
        callerIdentity: 'baseline-issuer-test',
        identitySource: 'test',
        intent: { operation: OPERATION_SET_RESERVATION, arguments: { service: 'alpha' } },
      });
      expect(malformed.reasonCode).toBe(IssuerRejection.MALFORMED_ARGUMENTS);

      const unroutable = await call(built.issuer, 'gamma');
      expect(unroutable.authorized).toBe(false);
      expect(unroutable.reasonCode).toBe(IssuerRejection.UNROUTABLE_SERVICE);
    } finally {
      await built.stop();
    }
  });
});
