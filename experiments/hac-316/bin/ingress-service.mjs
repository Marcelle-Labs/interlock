#!/usr/bin/env node
/**
 * The deployable neutral ingress: MCP in, routing surface out.
 *
 * ## The gap this closes
 *
 * `src/routing.mjs` exports `createRoutingSurface`, which builds one
 * `InMemoryPendingIntentStore` and two `InterlockProxy` instances — and nothing
 * else. It has no `createServer` and no `listen`, so deploying it as R-08's
 * entry point starts a process that exits immediately. Meanwhile the neutral
 * ingress that records arrivals, derives identity and detects a runtime retry
 * existed only inside `bin/run-arm.mjs`, was no service's entry point, spoke bare
 * JSON, and read the caller's identity out of `body.agent`.
 *
 * The agents speak MCP StreamableHTTP. This file is the missing piece: a runnable
 * entry point that speaks the protocol the agents actually speak, records what
 * arrives, decides who it came from *from the platform*, and hands the request to
 * the routing surface unaltered.
 *
 *   Agent Runtime A/B --MCP--> this service
 *     -> arrival + identity + retry observation   (src/arrivals.mjs, src/agent-identity.mjs)
 *     -> the shared routing surface               (src/routing.mjs, unchanged)
 *     -> two S2 InterlockProxy instances          (dist/, unchanged)
 *     -> two protected targets                    (dist/, unchanged)
 *
 * ## One process, one store
 *
 * The surface is built **once**, at startup, and every request goes through that
 * one object. `--max-instances=1` is load-bearing for the same reason it is on
 * R-08: a second instance is a second `PendingIntentStore`, the two proxies in
 * each instance would see only their own half of the pair, and the coupling this
 * experiment exists to observe would go unobserved with nothing looking wrong.
 *
 * ## What this file may not do (X-10, X-15)
 *
 * `ProxyServerOptions.proxy` is nominally typed to a single `InterlockProxy`, so
 * `createProxyServer` cannot be handed a two-proxy surface, and widening it would
 * be a product change made to suit an experiment. The MCP envelope handling is
 * therefore written here — but the *pieces* are the frozen ones: `TOOL_DEFINITION`
 * and `asToolResult` come from `dist/proxy/http.js`, identity from
 * `dist/proxy/identity.js`, and routing from the experiment's own surface. This
 * file inspects no evidence, authorizes nothing, alters no argument, mints no
 * receipt and takes no part in arbitration.
 *
 *   node experiments/hac-316/bin/ingress-service.mjs
 *
 * Requires `pnpm run build`. Creates no cloud resource of any kind; it is a
 * server that waits to be called.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { signingKeyFromPem } from '../../../dist/authorization/receipt.js';
import { CORRELATION_HEADER, resolveCorrelationId } from '../../../dist/correlation.js';
import {
  MCP_PROTOCOL_VERSION,
  TOOL_DEFINITION,
  asToolResult,
  targetsForIntent,
} from '../../../dist/proxy/http.js';
import { observeIdentity } from '../../../dist/proxy/identity.js';
import { HttpTargetPort } from '../../../dist/proxy/target-port.js';
import { OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

import {
  IDENTITY_FAIL_CLOSED,
  readAgentPrincipals,
  resolveExpectedAgent,
} from '../src/agent-identity.mjs';
import {
  TOOL_INVOCATION_HEADER,
  createArrivalRecorder,
  duplicateArrivalRefusal,
  headerValue,
  nowMs,
} from '../src/arrivals.mjs';
import { isDirectInvocation } from '../src/entrypoint.mjs';
import { EnvironmentError, readEnv } from '../src/env.mjs';
import { TARGET_IDS } from '../src/partition.mjs';
import { createRoutingSurface, dispatch } from '../src/routing.mjs';

/** The MCP endpoint the agents' `StreamableHTTPConnectionParams` point at. */
export const MCP_PATH = '/mcp';

/**
 * Every environment variable this entry point reads.
 *
 * The `INTERLOCK_*` names are the ones `src/config.ts` already defines, spelled
 * here rather than imported. `dist/config.js` is **not** on the pinned dist
 * closure (`evidence/pins.json`), and the closure is computed from the import
 * graph of the experiment's own files — so importing it would silently widen the
 * pin and turn the packet red against a pin this work may not rewrite. The names
 * are a contract with `bin/10-provision.sh`, and `test/ingress-service.test.mjs`
 * asserts they are the ones provisioning renders.
 */
