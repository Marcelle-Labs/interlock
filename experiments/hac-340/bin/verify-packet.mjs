#!/usr/bin/env node
/** Refuses an incomplete or self-asserted HAC-340 cloud packet. */
import { readFileSync } from 'node:fs';
const packet = JSON.parse(readFileSync(process.argv[2] ?? 'experiments/hac-340/evidence/cloud-run.json', 'utf8'));
const teardown = JSON.parse(readFileSync(process.argv[3] ?? 'experiments/hac-340/evidence/teardown.json', 'utf8'));
for (const field of ['commitSha', 'model', 'adkPath', 'resources', 'correlationId', 'decision', 'receiptDigest', 'observation', 'runtimeProof', 'controls']) {
  if (packet[field] === undefined || packet[field] === null || packet[field] === '') throw new Error(`packet missing ${field}`);
}
if (JSON.stringify(packet.expectedConfiguration) === JSON.stringify(packet.observedConfiguration)) throw new Error('expected and observed configuration cannot be the same evidence');
if (!/^gemini-3\.(5|[6-9])/.test(packet.model)) throw new Error('model is not Gemini 3.5+');
if (packet.decision !== 'ALLOW' || packet.protectedMutation?.status !== 'EXECUTED') throw new Error('representative mutation was not executed');
if (packet.observation?.state?.services?.alpha !== 45) throw new Error('independent observer did not read the protected mutation');
if (!packet.receiptDigest.startsWith('sha256:')) throw new Error('receipt digest is not frozen');
if (packet.controls.forgedHeaderStatus !== 403 || ![401, 403].includes(packet.controls.wrongAudienceStatus) || packet.controls.directBypassStatus !== 403) throw new Error('negative controls did not fail closed');
if (!Array.isArray(packet.runtimeProof.proxyLogEntries) || packet.runtimeProof.proxyLogEntries.length === 0) throw new Error('Cloud Logging correlation proof is absent');
if (teardown.status !== 'completed') throw new Error('teardown evidence is absent');
process.stdout.write('HAC-340 packet verified\n');
