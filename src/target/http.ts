/**
 * The protected target's HTTP surface.
 *
 * A thin adapter over `ProtectedTarget`. Every enforcement rule lives in the
 * service, not here, so that the direct-attack tests and the over-the-wire tests
 * exercise the same code. What this file adds is exactly three things: reading
 * the receipt off the wire, observing the caller identity the transport supplies,
 * and choosing a status code.
 *
 * ## Status codes are advisory; the body is the record
 *
 * A refusal is `403`, a malformed request `400`, an executed mutation `200`. But
 * the machine-readable answer is always the JSON body, because a status code
 * cannot say *why* and an intermediary can rewrite one. Nothing downstream should
 * branch on the number alone.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { readIntent } from '../authorization/intent.js';
import { CORRELATION_HEADER, RECEIPT_HEADER, resolveCorrelationId } from '../correlation.js';
import { readJsonBody, sendJson } from '../http/json.js';
import { observeIdentity } from '../proxy/identity.js';
import type { ProtectedTarget } from './service.js';
import { asCanonical } from './state.js';

/** Receipts arrive base64url-encoded in a header to keep them out of the body. */
export function decodeReceiptHeader(value: string | string[] | undefined): unknown {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === '') return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    // Undecodable is not absent: returning a non-null sentinel keeps this out of
    // the RECEIPT_ABSENT bucket, so a corrupted receipt is reported as malformed
    // rather than as a bypass attempt.
    return { malformed: true };
  }
}

export function encodeReceiptHeader(receipt: unknown): string {
  return Buffer.from(JSON.stringify(receipt), 'utf8').toString('base64url');
}

export interface TargetServerOptions {
  readonly target: ProtectedTarget;
  /** Whether to bind the caller identity the transport reports. */
  readonly enforceCallerIdentity?: boolean;
}

async function handleMutate(
  options: TargetServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { correlationId } = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
  const body = await readJsonBody(request);

  if (!body.ok) {
    sendJson(response, 400, {
      status: 'REJECTED',
      correlationId,
      reasonCode: 'MALFORMED_REQUEST',
      detail: body.detail,
    });
    return;
  }

  const intent = readIntent(body.value);
  if (intent === null) {
    sendJson(response, 400, {
      status: 'REJECTED',
      correlationId,
      reasonCode: 'MALFORMED_REQUEST',
      detail: 'body must be { operation: string, arguments: object }',
    });
    return;
  }

  const observed = observeIdentity(request.headers);
  const result = options.target.mutate({
    correlationId,
    presented: decodeReceiptHeader(request.headers[RECEIPT_HEADER]),
    intent,
    now: new Date(),
    ...(options.enforceCallerIdentity === true ? { callerIdentity: observed.identity } : {}),
  });

  sendJson(response, result.status === 'EXECUTED' ? 200 : 403, result);
}

/**
 * Build the target's HTTP server.
 *
 * `GET /v1/state` is the independent read the verifier arm uses. It is
 * deliberately unauthenticated-in-shape and side-effect free: an observation
 * that required the same credentials as the mutation would be a weaker
 * observation, and one that could change state would not be an observation.
 */
export function createTargetServer(options: TargetServerOptions): Server {
  return createServer((request, response) => {
    const url = request.url ?? '/';

    if (request.method === 'GET' && (url === '/v1/state' || url === '/')) {
      const read = options.target.read();
      sendJson(response, 200, {
        revision: read.revision,
        state: asCanonical(read.state),
      });
      return;
    }

    if (request.method === 'POST' && url === '/v1/mutate') {
      void handleMutate(options, request, response).catch((error: unknown) => {
        // An unexpected fault must not read as an authorization. 500 with a
        // structured body, never a partial success.
        sendJson(response, 500, {
          status: 'REJECTED',
          reasonCode: 'INTERNAL_ERROR',
          detail: (error as Error).message,
        });
      });
      return;
    }

    sendJson(response, 404, { status: 'REJECTED', reasonCode: 'NOT_FOUND', detail: url });
  });
}
