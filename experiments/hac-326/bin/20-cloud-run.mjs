#!/usr/bin/env node
/**
 * Drive the deployed HAC-326 topology on Cloud Run.
 *
 * The local experiment proves the enforcement semantics. This proves them on a
 * managed runtime with a real, platform-verified caller identity and a real
 * network between the proxy and the target — which is the part a loopback run
 * cannot speak to, and which HAC-326 has to freeze:
 *
 *   - what identity actually reaches the proxy when Cloud Run authenticates the
 *     caller, rather than what the documentation says will;
 *   - whether the target still refuses a direct call when it is a separate,
 *     independently reachable service;
 *   - what the enforcement path costs over a real network.
 *
 * Reads the deployed topology from .work/topology.json (written by 10-deploy.sh)
 * and writes evidence/cloud-run.json.
 *
 * Usage:  node experiments/hac-326/bin/20-cloud-run.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const experimentDir = join(here, '..');
const topology = JSON.parse(readFileSync(join(experimentDir, '.work', 'topology.json'), 'utf8'));

const SAMPLES = Number(process.env.HAC326_CLOUD_SAMPLES ?? 40);

/**
 * A Google-signed identity token for the operator.
 *
 * Minted per run and never written to the evidence packet — only the claims that
 * describe the identity *shape* are recorded, never the token.
 */
function identityToken() {
  return execFileSync('gcloud', ['auth', 'print-identity-token'], { encoding: 'utf8' }).trim();
}

const token = identityToken();
const authorized = (extra = {}) => ({ authorization: `Bearer ${token}`, ...extra });

const postIntent = (baseUrl, service, reserved, headers = {}) =>
  fetch(`${baseUrl}/v1/intents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(headers) },
    body: JSON.stringify({ operation: 'set_reservation', arguments: { service, reserved } }),
  });

const callTool = (baseUrl, service, reserved) =>
  fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...authorized() },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'set_reservation', arguments: { service, reserved } },
    }),
  });

const readState = async () =>
  (await (await fetch(`${topology.targetUrl}/v1/state`, { headers: authorized() })).json());

const checks = [];
const check = (id, criterion, passed, detail) => {
  checks.push({ id, criterion, passed, detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${id}  ${criterion}\n`);
  if (!passed) process.stdout.write(`      ${detail}\n`);
};

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const summarize = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    count: sorted.length,
    medianMs: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted.at(-1)),
    minMs: round(sorted[0]),
  };
};

// --- 1. Unauthenticated access is refused by the platform, before our code. ---
const anonymous = await fetch(`${topology.proxyUrl}/v1/intents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'alpha', reserved: 60 } }),
});
check(
  'CR-AUTH',
  'the platform refuses an unauthenticated caller before the container is invoked',
  anonymous.status === 401 || anonymous.status === 403,
  `HTTP ${anonymous.status}`,
);

// --- 2. Allowed request end to end, over the real network. ---
const allowed = await (await postIntent(topology.proxyUrl, 'alpha', 50)).json();
const stateAfterAllow = await readState();
check(
  'CR-ALLOW',
  'an authorized intent executes on the deployed target',
  allowed.decision === 'ALLOW' && stateAfterAllow.state.services.alpha === 50,
  `decision ${allowed.decision}, alpha=${stateAfterAllow.state.services.alpha}`,
);

const mcpAnswer = await (await callTool(topology.proxyUrl, 'gamma', 21)).json();
const mcpStructured = mcpAnswer.result?.structuredContent;

check(
  'CR-MCP',
  'the MCP surface works over the managed runtime',
  mcpStructured?.decision === 'ALLOW' || mcpStructured?.decision === 'DENY',
  `decision ${mcpStructured?.decision}`,
);

// --- 4. The target still refuses a direct call. ---
const beforeDirect = await readState();
const direct = await fetch(`${topology.targetUrl}/v1/mutate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...authorized() },
  body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'beta', reserved: 60 } }),
});
const directBody = await direct.json();
const afterDirect = await readState();

check(
  'CR-BYPASS',
  'the deployed target refuses an authenticated call that carries no receipt',
  direct.status === 403 &&
    directBody.reasonCode === 'RECEIPT_ABSENT' &&
    JSON.stringify(beforeDirect.state) === JSON.stringify(afterDirect.state),
  `HTTP ${direct.status} ${directBody.reasonCode}; state unchanged ${
    JSON.stringify(beforeDirect.state) === JSON.stringify(afterDirect.state)
  }`,
);

// --- 5. The unsafe composed pair, over the network. ---
const [alphaAnswer, betaAnswer] = await Promise.all([
  postIntent(topology.proxyUrl, 'alpha', 60).then((r) => r.json()),
  postIntent(topology.proxyUrl, 'beta', 60).then((r) => r.json()),
]);
const stateAfterPair = await readState();
const total = Object.values(stateAfterPair.state.services).reduce((sum, n) => sum + n, 0);

check(
  'CR-UNSAFE',
  'the coupled pair is not composed on the deployed topology',
  [alphaAnswer, betaAnswer].filter((a) => a.decision === 'ALLOW').length <= 1 &&
    total <= stateAfterPair.state.totalReservable,
  `alpha ${alphaAnswer.decision}, beta ${betaAnswer.decision}, total ${total}`,
);

