#!/usr/bin/env bash
# HAC-325 / S0 step 0: record the starting environment and enable the APIs the
# topology needs. Captures the identity, versions, quota and billing posture the
# receipt has to state.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

note "preflight"

run "$GCLOUD" version
run "$GCLOUD" config set project "$PROJECT_ID"
run "$GCLOUD" auth list
run "$GCLOUD" projects describe "$PROJECT_ID"

# Billing must be live or every later step fails in a way that looks like a
# capability gap rather than an account gap.
run_ok "$GCLOUD" billing projects describe "$PROJECT_ID"

APIS=(
  compute.googleapis.com
  networkservices.googleapis.com
  networksecurity.googleapis.com
  dns.googleapis.com
  iam.googleapis.com
  run.googleapis.com
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  agentregistry.googleapis.com
  aiplatform.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
)
run "$GCLOUD" services enable "${APIS[@]}" --project="$PROJECT_ID"
run "$GCLOUD" services list --enabled --project="$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/apis-enabled.json"

# Identity in play: the caller, plus the service agents the managed gateway and
# Cloud Build use. Recorded so the receipt can state IAM prerequisites exactly.
PROJECT_NUMBER="$("$GCLOUD" projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export PROJECT_NUMBER
{
  echo "{"
  echo "  \"projectId\": \"${PROJECT_ID}\","
  echo "  \"projectNumber\": \"${PROJECT_NUMBER}\","
  echo "  \"region\": \"${REGION}\","
  echo "  \"caller\": \"$("$GCLOUD" config get-value account 2>/dev/null)\","
  echo "  \"gcloudVersion\": \"$("$GCLOUD" version --format='value(\"Google Cloud SDK\")' 2>/dev/null)\","
  echo "  \"dependencyServiceAgent\": \"service-${PROJECT_NUMBER}@gcp-sa-dep.iam.gserviceaccount.com\","
  echo "  \"cloudBuildServiceAgent\": \"service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com\""
  echo "}"
} > "${EVIDENCE_DIR}/identities.json"

run "$GCLOUD" projects get-iam-policy "$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/iam-policy-before.json"

echo "preflight complete; evidence in ${EVIDENCE_DIR}"
