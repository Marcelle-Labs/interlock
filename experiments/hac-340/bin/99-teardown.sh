#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
for service in "$AGENT_SERVICE" "$PROXY_SERVICE" "$TARGET_SERVICE"; do gcloud run services delete "$service" --region="$REGION" --quiet 2>/dev/null || true; done
for account in "$AGENT_SA" "$PROXY_SA" "$TARGET_SA"; do gcloud iam service-accounts delete "${account}@${PROJECT_ID}.iam.gserviceaccount.com" --quiet 2>/dev/null || true; done
gcloud artifacts repositories delete "$REPO" --location="$REGION" --quiet 2>/dev/null || true
node -e 'const fs=require("fs");const p=process.argv[1];const x={deletedAt:new Date().toISOString(),status:"completed"};fs.writeFileSync(p,JSON.stringify(x,null,2)+"\n")' "$EVIDENCE_DIR/teardown.json"
echo "teardown evidence: $EVIDENCE_DIR/teardown.json"
