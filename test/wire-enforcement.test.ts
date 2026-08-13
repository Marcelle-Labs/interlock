/**
 * The whole path over real sockets.
 *
 * Everything else in this suite exercises the enforcement objects directly.
 * This file starts both services on loopback and drives them the way a caller
 * would, because several of HAC-326's questions are only answerable over a real
 * transport: what envelope actually arrives, whether the correlation identifier
 * survives two hops, and — most importantly — whether the target still refuses
 * when someone skips the proxy and posts straight at it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { intentDigest } from '../src/authorization/intent.js';
import type { Intent } from '../src/authorization/intent.js';
import type { ReceiptClaims } from '../src/authorization/receipt.js';
import { RECEIPT_VERSION, ReceiptRejection, signReceipt } from '../src/authorization/receipt.js';
import { AdmissionRejection } from '../src/broker/bypass/guard.js';
import { InMemoryReplayLedger } from '../src/broker/idempotency/ledger.js';
import { InMemoryPendingIntentStore } from '../src/broker/pairing/store.js';
import { CORRELATION_HEADER, RECEIPT_HEADER } from '../src/correlation.js';
import { createProxyServer, MCP_PROTOCOL_VERSION } from '../src/proxy/http.js';
import { InterlockProxy } from '../src/proxy/service.js';
import { HttpTargetPort } from '../src/proxy/target-port.js';
import { createTargetServer, encodeReceiptHeader } from '../src/target/http.js';
import { ProtectedTarget } from '../src/target/service.js';
import { INITIAL_STATE } from '../src/target/state.js';
import { BASELINE_BASIS, BASELINE_EVIDENCE, newKeyPair } from './support/s2.js';

const TARGET_ID = 'interlock-s2-target';

const listen = (server: Server): Promise<string> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

let targetServer: Server;
let proxyServer: Server;
let targetUrl: string;
let proxyUrl: string;
let target: ProtectedTarget;
let signingKey: ReturnType<typeof newKeyPair>['signingKey'];
const envelopes: unknown[] = [];

beforeAll(async () => {
  const keyPair = newKeyPair('interlock-s2-wire');
  signingKey = keyPair.signingKey;

  target = new ProtectedTarget({
    targetId: TARGET_ID,
    keys: keyPair.keys,
    ledger: new InMemoryReplayLedger(),
  });
  targetServer = createTargetServer({ target });
  targetUrl = await listen(targetServer);

  const proxy = new InterlockProxy({
    targetId: TARGET_ID,
    store: new InMemoryPendingIntentStore(),
    target: new HttpTargetPort({ baseUrl: targetUrl }),
    signingKey,
    evidence: BASELINE_EVIDENCE,
    sourceRevision: BASELINE_BASIS,
  });
  proxyServer = createProxyServer({
    proxy,
    onEnvelope: (envelope) => envelopes.push(envelope),
  });
  proxyUrl = await listen(proxyServer);
});

afterAll(async () => {
  await close(proxyServer);
  await close(targetServer);
});

const mcp = async (method: string, params?: unknown, headers: Record<string, string> = {}) => {
  const response = await fetch(`${proxyUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

describe('the MCP surface a real client sees', () => {
  it('initializes with a protocol version and server info', async () => {
    const { body } = await mcp('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1' },
    });

    const result = body['result'] as Record<string, unknown>;
    expect(result['protocolVersion']).toBe(MCP_PROTOCOL_VERSION);
    expect((result['serverInfo'] as Record<string, unknown>)['name']).toBe('interlock-proxy');
  });

  it('advertises exactly one tool, with a schema', async () => {
    const { body } = await mcp('tools/list');

    const tools = (body['result'] as { tools: { name: string; inputSchema: unknown }[] }).tools;
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('set_reservation');
    expect(tools[0]?.inputSchema).toBeDefined();
  });

  it('answers an unknown method with a JSON-RPC error, not a crash', async () => {
    const { body } = await mcp('tools/nonexistent');

    expect((body['error'] as { code: number }).code).toBe(-32601);
  });

  it('rejects a malformed JSON-RPC envelope', async () => {
    const response = await fetch(`${proxyUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ not: 'jsonrpc' }),
    });

    expect(response.status).toBe(400);
  });

  it('executes an allowed tool call end to end', async () => {
    const { body } = await mcp('tools/call', {
      name: 'set_reservation',
      arguments: { service: 'alpha', reserved: 50 },
    });

    const result = body['result'] as { isError: boolean; structuredContent: { decision: string } };
    expect(result.isError).toBe(false);
    expect(result.structuredContent.decision).toBe('ALLOW');
    expect(target.state.services['alpha']).toBe(50);
  });

  it('marks a denial as isError and carries the structured rationale', async () => {
    // Deny by asking for something the target's own invariant refuses, so the
    // denial travels the full path back through MCP.
    const { body } = await mcp('tools/call', {
      name: 'set_reservation',
      arguments: { service: 'beta', reserved: 999 },
    });

    const result = body['result'] as {
      isError: boolean;
      structuredContent: { decision: string; reasonCode: string; correlationId: string };
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent.decision).toBe('DENY');
    expect(result.structuredContent.correlationId).toMatch(/^ilk-/);
    // The same answer is in the text block, because clients differ in which one
    // they surface to the model.
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({ decision: 'DENY' });
  });

  it('rejects a call for a tool it does not expose', async () => {
    const { body } = await mcp('tools/call', { name: 'rm_rf', arguments: {} });

    expect((body['error'] as { code: number }).code).toBe(-32602);
  });

  it('captures the request envelope for the frozen fixture', async () => {
    envelopes.length = 0;
    await mcp('tools/call', {
      name: 'set_reservation',
      arguments: { service: 'gamma', reserved: 21 },
    });

    const [envelope] = envelopes as {
      transport: string;
      identity: string;
      identitySource: string;
      body: unknown;
    }[];
    expect(envelope?.transport).toBe('mcp');
    // No authenticated principal on loopback — recorded honestly rather than
    // invented.
    expect(envelope?.identity).toBe('unavailable');
    expect(envelope?.identitySource).toBe('none/no-authenticated-principal-observed');
  });
});

describe('the plain HTTP surface', () => {
  it('executes an allowed intent', async () => {
    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'gamma', reserved: 22 } }),
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { decision: string }).decision).toBe('ALLOW');
  });

  it('answers a denial with 403 and a structured body', async () => {
    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 999 } }),
    });

    const body = (await response.json()) as { decision: string; reasonCode: string };
    expect(response.status).toBe(403);
    expect(body.decision).toBe('DENY');
    expect(body.reasonCode).toBeDefined();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });

    expect(response.status).toBe(400);
  });

  it('serves health and 404s anything else', async () => {
    expect((await fetch(`${proxyUrl}/healthz`)).status).toBe(200);
    expect((await fetch(`${proxyUrl}/nope`)).status).toBe(404);
  });
});

describe('correlation survives caller → proxy → target', () => {
  it('carries a caller-supplied identifier all the way to the execution record', async () => {
    const correlationId = 'ilk-tracedthrough';

    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CORRELATION_HEADER]: correlationId },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'gamma', reserved: 23 } }),
    });

    const body = (await response.json()) as {
      correlationId: string;
      execution: { correlationId: string };
    };

    expect(body.correlationId).toBe(correlationId);
    // The target recorded the same identifier, which is the join the verifier
    // will rely on.
    expect(body.execution.correlationId).toBe(correlationId);
  });

  it('mints one when the caller supplies none, rather than failing the request', async () => {
    const response = await fetch(`${proxyUrl}/v1/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'gamma', reserved: 24 } }),
    });

    expect(((await response.json()) as { correlationId: string }).correlationId).toMatch(/^ilk-/);
  });
});

describe('the target refuses direct attacks, over the wire', () => {
  const mutate = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${targetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const stateNow = async (): Promise<Record<string, number>> => {
    const response = await fetch(`${targetUrl}/v1/state`);
    const body = (await response.json()) as { state: { services: Record<string, number> } };
    return body.state.services;
  };

  const receiptFor = (intent: Intent, overrides: Partial<ReceiptClaims> = {}) =>
    signReceipt(
      {
        receiptVersion: RECEIPT_VERSION,
        receiptId: 'rcpt-wire',
        correlationId: 'ilk-wireattack',
        caller: { identity: 'attacker@example.test', identitySource: 'test' },
        operation: intent.operation,
        intentDigest: intentDigest(intent),
        target: { targetId: TARGET_ID, expectedRevision: target.revision },
        evidence: { basisRevision: 'x', artifactSha256: 'y', producerSha: 'z' },
        decision: 'ALLOW',
        issuedAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        nonce: `nonce-wire-${Math.random().toString(36).slice(2)}`,
        ...overrides,
      } as ReceiptClaims,
      signingKey,
    );

  it('refuses a direct call carrying no receipt — the bypass case', async () => {
    const before = await stateNow();

    const response = await mutate({
      operation: 'set_reservation',
      arguments: { service: 'alpha', reserved: 99 },
    });
    const body = (await response.json()) as { status: string; reasonCode: string };

    expect(response.status).toBe(403);
    expect(body.reasonCode).toBe(ReceiptRejection.ABSENT);
    expect(await stateNow()).toEqual(before);
  });

  it('refuses an undecodable receipt header as malformed, not as absent', async () => {
    const before = await stateNow();

    const response = await mutate(
      { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 99 } },
      { [RECEIPT_HEADER]: 'not-base64url-json' },
    );
    const body = (await response.json()) as { reasonCode: string };

    expect(body.reasonCode).toBe(ReceiptRejection.MALFORMED);
    expect(await stateNow()).toEqual(before);
  });

  it('refuses a receipt whose arguments were edited in transit', async () => {
    const before = await stateNow();
    const receipt = receiptFor({
      operation: 'set_reservation',
      arguments: { service: 'alpha', reserved: 41 },
    });

    const response = await mutate(
      { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 120 } },
      { [RECEIPT_HEADER]: encodeReceiptHeader(receipt) },
    );
    const body = (await response.json()) as { reasonCode: string };

    expect(body.reasonCode).toBe(ReceiptRejection.INTENT_MISMATCH);
    expect(await stateNow()).toEqual(before);
  });

  it('refuses a receipt minted for a different target', async () => {
    const before = await stateNow();
    const intent: Intent = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 41 } };
    const receipt = receiptFor(intent, {
      target: { targetId: 'some-other-service', expectedRevision: target.revision },
    });

    const response = await mutate(intent, { [RECEIPT_HEADER]: encodeReceiptHeader(receipt) });

    expect(((await response.json()) as { reasonCode: string }).reasonCode).toBe(
      ReceiptRejection.WRONG_TARGET,
    );
    expect(await stateNow()).toEqual(before);
  });

  it('refuses a replayed receipt on the second presentation', async () => {
    const intent: Intent = { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 44 } };
    const receipt = receiptFor(intent);
    const header = { [RECEIPT_HEADER]: encodeReceiptHeader(receipt) };

    const first = await mutate(intent, header);
    expect(first.status).toBe(200);
    const afterFirst = await stateNow();

    const second = await mutate(intent, header);
    const body = (await second.json()) as { reasonCode: string };

    expect(second.status).toBe(403);
    expect([AdmissionRejection.REPLAYED, ReceiptRejection.STALE_REVISION]).toContain(body.reasonCode);
    expect(await stateNow()).toEqual(afterFirst);
  });

  it('refuses a malformed request body', async () => {
    const response = await fetch(`${targetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'nonsense',
    });

    expect(response.status).toBe(400);
  });

  it('refuses a body that is not an intent', async () => {
    const response = await mutate({ something: 'else' });

    expect(response.status).toBe(400);
  });

  it('404s an unknown route', async () => {
    expect((await fetch(`${targetUrl}/admin`)).status).toBe(404);
  });
});

describe('proxy outage does not become bypass', () => {
  it('the caller cannot reach the protected path, and the target still refuses', async () => {
    // Arm A of the chaos set, over real sockets: stand up an isolated pair,
    // stop the proxy, then try both the proxy and the target directly.
    const keyPair = newKeyPair('interlock-s2-outage');
    const isolatedTarget = new ProtectedTarget({
      targetId: TARGET_ID,
      keys: keyPair.keys,
      ledger: new InMemoryReplayLedger(),
    });
    const isolatedTargetServer = createTargetServer({ target: isolatedTarget });
    const isolatedTargetUrl = await listen(isolatedTargetServer);

    const isolatedProxyServer = createProxyServer({
      proxy: new InterlockProxy({
        targetId: TARGET_ID,
        store: new InMemoryPendingIntentStore(),
        target: new HttpTargetPort({ baseUrl: isolatedTargetUrl }),
        signingKey: keyPair.signingKey,
        evidence: BASELINE_EVIDENCE,
        sourceRevision: BASELINE_BASIS,
      }),
    });
    const isolatedProxyUrl = await listen(isolatedProxyServer);

    await close(isolatedProxyServer);

    // 1. The proxy is gone: the request fails at the transport.
    await expect(
      fetch(`${isolatedProxyUrl}/v1/intents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 60 } }),
      }),
    ).rejects.toThrow();

    // 2. Routing around the outage does not help: no receipt, no mutation.
    const direct = await fetch(`${isolatedTargetUrl}/v1/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 60 } }),
    });

    expect(direct.status).toBe(403);
    expect(isolatedTarget.state).toEqual(INITIAL_STATE);

    await close(isolatedTargetServer);
  });
});
