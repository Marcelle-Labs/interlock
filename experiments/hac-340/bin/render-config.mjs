#!/usr/bin/env node
/** Render the sole HAC-340 configuration shape. Values are non-secret. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const mode = process.argv[2] ?? 'local';
if (!['local', 'cloud'].includes(mode)) throw new Error('usage: render-config.mjs local|cloud <output>');
const output = resolve(process.argv[3] ?? `experiments/hac-340/.work/${mode}-runtime-config.json`);
const get = (name, fallback) => process.env[name] ?? fallback;
const projectId = get('PROJECT_ID', mode === 'cloud' ? '' : 'local-project');
if (mode === 'cloud' && projectId === '') throw new Error('PROJECT_ID is required for cloud rendering');
const config = {
  version: 1,
  mode,
  cloud: { projectId, region: get('REGION', 'us-central1') },
  agent: {
    service: get('AGENT_SERVICE', 'interlock-hac340-agent'),
    model: get('GEMINI_MODEL', 'gemini-3.5-flash'),
    accessPath: 'Vertex AI via Google ADK',
    vertexAi: { enabled: true, projectId, location: get('REGION', 'us-central1') },
    roles: ['proposer', 'reviewer'],
    proxyUrl: get('PROXY_URL', 'http://127.0.0.1:8080'),
    proxyAudience: get('PROXY_AUDIENCE', mode === 'cloud' ? 'required-at-provision' : 'interlock-proxy.local'),
  },
  proxy: {
    service: get('PROXY_SERVICE', 'interlock-hac340-proxy'),
    targetUrl: get('TARGET_URL', 'http://127.0.0.1:8081'),
    targetAudience: get('TARGET_AUDIENCE', mode === 'cloud' ? 'required-at-provision' : 'interlock-target.local'),
    identityMode: mode === 'cloud' ? 'cloud-run' : 'local-test',
    sourceRevision: get('SOURCE_REVISION', 'fixture-baseline'),
  },
  target: { service: get('TARGET_SERVICE', 'interlock-hac340-target'), targetId: get('TARGET_ID', 'interlock-hac340-target') },
  observer: { principal: get('OBSERVER_PRINCIPAL', mode === 'cloud' ? 'required-at-provision' : 'local-observer') },
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(config, null, 2) + '\n');
process.stdout.write(`${output}\n`);
