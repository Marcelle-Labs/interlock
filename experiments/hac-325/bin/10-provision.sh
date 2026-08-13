#!/usr/bin/env bash
# HAC-325 / S0 step 1: provision the smallest real topology the ADR describes.
#
#   Agent Gateway (Google-managed)
#     -> CONTENT_AUTHZ authz policy
#       -> AuthzExtension (failOpen: false)
#         -> regional INTERNAL_MANAGED backend service
#           -> Serverless NEG
#             -> Cloud Run ext_proc extension
#
# plus the VPC, PSC network attachment, private DNS zone and internal FQDN the
# managed gateway needs to reach into the project's network.
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

WORK="${EXPERIMENT_DIR}/.work"
mkdir -p "$WORK"

note "provision: network"
ensure "$GCLOUD" compute networks create "$NETWORK" \
  --subnet-mode=custom --project="$PROJECT_ID"
ensure "$GCLOUD" compute networks subnets create "$SUBNET" \
  --network="$NETWORK" --range="$SUBNET_RANGE" --region="$REGION" \
  --project="$PROJECT_ID"
# Regional internal managed load balancing requires a proxy-only subnet.
ensure "$GCLOUD" compute networks subnets create "$PROXY_SUBNET" \
  --purpose=REGIONAL_MANAGED_PROXY --role=ACTIVE \
  --network="$NETWORK" --range="$PROXY_RANGE" --region="$REGION" \
  --project="$PROJECT_ID"
# Separate subnet for the PSC interface the managed gateway attaches to.
ensure "$GCLOUD" compute networks subnets create "$PSC_SUBNET" \
  --network="$NETWORK" --range="$PSC_RANGE" --region="$REGION" \
  --project="$PROJECT_ID"

note "provision: images"
ensure "$GCLOUD" artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION" --project="$PROJECT_ID"

EXT_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${EXT_SERVICE}:s0"
TARGET_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${TARGET_SERVICE}:s0"
run "$GCLOUD" builds submit "${EXPERIMENT_DIR}/extension" \
  --tag="$EXT_IMAGE" --project="$PROJECT_ID" --region="$REGION"
run "$GCLOUD" builds submit "${EXPERIMENT_DIR}/target" \
  --tag="$TARGET_IMAGE" --project="$PROJECT_ID" --region="$REGION"

note "provision: cloud run"
# The callout backend must speak plaintext gRPC over HTTP/2 and accept
# unauthenticated calls -- the load balancer is the only client.
run "$GCLOUD" run deploy "$EXT_SERVICE" \
  --image="$EXT_IMAGE" --region="$REGION" --project="$PROJECT_ID" \
  --use-http2 --allow-unauthenticated --no-cpu-throttling \
  --min-instances=1 --max-instances=2 --port=8080
run "$GCLOUD" run deploy "$TARGET_SERVICE" \
  --image="$TARGET_IMAGE" --region="$REGION" --project="$PROJECT_ID" \
  --allow-unauthenticated --min-instances=1 --max-instances=2 --port=8080

run "$GCLOUD" run services describe "$EXT_SERVICE" --region="$REGION" \
  --project="$PROJECT_ID" --format=json > "${EVIDENCE_DIR}/cloudrun-ext.json"
run "$GCLOUD" run services describe "$TARGET_SERVICE" --region="$REGION" \
  --project="$PROJECT_ID" --format=json > "${EVIDENCE_DIR}/cloudrun-target.json"

note "provision: serverless NEG and backend service"
ensure "$GCLOUD" compute network-endpoint-groups create "$NEG" \
  --region="$REGION" --network-endpoint-type=serverless \
  --cloud-run-service="$EXT_SERVICE" --project="$PROJECT_ID"
ensure "$GCLOUD" compute backend-services create "$BACKEND_SERVICE" \
  --load-balancing-scheme=INTERNAL_MANAGED --protocol=HTTP2 \
  --region="$REGION" --project="$PROJECT_ID"
# Re-adding an already-attached serverless NEG reports a bogus "Invalid
# Serverless Network Endpoint Group scope" rather than a duplicate error, so
# check membership instead of relying on the error text.
if "$GCLOUD" compute backend-services describe "$BACKEND_SERVICE" \
     --region="$REGION" --project="$PROJECT_ID" \
     --format='value(backends[].group)' 2>/dev/null | grep -q "/${NEG}\$"; then
  note "backend already attached to ${BACKEND_SERVICE}; skipping add-backend"
else
  run "$GCLOUD" compute backend-services add-backend "$BACKEND_SERVICE" \
    --region="$REGION" --network-endpoint-group="$NEG" \
    --network-endpoint-group-region="$REGION" --project="$PROJECT_ID"
fi
run "$GCLOUD" compute backend-services describe "$BACKEND_SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/backend-service.json"

note "provision: internal FQDN and private DNS"
# An internal forwarding rule gives the FQDN a real address, so the DNS path is
# exercised rather than asserted.
ensure "$GCLOUD" compute addresses create "${PREFIX}-ilb-ip" \
  --region="$REGION" --subnet="$SUBNET" --project="$PROJECT_ID"
ILB_IP="$("$GCLOUD" compute addresses describe "${PREFIX}-ilb-ip" \
  --region="$REGION" --project="$PROJECT_ID" --format='value(address)')"
echo "ILB_IP=${ILB_IP}" | tee -a "$COMMAND_LOG"

ensure "$GCLOUD" compute url-maps create "${PREFIX}-urlmap" \
  --default-service="$BACKEND_SERVICE" --region="$REGION" --project="$PROJECT_ID"
