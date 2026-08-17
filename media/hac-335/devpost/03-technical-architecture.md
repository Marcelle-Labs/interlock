# Devpost — technical architecture

> Submission field: "How we built it" / technical detail.
> Frozen under HAC-335. Architecture arrives **after** the result in the judge
> sequence, never before it.

## Deterministic core, presentation at the edge

The Interlock composition engine is a deterministic TypeScript core. It takes
revision-bound environment evidence and a set of intents, and returns a
coordination decision with the attribution that produced it.

The core carries **no presentation dependencies**. The judge surfaces — the
storyboard and the cockpit — are dependency-free HTML that read frozen,
generated view models. There is no bundler between frozen evidence and a
rendered frame, which is what makes a capture of a surface reproducible rather
than a moment in time.

## The controlled local experiment (HAC-330)

The experiment holds two intents and one shared environment fixed and varies
exactly one thing: the environment evidence Interlock is given.

- **Baseline** — Interlock disabled. No decision. Joint outcome `140 > 130`.
- **Treatment** — original evidence. Decision `WITHHOLD_SERIALIZE`, from
  `COUPLING_OBSERVED`. Joint outcome `120 <= 130`.
- **Perturbed** — modified evidence. Decision `ALLOW_PARALLEL`, from
  `NO_QUALIFYING_COUPLING`. Joint outcome `140 > 130`.

Every arm is frozen into an evidence packet with a verifier that recomputes it.
The upstream WorkspaceJSON checkouts are pinned by revision and checked for
cleanliness as part of the 24 checks, so a passing packet also asserts *which
upstream bytes produced it*.

## The Google Cloud path (HAC-340)

A Cloud Run-hosted agent built on **Google ADK 1.35.1** calls
`gemini-3.5-flash` through Vertex AI. Its tool calls do not reach the protected
target directly — they go through the **Interlock MCP proxy**, which is where
the decision and the authorization receipt are produced.

The protected target refuses a mutation that does not carry a receipt. That is
what makes the receipt load-bearing rather than decorative: the direct-bypass
control returns `403`.

Observation is deliberately performed by a **different principal** than the one
that made the change, so the read-back is independent rather than a self-report.

## Trust boundaries

The distinction the architecture is built around:

- **Transport provenance** — Cloud Run IAM establishes *who called*. It is
  platform-verified and it is not something Interlock asserts.
- **Application provenance** — the Interlock decision and its receipt digest.
  This is what Interlock asserts, and it is meaningful only within the
  application.

These do not collapse. Cloud Run IAM does not establish Google-managed proposer,
reviewer or authorizer roles inside Interlock, and the submission does not
present it as if it did.

`interlock-hac340-proxy-00002-wzf` is the only deployment revision the frozen
record names — recovered from a Cloud Logging resource label. Agent and target
revision names are redacted in the public packet and are therefore not shown
anywhere.

**Absent from this deployment:** Agent Runtime, Agent Gateway, `CONTENT_AUTHZ`.

## Evidence handling

Every judge-facing surface reads from generated view models derived from frozen
evidence, never from hand-authored values. `140`, `120`, `130`, `24/24` and
`alpha=45` are read out of the frozen records; a gate fails if any of them
drifts.

Absence is modelled as a state. The local run has no receipt, no protected
target and no observer; the cloud run has no arms and no bounded joint outcome.
A missing field is omitted rather than set to `null`, because `null` would claim
the field was looked for and found empty. A gate fails if either run grows a
field the other owns.
