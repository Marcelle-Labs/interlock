/**
 * Cloud Run entrypoint for the protected target.
 *
 * Deliberately thin: read configuration, build the same objects the tests build,
 * listen. Anything that looks like a rule belongs in `service.ts`, so that what
 * runs in production is what the enforcement tests exercised.
 */
import type { Server } from 'node:http';

import { verificationKeysFromPem } from '../authorization/receipt.js';
import { InMemoryReplayLedger } from '../broker/idempotency/ledger.js';
import type { Environment } from '../config.js';
import { ENV, optional, readFlag, readKeyMap, readPort, required } from '../config.js';
import { createTargetServer } from './http.js';
import { ProtectedTarget } from './service.js';

export interface StartedTarget {
  readonly server: Server;
  readonly target: ProtectedTarget;
  readonly port: number;
}

/** Build and start the target from an environment record. */
export function startTarget(env: Environment): Promise<StartedTarget> {
  const targetId = required(env, ENV.TARGET_ID);
  const keys = verificationKeysFromPem(readKeyMap(env, ENV.VERIFICATION_KEYS));
  const port = readPort(env, 8081);

  const target = new ProtectedTarget({ targetId, keys, ledger: new InMemoryReplayLedger() });
  const identityMode = optional(env, ENV.IDENTITY_MODE, 'cloud-run');
  const identityConfiguration =
    identityMode === 'local-test'
      ? { mode: 'local-test' as const, secret: required(env, ENV.TEST_IDENTITY_SECRET), audience: required(env, ENV.TARGET_AUDIENCE) }
      : { mode: 'cloud-run' as const };
  const server = createTargetServer({
    target,
    enforceCallerIdentity: readFlag(env, ENV.ENFORCE_CALLER_IDENTITY),
    requireTransportIdentity: readFlag(env, ENV.REQUIRE_TRANSPORT_IDENTITY),
    identityConfiguration,
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({ server, target, port });
    });
  });
}

// Started only when executed directly, so importing this module in a test does
// not bind a port.
if (process.argv[1]?.endsWith('target/main.js') === true) {
  try {
    const started = await startTarget(process.env);
    process.stdout.write(`${JSON.stringify({ event: 'target.listening', port: started.port })}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ event: 'target.failed', error: (error as Error).message })}\n`,
    );
    process.exitCode = 1;
  }
}
