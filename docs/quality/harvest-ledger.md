# Harvest ledger

Owner: HAC-321. Companion: [`../../provenance/manifest.json`](../../provenance/manifest.json).

HAC-321 requires that **every capability built during the sprint receives exactly
one disposition** before the issue closes, and that each `HARVEST` item names a
durable owner issue. This file is that ledger.

The point is narrow and worth stating plainly: a hackathon repository is where
reusable work goes to die. Something gets built under deadline, it works, the
window closes, and it stays in a repository nobody opens again — not because
anyone decided that, but because nobody decided anything. A disposition is a
decision. `DELETE` is a real one and appears here more often than `HARVEST`.

## Vocabulary

Exactly one per row, from HAC-321:

| Disposition | Meaning |
| --- | --- |
| `HARVEST → workspacejson/integrations` | Reusable host-integration or adapter seam |
| `HARVEST → workspacejson/standard research` | Feeds a Standard research question; **not** a schema change |
| `HARVEST → Studio v3` | Belongs to `Marcelle-Labs/director` |
| `HARVEST → ai-swarm / Swarm Evolution` | Orchestration or quality substrate |
| `KEEP → Interlock reference app` | Stays here, as product, maintained |
| `DELETE → hackathon-only machinery` | Served the window; goes when it closes |

`KEEP` is not a synonym for "no decision". It asserts the capability is product
and will be maintained after the window. Anything that cannot carry that claim is
`DELETE`.

### On the manifest's `HARVEST_OR_DELETE_AFTER_SUBMISSION`

`provenance/manifest.json` records submission-local entries with the disposition
`HARVEST_OR_DELETE_AFTER_SUBMISSION`. That is a **deferral, not a disposition** —
it was correct at bootstrap, when the evidence to choose did not exist yet.
HAC-321 is where the deferral is spent, and each entry is resolved below.

The manifest's own `harvestDisposition` values are **left unchanged**, and each
entry gains two new fields instead: `harvestLedgerRef`, pointing at the section
here that carries the decision, and `harvestLedgerDisposition`, the resolved
value. Two reasons for the cross-reference rather than an in-place rewrite. The
schema constrains `harvestDisposition` to a three-value enum that does not include
HAC-321's vocabulary, so resolving in place would mean changing the schema and
`check-provenance.mjs` during freeze week to record a decision that changes no
code. And the deferral is itself a fact worth keeping: it is true that these were
carried undecided from bootstrap until now, and overwriting the field would erase
the only record of that.

The manifest is machine-checked; this file is not. Where they disagree the
manifest wins on provenance and this file wins on disposition, because they are
answering different questions.

---

## 1. Product core — `src/`

The deterministic machinery the submission's claims rest on.

| Capability | Files | Disposition | Owner issue |
| --- | --- | --- | --- |
| Composition decision core | `src/broker/pairing/arbitrate.ts`, `store.ts` | `KEEP → Interlock reference app` | — |
| Authorization receipts | `src/authorization/{receipt,intent,canonical}.ts`, `src/receipt.ts` | `HARVEST → workspacejson/integrations` | **META-330** |
| Enforcement proxy | `src/proxy/{main,service,http,identity,target-port}.ts` | `KEEP → Interlock reference app` | — |
| Protected target | `src/target/{main,service,http,state}.ts` | `KEEP → Interlock reference app` | — |
| Bypass guard, idempotency ledger, revision binding | `src/broker/{bypass/guard,idempotency/ledger,revision/revision}.ts` | `KEEP → Interlock reference app` | — |
| Independent observation events | `src/observation/events.ts`, `src/correlation.ts` | `KEEP → Interlock reference app` | — |

**Why `arbitrate.ts` is `KEEP` and not harvested.** It is the most valuable thing
built in the sprint and it is the one thing that must not move upstream. It
decides whether two intents may compose — a prescriptive judgment. `GOVERNANCE.md`
§61 rejects exactly that from the standard: *"Fields that encode what a team must
do — approval gates, merge blocking, enforcement policy — are rejected by the
architecture guard."* Harvesting the decision core into WorkspaceJSON would be the
charter violation META-284 is currently unwinding elsewhere. It stays a consumer.

**Why the receipt contract is the harvest.** HAC-321's adoption wedge asks for
"a bounded receipt/event contract that other agent systems can consume". That is
this, and only this: the receipt binds intent, target revision, evidence
references and decision, and its lifecycle (`REQUESTED`, `WITHHELD`, `AUTHORIZED`,
`ACCEPTED`, `EXECUTED`, `OBSERVED`, `FAILED`) is the part another agent system can
adopt without adopting Interlock's policy. The contract travels; the decision does
not. **META-330** is the durable owner and already scopes "authorization seams" —
this amends it rather than opening a new issue.

