# HAC-325 / S0 — Agent Gateway `CONTENT_AUTHZ` topology gate

Disposable feasibility spike. It answers one question: **can the Google-native
enforcement topology the ADR recommends actually exist?** It is not the product,
carries no Interlock policy logic, and is torn down after evidence capture.

Authority: [HAC-325](https://linear.app/marcelle-labs/issue/HAC-325) and the ADR
*Interlock Gateway-Extension Architecture and S0/S2 Freeze Gate*.

## Status

**Not yet executed.** No Google Cloud credential exists on the bootstrap machine
(recorded as an open item in the HAC-328 receipt §5 and §9.2, assigned to this
issue). The execution kit below is written and syntax-checked; it has not been
run, and nothing in `evidence/` is a measurement yet.

## What gets provisioned

```
Agent Gateway (Google-managed, CLIENT_TO_AGENT)
  └── authz policy, policyProfile: CONTENT_AUTHZ, action: CUSTOM
        └── AuthzExtension  (failOpen: false, timeout 1000ms, EXT_PROC_GRPC)
              └── regional INTERNAL_MANAGED backend service
                    └── Serverless NEG
                          └── Cloud Run ext_proc extension  (HTTP/2, plaintext gRPC)

  networkConfig.egress.networkAttachment  → PSC interface into the S0 VPC
  networkConfig.dnsPeeringConfig          → private zone s0.interlock.internal
```

`target/` is a trivial echo service standing in for the protected tool, so the
gateway has something to route to and a 200 vs 403 is unambiguous.

## Two deviations from the ADR, deliberate

1. **Ingress (`CLIENT_TO_AGENT`), not egress (`AGENT_TO_ANYWHERE`).** The egress
   gateway requires `registries:` — an Agent Registry plus agent workloads —
   which HAC-325 excludes ("no final agent system"). The resource graph under
   test is identical in both directions, and ingress permits exactly one
   `CONTENT_AUTHZ` policy, which matches the consolidated-extension decision.
   **What this does not prove:** egress-specific registry binding and egress
   routing. That delta belongs to HAC-326 / S2.
2. **`service:` is a backend service, not a bare FQDN.** The published
   `delegate-authorization` page shows `service: mycustomauthz.internal.net`,
   but the `AuthzExtension` schema shipped in gcloud 580.0.0 says `service` must
   be a fully-qualified backend service reference and that `authority` is
   required when it is. The kit follows the schema and carries the internal FQDN
   in `authority`. If import rejects that shape, the FQDN form is the fallback
   and both attempts are recorded.

## Facts established before execution

From the gcloud 580.0.0 schema bundle and the current documentation, without
needing a credential:

- `gcloud network-services agent-gateways` and
  `gcloud service-extensions authz-extensions` exist in **GA** gcloud — the
  surface is not hidden behind a preview component install.
- `AuthzExtension.timeout` **must be 10–10000 ms**. That is a hard ceiling on
  the ADR's timeout envelope, not a tunable.
- `CONTENT_AUTHZ` requires ext_proc **`FULL_DUPLEX_STREAMED`** body mode, so the
  extension must stream every body chunk back — inspect-only is still an echo.
- A Cloud Run callout backend must listen on a **plaintext gRPC port**, accept
  **HTTP/2**, and **allow unauthenticated** access.
- Ingress gateways accept **one** `CONTENT_AUTHZ` policy; egress accepts at most
  four custom authorization policies total.

None of these is a substitute for running the thing.

## Running it

```sh
export PROJECT_ID=<billing-enabled project>
export REGION=us-central1                 # default

experiments/hac-325/bin/00-preflight.sh   # identity, APIs, versions, billing
experiments/hac-325/bin/10-provision.sh   # the topology above
experiments/hac-325/bin/20-roundtrip.sh   # allow + deny + latency distribution
experiments/hac-325/bin/30-outage.sh      # fail-closed under extension outage
experiments/hac-325/bin/99-teardown.sh    # reverse-order delete + residue check
```

Every Google-side mutation runs through the `run` helper in `bin/env.sh`, which
appends the exact command and its output to `evidence/commands.log`. The receipt
is built from that log, not from recollection.

## Pass criteria (from HAC-325)

| # | Criterion |
| -- | -- |
| 1 | extension import succeeds without an allowlist error |
| 2 | the gateway reaches the Cloud Run extension and receives a valid response |
| 3 | one request/response round trip succeeds |
| 4 | latency fits the provisional envelope, or yields a concrete revised budget |
| 5 | the outage demonstrates the intended fail-closed path |
| 6 | rerun and teardown are reproducible |

A 200 during the outage probe is a **failure**, not a warning: it would mean the
gate is not fail-closed.

## Cost

Real spend, bounded and torn down: two `min-instances=1` Cloud Run services, one
regional internal load balancer, one Cloud DNS private zone, one PSC network
attachment, Artifact Registry storage, and Agent Gateway itself. Observed burn is
recorded in the receipt; HAC-325 question 5 and canon O-11 own that number.
