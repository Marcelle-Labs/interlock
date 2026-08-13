/**
 * The deployable artifacts, started the way Cloud Run starts them.
 *
 * This is the only test that exercises the entrypoints — the code that reads
 * `PORT`, loads key material from the environment, and reads the evidence
 * artifact off disk. Without it, "the enforcement logic is proven" and "the
 * thing we deploy enforces" would be two different claims, and only the first
 * would have evidence.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ConfigurationError, ENV } from '../src/config.js';
import { metadataIdToken, startProxy } from '../src/proxy/main.js';
import { startTarget } from '../src/target/main.js';
import { BASELINE_BASIS } from './support/s2.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = join(repoRoot, 'experiments', 'hac-330', 'evidence', 'baseline.evidence.json');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const TARGET_ID = 'interlock-s2-deployable';

let targetServer: Server;
let proxyServer: Server;
let proxyUrl: string;
let targetUrl: string;

const portOf = (server: Server): number => (server.address() as AddressInfo).port;

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

beforeAll(async () => {
  const started = await startTarget({
    [ENV.PORT]: '0',
    [ENV.TARGET_ID]: TARGET_ID,
    [ENV.VERIFICATION_KEYS]: JSON.stringify({ 'deploy-key': publicPem }),
  });
  targetServer = started.server;
  targetUrl = `http://127.0.0.1:${portOf(targetServer)}`;

  const startedProxy = await startProxy({
    [ENV.PORT]: '0',
    [ENV.TARGET_ID]: TARGET_ID,
    [ENV.TARGET_URL]: targetUrl,
    [ENV.SIGNING_KEY_ID]: 'deploy-key',
    [ENV.SIGNING_KEY_PEM]: privatePem,
    [ENV.EVIDENCE_PATH]: evidencePath,
    [ENV.SOURCE_REVISION]: BASELINE_BASIS,
  });
  proxyServer = startedProxy.server;
  proxyUrl = `http://127.0.0.1:${portOf(proxyServer)}`;
});

afterAll(async () => {
  await close(proxyServer);
  await close(targetServer);
});

describe('the services as deployed', () => {
  it('start from the environment and serve health', async () => {
    expect((await fetch(`${proxyUrl}/healthz`)).status).toBe(200);
    expect((await fetch(`${targetUrl}/v1/state`)).status).toBe(200);
  });

  it('carry an intent all the way through to a mutation', async () => {
    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 45 } }),
    });
    const body = (await response.json()) as { decision: string };

    expect(body.decision).toBe('ALLOW');

    const state = (await (await fetch(`${targetUrl}/v1/state`)).json()) as {
      state: { services: Record<string, number> };
    };
    expect(state.state.services['alpha']).toBe(45);
  });

  it('still refuse a direct call to the deployed target', async () => {
    const response = await fetch(`${targetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'beta', reserved: 45 } }),
    });

    expect(response.status).toBe(403);
    expect(((await response.json()) as { reasonCode: string }).reasonCode).toBe('RECEIPT_ABSENT');
  });
});

describe('startup refuses an unusable configuration', () => {
  // These throw synchronously, before a port is ever bound. That is the
  // behaviour worth having: a service that fails to boot is visible in a
  // deployment, whereas one that boots and then refuses everything looks
  // healthy right up to the moment someone disables the check to fix the demo.

  it('will not start a target with no verification keys', () => {
    expect(() => startTarget({ [ENV.TARGET_ID]: TARGET_ID })).toThrow(ConfigurationError);
  });

  it('will not start a proxy with no signing key', () => {
    expect(() =>
      startProxy({
        [ENV.TARGET_ID]: TARGET_ID,
        [ENV.TARGET_URL]: targetUrl,
        [ENV.EVIDENCE_PATH]: evidencePath,
        [ENV.SOURCE_REVISION]: BASELINE_BASIS,
      }),
    ).toThrow(ConfigurationError);
  });

  it('will not start a proxy whose evidence artifact is missing', () => {
    expect(() =>
      startProxy({
        [ENV.TARGET_ID]: TARGET_ID,
        [ENV.TARGET_URL]: targetUrl,
        [ENV.SIGNING_KEY_ID]: 'deploy-key',
        [ENV.SIGNING_KEY_PEM]: privatePem,
        [ENV.EVIDENCE_PATH]: join(repoRoot, 'no-such-evidence.json'),
        [ENV.SOURCE_REVISION]: BASELINE_BASIS,
      }),
    ).toThrow(/ENOENT/);
  });
});

describe('metadataIdToken', () => {
  it('returns the token the metadata server issues', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('id-token') });
    vi.stubGlobal('fetch', stub);

    await expect(metadataIdToken('https://target.run.app')).resolves.toBe('id-token');
    expect(stub.mock.calls[0]?.[0]).toContain('audience=https%3A%2F%2Ftarget.run.app');

    vi.unstubAllGlobals();
  });

  it('returns undefined rather than throwing when there is no metadata server', async () => {
    // Off-platform, this must fail into an unauthenticated call the target
    // refuses — a clearer failure than a crash inside the request path.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));

    await expect(metadataIdToken('https://target.run.app')).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('returns undefined when the metadata server answers an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(metadataIdToken('https://target.run.app')).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
