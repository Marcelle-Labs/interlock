#!/usr/bin/env bash
# HAC-325 / S0 step 3: one deliberate extension outage.
#
# With failOpen:false the documented behaviour is a generic 500 to the client
# (or a stream reset once response headers are away). A 200 here would mean the
# gate is not actually fail-closed, which is an S0 failure, not a warning.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

ENDPOINT="$("$GCLOUD" network-services agent-gateways describe "$GATEWAY" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='value(googleManaged.endpoint)')"

# The probe reports its result on stdout, never through its exit status. A
# failed request during the outage arm is the observation being collected, not
# an error, so returning non-zero would abort the run under `set -e` at exactly
# the moment the measurement matters. The explicit `return 0` states that: it
# matches the existing behaviour, since `curl ... || echo` already yields 0.
probe() {
  local label="$1" out="$2"
  printf '%s ' "$label"
  curl -sS -o "$out" -w '%{http_code} %{time_total}\n' \
    -X POST "https://${ENDPOINT}/" \
    -H 'Content-Type: application/json' \
    -d '{"probe":"interlock-s0","intent":"allow"}' || echo "curl-failed"
  return 0
}

note "outage: healthy baseline"
probe healthy "${EVIDENCE_DIR}/outage-before.body" \
  | tee "${EVIDENCE_DIR}/outage-before.txt" | tee -a "$COMMAND_LOG"

note "outage: detach the extension backend"
# Removing the NEG makes the callout target unreachable while leaving the
# extension and policy bound, which is the failure the design must survive.
run "$GCLOUD" compute backend-services remove-backend "$BACKEND_SERVICE" \
  --region="$REGION" --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION" --project="$PROJECT_ID"
sleep 60

note "outage: probe during outage"
probe outage "${EVIDENCE_DIR}/outage-during.body" \
  | tee "${EVIDENCE_DIR}/outage-during.txt" | tee -a "$COMMAND_LOG"

note "outage: restore"
run "$GCLOUD" compute backend-services add-backend "$BACKEND_SERVICE" \
  --region="$REGION" --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION" --project="$PROJECT_ID"
sleep 60

note "outage: probe after restore"
probe restored "${EVIDENCE_DIR}/outage-after.body" \
  | tee "${EVIDENCE_DIR}/outage-after.txt" | tee -a "$COMMAND_LOG"

run_ok "$GCLOUD" logging read \
  "resource.type=networkservices.googleapis.com/AgentGateway OR resource.type=cloud_run_revision" \
  --project="$PROJECT_ID" --limit=200 --format=json \
  > "${EVIDENCE_DIR}/outage-logs.json"

echo "outage sequence complete; evidence in ${EVIDENCE_DIR}"
