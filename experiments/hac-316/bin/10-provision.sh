#!/usr/bin/env bash
#
# Phase 7 provisioning. One block per row of the frozen resource manifest
# (evidence/resources.json), in manifest order.
#
# ## CLOUD SPEND BEGINS HERE
#
# Do not run this until Phases 0-6 are green. It creates a disposable Google
# Cloud project and bills against ${BILLING_ACCOUNT}. Teardown is
# bin/teardown.mjs, and it refuses any project id this script did not record.
#
# ## Nothing is inherited
#
# Every gcloud call names ${PROJECT_ID} explicitly: as --project= where the verb
# accepts it, as the positional operand where it does not. `gcloud config` is
# never read and never set (REQ-070). The reason is specific rather than
# decorative: the ambient configuration on the operator's workstation still names
# a project that was deleted at an earlier teardown, so a script that inherits it
# aims at the wrong place or at nothing at all. An id that is generated here and
# passed explicitly can only ever mean one project.
#
# The region is pinned to the literal us-central1 for every regional resource,
# with no exceptions and no override.
#
# ## Not created
#
# X-01. No egress gateway, no network attachment, no PSC endpoint, no internal
# load balancer, no DNS peering, no authorization policy, no service extension.
# HAC-325 falsified that topology and this phase does not re-provision any part
# of it. REQ-069 and REQ-070 each check that independently of REQ-058.
#
# ## What this script does not do
#
# It does not create R-09 or R-10. Those are Agent Engine reasoning engines and
# there is no gcloud create verb for one; the ADK deploy entry point creates them
# through vertexai.agent_engines.create and appends their resource names to the
# topology record this script writes. Until it has, REQ-069 reports a declared
# resource that was never provisioned - which is the correct reading of a
# half-provisioned phase, not a defect in the check.
#
# Usage:
#   BILLING_ACCOUNT=<id> bash experiments/hac-316/bin/10-provision.sh

set -euo pipefail

# P-00  identifiers - generated, never inferred
export PROJECT_ID="interlock-s1-$(openssl rand -hex 4)"
export REGION="us-central1"
export REPO="interlock-s1"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/interlock-s1:latest"
export BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT to the billing account id}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK_DIR="${WORK_DIR:-${REPO_ROOT}/experiments/hac-316/.work}"
EVIDENCE_DIR="${REPO_ROOT}/experiments/hac-316/evidence"
mkdir -p "${WORK_DIR}"

echo "provisioning ${PROJECT_ID} in ${REGION}"

# P-01  R-01 + R-02  disposable project, billing linked
gcloud projects create "${PROJECT_ID}" --name="HAC-316 S1 disposable" --quiet
gcloud billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACCOUNT}" --quiet

# P-02  R-03  APIs - the five the topology needs, and only those
gcloud services enable --project="${PROJECT_ID}" --quiet \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com storage.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
PROXY_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# P-03  R-12  build role - absent on a fresh project, and its absence reads
# like a bucket fault (HAC-325 finding 1)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --quiet \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.builder --condition=None

# P-04  R-04  Artifact Registry
gcloud artifacts repositories create "${REPO}" --project="${PROJECT_ID}" --quiet \
  --repository-format=docker --location="${REGION}"

# P-05  R-05 + R-13  one image, built once, three entry points behind it
gcloud builds submit "${REPO_ROOT}" --project="${PROJECT_ID}" --quiet \
  --config="${WORK_DIR}/cloudbuild.yaml"

# P-06  R-06  alpha target - unchanged ProtectedTarget
gcloud run deploy interlock-s1-target-alpha --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=dist/target/main.js \
  --env-vars-file="${WORK_DIR}/target-alpha.env.json" --max-instances=1

# P-07  R-07  beta target - unchanged ProtectedTarget, same flags
gcloud run deploy interlock-s1-target-beta --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=dist/target/main.js \
  --env-vars-file="${WORK_DIR}/target-beta.env.json" --max-instances=1

# P-08  R-08  routing surface - ONE process, ONE PendingIntentStore (REQ-028).
# --max-instances=1 is load-bearing: a second instance is a second store, and
# the coupling would go unobserved without anything looking wrong.
gcloud run deploy interlock-s1-proxy --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=experiments/hac-316/src/routing.mjs \
  --env-vars-file="${WORK_DIR}/proxy.env.json" --max-instances=1

# P-09  R-11  Agent Engine staging bucket
gcloud storage buckets create "gs://${PROJECT_ID}-agent-staging" --project="${PROJECT_ID}" \
  --location="${REGION}"

# P-10  R-12  invoker bindings - least privilege, no allUsers anywhere
gcloud run services add-iam-policy-binding interlock-s1-target-alpha --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:${PROXY_SA}" --role=roles/run.invoker
gcloud run services add-iam-policy-binding interlock-s1-target-beta --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:${PROXY_SA}" --role=roles/run.invoker
gcloud run services add-iam-policy-binding interlock-s1-proxy --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com" \
  --role=roles/run.invoker

ALPHA_URL="$(gcloud run services describe interlock-s1-target-alpha --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"
BETA_URL="$(gcloud run services describe interlock-s1-target-beta --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"
PROXY_URL="$(gcloud run services describe interlock-s1-proxy --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"

# The record teardown reads. One half of the two-key rule (G-3), so it is written
# now rather than reconstructed afterwards: teardown must be able to refuse an id
# this run did not create, and it cannot do that against a file that does not
# exist yet. R-09 and R-10 are appended by the ADK deploy entry point.
cat > "${EVIDENCE_DIR}/topology.json" <<TOPOLOGY
{
  "experiment": "HAC-316",
  "artifact": "Phase 7 provisioning actuals",
  "producedBy": "experiments/hac-316/bin/10-provision.sh",
  "producedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "projectId": "${PROJECT_ID}",
  "projectNumber": "${PROJECT_NUMBER}",
  "region": "${REGION}",
  "pendingActuals": ["R-09", "R-10"],
  "pendingActualsNote": "Agent Engine reasoning engines, appended by the ADK deploy entry point. REQ-069 fails until they are, and that is the correct reading of a half-provisioned phase.",
  "actuals": [
    { "id": "R-01", "name": "${PROJECT_ID}" },
    { "id": "R-02", "name": "billingAccounts/${BILLING_ACCOUNT}" },
    { "id": "R-03", "name": "run,cloudbuild,artifactregistry,aiplatform,storage" },
    { "id": "R-04", "name": "projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO}" },
    { "id": "R-05", "name": "${IMAGE}" },
    { "id": "R-06", "name": "interlock-s1-target-alpha", "url": "${ALPHA_URL}" },
    { "id": "R-07", "name": "interlock-s1-target-beta", "url": "${BETA_URL}" },
    { "id": "R-08", "name": "interlock-s1-proxy", "url": "${PROXY_URL}" },
    { "id": "R-11", "name": "gs://${PROJECT_ID}-agent-staging" },
    { "id": "R-12", "name": "iam bindings per resources.json R-12" },
    { "id": "R-13", "name": "cloudbuild builds (transient)" }
  ]
}
TOPOLOGY

echo "wrote ${EVIDENCE_DIR}/topology.json"
echo "provisioned project=${PROJECT_ID} region=${REGION}"
echo "next: deploy the ADK agents (R-09, R-10) and append their resource names to topology.json"
echo "teardown: node experiments/hac-316/bin/teardown.mjs --project=${PROJECT_ID} --execute --confirm --verify"
