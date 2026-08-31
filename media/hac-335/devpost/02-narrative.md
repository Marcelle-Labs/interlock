# Devpost — project narrative

> Submission field: the main project story.
> Frozen under HAC-335. Narrative order matches
> `media/hac-335/evidence/judge-sequence.json`. Every statement maps to a row in
> `media/hac-335/evidence/claim-ledger.json`.

---

## The problem

Two good agent decisions can still make one bad system decision.

One agent raises the reservation on one service. Another raises the reservation
on a different service. Different services, different files, different lock
keys — and reviewed independently, each change passes. Applied together against
the environment they share, they break a ceiling that neither of them owns.

The failure is not in either change. It is that nothing coordinated them before
they touched shared state — and a per-target lock cannot coordinate a
relationship that is not either target.

## The intervention

Interlock reads **revision-bound environment evidence** before shared-state
mutation and selects a **deterministic coordination decision**.

The evidence is bound to a specific revision of the environment, so a decision
can be attributed to what was actually true when it was made rather than to a
snapshot that has since moved.

## The causal proof

**HAC-330 — a controlled local experiment.**

Two locally valid intents. One shared environment bounded by
`sum(services[].reserved) <= 130`.

| | Interlock disabled | Interlock enabled |
| -- | -- | -- |
| Decision | *no decision* | `WITHHOLD_SERIALIZE` |
| Joint outcome | `140 > 130` — invalid joint state | `120 <= 130` — bounded constraint satisfied |

Checks: **24/24**.

Then the load-bearing test. Change the environment evidence, and the
deterministic decision changes with it: `ALLOW_PARALLEL`, and the joint outcome
returns to `140 > 130`.

That is the whole claim: **the evidence is doing the work**. Both arms are
recorded results — selecting an arm shows a different frozen arm, and nothing is
recomputed to produce the comparison.

This experiment ran **locally**. It did not run on Google Cloud.

---

## Context reset — a different run, with different evidence

Everything above is the controlled local experiment. What follows is a
**separate recorded run**. Neither is evidence for the other, and no single run
produced both.

---

## Google Cloud participation

**HAC-340 — one recorded traversal.**

`gemini-3.5-flash` → **Google ADK 1.35.1** / Vertex AI global access → Cloud
Run-hosted agent in `us-central1` → **Interlock MCP proxy** → `ALLOW` +
authorization receipt → protected target mutation `EXECUTED` → independently
authenticated read-back `OBSERVED alpha=45` → Cloud Logging correlated by run
id.

`EXECUTED` and `OBSERVED` are kept separate throughout: one is what the mutation
reported, the other is what a separately authenticated principal read back
afterwards. Collapsing them would turn a read-back into a self-report.

Three fail-closed refusals were recorded:

| Control | Result |
| -- | -- |
| Forged identity header | `403` |
| Invalid bearer token | `401` |
| Direct target bypass without receipt | `403` |

Three controls — not comprehensive attack coverage.

## Verification

The cloud run is published immutably, pinned to a commit rather than a branch,
with an independent verifier and a redaction manifest beside it. The packet
bytes hash to `ea1d6993…`, and any reader can recompute that.

Two digests are deliberately **not** reader-recomputable, and the package says
so instead of implying otherwise: the source packet digest is a private
commitment, and the runtime source revision has no public URL because its tree
contains an identifier excluded from publication. A public snapshot records the
executed source content instead.

## What we are not claiming

HAC-330 did not run on Google Cloud, and HAC-340 does not reproduce the 140/120
counterfactual there. Agent Runtime and Agent Gateway did not participate.
Wrong-audience token rejection is controlled local parity evidence, not a cloud
result. `ALLOW` is not `VERIFIED`; `OBSERVED` is not `SAFE`;
`WITHHOLD_SERIALIZE` is not human approval, joint authorization or an
`AUTHORIZED` lifecycle state.

No exactly-once, restart-safety or recovery guarantee. No safety, security,
verification or production-readiness guarantee. No fleet-scale readiness, and no
universal collision prevention.

## Compared with what?

A bounded four-arm evaluation (HAC-343) runs one frozen sixteen-scenario corpus
through four mechanically distinct coordination strategies. Exact counts, not
percentages — the corpus is an exhaustive enumeration, not a sample.

| Strategy | Hazards unsafe | Independent opportunities parallel |
| --- | --- | --- |
| Uncoordinated | 2/2 | 2/2 |
| Global lock | 0/2 | 0/2 |
| Per-target lock | 2/2 | 2/2 |
| Interlock | 0/2 | 2/2 |

Global locking bought safety by eliminating concurrency. Per-target locking kept
the concurrency and missed both hazards.

**Is that per-target lock credible?** It has to be, or the comparison is a straw
man. It serialized same-target contention 2/2, parallelised cross-target pairs
4/4, and still missed cross-target hazards 2/2. It locked exactly what a lock can
see; a composition hazard spanning two lock keys is invisible to any per-key
discipline.

**Is the safety from the evidence, or from Interlock?** Remove the evidence and
find out:

| Condition | Invalid outcomes |
| --- | --- |
| Interlock + coupling evidence present | 0/2 |
| Interlock + coupling evidence removed | 2/2 |

The decision reverses. The safety is evidence-derived, not a property of the
engine.

**What this is not.** Interlock is not 0% unsafe — it produced invalid joint
states in the two ablation scenarios by design. It is not "safer than locking":
per-target locking is correct for the hazard it addresses. The 0/2 is bounded to
the coupled scenarios of this corpus and must not be collapsed into a single
rate over all sixteen. No interval or significance is claimed, and no
exactly-once, restart-safety or production-readiness result was tested here.

## What is new here

Interlock is new work, created during the contest. It builds on the pre-existing
open-source **workspace.json** specification and toolchain, consumed at pinned
revisions and never copied. A provenance gate enforces that boundary in CI.
