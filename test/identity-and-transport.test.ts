/**
 * What the proxy can actually learn about its caller, and how it talks to the target.
 *
 * The identity tests matter beyond coverage: HAC-326 must freeze the caller
 * identity shape *or* record that it could not, and the difference between those
 * two outcomes is decided entirely by what this module returns for a given set of
 * headers. A test that accepted an invented identity would let the receipt bind
 * to a fiction.
 */
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { IDENTITY_UNAVAILABLE, observeIdentity } from '../src/proxy/identity.js';
import { HttpTargetPort, DirectTargetPort } from '../src/proxy/target-port.js';
import type { TargetResponse } from '../src/target/service.js';
import { decodeReceiptHeader, encodeReceiptHeader } from '../src/target/http.js';
import { targetsForIntent } from '../src/proxy/http.js';
import { reservationPath } from '../src/target/state.js';

/** Build a Google-shaped ID token. Signature is irrelevant: it is never checked here. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature-not-checked-here`;
}

describe('observeIdentity', () => {
  it('prefers a platform-verified end-user header', () => {
    expect(
      observeIdentity({ 'x-goog-authenticated-user-email': 'accounts.google.com:qwynn@example.test' }),
    ).toEqual({
      identity: 'qwynn@example.test',
      identitySource: 'x-goog-authenticated-user-email/platform-verified',
    });
  });

  it('reads the email claim from a bearer ID token', () => {
    const headers = { authorization: `Bearer ${idToken({ email: 'svc@project.iam.gserviceaccount.com' })}` };

    expect(observeIdentity(headers)).toEqual({
      identity: 'svc@project.iam.gserviceaccount.com',
      identitySource: 'oidc-id-token/platform-verified:email',
    });
  });

  it('falls back to the subject when a token carries no email', () => {
    const headers = { authorization: `Bearer ${idToken({ sub: '109876543210' })}` };

    expect(observeIdentity(headers)).toEqual({
      identity: '109876543210',
      identitySource: 'oidc-id-token/platform-verified:sub',
    });
  });

  it('accepts a lowercase scheme, since header casing is not guaranteed', () => {
    const headers = { authorization: `bearer ${idToken({ email: 'a@b.test' })}` };

    expect(observeIdentity(headers).identity).toBe('a@b.test');
  });

  it('takes the first value when a header arrives repeated', () => {
    expect(observeIdentity({ 'x-goog-authenticated-user-email': ['first@x.test', 'second@x.test'] }).identity).toBe(
      'first@x.test',
    );
  });

  it.each([
    ['no headers at all', {}],
    ['an empty header', { 'x-goog-authenticated-user-email': '' }],
    ['a non-bearer authorization', { authorization: 'Basic abc123' }],
    ['a token with too few segments', { authorization: 'Bearer not.a-token' }],
    ['a token whose payload is not base64 JSON', { authorization: 'Bearer a.!!!!.c' }],
    ['a token whose payload is a JSON array', { authorization: `Bearer ${idToken([] as never)}` }],
    ['a token with neither email nor sub', { authorization: `Bearer ${idToken({ aud: 'x' })}` }],
    ['a token with an empty email', { authorization: `Bearer ${idToken({ email: '' })}` }],
  ])('reports unavailable for %s rather than inventing one', (_label, headers) => {
    // The load-bearing assertion: no header set produces a plausible-looking
    // identity that nothing actually authenticated.
    expect(observeIdentity(headers)).toEqual(IDENTITY_UNAVAILABLE);
  });
});

describe('receipt header encoding', () => {
  it('round-trips a receipt', () => {
    const receipt = { claims: { receiptId: 'r' } };

    expect(decodeReceiptHeader(encodeReceiptHeader(receipt))).toEqual(receipt);
  });

  it('reports an absent header as absent', () => {
    expect(decodeReceiptHeader(undefined)).toBeNull();
    expect(decodeReceiptHeader('')).toBeNull();
  });

  it('reports an undecodable header as present-but-malformed, not absent', () => {
    // The distinction decides whether this is logged as a bypass attempt or as a
    // corrupted receipt, and those are different incidents.
    expect(decodeReceiptHeader('%%%not-base64%%%')).not.toBeNull();
  });

  it('reads the first value when the header repeats', () => {
    expect(decodeReceiptHeader([encodeReceiptHeader({ a: 1 }), encodeReceiptHeader({ a: 2 })])).toEqual({
      a: 1,
    });
  });
});

describe('targetsForIntent', () => {
  it('maps a service argument to its evidence-namespace path', () => {
    expect(targetsForIntent({ operation: 'set_reservation', arguments: { service: 'alpha' } })).toEqual([
      reservationPath('alpha'),
    ]);
  });

  it('claims no paths when the argument is missing, so nothing is silently coupled', () => {
    expect(targetsForIntent({ operation: 'set_reservation', arguments: {} })).toEqual([]);
  });
});

describe('HttpTargetPort', () => {
  const listen = (server: Server): Promise<string> =>
    new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      });
    });

  const close = (server: Server): Promise<void> =>
    new Promise((resolve) => {
      server.close(() => resolve());
    });

  it('reads the revision and attaches a bearer token when one is supplied', async () => {
    let seenAuthorization: string | undefined;
    const server = createServer((request, response) => {
      seenAuthorization = request.headers.authorization;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ revision: 'sha256:abc' }));
    });
    const baseUrl = await listen(server);

    const port = new HttpTargetPort({ baseUrl, authToken: () => Promise.resolve('token-123') });

    expect(await port.revision()).toBe('sha256:abc');
    expect(seenAuthorization).toBe('Bearer token-123');

    await close(server);
  });

  it('throws when the target answers a state read with an error status', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503).end('{}');
    });
    const baseUrl = await listen(server);

    await expect(new HttpTargetPort({ baseUrl }).revision()).rejects.toThrow(/HTTP 503/);

    await close(server);
  });

  it('throws when the state response carries no revision', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ state: {} }));
    });
    const baseUrl = await listen(server);

    await expect(new HttpTargetPort({ baseUrl }).revision()).rejects.toThrow(/no revision/);

    await close(server);
  });

  it('returns a target refusal as a value, not as a transport exception', async () => {
    // "The target refused" is an answer. Turning it into an exception would make
    // it indistinguishable from "the target could not be reached", and those
    // failures need different handling.
    const server = createServer((_request, response) => {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'REJECTED', reasonCode: 'RECEIPT_ABSENT' }));
    });
    const baseUrl = await listen(server);

    const result = await new HttpTargetPort({ baseUrl }).execute({
      correlationId: 'ilk-aaaaaaaa',
      receipt: { claims: {}, alg: 'Ed25519', keyId: 'k', signature: 's' } as never,
      intent: { operation: 'set_reservation', arguments: {} },
    });

    expect(result.status).toBe('REJECTED');

    await close(server);
  });

  it('presents the receipt and correlation id on the mutate call', async () => {
    const seen: Record<string, string | string[] | undefined> = {};
    const server = createServer((request, response) => {
      Object.assign(seen, request.headers);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'EXECUTED' }));
    });
    const baseUrl = await listen(server);

    await new HttpTargetPort({ baseUrl }).execute({
      correlationId: 'ilk-aaaaaaaa',
      receipt: { claims: { receiptId: 'r' }, alg: 'Ed25519', keyId: 'k', signature: 's' } as never,
      intent: { operation: 'set_reservation', arguments: { service: 'alpha', reserved: 1 } },
    });

    expect(seen['interlock-correlation-id']).toBe('ilk-aaaaaaaa');
    expect(decodeReceiptHeader(seen['interlock-receipt'])).toMatchObject({
      claims: { receiptId: 'r' },
    });

    await close(server);
  });
});

describe('DirectTargetPort', () => {
  it('calls the same target methods the HTTP adapter calls', async () => {
    const executed: unknown[] = [];
    const port = new DirectTargetPort({
      revision: 'sha256:direct',
      mutate: (request) => {
        executed.push(request);
        return { status: 'EXECUTED' } as TargetResponse;
      },
    });

    expect(await port.revision()).toBe('sha256:direct');

    const result = await port.execute({
      correlationId: 'ilk-aaaaaaaa',
      receipt: { claims: {}, alg: 'Ed25519', keyId: 'k', signature: 's' } as never,
      intent: { operation: 'set_reservation', arguments: {} },
    });

    expect(result.status).toBe('EXECUTED');
    expect(executed).toHaveLength(1);
  });
});
