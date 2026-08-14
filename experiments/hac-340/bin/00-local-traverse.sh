#!/usr/bin/env bash
# Local, authenticated representative traversal. This is deliberately a thin
# composition of the existing proxy/target entrypoints, not another harness.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${ROOT}/experiments/hac-340/.work/local"
EVIDENCE="${ROOT}/experiments/hac-340/evidence"
PYTHON="${HAC340_PYTHON:-/tmp/interlock-hac340-adk/bin/python}"
mkdir -p "$WORK" "$EVIDENCE"

: "${PROJECT_ID:?PROJECT_ID is required: the local ADK traversal calls Gemini through Vertex AI}"
test -x "$PYTHON" || { echo "missing pinned ADK runtime: $PYTHON" >&2; exit 1; }
command -v openssl >/dev/null

cd "$ROOT"
pnpm run build >/dev/null
node experiments/hac-340/bin/render-config.mjs local "$WORK/runtime-config.json" >/dev/null

SECRET="$(openssl rand -hex 32)"
openssl genpkey -algorithm ed25519 -out "$WORK/signing.pem" >/dev/null 2>&1
openssl pkey -in "$WORK/signing.pem" -pubout -out "$WORK/verification.pem" >/dev/null 2>&1
KEYS="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.stringify({local:fs.readFileSync(process.argv[1],"utf8")}))' "$WORK/verification.pem")"
SOURCE_REVISION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("experiments/hac-330/evidence/baseline.evidence.json")).selection.scoringBasis.basisRevision)')"

cleanup() { kill "${AGENT_PID:-}" "${PROXY_PID:-}" "${TARGET_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT

PORT=18081 INTERLOCK_TARGET_ID=interlock-hac340-target INTERLOCK_VERIFICATION_KEYS="$KEYS" \
INTERLOCK_IDENTITY_MODE=local-test INTERLOCK_TEST_IDENTITY_SECRET="$SECRET" \
INTERLOCK_TARGET_AUDIENCE=interlock-target.local INTERLOCK_REQUIRE_TRANSPORT_IDENTITY=true \
node dist/target/main.js >"$WORK/target.log" 2>&1 & TARGET_PID=$!

PORT=18080 INTERLOCK_TARGET_ID=interlock-hac340-target INTERLOCK_TARGET_URL=http://127.0.0.1:18081 \
INTERLOCK_TARGET_AUDIENCE=interlock-target.local INTERLOCK_PROXY_AUDIENCE=interlock-proxy.local \
INTERLOCK_IDENTITY_MODE=local-test INTERLOCK_TEST_IDENTITY_SECRET="$SECRET" \
INTERLOCK_SIGNING_KEY_ID=local INTERLOCK_SIGNING_KEY_PEM="$(cat "$WORK/signing.pem")" \
INTERLOCK_EVIDENCE_PATH="$ROOT/experiments/hac-330/evidence/baseline.evidence.json" \
INTERLOCK_SOURCE_REVISION="$SOURCE_REVISION" node dist/proxy/main.js >"$WORK/proxy.log" 2>&1 & PROXY_PID=$!

GOOGLE_GENAI_USE_VERTEXAI=True GOOGLE_CLOUD_PROJECT="$PROJECT_ID" GOOGLE_CLOUD_LOCATION="${REGION:-us-central1}" \
PORT=18082 INTERLOCK_GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash}" \
INTERLOCK_PROXY_URL=http://127.0.0.1:18080 INTERLOCK_PROXY_AUDIENCE=interlock-proxy.local \
INTERLOCK_IDENTITY_MODE=local-test INTERLOCK_TEST_IDENTITY_SECRET="$SECRET" \
"$PYTHON" experiments/hac-340/agent/server.py >"$WORK/agent.log" 2>&1 & AGENT_PID=$!

for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:18082/healthz >/dev/null && break; sleep 1; done
curl -fsS http://127.0.0.1:18082/healthz >/dev/null

CORRELATION_ID="ilk-hac340-local-$(date +%s)"
STATUS="$(curl -sS -o "$WORK/adk-response.json" -w '%{http_code}' http://127.0.0.1:18082/v1/run -H 'content-type: application/json' \
  --data "{\"role\":\"proposer\",\"correlationId\":\"$CORRELATION_ID\",\"message\":\"Set alpha reservation to 45 using the tool.\"}" \
 )"
if [[ "$STATUS" != 200 ]]; then
  echo "ADK traversal failed with HTTP $STATUS; see $WORK/adk-response.json and $WORK/agent.log" >&2
  exit 1
fi

node --input-type=module - "$SECRET" "$CORRELATION_ID" "$EVIDENCE/local-traversal.json" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { localTestToken } from './dist/proxy/identity.js';
const [secret, correlationId, output] = process.argv.slice(2);
const token = localTestToken(secret, 'interlock-target.local', 'observer@local.test');
const observation = await fetch('http://127.0.0.1:18081/v1/state', { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
const agent = JSON.parse(readFileSync('experiments/hac-340/.work/local/adk-response.json'));
const forgedHeader = await fetch('http://127.0.0.1:18080/v1/intents', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-authenticated-user-email': 'accounts.google.com:forged@local.test' },
  body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'beta', reserved: 1 } }),
});
const wrongAudience = await fetch('http://127.0.0.1:18080/v1/intents', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localTestToken(secret, 'wrong-audience', 'agent@local.test')}` },
  body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'beta', reserved: 1 } }),
});
const bypass = await fetch('http://127.0.0.1:18081/v1/mutate', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ operation: 'set_reservation', arguments: { service: 'beta', reserved: 1 } }),
});
if (forgedHeader.status !== 401 || wrongAudience.status !== 401 || bypass.status !== 403) throw new Error('required auth/bypass controls did not fail closed');
writeFileSync(output, JSON.stringify({
  kind: 'local-authenticated-adk-traversal', correlationId,
  expectedConfiguration: JSON.parse(readFileSync('experiments/hac-340/.work/local/runtime-config.json')),
  observedConfiguration: { proxyIdentityMode: 'local-test', targetTransportIdentityRequired: true, observerIdentity: 'observer@local.test' },
  adk: { model: agent.model, role: agent.role, toolResults: agent.toolResults }, observation,
  controls: { forgedIdentityHeader: forgedHeader.status, wrongAudience: wrongAudience.status, directTargetBypass: bypass.status },
}, null, 2) + '\n');
NODE

echo "local traversal evidence: $EVIDENCE/local-traversal.json"
