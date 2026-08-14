#!/usr/bin/env bash
# Thin HAC-340 adaptation of HAC-326's Cloud Run deployment mechanics.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com --quiet
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CALLER="$("$GCLOUD_BIN" config get-value account)"
# HAC-326 finding: on a fresh project Cloud Build's default worker identity
# needs this role to read the staged source archive it just uploaded.
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${COMPUTE_SA}" --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null
for name in "$TARGET_SA" "$PROXY_SA" "$AGENT_SA"; do
  gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 || \
    gcloud iam service-accounts create "$name" --display-name="$name" --quiet
done
TARGET_MEMBER="serviceAccount:${TARGET_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
PROXY_MEMBER="serviceAccount:${PROXY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
AGENT_MEMBER="serviceAccount:${AGENT_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$AGENT_MEMBER" --role=roles/aiplatform.user --condition=None --quiet >/dev/null
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --quiet
NODE_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/interlock-node:$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
AGENT_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/interlock-adk:$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
cat >"$WORK_DIR/cloudbuild.yaml" <<YAML
steps:
- name: gcr.io/cloud-builders/docker
  args: [build, -f, experiments/hac-326/deploy/Dockerfile, -t, ${NODE_IMAGE}, .]
- name: gcr.io/cloud-builders/docker
  args: [build, -f, experiments/hac-340/deploy/Dockerfile, -t, ${AGENT_IMAGE}, .]
images: [${NODE_IMAGE}, ${AGENT_IMAGE}]
options: {logging: CLOUD_LOGGING_ONLY}
YAML
gcloud builds submit "$REPO_ROOT" --config="$WORK_DIR/cloudbuild.yaml" --quiet
openssl genpkey -algorithm ed25519 -out "$WORK_DIR/signing.pem"
openssl pkey -in "$WORK_DIR/signing.pem" -pubout -out "$WORK_DIR/verification.pem"
chmod 600 "$WORK_DIR/signing.pem"
KEYS="$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({[process.argv[1]]:fs.readFileSync(process.argv[2],"utf8")}))' "$SIGNING_KEY_ID" "$WORK_DIR/verification.pem")"
SOURCE_REVISION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).selection.scoringBasis.basisRevision)' "$REPO_ROOT/experiments/hac-330/evidence/baseline.evidence.json")"
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({INTERLOCK_TARGET_ID:process.argv[2],INTERLOCK_VERIFICATION_KEYS:process.argv[3]},null,2))' "$WORK_DIR/target.env.json" "$TARGET_ID" "$KEYS"
gcloud run deploy "$TARGET_SERVICE" --image="$NODE_IMAGE" --region="$REGION" --no-allow-unauthenticated --service-account="${TARGET_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --command=node --args=dist/target/main.js --env-vars-file="$WORK_DIR/target.env.json" --max-instances=1 --quiet
TARGET_URL="$(gcloud run services describe "$TARGET_SERVICE" --region="$REGION" --format='value(status.url)')"
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({INTERLOCK_TARGET_ID:process.argv[2],INTERLOCK_TARGET_URL:process.argv[3],INTERLOCK_TARGET_AUDIENCE:process.argv[3],INTERLOCK_SIGNING_KEY_ID:process.argv[4],INTERLOCK_SIGNING_KEY_PEM:fs.readFileSync(process.argv[5],"utf8"),INTERLOCK_SOURCE_REVISION:process.argv[6]},null,2))' "$WORK_DIR/proxy.env.json" "$TARGET_ID" "$TARGET_URL" "$SIGNING_KEY_ID" "$WORK_DIR/signing.pem" "$SOURCE_REVISION"
gcloud run deploy "$PROXY_SERVICE" --image="$NODE_IMAGE" --region="$REGION" --no-allow-unauthenticated --service-account="${PROXY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --command=node --args=dist/proxy/main.js --env-vars-file="$WORK_DIR/proxy.env.json" --max-instances=1 --quiet
PROXY_URL="$(gcloud run services describe "$PROXY_SERVICE" --region="$REGION" --format='value(status.url)')"
gcloud run services add-iam-policy-binding "$TARGET_SERVICE" --region="$REGION" --member="$PROXY_MEMBER" --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "$TARGET_SERVICE" --region="$REGION" --member="user:${CALLER}" --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "$PROXY_SERVICE" --region="$REGION" --member="$AGENT_MEMBER" --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "$PROXY_SERVICE" --region="$REGION" --member="user:${CALLER}" --role=roles/run.invoker --quiet >/dev/null
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({INTERLOCK_GEMINI_MODEL:"gemini-3.5-flash",INTERLOCK_PROXY_URL:process.argv[2],INTERLOCK_PROXY_AUDIENCE:process.argv[2],GOOGLE_GENAI_USE_VERTEXAI:"True",GOOGLE_CLOUD_PROJECT:process.argv[3],GOOGLE_CLOUD_LOCATION:process.argv[4]},null,2))' "$WORK_DIR/agent.env.json" "$PROXY_URL" "$PROJECT_ID" "$VERTEX_LOCATION"
gcloud run deploy "$AGENT_SERVICE" --image="$AGENT_IMAGE" --region="$REGION" --no-allow-unauthenticated --service-account="${AGENT_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --env-vars-file="$WORK_DIR/agent.env.json" --max-instances=1 --quiet
AGENT_URL="$(gcloud run services describe "$AGENT_SERVICE" --region="$REGION" --format='value(status.url)')"
gcloud run services add-iam-policy-binding "$AGENT_SERVICE" --region="$REGION" --member="user:${CALLER}" --role=roles/run.invoker --quiet >/dev/null
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({projectId:process.argv[2],region:process.argv[3],vertexLocation:process.argv[4],agentUrl:process.argv[5],proxyUrl:process.argv[6],targetUrl:process.argv[7],agentServiceAccount:process.argv[8],proxyServiceAccount:process.argv[9],targetServiceAccount:process.argv[10],observerPrincipal:process.argv[11],nodeImage:process.argv[12],agentImage:process.argv[13]},null,2)+"\n")' "$WORK_DIR/topology.json" "$PROJECT_ID" "$REGION" "$VERTEX_LOCATION" "$AGENT_URL" "$PROXY_URL" "$TARGET_URL" "$AGENT_MEMBER" "$PROXY_MEMBER" "$TARGET_MEMBER" "user:${CALLER}" "$NODE_IMAGE" "$AGENT_IMAGE"
echo "provisioned topology: $WORK_DIR/topology.json"
