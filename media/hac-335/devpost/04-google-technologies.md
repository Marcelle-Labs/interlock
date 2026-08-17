# Devpost — Google technologies used

> Submission field: Google Cloud / Google AI technologies.
> Frozen under HAC-335. Every row below appears in the frozen HAC-340 record
> published by HAC-342. Nothing is listed that did not run.

## On the recorded path

| Technology | Version / detail | Role in the recorded run |
| -- | -- | -- |
| **Gemini** | `gemini-3.5-flash` | The model driving the agent |
| **Google ADK** | `1.35.1` | Agent framework |
| **Vertex AI** | global access | Model access path |
| **Cloud Run** | `us-central1` | Hosts the agent, the Interlock MCP proxy and the protected target |
| **Cloud Run IAM** | `oidc-id-token/platform-verified:email` | Establishes transport identity for every hop |
| **Cloud Logging** | correlated by run id `ilk-hac340-cloud-1786730369123` | Independent record of the traversal |

Deployment revision named by the frozen record:
`interlock-hac340-proxy-00002-wzf`.

## How they fit together

```
gemini-3.5-flash
  → Google ADK 1.35.1 / Vertex AI global access
    → Cloud Run-hosted agent (us-central1)
      → Interlock MCP proxy
        → ALLOW + authorization receipt
          → protected target mutation — EXECUTED
            → independently authenticated read-back — OBSERVED alpha=45
              → Cloud Logging correlated by run id
```

## What Google Cloud establishes, and what it does not

Cloud Run IAM establishes **transport provenance** — a platform-verified
identity for the caller on each hop. That is a real and useful property, and it
is the reason the forged-identity-header control returns `403`.

It does **not** establish application-role semantics. The proposer, reviewer and
authorizer roles inside Interlock are not Google-managed identities, and this
submission does not present transport identity as though it were application
authorization.

## Not on the recorded path

**Agent Runtime**, **Agent Gateway** and **`CONTENT_AUTHZ`** did not
participate. They are named here only so a reader does not infer them from the
presence of the rest of the Google stack.

Claims used: `CL-010`, `CL-011`, `CL-012`, `CL-015`, `CL-016`, `CL-021`.
