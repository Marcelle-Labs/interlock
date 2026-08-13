#!/usr/bin/env bash
# HAC-325 / S0 teardown. Reverse dependency order. Every delete is tolerant so a
# partial provision still tears down completely, and the log records what was
# actually removed.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

note "teardown"
Q=(--quiet --project="$PROJECT_ID")

run_ok "$GCLOUD" network-security authz-policies delete "$AUTHZ_POLICY" --location="$REGION" "${Q[@]}"
run_ok "$GCLOUD" service-extensions authz-extensions delete "$AUTHZ_EXTENSION" --location="$REGION" "${Q[@]}"
run_ok "$GCLOUD" network-services agent-gateways delete "$GATEWAY" --location="$REGION" "${Q[@]}"

run_ok "$GCLOUD" compute network-attachments delete "$NETWORK_ATTACHMENT" --region="$REGION" "${Q[@]}"

run_ok "$GCLOUD" dns record-sets delete "${EXT_FQDN}." --zone="$DNS_ZONE" --type=A "${Q[@]}"
run_ok "$GCLOUD" dns managed-zones delete "$DNS_ZONE" "${Q[@]}"

run_ok "$GCLOUD" compute forwarding-rules delete "${PREFIX}-fr" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute target-http-proxies delete "${PREFIX}-proxy" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute url-maps delete "${PREFIX}-urlmap" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute addresses delete "${PREFIX}-ilb-ip" --region="$REGION" "${Q[@]}"

run_ok "$GCLOUD" compute backend-services delete "$BACKEND_SERVICE" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute network-endpoint-groups delete "$NEG" --region="$REGION" "${Q[@]}"

run_ok "$GCLOUD" run services delete "$EXT_SERVICE" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" run services delete "$TARGET_SERVICE" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" artifacts repositories delete "$AR_REPO" --location="$REGION" "${Q[@]}"

run_ok "$GCLOUD" compute networks subnets delete "$PSC_SUBNET" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute networks subnets delete "$PROXY_SUBNET" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute networks subnets delete "$SUBNET" --region="$REGION" "${Q[@]}"
run_ok "$GCLOUD" compute networks delete "$NETWORK" "${Q[@]}"

note "teardown: residue check"
# Anything still carrying the prefix after this point is a teardown defect.
{
  "$GCLOUD" compute networks list --filter="name~${PREFIX}" --project="$PROJECT_ID" --format=json
  "$GCLOUD" run services list --region="$REGION" --filter="metadata.name~${PREFIX}" --project="$PROJECT_ID" --format=json
  "$GCLOUD" compute backend-services list --filter="name~${PREFIX}" --project="$PROJECT_ID" --format=json
} > "${EVIDENCE_DIR}/teardown-residue.json" 2>&1 || true

echo "teardown complete; residue recorded in ${EVIDENCE_DIR}/teardown-residue.json"
