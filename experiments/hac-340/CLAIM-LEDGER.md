# HAC-340 claim ledger

## Proven on Google Cloud

- At runtime source commit `ae6d0d3c405b6169d5f0495c22aaf05d8fc1de4a`, a
  `gemini-3.5-flash` Google ADK action on Cloud Run invoked the Interlock MCP
  proxy under the agent service account.
- Interlock returned `ALLOW`, issued the recorded receipt digest, and the
  protected target executed the receipt-bound reservation mutation.
- An independently authenticated operator read the target state directly;
  its observed revision and state match the mutation result.
- Cloud Logging recorded the same correlation identifier at the proxy. Forged
  identity-header, invalid-token, and direct-target-bypass controls failed
  closed.

## Proven in controlled local experiment

- The same Gemini/ADK-to-Interlock traversal ran locally with explicit,
  validated local test tokens for configuration parity.

## Not claimed / limitation

- This is not an Agent Runtime or Agent Gateway result, does not establish
  independent managed-agent identities, and does not promote internal role
  labels to platform identities.
- Cloud Run service accounts establish transport provenance; the application
  role names are receipt provenance only.
