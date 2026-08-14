# Sources — HAC-339

Every external source relied on in this packet. Retrieval date for all:
**2026-08-14**. All platform-contract claims come from primary Google
documentation under the current **Gemini Enterprise Agent Platform** doc set
(the current home of Agent Runtime / Agent Gateway documentation).

## Primary Google sources (fetched and read in full relevant sections)

### S1 — Route Agent Runtime traffic through Agent Gateway

- URL: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/agent-gateway-runtime-deploy>
- Contracts relied on:
  - A single Runtime instance can bind to both an `AGENT_TO_ANYWHERE`
    (egress) and a `CLIENT_TO_AGENT` (ingress) gateway simultaneously.
  - New agents: pass `agent_gateway_config` (+ `identity_type=AGENT_IDENTITY`
    for gateway-mediated features) in `client.agent_engines.create`.
  - Existing agents: PATCH `spec.deploymentSpec.agentGatewayConfig` with
    `updateMask=spec.deploymentSpec.agentGatewayConfig`. Validation: GET the
    reasoning engine; if `.spec.deploymentSpec.agentGatewayConfig` returns
    `null`, "Runtime has failed to bind to the gateway."
  - "Updating an existing reasoning engine to set `agentGatewayConfig` does
    not change its `identity_type`" — an engine created without
    `AGENT_IDENTITY` cannot become eligible for gateway-mediated features by
    patching; it must be redeployed with both set at creation time.
  - **Allowlist essential APIs for Runtime operations:** "Agent Gateway
    adopts a default deny policy. To enable certain Agent Platform functions,
    you must ensure that the agent can communicate with the following
    endpoints" — including `agentregistry.googleapis.com`,
    `telemetry(.mtls).googleapis.com`, `logging(.mtls).googleapis.com`, and
    explicitly **Sessions**:
    `https://REGION-aiplatform.googleapis.com/API_VERSION/projects/.../sessions`
    and Memory Bank. "Because the gateway matches hostnames directly, you
    must ensure that you register all the variants that the agent SDK uses"
    — `REGION-aiplatform.googleapis.com`, `REGION-aiplatform.mtls.googleapis.com`,
    `aiplatform.REGION.rep.googleapis.com`. The agent must also hold
    `roles/iap.egressor` on these endpoints.
  - **CA injection:** "Because Agent Gateway performs TLS decryption and
    inspection on outbound agent communications, non-BYOC (source-based)
    agent deployments automatically inject the CA's certificate during image
    creation." BYOC images must instead install the gateway root CA from
    `agentGatewayCard.rootCertificates` into the system trust store and set
    `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`, `REQUESTS_CA_BUNDLE`,
    `SSL_CERT_FILE` to `/etc/ssl/certs/ca-certificates.crt`.
  - Limitations: an Agent Gateway can't be bound to Reasoning Engines
    created before 2026-04-29; all Runtime agents in one project+region must
    bind to the same egress (and same ingress) gateway; no VPC-SC; no
    revisions support; SCC Agent Engine Threat Detection unavailable with a
    gateway attached.

### S2 — Troubleshoot Agent Gateway connectivity

- URL: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/troubleshooting/troubleshoot-agent-gateway>
- Contracts relied on:
  - Egress request flow: default-deny for all outgoing traffic; success
    requires (a) destination registered in Agent Registry, (b) authorization
    policy explicitly targeting the gateway, (c) delegated authorization
    outcome, (d) agent identity holds `roles/iap.egressor` on the
    destination.
  - "Errors during Agent Runtime startup": when IAP is in enforcement mode
    the gateway "blocks calls even to internal services (such as aiplatform
    or logging) unless they are registered and the agent has the required
    IAM permissions." Symptom: **403 Forbidden** during startup. Fix:
    register hostnames, grant `roles/iap.egressor` (or temporarily dry-run
    IAP to discover failing hostnames).
  - Documented 403 signature: `Egress request is not authorized`.
  - "Agent deployed with custom container (BYOC) fails to connect": symptom
    "TLS handshake or certificate verification errors"; cause "the agent's
    custom container does not trust the Agent Gateway's certificate
    authority." **This TLS failure mode is documented only for BYOC.**
  - "Self-signed or private CA destinations fail to connect": Agent Gateway
    does not validate self-signed certificate chains on the destination side.
  - Basic roles required on the agent identity at startup:
    `roles/aiplatform.agentDefaultAccess`, `roles/aiplatform.user`,
    `roles/agentregistry.viewer`, `roles/logging.logWriter`,
    `roles/monitoring.metricWriter`, `roles/browser`.

### S3 — Use Agent Identity with Agent Runtime

