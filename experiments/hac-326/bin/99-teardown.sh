#!/usr/bin/env bash
# Tear down the HAC-326 Cloud Run topology and stop spend.
#
# Two modes. If the project was created for this experiment, deleting the project
# is the exhaustive teardown and is preferred — it cannot leave a resource behind
# that nobody remembered to list, which is the failure mode a resource-by-resource
# script has. Otherwise the individual services are removed.
#
#   PROJECT_ID=... DELETE_PROJECT=true experiments/hac-326/bin/99-teardown.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [[ "${DELETE_PROJECT:-false}" == "true" ]]; then
  echo "== deleting the disposable project ${PROJECT_ID} =="
  gcloud projects delete "${PROJECT_ID}" --quiet
  echo "deleted. Google retains it recoverably for ~30 days."
else
  echo "== deleting Cloud Run services =="
  gcloud run services delete "${PROXY_SERVICE}" --region="${REGION}" --quiet || true
  gcloud run services delete "${TARGET_SERVICE}" --region="${REGION}" --quiet || true

  echo "== deleting the Artifact Registry repository =="
  gcloud artifacts repositories delete "${REPO}" --location="${REGION}" --quiet || true
fi

# Key material is per-deployment and has no reason to outlive it.
rm -f "${SIGNING_KEY_PEM_FILE}" "${VERIFICATION_KEY_PEM_FILE}" \
      "${WORK_DIR}/proxy.env.json" "${WORK_DIR}/target.env.json"

echo "teardown complete"
