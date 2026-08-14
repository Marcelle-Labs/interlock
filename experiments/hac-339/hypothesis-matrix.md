# Hypothesis matrix — HAC-339 Phase C

Scores the preserved HAC-325 evidence (`hac-325-participation-matrix.md`)
against the current Google contract (`google-support-matrix.md`). Confidence
is categorical: HIGH / MEDIUM / LOW / UNRESOLVED.

Two failure layers must be kept apart, because the preserved run exhibits the
first and the current docs prove the second was also present:

- **Layer T (trust):** TLS interception of the agent's own platform traffic
  without a trusted gateway CA → the observed `CERTIFICATE_VERIFY_FAILED`
  failures.
- **Layer P (policy):** default-deny egress — destination not registered in
  Agent Registry / no `roles/iap.egressor` → documented 403
  `Egress request is not authorized` failures (S1, S2, S5).

The preserved registry contained exactly one entry (`interlock-s0-mcp`); no
`aiplatform` / Sessions / CRM / Logging endpoints were registered and no
egressor grants to the agent identity on platform endpoints are preserved.
**The registry/policy configuration was therefore incomplete under the
currently documented ENFORCE contract (OBSERVED from REG + current docs).
Whether it independently blocked this exact historical run remains
UNRESOLVED**, because the run's IAP enforcement mode (ENFORCE vs DRY_RUN) is
not preserved anywhere (hop 16); under DRY_RUN the same gaps would have been
logged, not blocked. H1–H4 below are scored primarily as explanations of the
Layer T failure, since that is what the run actually observed (TLS failures
precede and are independent of any authorization decision).

## H1 — Platform CA-injection defect

Source-based deployment should receive the CA; the effective runtime did not.

- **Supporting:** TLS verification failed for *both* client families (aiohttp
  → `aiplatform.mtls`, gRPC → CRM via `240.0.0.2`) after binding, i.e.
  trust absence was container-wide (BLK). Failure persisted after the
  04:33:36 engine update, which the receipt asserts was a post-binding source
  redeploy (BLK[36–39] vs RE `updateTime`). Current docs promise injection
  for exactly this mode (S1).
- **Contradicting:** hop 4 is ASSUMED — no artifact proves the 04:33:36
  update rebuilt the image. The engine's initial image (03:55:10) necessarily
  predates the gateway (04:05:51); if the final update reused that image, no
  injection was ever owed and H1 collapses into H3. The run was also
  Layer-P-defective, so it was not a clean test of injection.
- **Missing discriminator:** post-binding image build provenance + in-image
  trust-store listing matched against the preserved gateway root fingerprint
  (`9A:9A:3A:F8:…:31:20`).
- **Confidence:** **LOW** (one unverified narrative claim is the only
  support; no direct evidence).
- **Cheapest next discriminator:** one-shot trust self-audit probe
  (`one-shot-probe.md`) — deploy with binding at creation time and dump the
  trust state from inside the container.

## H2 — Client-consumption defect

CA present; the relevant HTTP/gRPC clients did not consume it.

- **Supporting:** the documented BYOC contract (S1) shows consumption is
  *not* automatic even when the CA is installed: gRPC uses its own bundled
  roots and needs `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`; Python HTTP clients
  need `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE`. Crucially, **aiohttp's default
  TLS context is built on certifi's bundled roots, not the system store**
  (and gRPC likewise bundles roots) — so a platform injection that installed
  the CA only into the system store would fail *both* client families,
  exactly as observed (BLK). H2 is fully consistent with the observed
  failure pattern.
- **Contradicting:** no evidence places the CA anywhere in the container —
  the premise "CA present" is unevidenced (hops 5–9 UNRESOLVED). H2 cannot
  be distinguished from H1/H3 on preserved evidence alone.
- **Missing discriminator:** trust-store listing (system store *and* the
  certifi bundle path) + env capture (`SSL_CERT_FILE`,
  `REQUESTS_CA_BUNDLE`, `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`) from inside the
  running container.
- **Confidence:** **LOW** as an attribution (consistent with all
  observations, but its premise has zero direct evidence).
- **Cheapest next discriminator:** same probe — env + store dump decides
  presence-vs-consumption in one shot.

## H3 — Experiment/deployment defect (our sequencing/configuration)