export const INGRESS_ENV = Object.freeze({
  PORT: 'PORT',
  TARGET_URL_ALPHA: 'INTERLOCK_TARGET_URL_ALPHA',
  TARGET_URL_BETA: 'INTERLOCK_TARGET_URL_BETA',
  TARGET_AUDIENCE: 'INTERLOCK_TARGET_AUDIENCE',
  SIGNING_KEY_ID: 'INTERLOCK_SIGNING_KEY_ID',
  SIGNING_KEY_PEM: 'INTERLOCK_SIGNING_KEY_PEM',
  EVIDENCE_PATH: 'INTERLOCK_EVIDENCE_PATH',
  SOURCE_REVISION: 'INTERLOCK_SOURCE_REVISION',
  ARM: 'HAC316_ARM',
  RUN_ID: 'HAC316_RUN_ID',
});

/** A required setting, with empty and whitespace-only treated as absent. */
function requiredEnv(env, name) {
  const value = readEnv(name, env);
  if (value === null) {
    throw new EnvironmentError(`${name} is required and was not set`);
  }
  return value;
}

/** An optional setting. */
function optionalEnv(env, name, fallback) {
  return readEnv(name, env) ?? fallback;
}

/** The port to bind. Cloud Run supplies `PORT`; anything else is a local run. */
function readPort(env, fallback) {
  const raw = readEnv(INGRESS_ENV.PORT, env);
  if (raw === null) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    // Binding the wrong port looks exactly like a crashed service.
    throw new EnvironmentError(
      `${INGRESS_ENV.PORT} must be an integer 0-65535, got ${JSON.stringify(raw)}`,
    );
  }
  return port;
}

/** Where Cloud Run's metadata server issues the ID token a target will verify. */
const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

/**
 * A Google-signed ID token for `audience`, or `undefined` off-platform.
 *
 * `dist/proxy/main.js` has this function and it is not imported, for the reason
 * given on `INGRESS_ENV`: `proxy/main` is a Cloud Run entry point rather than a
 * decision-path module, it is outside the pinned dist closure, and importing it
 * would drag `dist/config.js` in behind it.
 *
 * It never throws. An identity that cannot be obtained produces an
 * unauthenticated call the target refuses, which is a clearer failure than a
 * crash inside the request path — and the reason is written to stderr, because a
 * silent `undefined` makes an unauthenticated downstream call indistinguishable
 * from a misconfigured one.
 */
