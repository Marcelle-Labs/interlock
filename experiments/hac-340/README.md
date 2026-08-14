# HAC-340 — minimal Gemini / ADK / Cloud Run proof

This is product/cloud participation proof only. HAC-316 remains terminal historical
evidence and is neither imported nor reproduced.

The submitted path is `Gemini 3.5+ via ADK → Interlock MCP proxy → signed receipt
→ protected target → independently authenticated read-back`. The agent exposes two
named ADK roles (`proposer`, `reviewer`); role names are application provenance, not
platform-verified identities. Cloud Run IAM verifies the agent service account at
the proxy and the proxy service account at the target. The target validates the
receipt but does not compare its agent provenance to the proxy transport identity.

`bin/render-config.mjs` is the only configuration shape. Its local rendering uses
a validated non-empty HMAC test token solely as an IAM-equivalent harness; cloud
rendering uses Cloud Run platform verification and metadata-server ID tokens. The
packet records this limitation and never calls the local token platform identity.
