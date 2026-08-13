#!/usr/bin/env bash
# HAC-325 / S0 step 2: one successful ext_proc round trip, plus the deterministic
# deny, plus a latency sample. Answers ADR questions 2 and 3.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

SAMPLES="${SAMPLES:-20}"

ENDPOINT="$("$GCLOUD" network-services agent-gateways describe "$GATEWAY" \
  --location="$REGION" --project="$PROJECT_ID" \
  --format='value(googleManaged.endpoint)' 2>/dev/null || true)"
if [[ -z "$ENDPOINT" ]]; then
  # Field name is not documented; fall back to the whole resource so the receipt
  # records what the API actually returned rather than a guess.
  "$GCLOUD" network-services agent-gateways describe "$GATEWAY" \
    --location="$REGION" --project="$PROJECT_ID" --format=json \
    > "${EVIDENCE_DIR}/agent-gateway-endpoint-lookup.json"
  echo "could not resolve gateway endpoint; see agent-gateway-endpoint-lookup.json" >&2
  exit 2
fi
echo "ENDPOINT=${ENDPOINT}" | tee -a "$COMMAND_LOG"

note "round trip: allow"
run_ok curl -sS -o "${EVIDENCE_DIR}/roundtrip-allow.body" \
  -w '%{http_code} %{time_total}\n' \
  -X POST "https://${ENDPOINT}/" \
  -H 'Content-Type: application/json' \
  -d '{"probe":"interlock-s0","intent":"allow"}'

note "round trip: deny (deterministic marker)"
run_ok curl -sS -o "${EVIDENCE_DIR}/roundtrip-deny.body" \
  -w '%{http_code} %{time_total}\n' \
  -X POST "https://${ENDPOINT}/" \
  -H 'Content-Type: application/json' \
  -d '{"probe":"interlock-s0","intent":"interlock-s0-deny"}'

note "latency sample (n=${SAMPLES})"
: > "${EVIDENCE_DIR}/latency-samples.txt"
for _ in $(seq 1 "$SAMPLES"); do
  curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' \
    -X POST "https://${ENDPOINT}/" \
    -H 'Content-Type: application/json' \
    -d '{"probe":"interlock-s0","intent":"allow"}' \
    >> "${EVIDENCE_DIR}/latency-samples.txt" || true
done
# Report the distribution, never a happy-path number -- the canon forbids the
# single-figure form.
awk '{print $2}' "${EVIDENCE_DIR}/latency-samples.txt" | sort -n | awk '
  { v[NR] = $1; s += $1 }
  END {
    if (NR == 0) { print "no samples"; exit }
    printf "n=%d min=%.3fs p50=%.3fs p90=%.3fs p99=%.3fs max=%.3fs mean=%.3fs\n",
      NR, v[1], v[int(NR*0.5)+((NR*0.5)%1?1:0)], v[int(NR*0.9)+((NR*0.9)%1?1:0)],
      v[int(NR*0.99)+((NR*0.99)%1?1:0)], v[NR], s/NR
  }' | tee "${EVIDENCE_DIR}/latency-summary.txt"

note "extension-side logs"
run_ok "$GCLOUD" logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${EXT_SERVICE}" \
  --project="$PROJECT_ID" --limit=200 --format=json \
  > "${EVIDENCE_DIR}/extension-logs.json"

echo "round trip complete; evidence in ${EVIDENCE_DIR}"
