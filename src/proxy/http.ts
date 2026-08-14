/**
 * The proxy's two caller-facing surfaces: MCP and plain HTTP.
 *
 * Both are offered because HAC-326 asks what a *real* caller sends, and the
 * answer differs by transport. An ADK agent reaches a tool through MCP, where
 * arguments arrive inside a JSON-RPC envelope and errors have a prescribed
 * shape; a script or another service posts JSON directly. Rather than abstract
 * over the difference and record a shape neither caller actually produces, both
 * are implemented and both envelopes are captured in the evidence packet.
 *
 * The decision path is identical for both. Only the envelope differs, which is
 * the point: if the enforcement contract depended on the transport, it would not
 * be a contract.
 *
 * ## MCP scope
 *
 * Enough of Streamable HTTP to serve a real MCP client: `initialize`,
 * `notifications/initialized`, `tools/list`, `tools/call`. Responses are
 * `application/json`, which the specification permits, rather than SSE — there is
 * nothing to stream, and a streaming transport would add reconnection semantics
 * this gate does not need.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { Intent } from '../authorization/intent.js';
import { CORRELATION_HEADER, resolveCorrelationId } from '../correlation.js';
import { readJsonBody, sendJson } from '../http/json.js';
import { OPERATION_SET_RESERVATION, reservationPath } from '../target/state.js';
import { observeIdentity } from './identity.js';
import type { IdentityConfiguration } from './identity.js';
import type { InterlockProxy, ProxyResponse } from './service.js';

/** Protocol revision this server implements. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** The one tool this bounded proxy exposes. */
export const TOOL_DEFINITION = Object.freeze({
  name: OPERATION_SET_RESERVATION,
  title: 'Set a service reservation',
  description:
    'Set a service reservation on the protected capacity pool. Every call is adjudicated by ' +
    'Interlock before it reaches the target; a call may be denied because another agent is ' +
    'concurrently mutating a historically co-changed resource.',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string', description: 'Service whose reservation to set.' },
      reserved: { type: 'integer', minimum: 0, description: 'Units to reserve.' },
    },
    required: ['service', 'reserved'],
    additionalProperties: false,
  },
});

/** Evidence-namespace paths an intent writes. */
export function targetsForIntent(intent: Intent): readonly string[] {
  const service = intent.arguments['service'];
  return typeof service === 'string' ? [reservationPath(service)] : [];
}

export interface ProxyServerOptions {
  readonly proxy: InterlockProxy;
  /** Explicitly Cloud Run OIDC in production, verified local token in parity tests. */
  readonly identityConfiguration?: IdentityConfiguration;
  /** Required on the HAC-340 Cloud Run and local-parity paths. */
  readonly requireAuthenticatedIdentity?: boolean;
  /** Records every observed request envelope, for the frozen fixtures. */
  readonly onEnvelope?: (envelope: {
    readonly transport: 'mcp' | 'http';
    readonly correlationId: string;
    readonly identity: string;
    readonly identitySource: string;
    readonly headers: Readonly<Record<string, string | string[] | undefined>>;
    readonly body: unknown;
  }) => void;
}

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

function readJsonRpc(value: unknown): JsonRpcRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source['jsonrpc'] !== '2.0' || typeof source['method'] !== 'string') return null;
  const id = source['id'];
  const params = source['params'];
  return {
    jsonrpc: '2.0',
    method: source['method'],
    ...(typeof id === 'string' || typeof id === 'number' || id === null ? { id } : {}),
    ...(typeof params === 'object' && params !== null && !Array.isArray(params)
      ? { params: params as Record<string, unknown> }
      : {}),
  };
}

/**
 * Render a proxy answer as an MCP tool result.
 *
 * A denial is `isError: true` with the structured answer in both
 * `structuredContent` and the text block. Both, because clients differ in which
 * they surface to the model, and a denial the agent cannot read is a denial that
 * will simply be retried.
 */
export function asToolResult(answer: ProxyResponse): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }],
    structuredContent: answer as unknown as Record<string, unknown>,
    isError: answer.decision === 'DENY',
  };
}