- **Supporting (strongest of the five):** (a) OBSERVED: engine created
  before the gateway existed (RE 03:55:10 vs GWE 04:05:51) — the first image
  was built unbound; (b) hop 4 unverifiable — the claimed injection-eligible
  redeploy is narrative only; docs describe injection "during image creation"
  and do not promise re-injection on PATCH-bind of an existing engine (S1);
  (c) OBSERVED + documented: registry held only `interlock-s0-mcp` — no
  Sessions/CRM/Logging endpoints, no egressor grants (REG; S1, S2, S5); the
  official codelab grants egressor on registered endpoints *before* deploying
  precisely because deploy/startup traffic needs them (S6); (d) the run never
  captured trust state, so a sequencing defect would be invisible — and
  stayed invisible.
- **Contradicting:** H3's ordering arm explains the TLS failure only if the
  post-binding "redeploy" did not in fact rebuild the image. If it did
  rebuild and injection still didn't take, the ordering arm is falsified and
  weight shifts to H1. The registry arm (Layer P) is certain but produces
  403s, not the observed TLS failure — it cannot itself be the Layer T cause.
- **Missing discriminator:** same as H1 — verified post-binding rebuild +
  trust-store inspection.
- **Confidence:** **MEDIUM** as the Layer T explanation (most parsimonious
  given the proven unbound initial image and the unverified redeploy). On
  Layer P: **HIGH** that the registry/policy configuration was incomplete
  under the documented ENFORCE contract; **UNRESOLVED** whether it
  independently blocked this exact run (enforcement mode not preserved —
  hop 16).
- **Cheapest next discriminator:** the one-shot probe with **binding at
  creation time** removes the ordering ambiguity entirely: if the CA is still
  absent then, H3-ordering is falsified and H1 is confirmed.

## H4 — Deeper platform defect

Trust present and effective; managed session still fails.

- **Supporting:** nothing direct. Context worth recording: CAA terminates
  mTLS at the gateway and requires DPoP beyond it (S3, CAA doc), so the
  Sessions path carries a second, identity-layer failure mode that this run
  never reached; and the preserved logs show asymmetric steering (some hosts
  intercepted, some direct IPv6-unreachable), hinting the dataplane is more
  complex than the docs' diagram.
- **Contradicting:** its premise is unmet — trust was demonstrably not
  effective (both client families failed verification). No post-trust
  failure was observed.
- **Missing discriminator:** a run in which trust is verified first, then a
  session creation attempt.
- **Confidence:** **UNRESOLVED** (untestable from this run; premise not met).
- **Cheapest next discriminator:** the probe's second stage — after
  confirming trust, one session creation attempt (with endpoints registered
  and egressor granted, to keep Layer P out of the way).

## H5 — Unresolved

Preserved evidence cannot distinguish.

- **Supporting:** hops 5–9 are all UNRESOLVED; the discriminator set (image
  provenance, trust-store content, env vars, presented-chain fingerprint) was
  never captured. True specifically for H1 vs H2 vs H3-ordering on Layer T.
- **Contradicting:** the evidence is *not* uniformly inconclusive — it
  positively establishes the Layer P config defect and the
  presence-without-participation of the extension (hops 13–15).
- **Confidence:** **HIGH** that preserved evidence cannot distinguish the
  Layer T hypotheses.
- **Cheapest next discriminator:** the one-shot probe; every discriminator
  listed above is the same single deployment.

## Summary

| Hypothesis | Confidence as Layer T (TLS) cause | Note |
| -- | -- | -- |
| H1 platform injection defect | LOW | needs verified post-binding rebuild evidence |
| H2 client-consumption defect | LOW | consistent with observations (aiohttp/certifi + gRPC both use bundled roots, so system-store-only injection fails both); premise "CA present" unevidenced |
| H3 experiment/deployment defect | **MEDIUM** (Layer T); Layer P: **HIGH** config-incomplete under ENFORCE contract, **UNRESOLVED** whether it blocked this run | most parsimonious on preserved evidence |
| H4 deeper platform defect | UNRESOLVED | premise untestable in this run |
| H5 unresolved | HIGH | for TLS-layer discrimination: hops 5–9 all UNRESOLVED by preservation gaps |

Note: the HAC-325 receipt characterized the blocker as "a platform
interaction, not a configuration defect in this experiment." Under the
current documentation, that characterization is **not supported** for the
run as a whole: the registry/policy configuration was incomplete under the
currently documented ENFORCE contract (whether it independently blocked this
exact historical run remains unresolved — enforcement mode not preserved,
hop 16), and the trust-layer ordering defect (initial image provably built
before the gateway existed) is at minimum unexcluded. The receipt itself is
preserved unmodified per the lane boundary; this note is the
reinterpretation, kept separate.