export async function metadataIdToken(audience) {
  try {
    const response = await fetch(
      `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`,
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (response.ok) return await response.text();
    process.stderr.write(
      `${JSON.stringify({ event: 'ingress.identity_token_unavailable', status: response.status, audience })}\n`,
    );
    return undefined;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ event: 'ingress.identity_token_error', error: error.message, audience })}\n`,
    );
    return undefined;
  }
}

/**
 * Build the routing surface this service fronts, from the environment.
 *
 * Both proxies are built from the same evidence artifact at the same
 * `sourceRevision`, read once at startup and never refetched: a decision path
 * that reloaded its evidence mid-flight could decide two halves of one concurrent
 * pair against two different artifacts, and no receipt would record which one
 * applied.
 */
export function buildRoutingSurface(env) {
  const evidence = JSON.parse(readFileSync(requiredEnv(env, INGRESS_ENV.EVIDENCE_PATH), 'utf8'));
  const sourceRevision = requiredEnv(env, INGRESS_ENV.SOURCE_REVISION);
  const signingKey = signingKeyFromPem(
    requiredEnv(env, INGRESS_ENV.SIGNING_KEY_ID),
    requiredEnv(env, INGRESS_ENV.SIGNING_KEY_PEM),
  );
  const audience = optionalEnv(env, INGRESS_ENV.TARGET_AUDIENCE, '');

  const urls = {
    alpha: requiredEnv(env, INGRESS_ENV.TARGET_URL_ALPHA),
    beta: requiredEnv(env, INGRESS_ENV.TARGET_URL_BETA),
  };

  const proxyOptionsFor = (service) => ({
    targetId: TARGET_IDS[service],
    target: new HttpTargetPort({
      baseUrl: urls[service],
      // Opt-in, by an explicit audience. A local run has no metadata server, and
      // reaching for one on every request would add a DNS timeout to the path
      // whose latency this experiment measures.
      ...(audience === '' ? {} : { authToken: () => metadataIdToken(audience) }),
    }),
    signingKey,
    evidence,
    sourceRevision,
  });

  return createRoutingSurface({
    alpha: proxyOptionsFor('alpha'),
    beta: proxyOptionsFor('beta'),
  });
}

/**
 * Write one JSON answer.
 *
 * `dist/http/json.js` has `sendJson` and `readJsonBody`, and neither is imported,
 * for a reason worth stating: `http/json` is the one module in the pinned dist
 * closure that **nothing in this experiment imports directly**. It is reached
 * only through pinned decision-path modules, and
 * `test/dist-provenance.test.mjs` asserts exactly that — it is the surviving
 * demonstration that the closure walk reaches further than a hand-written list
 * would, which is the escape (E1) the pin exists to close. Importing it here
 * would cost that demonstration to save ten lines. The local ingress in
 * `bin/run-arm.mjs` parses its own bodies for the same reason.
 */
function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Read a JSON request body, reporting a parse failure rather than throwing. */
function readJsonBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('error', (error) => resolve({ ok: false, detail: error.message }));
    request.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch (error) {
        resolve({ ok: false, detail: error.message });
      }
    });
  });
}

/** An MCP tool result for something the ingress refused before dispatching. */
function refusalResult(refusal) {
  return {
    content: [{ type: 'text', text: JSON.stringify(refusal, null, 2) }],
    structuredContent: refusal,
    isError: true,
  };
}

/**
 * The MCP StreamableHTTP surface, over a prebuilt routing surface.
 *
 * `initialize`, `notifications/initialized`, `tools/list` and `tools/call` —
 * enough of the protocol to serve a real MCP client, answered as
 * `application/json` rather than SSE, exactly as `dist/proxy/http.js` does. There
 * is nothing to stream, and a streaming transport would add reconnection
 * semantics this topology does not need.
 *
 * `observations` is appended to in place so the caller — a test on loopback, or a
 * verifier reading the service's own record — sees arrivals as they land.
 */
export function createIngressServer({
  surface,
  principals,
  observations = [],
  arm = 'phase-7',
  runId = `hac316-ingress-${randomUUID()}`,
  onArrival,
}) {
  const recorder = createArrivalRecorder({ observations, arm, runId });

  const handleToolCall = async (request, response, rpc, reply) => {
    const startedAtMs = nowMs();
    const params = rpc.params ?? {};

    if (params.name !== OPERATION_SET_RESERVATION) {
      sendJson(response, 200, {
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        error: { code: -32602, message: `unknown tool: ${String(params.name)}` },
      });
      return;
    }

    const args = params.arguments;
    const intent = {
      operation: OPERATION_SET_RESERVATION,
      arguments:
        typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {},
    };

    const { correlationId } = resolveCorrelationId(
      request.headers[CORRELATION_HEADER] ?? params._meta?.correlationId,
    );

    // Identity from the platform, and from nothing else. Not `params.agent`, not
    // a caller-set header: those are claims a caller makes about itself, and
    // every judgement downstream — the A/B overlap, one-arrival-per-agent, the
    // duplicate key — would then rest on self-declaration.
    const identity = resolveExpectedAgent(principals, observeIdentity(request.headers));

    const { arrival, duplicateOfOrdinal } = recorder.record({
      agentId: identity.agentId,
      expectedAgent: identity.expectedAgent,
      identitySource: identity.identitySource,
      correlationId,
      intent,
      toolInvocationId: headerValue(request.headers, TOOL_INVOCATION_HEADER) ?? null,
      startedAtMs,
    });
    onArrival?.(arrival);

    // Recorded first, refused second. An arrival the ingress declines is the one
    // most worth having in the record, and a detector that only retained what it
    // forwarded could not report the thing it declined to forward.
    if (duplicateOfOrdinal !== null) {
      recorder.finish(arrival);
      reply(refusalResult(duplicateArrivalRefusal({ correlationId, duplicateOfOrdinal })));
      return;
    }

    if (!identity.ok) {
      recorder.finish(arrival);
      reply(
        refusalResult({
          correlationId,
          decision: 'DENY',
          reasonCode: identity.code,
          failClosed: true,
          message: identity.detail,
          evidenceRefs: [],
        }),
      );
      return;
    }

    recorder.markDispatched(arrival);
    let routed;
    try {
      routed = await dispatch(surface, {
        correlationId,
        callerIdentity: identity.agentId,
        identitySource: identity.identitySource,
        intent,
        targets: targetsForIntent(intent),
      });
    } catch (error) {
      recorder.finish(arrival);
      reply(
        refusalResult({
          correlationId,
          decision: 'DENY',
          reasonCode: 'INGRESS_DISPATCH_FAILED',
          message: error.message,
          evidenceRefs: [],
        }),
      );
      return;
    }
    recorder.finish(arrival);

    // The surface either routed — in which case the answer is the proxy's own,
    // rendered by the frozen `asToolResult` — or refused to route, which is a
    // fail-closed refusal and never an allow.
    reply(
      routed.dispatched === true
        ? asToolResult(routed.response)
        : refusalResult({
            correlationId,
            decision: 'DENY',
            reasonCode: routed.code,
            failClosed: true,
            message: routed.detail,
            evidenceRefs: [],
          }),
    );
  };

  const handleMcp = async (request, response) => {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `parse error: ${body.detail}` },
      });
      return;
    }

    const source = body.value;
    if (
      typeof source !== 'object' ||
      source === null ||
      Array.isArray(source) ||
      source.jsonrpc !== '2.0' ||
      typeof source.method !== 'string'
    ) {
      sendJson(response, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'invalid request' },
      });
      return;
    }

    const rpc = {
      id: source.id ?? null,
      method: source.method,
      params:
        typeof source.params === 'object' && source.params !== null && !Array.isArray(source.params)
          ? source.params
          : {},
    };
    const reply = (result) => sendJson(response, 200, { jsonrpc: '2.0', id: rpc.id, result });

    switch (rpc.method) {
      case 'initialize':
        reply({
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'interlock-s1-ingress', version: '0.0.0-hac316' },
        });
        return;

      case 'notifications/initialized':
        // A notification carries no id and expects no result.
        response.writeHead(202).end();
        return;

      case 'tools/list':
        // The frozen definition, so the tool the agents see is the tool the S2
        // proxy exposes rather than a second description of it.
        reply({ tools: [TOOL_DEFINITION] });
        return;

      case 'tools/call':
        await handleToolCall(request, response, rpc, reply);
        return;

      default:
        sendJson(response, 200, {
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: -32601, message: `method not found: ${rpc.method}` },
        });
    }
  };

  return createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0] ?? '/';

    const fail = (error) => {
      // An unexpected fault must never read as an authorization.
      sendJson(response, 500, {
        decision: 'DENY',
        reasonCode: 'INTERNAL_ERROR',
        correlationId: 'unknown',
        message: error?.message ?? String(error),
        evidenceRefs: [],
      });
    };

    if (request.method === 'POST' && url === MCP_PATH) {
      void handleMcp(request, response).catch(fail);
      return;
    }

    if (request.method === 'GET' && (url === '/healthz' || url === '/')) {
      sendJson(response, 200, {
        status: 'ok',
        protocolVersion: MCP_PROTOCOL_VERSION,
        // A start that looks healthy while the store is split is the failure
        // R-08's `--max-instances=1` exists to prevent; the counts are reported
        // so a probe can see the topology rather than assume it.
        proxies: Object.keys(surface.proxies).length,
        stores: new Set([surface.store]).size,
      });
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

/**
 * Build and start the service from an environment record.
 *
 * The principals are read **before** the socket is opened. A deployment that did
 * not say which service account is A and which is B does not start listening: an
 * ingress that discovered that at request time would already have recorded
 * arrivals it could not attribute, and a crash after the first mutation is worse
 * than a refusal to start.
 */
export function startIngressService(env = process.env) {
  const principals = readAgentPrincipals(env);
  const surface = buildRoutingSurface(env);
  const observations = [];
  const server = createIngressServer({
    surface,
    principals,
    observations,
    arm: optionalEnv(env, INGRESS_ENV.ARM, 'phase-7'),
    runId: optionalEnv(env, INGRESS_ENV.RUN_ID, `hac316-ingress-${randomUUID()}`),
  });
  const port = readPort(env, 8080);

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({
        server,
        port: server.address().port,
        url: `http://127.0.0.1:${server.address().port}${MCP_PATH}`,
        surface,
        principals,
        observations,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

export { IDENTITY_FAIL_CLOSED };

if (isDirectInvocation(import.meta.url)) {
  try {
    const started = await startIngressService(process.env);
    process.stdout.write(
      `${JSON.stringify({
        event: 'ingress.listening',
        port: started.port,
        path: MCP_PATH,
        proxies: Object.keys(started.surface.proxies).length,
        stores: new Set([started.surface.store]).size,
        principals: Object.fromEntries(
          Object.entries(started.principals).map(([principal, agent]) => [agent, principal]),
        ),
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ event: 'ingress.failed', error: error.message })}\n`,
    );
    process.exitCode = 1;
  }
}