- URL: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/agent-identity>
- Contracts relied on:
  - Agent identity credentials are secured by default by Context-Aware
    Access (CAA): mTLS with certificate-bound tokens (RFC 8705); tokens
    usable only from the intended runtime.
  - CAA opt-out (discouraged): env var
    `GOOGLE_API_PREVENT_AGENT_TOKEN_SHARING_FOR_GCP_SERVICES: False` at
    creation time.

### S4 — Delegate authorization with Service Extensions (Agent Gateway)

- URL: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/delegate-authorization>
- Contracts relied on:
  - `policyProfile: CONTENT_AUTHZ` with `action: CUSTOM` delegates full
    request/response content to a custom authorization extension.
  - Custom authorization extensions "can target only fully qualified domain
    names (FQDNs)"; the extension uses HTTP/2 with TLS on port 443 and
    "doesn't validate the server certificate".
  - Custom `CONTENT_AUTHZ` extensions must implement `ext_proc` with
    `FULL_DUPLEX_STREAMED` body processing.
  - Limits: max four custom authorization policies per egress gateway;
    extension `timeout` example written as `1s`.

### S5 — Set up Agent Gateway

- URL: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/set-up-agent-gateway>
- Contracts relied on:
  - Agent Runtime supports both egress and ingress modes; egress gateways
    may be cross-project but must be same-region; registry registrations and
    IAM bindings live in the gateway project.
  - "Identify and register all tools, MCP servers, and API endpoints your
    agents will call. Registering these resources is required because
    **Agent Gateway blocks all outbound traffic to hosts not registered in
    Agent Registry**."
  - Default enforcement is IAP; grant `roles/iap.egressor` per destination;
    "By default, all egress traffic is denied unless explicitly allowed by
    this IAM policy."

### S6 — Codelab: Governing agentic workloads with Agent Gateway

- URL: <https://codelabs.developers.google.com/cloudnet-agent-gateway>
- Contracts relied on:
  - Official end-to-end example: ADK agent deployed on Agent Runtime,
    `AGENT_TO_ANYWHERE` Agent Gateway, MCP servers on Cloud Run, Agent
    Registry, IAP `REQUEST_AUTHZ` + Model Armor `CONTENT_AUTHZ`.
  - Step 12 grants `roles/iap.egressor` on all registered endpoints **before
    deploying the agent**, because "when it's being deployed, it needs to
    reach github.com for packages and then reach the various Google APIs
    needed to deploy."
  - Troubleshooting: 403 PermissionDenied on tool calls is cured by
    re-granting egressor; agent discovers MCP tools by listing `mcpServers`
    in the Agent Registry.

## Secondary search-result context (snippet-level, not fetched in full)

- `deploy-an-agent` (Agent Runtime deploy methods incl. source files):
  <https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/deploy-an-agent>
- `set-up-vpc-connectivity` (PSC network attachment + DNS peering YAML):
  <https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/set-up-vpc-connectivity>
- Cloud Service Mesh REST reference `projects.locations.agentGateways`
  (`networkConfig.egress.networkAttachment`, `dnsPeeringConfig`,
  `GOVERNED_ACCESS_PATH` enums):
  <https://docs.cloud.google.com/service-mesh/docs/reference/network-services/rest/v1alpha1/projects.locations.agentGateways>
- Access Context Manager "Context-Aware Access agent security" (mTLS to the
  gateway; DPoP after the gateway; "When Agent Gateway is enabled, however,
  the gateway terminates mTLS, so DPoP must be used"):
  <https://docs.cloud.google.com/access-context-manager/docs/caa-agent-security>
- Referenced-but-not-fetched codelabs: Agent Gateway egress from Agent
  Runtime to Google Cloud MCP servers; to external MCP servers; to VPC
  networks (linked from S5's "What's next").

## Preserved HAC-325 evidence (local, read at base SHA efea48013de626d5714c8c2c146c0e1b683cc615)

- `docs/receipts/HAC-325-s0-receipt.md`
- `experiments/hac-325/README.md`
- `experiments/hac-325/evidence/`: `commands.log`, `blocker-tls-interception.json`,
  `reasoning-engine.json`, `agent-gateway.json`, `agent-gateway-egress.json`,
  `agent-gateway.yaml`, `agent-gateway-with-registry.yaml`,
  `authz-extension.json`, `authz-extension.yaml`, `authz-policy.json`,
  `authz-policy-egress.json`, `authz-policy.yaml`, `backend-service.json`,
  `cloudrun-ext.json`, `cloudrun-target.json`, `extension-logs.json`,
  `identities.json`, `apis-enabled.json`, `iam-policy-before.json`,
  `registry-mcp-servers.json`
- `experiments/hac-325/agent/`, `extension/`, `target/`, `bin/`