**Carried constraint.** `EXECUTED` and `OBSERVED` must not collapse in any
harvested form. An API acceptance is not an observation; that separation is the
substance of the contract, not a detail of it.

## 2. Evaluation and evidence harnesses — `experiments/`

| Capability | Location | Disposition | Owner issue |
| --- | --- | --- | --- |
| Four-arm evaluation harness — arms, corpus, executor, aggregation | `experiments/hac-343/lib/*`, `bin/run-experiment.mjs` | `HARVEST → workspacejson/standard research` | **META-313** |
| Freeze-before-results protocol — `metric-definitions.json` with `supersedes[]` | `experiments/hac-343/evidence/metric-definitions.json` | `HARVEST → workspacejson/standard research` | **META-312** |
| Packet verifier pattern — `verify-packet.mjs` | `experiments/hac-{326,330,343}/bin/verify-packet.mjs` | `HARVEST → workspacejson/standard research` | **META-313** |
| Public evidence redaction and logged-out verification | `experiments/hac-342/bin/{redact-packet,verify-public-packet,runtime-source-snapshot}.mjs` | `KEEP → Interlock reference app` | — |
| HAC-330 evidence adapter | `experiments/hac-330/` adapter | `HARVEST → workspacejson/standard research` | **META-313** |
| HAC-330 fixture harness — synthetic Git histories | `experiments/hac-330/bin/build-fixtures.mjs`, `lib/*` | `DELETE → hackathon-only machinery` | — |
| HAC-325 Agent Gateway provisioning scripts | `experiments/hac-325/bin/*.sh` | `DELETE → hackathon-only machinery` | — |
| HAC-326 fallback enforcement path | `experiments/hac-326/` | `KEEP → Interlock reference app` | — |
| Live-worktree composition harness | `experiments/meta-383/bin/*` | `HARVEST → workspacejson/standard research` | **META-313** |

**The four-arm harness is the most reusable thing here and it is not obvious.**
Its value is not the Interlock result; it is the shape — freeze every arm, label
and metric in a committed file *before* any result exists, revise only by adding a
`supersedes[]` entry, and make the metric definition a separate commit from the
result. META-373, META-380, META-381, META-382 and META-383 all reused that shape
in other repositories without it being written down anywhere as a reusable
protocol. Harvesting it means naming it, not moving code.

**HAC-330's adapter resolves to research, not to `workspacejson/cli`.** The
manifest's deferred target was "workspacejson/cli, only via a separately approved
upstream issue carrying the repository-attribution finding". That finding — that
the CLI does not check whether the repository it mined is the repository that was
requested — is real and already has an owner: **META-338**, `[CLI][DEFECT] Reject
mining when the requested subject resolves to an ancestor repository`. The
*adapter* does not need to move; the *defect* is already filed upstream. What
remains harvestable is the provenance-envelope pattern, which belongs with the
research protocol above. Recording this as one disposition rather than two is the
resolution the manifest deferred.

**Two deletions, stated as decisions.** The HAC-330 fixture harness generates
synthetic Git histories that differ only in co-maintenance — it exists to make one
concept gate falsifiable and has no life after it; META-383 superseded the whole
approach by using real repository history. The HAC-325 provisioning scripts belong
to a path recorded as `[FAILED/PIVOTED]`; keeping executable scripts for an
abandoned architecture invites someone to run them.

## 3. Media and judge-surface machinery — `media/`

| Capability | Location | Disposition | Owner issue |
| --- | --- | --- | --- |
| Multi-source capture and scene manifest | `experiments/hac-324/bin/{build,verify}-filmed-run.mjs` | `HARVEST → Studio v3` | **HAC-324** |
| Cockpit build and cold-read kit | `media/hac-341/{bin,lib,cold-read}` | `KEEP → Interlock reference app` | — |
| Architecture visual generation + gate perturbation test | `media/hac-334/bin/*`, `test/hac-334-gate-perturbation.test.mjs` | `HARVEST → Studio v3` | **HAC-324** |
| Asset registry and export naming | `scripts/export-naming.mjs`, `media/hac-335/bin/*` | `HARVEST → Studio v3` | **HAC-324** |
| Storyboard assembly | `media/hac-333/bin/*` | `DELETE → hackathon-only machinery` | — |
| Devpost cards and captures | `media/hac-335/{cards,devpost,captures}` | `DELETE → hackathon-only machinery` | — |

