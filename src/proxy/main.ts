/**
 * Cloud Run entrypoint for the Interlock proxy.
 *
 * Thin, for the same reason as the target's entrypoint: the rules live in
 * `service.ts`, and this file only assembles them.
 *
 * The evidence artifact is read from disk at startup and never refetched. That
 * is deliberate — a decision path that reloads its evidence mid-flight could
 * decide two halves of the same concurrent pair against two different artifacts,
 * and no receipt would record which one applied.
 */
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';

import { signingKeyFromPem } from '../authorization/receipt.js';
import { InMemoryPendingIntentStore } from '../broker/pairing/store.js';
import type { Environment } from '../config.js';
import { ENV, readDurationMs, readPort, optional, required } from '../config.js';
import { createProxyServer } from './http.js';
import { InterlockProxy } from './service.js';
import { HttpTargetPort } from './target-port.js';

const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

/**
 * Fetch a Google-signed ID token for `audience` from the metadata server.
 *
 * Returns `undefined` off-platform — a local run has no metadata server, and the
 * local target does not require a token. It never throws: an identity that
 * cannot be obtained produces an unauthenticated call the target will refuse,
 * which is a clearer failure than a crash inside the request path.
 */
export async function metadataIdToken(audience: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    if (response.ok) return await response.text();

    // Swallowing this silently makes an unauthenticated downstream call
    // indistinguishable from a misconfigured one, and the resulting 403 arrives
    // with no explanation at all. Observed during the HAC-326 Cloud Run arm.
    process.stderr.write(
      `${JSON.stringify({
        event: 'proxy.identity_token_unavailable',
        status: response.status,
        audience,
      })}\n`,
    );
    return undefined;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        event: 'proxy.identity_token_error',
        error: (error as Error).message,
        audience,
      })}\n`,
    );
    return undefined;
  }
}

export interface StartedProxy {
  readonly server: Server;
  readonly port: number;
}

/** Build and start the proxy from an environment record. */
export function startProxy(env: Environment): Promise<StartedProxy> {
  const targetUrl = required(env, ENV.TARGET_URL);
  const evidencePath = required(env, ENV.EVIDENCE_PATH);
  const port = readPort(env, 8080);

  // Service-to-service tokens are opt-in via an explicit audience. A local run
  // has no metadata server, and reaching for one on every request would add a
  // DNS timeout to a path whose latency this issue is trying to measure.
  const audience = optional(env, ENV.TARGET_AUDIENCE, '');

  const proxy = new InterlockProxy({
    targetId: required(env, ENV.TARGET_ID),
    store: new InMemoryPendingIntentStore(),
    target: new HttpTargetPort({
      baseUrl: targetUrl,
      ...(audience === '' ? {} : { authToken: () => metadataIdToken(audience) }),
    }),
    signingKey: signingKeyFromPem(
      required(env, ENV.SIGNING_KEY_ID),
      required(env, ENV.SIGNING_KEY_PEM),
    ),
    evidence: JSON.parse(readFileSync(evidencePath, 'utf8')),
    sourceRevision: required(env, ENV.SOURCE_REVISION),
    receiptTtlMs: readDurationMs(env, ENV.RECEIPT_TTL_MS, 30_000),
    decisionTimeoutMs: readDurationMs(env, ENV.DECISION_TIMEOUT_MS, 2_000),
  });

  const server = createProxyServer({
    proxy,
    // One structured line per request. Cloud Logging parses JSON on stdout, and
    // a log that a verifier cannot parse is a log that will not be read.
    onEnvelope: (envelope) => {
      process.stdout.write(
        `${JSON.stringify({
          event: 'proxy.request',
          transport: envelope.transport,
          correlationId: envelope.correlationId,
          identity: envelope.identity,
          identitySource: envelope.identitySource,
        })}\n`,
      );
    },
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({ server, port });
    });
  });
}

if (process.argv[1]?.endsWith('proxy/main.js') === true) {
  startProxy(process.env)
    .then((started) => {
      process.stdout.write(`${JSON.stringify({ event: 'proxy.listening', port: started.port })}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({ event: 'proxy.failed', error: (error as Error).message })}\n`,
      );
      process.exitCode = 1;
    });
}
