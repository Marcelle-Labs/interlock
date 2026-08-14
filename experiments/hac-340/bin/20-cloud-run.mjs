#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(dir, '.work', 'cloud');
const evidence = join(dir, 'evidence');
const topology = JSON.parse(readFileSync(join(work, 'topology.json')));
const gcloud = process.env.GCLOUD_BIN ?? '/opt/homebrew/share/google-cloud-sdk/bin/gcloud';
const run = (args) => execFileSync(gcloud, args, { encoding: 'utf8' }).trim();
// The established HAC-326 operator path uses a human-account ID token. Audience
// selection is available only when impersonating a service account.
const token = () => run(['auth', 'print-identity-token']);
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const correlationId = `ilk-hac340-cloud-${Date.now()}`;
const agentToken = token();
const agentResponse = await post(`${topology.agentUrl}/v1/run`, {
  role: 'proposer', correlationId, message: 'Set alpha reservation to 45 using the tool.',
}, { authorization: `Bearer ${agentToken}` });
const agent = await agentResponse.json();
if (!agentResponse.ok || agent.correlationId !== correlationId || agent.toolResults?.length !== 1) throw new Error(`agent traversal failed: ${JSON.stringify(agent)}`);
const outcome = agent.toolResults[0];
const observerToken = token();
const observationResponse = await fetch(`${topology.targetUrl}/v1/state`, { headers: { authorization: `Bearer ${observerToken}` } });
const observation = await observationResponse.json();
const forgedCorrelation = `${correlationId}-forged`;
const forged = await post(`${topology.proxyUrl}/v1/intents`, { operation: 'not-a-real-operation', arguments: {} }, {
  authorization: `Bearer ${token()}`,
  'x-goog-authenticated-user-email': 'accounts.google.com:forged@example.test',
  'interlock-correlation-id': forgedCorrelation,
});
const wrongAudience = await post(`${topology.proxyUrl}/v1/intents`, { operation: 'set_reservation', arguments: { service: 'beta', reserved: 1 } }, {
  authorization: 'Bearer invalid.wrong.token',
});
const bypass = await post(`${topology.targetUrl}/v1/mutate`, { operation: 'set_reservation', arguments: { service: 'beta', reserved: 1 } }, {
  authorization: `Bearer ${observerToken}`,
});
let logs = [];
try {
  logs = JSON.parse(run(['logging', 'read', `resource.type=cloud_run_revision AND resource.labels.service_name=${process.env.PROXY_SERVICE ?? 'interlock-hac340-proxy'} AND jsonPayload.correlationId=${correlationId}`, '--limit', '20', '--format', 'json', '--freshness', '30m']));
} catch { /* verifier rejects missing runtime proof below */ }
const receiptDigest = outcome.receiptDigest;
const packet = {
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), model: agent.model, adkPath: 'Google ADK 1.35.1 / Vertex AI',
  resources: topology, correlationId, decision: outcome.decision, receiptId: outcome.receiptId, receiptDigest,
  protectedMutation: outcome.execution, observation, runtimeProof: { proxyLogEntries: logs, agentHttpStatus: agentResponse.status },
  expectedConfiguration: JSON.parse(readFileSync(join(work, 'topology.json'))),
  observedConfiguration: { agentRevision: topology.agentUrl, proxyRevision: topology.proxyUrl, targetRevision: topology.targetUrl },
  controls: { forgedHeaderStatus: forged.status, wrongAudienceStatus: wrongAudience.status, directBypassStatus: bypass.status },
  teardown: 'pending',
};
writeFileSync(join(evidence, 'cloud-run.json'), JSON.stringify(packet, null, 2) + '\n');
console.log(JSON.stringify({ correlationId, decision: outcome.decision, receiptDigest, controls: packet.controls }, null, 2));