**The asset registry is the Studio harvest worth naming.** Binding every exported
asset to an asset ID, a judge question, a source run, a supported claim, a runtime
source SHA and an evidence-publication SHA is a general capability for
evidence-bound media. Studio v3 is producing the demo from this repository's
frozen runs, so the consumer already exists — this is a harvest with a live
customer rather than a speculative one.

**The gate-perturbation test travels with it.** An asset pipeline that cannot
demonstrate its own gate failing is the vacuous-green case this project spent
META-337 eliminating. Harvesting the generator without the perturbation test would
export the convenience and leave the control behind.

## 4. Repository gates — `scripts/`, `docs/quality/`

| Capability | Location | Disposition | Owner issue |
| --- | --- | --- | --- |
| Provenance boundary gate | `scripts/check-provenance.mjs`, `provenance/manifest.schema.json` | `HARVEST → ai-swarm / Swarm Evolution` | **META-339** |
| Identity boundary gate | `scripts/check-identity.mjs` | `KEEP → Interlock reference app` | — |
| Merge-gate matrix and hardening receipts | `docs/quality/{merge-gate-matrix,hardening-receipts}.md` | `HARVEST → ai-swarm / Swarm Evolution` | **META-339** |
| Bidirectional gate-proof method | `docs/quality/hardening-receipts.md` shape | `HARVEST → ai-swarm / Swarm Evolution` | **META-339** |

**The provenance gate is the strongest general capability the sprint produced.**
A machine-checked manifest that refuses to let a manifest edit grant itself
permission, enforced in CI, is a reusable answer to "which repository may this
change touch" — the question every multi-repository agent sprint has and most
answer with a paragraph in a README. **META-339** is the standing follow-up under
META-337 and is the right owner.

**Identity stays.** `check-identity.mjs` verifies the Interlock mark, vendored
fonts and cockpit identity authority. It is specific to one product's brand and
generalizes to nothing.

## 5. Research findings — no code

Not capabilities, but they are sprint output and would otherwise strand.

| Finding | Source | Disposition | Owner issue |
| --- | --- | --- | --- |
| Per-target locking misses cross-target composition hazards | HAC-343 | `HARVEST → workspacejson/standard research` | **META-313** |
| Committed evidence adds no measured value once both sibling diffs are visible — `BOUNDED_SEARCH_EXHAUSTED` | META-383 | `HARVEST → workspacejson/standard research` | Fibery **OQ-17** |
| Roadmap intelligence candidates showed no baseline headroom | META-382 | `HARVEST → workspacejson/standard research` | Fibery **OQ-17** |
| Local macOS accessibility runs under-report overflow violations; Linux CI is authoritative | META-254 | `HARVEST → workspacejson/standard research` | **META-215** |

The two negatives are the most valuable rows in this table and the likeliest to be
quietly dropped. META-383 and META-382 both closed without establishing the value
they set out to measure. That is a finding about where *not* to invest, and it is
worth more than a positive result would have been from a search that had to be
widened to find one.

---

## Summary

| Disposition | Count |
| --- | --- |
| `KEEP → Interlock reference app` | 9 |
| `HARVEST → workspacejson/standard research` | 9 |
| `HARVEST → Studio v3` | 3 |
| `HARVEST → ai-swarm / Swarm Evolution` | 3 |
| `HARVEST → workspacejson/integrations` | 1 |
| `DELETE → hackathon-only machinery` | 4 |

Every row has one disposition. Every `HARVEST` row names an existing Linear or
Fibery issue as its durable owner — none is owned by a TODO comment, and no new
issue was invented to make a row look owned.

One entry in `provenance/manifest.json` is **not** resolved here:
`revision-anchor-extension`, status `PLANNED`. It was never built. A capability
that does not exist cannot receive a disposition, and recording one would assert
work that did not happen. It is removed from the harvest scope and left in the
manifest as `PLANNED`, which is what it is.

## Deletion is deferred, not executed

Nothing marked `DELETE` is removed by this change. Deleting during freeze week
would alter paths that frozen evidence packets, the asset registry and the cockpit
resolve against, and a submission that cannot resolve its own evidence links is a
worse outcome than carrying four dead directories.

The deletions execute after the submission window under HAC-321's post-window
branch, and the ledger is the record that they were decided rather than forgotten.
