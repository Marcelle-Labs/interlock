#!/usr/bin/env bash
# Provision the HAC-326 Cloud Run topology.
#
#   caller -> Interlock proxy (Cloud Run, authenticated)
#          -> protected target (Cloud Run, authenticated)
#
# Both services require IAM authentication. That is not incidental hardening: it
# is what makes a real, platform-verified caller identity available at the proxy,
# which is one of the things this gate has to freeze. It also sidesteps the org
# policy that forbids `allUsers` (HAC-325 finding 9) rather than weakening it.
#
# Idempotent. Safe to re-run against a partially provisioned project.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

echo "== enabling APIs =="
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# HAC-325 finding 1: on a fresh project the Compute Engine default service
# account lacks the builder role, and `builds submit` then fails with a
# storage.objects.get 403 that reads like a bucket fault.
echo "== granting Cloud Build the builder role =="
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role=roles/cloudbuild.builds.builder \
  --condition=None --quiet >/dev/null

echo "== creating Artifact Registry repository =="
gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker --location="${REGION}" \
    --description="HAC-326 S2 fallback enforcement images" --quiet

echo "== minting the receipt signing key pair =="
# Generated per deployment and kept under .work/ only. The private half reaches
# the proxy through an env-vars file; the public half reaches the target the same
# way. Neither is ever committed, and check:provenance scans for both shapes.
if [[ ! -f "${SIGNING_KEY_PEM_FILE}" ]]; then
  openssl genpkey -algorithm ed25519 -out "${SIGNING_KEY_PEM_FILE}"
  openssl pkey -in "${SIGNING_KEY_PEM_FILE}" -pubout -out "${VERIFICATION_KEY_PEM_FILE}"
fi
chmod 600 "${SIGNING_KEY_PEM_FILE}"

echo "== building the image =="
# Written to a file rather than piped: `gcloud builds submit` does not read
# --config from stdin.
cat > "${WORK_DIR}/cloudbuild.yaml" <<YAML
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - experiments/hac-326/deploy/Dockerfile
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
options:
  logging: CLOUD_LOGGING_ONLY
YAML

gcloud builds submit "${REPO_ROOT}" \
  --config="${WORK_DIR}/cloudbuild.yaml" --quiet

echo "== deploying the protected target =="
# The verification key map is written as a YAML env-vars file because a PEM
# contains newlines that --set-env-vars cannot carry.
VERIFICATION_KEYS_JSON="$(node -e '
  const { readFileSync } = require("node:fs");
  process.stdout.write(JSON.stringify({ [process.argv[1]]: readFileSync(process.argv[2], "utf8") }));
' "${SIGNING_KEY_ID}" "${VERIFICATION_KEY_PEM_FILE}")"

node -e '
  const { writeFileSync } = require("node:fs");
  writeFileSync(process.argv[1], JSON.stringify({
    INTERLOCK_TARGET_ID: process.argv[2],
    INTERLOCK_VERIFICATION_KEYS: process.argv[3],
  }, null, 2));
' "${WORK_DIR}/target.env.json" "${TARGET_ID}" "${VERIFICATION_KEYS_JSON}"

gcloud run deploy "${TARGET_SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --no-allow-unauthenticated \
  --command=node --args=dist/target/main.js \
  --env-vars-file="${WORK_DIR}/target.env.json" \
  --max-instances=1 \
  --quiet

TARGET_URL="$(gcloud run services describe "${TARGET_SERVICE}" --region="${REGION}" --format='value(status.url)')"
echo "target: ${TARGET_URL}"

echo "== deploying the Interlock proxy =="
SOURCE_REVISION="$(node -e '
  const { readFileSync } = require("node:fs");
  process.stdout.write(JSON.parse(readFileSync(process.argv[1], "utf8")).selection.scoringBasis.basisRevision);
' "${REPO_ROOT}/experiments/hac-330/evidence/baseline.evidence.json")"

node -e '
  const { readFileSync, writeFileSync } = require("node:fs");
  writeFileSync(process.argv[1], JSON.stringify({
    INTERLOCK_TARGET_ID: process.argv[2],
    INTERLOCK_TARGET_URL: process.argv[3],
    INTERLOCK_TARGET_AUDIENCE: process.argv[3],
    INTERLOCK_SIGNING_KEY_ID: process.argv[4],
    INTERLOCK_SIGNING_KEY_PEM: readFileSync(process.argv[5], "utf8"),
    INTERLOCK_SOURCE_REVISION: process.argv[6],
  }, null, 2));
' "${WORK_DIR}/proxy.env.json" "${TARGET_ID}" "${TARGET_URL}" "${SIGNING_KEY_ID}" "${SIGNING_KEY_PEM_FILE}" "${SOURCE_REVISION}"

gcloud run deploy "${PROXY_SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --no-allow-unauthenticated \
  --command=node --args=dist/proxy/main.js \
  --env-vars-file="${WORK_DIR}/proxy.env.json" \
  --max-instances=1 \
  --quiet

PROXY_URL="$(gcloud run services describe "${PROXY_SERVICE}" --region="${REGION}" --format='value(status.url)')"
echo "proxy: ${PROXY_URL}"

echo "== authorizing the proxy to call the target =="
# Least privilege, and named rather than `allUsers`: only the proxy's own
# service identity may invoke the target.
PROXY_SA="$(gcloud run services describe "${PROXY_SERVICE}" --region="${REGION}" \
  --format='value(spec.template.spec.serviceAccountName)')"
PROXY_SA="${PROXY_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

gcloud run services add-iam-policy-binding "${TARGET_SERVICE}" \
  --region="${REGION}" \
  --member="serviceAccount:${PROXY_SA}" \
  --role=roles/run.invoker --quiet >/dev/null

# The operator drives the proxy directly, so they need invoker on it too.
CALLER="$(gcloud config get-value account 2>/dev/null)"
gcloud run services add-iam-policy-binding "${PROXY_SERVICE}" \
  --region="${REGION}" \
  --member="user:${CALLER}" \
  --role=roles/run.invoker --quiet >/dev/null

# ...and on the target, so the direct-attack arm can be run against it.
gcloud run services add-iam-policy-binding "${TARGET_SERVICE}" \
  --region="${REGION}" \
  --member="user:${CALLER}" \
  --role=roles/run.invoker --quiet >/dev/null

node -e '
  const { writeFileSync } = require("node:fs");
  writeFileSync(process.argv[1], JSON.stringify({
    projectId: process.argv[2],
    region: process.argv[3],
    proxyUrl: process.argv[4],
    targetUrl: process.argv[5],
    proxyServiceAccount: process.argv[6],
    image: process.argv[7],
    sourceRevision: process.argv[8],
    signingKeyId: process.argv[9],
    authentication: "IAM required on both services (--no-allow-unauthenticated)",
  }, null, 2) + "\n");
' "${WORK_DIR}/topology.json" "${PROJECT_ID}" "${REGION}" "${PROXY_URL}" "${TARGET_URL}" \
  "${PROXY_SA}" "${IMAGE}" "${SOURCE_REVISION}" "${SIGNING_KEY_ID}"

echo
echo "deployed. topology recorded at ${WORK_DIR}/topology.json"