// --- 6. Latency over the real network. ---
for (let i = 0; i < 5; i += 1) await postIntent(topology.proxyUrl, 'gamma', 20 + (i % 3));

const authorizedLatency = [];
for (let i = 0; i < SAMPLES; i += 1) {
  const started = performance.now();
  await postIntent(topology.proxyUrl, 'gamma', 20 + (i % 5));
  authorizedLatency.push(performance.now() - started);
}

const concurrentLatency = [];
for (let i = 0; i < Math.min(20, SAMPLES); i += 1) {
  const started = performance.now();
  await Promise.all([
    postIntent(topology.proxyUrl, 'gamma', 21),
    postIntent(topology.proxyUrl, 'gamma', 22),
  ]);
  concurrentLatency.push(performance.now() - started);
}

const latency = {
  note:
    'Measured from a developer workstation to Cloud Run in ' +
    `${topology.region}. Includes client-to-proxy internet latency, which dominates and is not ` +
    'attributable to Interlock. The proxy-to-target hop is intra-region.',
  authorizedPath: summarize(authorizedLatency),
  twoConcurrentRequests: summarize(concurrentLatency),
};

check(
  'CR-LAT',
  'latency on the managed runtime is measured as a distribution',
  latency.authorizedPath.count >= 20,
  `n=${latency.authorizedPath.count}, median ${latency.authorizedPath.medianMs}ms, p95 ${latency.authorizedPath.p95Ms}ms`,
);

// --- 7. What identity the proxy actually observed. ---
//
// Read from the proxy's own structured logs rather than asserted here. This is
// the empirical answer to "which caller identity fields are available and stable
// enough to bind into a receipt", and it must come from the running service.
let observedIdentity = { error: 'not read' };
let rawLogSample = [];
try {
  const raw = execFileSync(
    'gcloud',
    [
      'logging',
      'read',
      `resource.type=cloud_run_revision AND resource.labels.service_name=${process.env.PROXY_SERVICE ?? 'interlock-s2-proxy'} AND jsonPayload.event=proxy.request`,
      '--project',
      topology.projectId,
      '--limit',
      '25',
      '--format',
      'json',
      '--freshness',
      '1h',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const entries = JSON.parse(raw);
  const payloads = entries.map((entry) => entry.jsonPayload).filter(Boolean);
  const distinct = [...new Set(payloads.map((p) => `${p.identity}|${p.identitySource}`))];

  observedIdentity = {
    distinctIdentitiesObserved: distinct.map((value) => {
      const [identity, identitySource] = value.split('|');
      // The identity is the operator's own account. Recorded as a shape, with
      // the local part redacted: the packet needs to prove which field arrived,
      // not who ran the experiment.
      return {
        identitySource,
        identityShape: identity.includes('@')
          ? `<local-part>@${identity.split('@')[1]}`
          : identity === 'unavailable'
            ? 'unavailable'
            : '<opaque-subject>',
      };
    }),
    sampleCount: payloads.length,
  };
  rawLogSample = payloads.slice(0, 5).map((payload) => ({
    event: payload.event,
    transport: payload.transport,
    correlationId: payload.correlationId,
    identitySource: payload.identitySource,
    identity: payload.identity.includes('@')
      ? `<local-part>@${payload.identity.split('@')[1]}`
      : payload.identity,
  }));
} catch (error) {
  observedIdentity = { error: error.message.slice(0, 200) };
}

check(
  'CR-IDENTITY',
  'the proxy observed a platform-verified caller identity on the managed runtime',
  Array.isArray(observedIdentity.distinctIdentitiesObserved) &&
    observedIdentity.distinctIdentitiesObserved.length > 0 &&
    observedIdentity.distinctIdentitiesObserved.every(
      (entry) => entry.identitySource !== 'none/no-authenticated-principal-observed',
    ),
  JSON.stringify(observedIdentity),
);

// --- Record. ---
const passed = checks.every((c) => c.passed);
writeFileSync(
  join(experimentDir, 'evidence', 'cloud-run.json'),
  `${JSON.stringify(
    {
      note:
        'The deployed arm. Proves the same enforcement contract on a managed runtime with a ' +
        'platform-verified caller identity and a real network between proxy and target.',
      result: passed ? 'PASS' : 'FAIL',
      topology: {
        region: topology.region,
        proxyService: topology.proxyUrl.replace(/https:\/\/([^-]+).*/, '$1'),
        authentication: topology.authentication,
        proxyServiceAccount: topology.proxyServiceAccount,
        image: topology.image.replace(/^[^/]+/, '<region>-docker.pkg.dev'),
        sourceRevision: topology.sourceRevision,
        note: 'Service URLs are omitted: the project is disposable and the URLs are not a contract.',
      },
      callerIdentityObserved: observedIdentity,
      rawLogSample,
      allowedRequest: { decision: allowed.decision, reasonCode: allowed.reasonCode },
      unauthenticatedRequestStatus: anonymous.status,
      directCallToTarget: { status: direct.status, reasonCode: directBody.reasonCode },
      unsafePair: { alpha: alphaAnswer.decision, beta: betaAnswer.decision, finalTotal: total },
      latency,
      checks,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(`\n${passed ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.passed).length}/${checks.length} cloud checks\n`);
process.exitCode = passed ? 0 : 1;