async function handleMcp(
  options: ProxyServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    sendJson(response, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `parse error: ${body.detail}` },
    });
    return;
  }

  const rpc = readJsonRpc(body.value);
  if (rpc === null) {
    sendJson(response, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'invalid request' },
    });
    return;
  }

  const reply = (result: unknown): void => {
    sendJson(response, 200, { jsonrpc: '2.0', id: rpc.id ?? null, result });
  };

  switch (rpc.method) {
    case 'initialize':
      reply({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'interlock-proxy', version: '0.0.0-s2-fixture' },
      });
      return;

    case 'notifications/initialized':
      // A notification carries no id and expects no result.
      response.writeHead(202).end();
      return;

    case 'tools/list':
      reply({ tools: [TOOL_DEFINITION] });
      return;

    case 'tools/call':
      break;

    default:
      sendJson(response, 200, {
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        error: { code: -32601, message: `method not found: ${rpc.method}` },
      });
      return;
  }

  const params = rpc.params ?? {};
  const name = params['name'];
  const args = params['arguments'];

  if (name !== OPERATION_SET_RESERVATION) {
    sendJson(response, 200, {
      jsonrpc: '2.0',
      id: rpc.id ?? null,
      error: { code: -32602, message: `unknown tool: ${String(name)}` },
    });
    return;
  }

  const intent: Intent = {
    operation: OPERATION_SET_RESERVATION,
    arguments:
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Intent['arguments'])
        : {},
  };

  const { correlationId } = resolveCorrelationId(
    request.headers[CORRELATION_HEADER] ?? (params['_meta'] as Record<string, unknown> | undefined)?.['correlationId'],
  );
  const identity = observeIdentity(request.headers, options.identityConfiguration);

  if (options.requireAuthenticatedIdentity === true && identity.identity === 'unavailable') {
    sendJson(response, 401, { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32001, message: 'authenticated identity required' } });
    return;
  }
  options.onEnvelope?.({
    transport: 'mcp',
    correlationId,
    identity: identity.identity,
    identitySource: identity.identitySource,
    headers: request.headers,
    body: body.value,
  });

  const answer = await options.proxy.handle({
    correlationId,
    callerIdentity: identity.identity,
    identitySource: identity.identitySource,
    intent,
    targets: targetsForIntent(intent),
  });

  reply(asToolResult(answer));
}

async function handleHttpIntent(
  options: ProxyServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { correlationId } = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
  const body = await readJsonBody(request);

  if (!body.ok) {
    sendJson(response, 400, {
      decision: 'DENY',
      reasonCode: 'MALFORMED_REQUEST',
      correlationId,
      message: body.detail,
      evidenceRefs: [],
    });
    return;
  }

  const source = body.value as Record<string, unknown>;
  const args = source['arguments'];
  const intent: Intent = {
    operation: typeof source['operation'] === 'string' ? (source['operation'] as string) : '',
    arguments:
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Intent['arguments'])
        : {},
  };

  const identity = observeIdentity(request.headers, options.identityConfiguration);
  if (options.requireAuthenticatedIdentity === true && identity.identity === 'unavailable') {
    sendJson(response, 401, {
      decision: 'DENY', reasonCode: 'IDENTITY_UNAVAILABLE', correlationId,
      message: 'an authenticated caller identity is required', evidenceRefs: [],
    });
    return;
  }
  options.onEnvelope?.({
    transport: 'http',
    correlationId,
    identity: identity.identity,
    identitySource: identity.identitySource,
    headers: request.headers,
    body: body.value,
  });

  const answer = await options.proxy.handle({
    correlationId,
    callerIdentity: identity.identity,
    identitySource: identity.identitySource,
    intent,
    targets: targetsForIntent(intent),
  });

  sendJson(response, answer.decision === 'ALLOW' ? 200 : 403, answer);
}

export function createProxyServer(options: ProxyServerOptions): Server {
  return createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0] ?? '/';

    const fail = (error: unknown): void => {
      sendJson(response, 500, {
        decision: 'DENY',
        reasonCode: 'INTERNAL_ERROR',
        correlationId: 'unknown',
        message: (error as Error).message,
        evidenceRefs: [],
      });
    };

    if (request.method === 'POST' && url === '/mcp') {
      void handleMcp(options, request, response).catch(fail);
      return;
    }

    if (request.method === 'POST' && url === '/v1/intents') {
      void handleHttpIntent(options, request, response).catch(fail);
      return;
    }

    if (request.method === 'GET' && (url === '/healthz' || url === '/')) {
      sendJson(response, 200, { status: 'ok', protocolVersion: MCP_PROTOCOL_VERSION });
      return;
    }

    sendJson(response, 404, {
      decision: 'DENY',
      reasonCode: 'NOT_FOUND',
      correlationId: 'unknown',
      message: url,
      evidenceRefs: [],
    });
  });
}