ensure "$GCLOUD" compute target-http-proxies create "${PREFIX}-proxy" \
  --url-map="${PREFIX}-urlmap" --region="$REGION" --project="$PROJECT_ID"
ensure "$GCLOUD" compute forwarding-rules create "${PREFIX}-fr" \
  --load-balancing-scheme=INTERNAL_MANAGED --network="$NETWORK" \
  --subnet="$SUBNET" --address="$ILB_IP" --ports=80 \
  --target-http-proxy="${PREFIX}-proxy" --target-http-proxy-region="$REGION" \
  --region="$REGION" --project="$PROJECT_ID"

ensure "$GCLOUD" dns managed-zones create "$DNS_ZONE" \
  --dns-name="$DNS_DOMAIN" --visibility=private \
  --networks="$NETWORK" --description="HAC-325 S0 internal FQDN" \
  --project="$PROJECT_ID"
ensure "$GCLOUD" dns record-sets create "${EXT_FQDN}." \
  --zone="$DNS_ZONE" --type=A --ttl=60 --rrdatas="$ILB_IP" \
  --project="$PROJECT_ID"

note "provision: PSC network attachment for the managed gateway"
ensure "$GCLOUD" compute network-attachments create "$NETWORK_ATTACHMENT" \
  --region="$REGION" --subnets="$PSC_SUBNET" \
  --connection-preference=ACCEPT_AUTOMATIC --project="$PROJECT_ID"

note "provision: agent gateway"
cat > "${WORK}/agent-gateway.yaml" <<YAML
name: projects/${PROJECT_ID}/locations/${REGION}/agentGateways/${GATEWAY}
protocols:
  - MCP
googleManaged:
  governedAccessPath: CLIENT_TO_AGENT
networkConfig:
  egress:
    networkAttachment: projects/${PROJECT_ID}/regions/${REGION}/networkAttachments/${NETWORK_ATTACHMENT}
  dnsPeeringConfig:
    domains:
      - ${DNS_DOMAIN}
    targetNetwork: projects/${PROJECT_ID}/global/networks/${NETWORK}
    targetProject: ${PROJECT_ID}
YAML
cp "${WORK}/agent-gateway.yaml" "${EVIDENCE_DIR}/agent-gateway.yaml"
run_ok "$GCLOUD" network-services agent-gateways import "$GATEWAY" \
  --source="${WORK}/agent-gateway.yaml" --location="$REGION" --project="$PROJECT_ID"
run_ok "$GCLOUD" network-services agent-gateways describe "$GATEWAY" \
  --location="$REGION" --project="$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/agent-gateway.json"

note "provision: authz extension (question 1 -- does import succeed unallowlisted?)"
# An Agent Gateway target carries no load balancing scheme, and the API requires
# the extension's scheme to match it. The backend-service form of `service`
# forces INTERNAL_MANAGED and is therefore rejected for gateway targets:
#
#   authz extension load balancing scheme INTERNAL_MANAGED must match the
#   authz policy load balancing scheme LOAD_BALANCING_SCHEME_UNSPECIFIED
#
# So the FQDN form is mandatory here, and the internal FQDN is reached through
# the gateway's dnsPeeringConfig and PSC attachment into this VPC. The
# schema-driven backend-service form belongs to load balancer targets, not
# gateway targets. failOpen:false is the ADR's posture.
cat > "${WORK}/authz-extension.yaml" <<YAML
name: projects/${PROJECT_ID}/locations/${REGION}/authzExtensions/${AUTHZ_EXTENSION}
description: HAC-325 S0 consolidated CONTENT_AUTHZ probe. No product policy.
service: ${EXT_FQDN}
failOpen: false
timeout: ${EXT_TIMEOUT}
wireFormat: EXT_PROC_GRPC
YAML
cp "${WORK}/authz-extension.yaml" "${EVIDENCE_DIR}/authz-extension.yaml"
run_ok "$GCLOUD" service-extensions authz-extensions import "$AUTHZ_EXTENSION" \
  --source="${WORK}/authz-extension.yaml" --location="$REGION" --project="$PROJECT_ID"
run_ok "$GCLOUD" service-extensions authz-extensions describe "$AUTHZ_EXTENSION" \
  --location="$REGION" --project="$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/authz-extension.json"

note "provision: CONTENT_AUTHZ policy binding the extension to the gateway"
cat > "${WORK}/authz-policy.yaml" <<YAML
name: projects/${PROJECT_ID}/locations/${REGION}/authzPolicies/${AUTHZ_POLICY}
target:
  resources:
    - projects/${PROJECT_ID}/locations/${REGION}/agentGateways/${GATEWAY}
policyProfile: CONTENT_AUTHZ
action: CUSTOM
customProvider:
  authzExtension:
    resources:
      - projects/${PROJECT_ID}/locations/${REGION}/authzExtensions/${AUTHZ_EXTENSION}
httpRules:
  - to:
      operations:
        - paths:
            - prefix: /
YAML
cp "${WORK}/authz-policy.yaml" "${EVIDENCE_DIR}/authz-policy.yaml"
run_ok "$GCLOUD" network-security authz-policies import "$AUTHZ_POLICY" \
  --source="${WORK}/authz-policy.yaml" --location="$REGION" --project="$PROJECT_ID"
run_ok "$GCLOUD" network-security authz-policies describe "$AUTHZ_POLICY" \
  --location="$REGION" --project="$PROJECT_ID" --format=json \
  > "${EVIDENCE_DIR}/authz-policy.json"

echo "provision complete; evidence in ${EVIDENCE_DIR}"
