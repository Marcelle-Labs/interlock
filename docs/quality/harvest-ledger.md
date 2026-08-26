# Harvest ledger

Owner: HAC-321. Companions:
[`../../provenance/harvest-inventory.json`](../../provenance/harvest-inventory.json) (the data),
[`../../scripts/check-harvest.mjs`](../../scripts/check-harvest.mjs) (the gate),
[`../../provenance/manifest.json`](../../provenance/manifest.json) (provenance).

HAC-321 requires that **every capability built during the sprint receives exactly
one disposition** before the issue closes, and that each `HARVEST` item has a
durable owner issue that was **filed or amended** — not merely referenced.

The point is narrow and worth stating plainly: a hackathon repository is where
reusable work goes to die. Something gets built under deadline, it works, the
window closes, and it stays in a repository nobody opens again — not because
anyone decided that, but because nobody decided anything. A disposition is a
decision. `DELETE` is a real one and appears here more often than
`HARVEST → workspacejson/integrations`.

## This ledger can fail

The inventory is data; this file is a rendering of it. `scripts/check-harvest.mjs`
runs inside the **required `Provenance boundary`** context and fails on:

* a disposition outside the declared vocabulary;
* a `HARVEST` row with no durable owner issue;
* a duplicate capability id, or a path claimed by two rows;
* a row pointing at a path that does not exist;
* a finding that carries paths, or a capability that carries none;
* **a path under any coverage root that no row claims**;
* counts in this file disagreeing with the inventory.

The coverage check is the one that matters. Validating the rows that exist proves
nothing about the capability nobody wrote down, and a ledger whose failure mode is
"someone forgot" is a document rather than a control. Coverage roots are `src`
(recursive), and `experiments`, `media`, `scripts`, `docs/quality` (top level), so
**adding a capability without a ledger row turns a required check red.**

Proven bidirectionally — see
[`hardening-receipts.md`](hardening-receipts.md#marcelle-labsinterlock).

## Vocabulary

Exactly one per row, from HAC-321. Inventory values in `CONSTANT_CASE`:

| Inventory value | HAC-321 disposition |
| --- | --- |
| `HARVEST_INTEGRATIONS` | `HARVEST → workspacejson/integrations` |
| `HARVEST_STANDARD_RESEARCH` | `HARVEST → workspacejson/standard research` |
| `HARVEST_STUDIO` | `HARVEST → Studio v3` |
| `HARVEST_SWARM` | `HARVEST → ai-swarm / Swarm Evolution` |
| `KEEP_INTERLOCK` | `KEEP → Interlock reference app` |
| `DELETE_HACKATHON_ONLY` | `DELETE → hackathon-only machinery` |

`KEEP` is not a synonym for "no decision". It asserts the capability is product
and will be maintained after the window. Anything that cannot carry that claim is
`DELETE`.

## Owner issues were amended, not just cited

Every `HARVEST` row names an issue that now **describes the harvested capability
in its own body**, with the source PR, the source paths, and the constraints that
travel with it. Naming an issue that never heard about the work is a table entry,
not ownership.

| Owner | Amended | Owns |
| --- | --- | --- |
| **META-330** | 2026-08-25 | the receipt/event contract — its existing scope already covers authorization seams |
| **META-384** | filed 2026-08-25 | the bounded-experiment protocol and evaluation harnesses |
| **HAC-324** | 2026-08-25 | filmed-run capture, architecture visuals, asset registry, export naming |
| **META-339** | 2026-08-25 | the provenance gate, the merge-gate method, this ledger's own gate |
| **Fibery OQ-17** | — | the two research negatives, per META-383's own completion routing |

**META-384 was created rather than reusing META-313.** An earlier draft routed
five capabilities to META-313, which is wrong: META-313 is scoped to *executing*
the preregistered random-repository cohort under a protocol frozen by META-312,
and its entry gate explicitly forbids methodology changes. Parking harness work
there would have conflicted with its own freeze. Not inventing an issue is not a
virtue when the existing issue does not own the work.

## 1. Product core — `src/`

| Capability | Paths | Disposition | Owner |
| --- | --- | --- | --- |
| Composition decision core | `broker/pairing/{arbitrate,store}.ts` | `KEEP` | — |
| Authorization receipt and lifecycle contract | `authorization/{receipt,intent,canonical}.ts`, `receipt.ts` | `HARVEST → integrations` | **META-330** |
| Enforcement proxy | `proxy/*` | `KEEP` | — |
| Protected target | `target/*` | `KEEP` | — |
| Bypass guard, idempotency ledger, revision binding | `broker/{bypass,idempotency,revision}/*` | `KEEP` | — |
| Independent observation and correlation | `observation/events.ts`, `correlation.ts` | `KEEP` | — |
| Runtime configuration and JSON transport | `config.ts`, `http/json.ts` | `KEEP` | — |

**Why `arbitrate.ts` is `KEEP` and not harvested.** It is the most valuable thing
built in the sprint and the one thing that must not move upstream. It decides
whether two intents may compose — a prescriptive judgment. `GOVERNANCE.md` rejects
exactly that from the standard: *"Fields that encode what a team must do —
approval gates, merge blocking, enforcement policy — are rejected by the
architecture guard."* Harvesting the decision core into WorkspaceJSON would be the
charter violation META-284 is currently unwinding elsewhere. It stays a consumer.

**Why the receipt contract is the harvest.** HAC-321's adoption wedge asks for
"a bounded receipt/event contract that other agent systems can consume". That is
this: the receipt binds intent, target revision, evidence references and decision,
and its lifecycle (`REQUESTED`, `WITHHELD`, `AUTHORIZED`, `ACCEPTED`, `EXECUTED`,
`OBSERVED`, `FAILED`) is the part another system can adopt without adopting
Interlock's policy. The contract travels; the decision does not.

**Carried constraint.** `EXECUTED` and `OBSERVED` must not collapse in any
harvested form. An API acceptance is not an observation; that separation is the
substance of the contract, not a detail of it. Recorded on META-330.

**`runtime-config` is ordinary plumbing** and is listed because coverage requires
it, not because it is notable. That is the coverage check working as intended:
it forces a decision on the boring rows too, which is where omissions hide.

## 2. Evaluation and evidence harnesses — `experiments/`

| Capability | Path | Disposition | Owner |
| --- | --- | --- | --- |
| Four-arm evaluation harness | `hac-343` | `HARVEST → standard research` | **META-384** |
| Evidence provenance envelope and pinned-upstream adapter | `hac-330` | `HARVEST → standard research` | **META-384** |
| Public evidence redaction and logged-out verification | `hac-342` | `KEEP` | — |
| S2 fallback enforcement path | `hac-326` | `KEEP` | — |
| Filmed-run capture and verification | `hac-324` | `HARVEST → Studio v3` | **HAC-324** |
| Agent Gateway provisioning scripts | `hac-325` | `DELETE` | — |

**The four-arm harness is the most reusable thing here and it is not obvious.**
Its value is not the Interlock result; it is the shape — freeze every arm, label
and metric in a committed file *before* any result exists, revise only by adding a
`supersedes[]` entry, and make the metric definition a separate commit from the
result. META-373, META-380, META-381, META-382 and META-383 all reused that shape
in other repositories without it ever being written down as a protocol. Four of
those five closed negative, which is exactly the condition under which an unfrozen
protocol gets quietly widened until it finds something. Harvesting it means naming
it, not moving code.

**`hac-330` is harvested as one unit with a superseded part named.** The reusable
half is the provenance envelope and the refusal to run against a dirty or off-pin
upstream checkout. The synthetic-history fixture generator in the same tree is
superseded — META-383 replaced the approach with real repository history — and is
recorded in the inventory's `supersededParts` so it goes with the tree post-window
rather than being harvested by accident.

**The repository-attribution finding already has an upstream owner.** That the CLI
does not check whether the repository it mined is the repository that was
requested is real and is filed as **META-338**. The adapter does not need to move
for that finding to survive.

**`hac-325` is a decision, not an omission.** It belongs to a path recorded as
`[FAILED/PIVOTED]`. Keeping executable provisioning scripts for an abandoned
architecture invites someone to run them. HAC-338 owns the forensic finding; the
scripts are not needed to preserve it.

## 3. Media and judge-surface machinery — `media/`

| Capability | Path | Disposition | Owner |
| --- | --- | --- | --- |
| Judge verification cockpit | `hac-341` | `KEEP` | — |
| Consequence-first judge landing surface | `hac-349` | `KEEP` | — |
| Evidence-bound architecture visual suite | `hac-334` | `HARVEST → Studio v3` | **HAC-324** |
| Judge package and asset registry | `hac-335` | `HARVEST → Studio v3` | **HAC-324** |
| Evidence-bound final cut assembly | `hac-336` | `HARVEST → Studio v3` | **HAC-324** |
| Muted storyboard assembly | `hac-333` | `DELETE` | — |

**The asset registry is the Studio harvest worth naming.** Binding every exported
asset to an asset ID, a judge question, a source run, a supported claim, a runtime
source SHA and an evidence-publication SHA is a general capability for
evidence-bound media. Studio v3 is already producing the demo from this
repository's frozen runs, so this is a harvest with a live customer rather than a
speculative one.

**The gate-perturbation test travels with it.** An asset pipeline that cannot
demonstrate its own gate failing is the vacuous-green case META-337 spent a pass
eliminating. Harvesting the generator without the perturbation test would export
the convenience and leave the control behind. Recorded on HAC-324.

## 4. Repository gates — `scripts/`, `docs/quality/`

| Capability | Paths | Disposition | Owner |
| --- | --- | --- | --- |
| Provenance boundary gate | `scripts/check-provenance.mjs` | `HARVEST → swarm` | **META-339** |
| Merge-gate matrix and hardening-receipt method | `docs/quality/{merge-gate-matrix,hardening-receipts}.md` | `HARVEST → swarm` | **META-339** |
| Harvest ledger and coverage gate | this file, `check-harvest.mjs`, the inventory + schema | `HARVEST → swarm` | **META-339** |
| Identity boundary gate | `scripts/check-identity.mjs` | `KEEP` | — |
| Deterministic export naming | `scripts/export-naming.mjs` | `HARVEST → Studio v3` | **HAC-324** |

**The provenance gate is the strongest general capability the sprint produced.**
A machine-checked manifest that refuses to let a manifest edit grant itself
permission, enforced in CI, is a reusable answer to "which repository may this
change touch" — the question every multi-repository agent sprint has and most
answer with a paragraph in a README.

**The harvest-ledger gate harvests itself**, deliberately. Its coverage row is
what stops this ledger from omitting its own machinery.

**Identity stays.** `check-identity.mjs` verifies the Interlock mark, vendored
fonts and cockpit identity authority. It generalizes to nothing.

## 5. Research findings — no code

Not capabilities, but sprint output that would otherwise strand. Findings carry no
paths, so they cannot be used to claim a directory nobody classified.

| Finding | Source | Disposition | Durable home |
| --- | --- | --- | --- |
| Per-target locking misses cross-target composition hazards | HAC-343 | `KEEP` | `experiments/hac-343/evidence/judge-export.json` |
| `BOUNDED_SEARCH_EXHAUSTED` — no admissible worktree-composition fixture | META-383 | `HARVEST → standard research` | **Fibery OQ-17** |
| No measured baseline headroom on roadmap intelligence candidates | META-382 | `HARVEST → standard research` | **Fibery OQ-17** |

The composition finding is `KEEP` because it is the submission's own bounded
claim, already pinned in a frozen packet **with its scope boundary attached**.
Routing it to a Standard research issue would detach the claim from the corpus
that bounds it, which is the failure mode the packet's `boundedClaim` field exists
to prevent.

The two negatives are the likeliest rows in this table to be quietly dropped, and
they go where META-383's own completion routing sends them. Both closed without
establishing the value they set out to measure. That is a finding about where
*not* to invest, and it is worth more than a positive result would have been from
a search that had to be widened to find one.

## Summary

<!-- counts: {"total":27,"KEEP_INTERLOCK":12,"HARVEST_STANDARD_RESEARCH":4,"HARVEST_STUDIO":5,"HARVEST_SWARM":3,"HARVEST_INTEGRATIONS":1,"DELETE_HACKATHON_ONLY":2} -->

| Disposition | Count |
| --- | --- |
| `KEEP → Interlock reference app` | 12 |
| `HARVEST → workspacejson/standard research` | 4 |
| `HARVEST → Studio v3` | 5 |
| `HARVEST → ai-swarm / Swarm Evolution` | 3 |
| `HARVEST → workspacejson/integrations` | 1 |
| `DELETE → hackathon-only machinery` | 2 |
| **Total** | **27** |

23 capabilities and 3 findings. These counts are checked against the inventory on
every run, so they cannot drift.

**An earlier draft of this file claimed 29 rows.** That count was arithmetically
correct over a hand-written table and is not reproducible from the repository:
several rows split one directory into multiple entries, and one row recorded a
`workspacejson.dev` accessibility finding that is not an Interlock capability at
all. The inventory is what produces the number, and it moves when the
repository does: 26 when that draft was written, 27 once HAC-349 added the judge
landing surface. The discrepancy is the argument for the gate.

## Deliberate absences

Two things are **not** in the inventory, recorded so an absence is never mistaken
for an oversight:

* **`live-worktree-composition-harness`** — lives on `feature/meta-383-…` and is
  not yet on `main`. Its intended disposition is `HARVEST → standard research`
  under META-384 and is recorded there. It is absent here because the path does
  not exist on this branch, and a coverage gate that tolerates missing paths is
  not a coverage gate. It enters when that branch merges — and until it does, the
  coverage check will flag `experiments/meta-383` as unclaimed, which is the gate
  working rather than failing.
* **`revision-anchor-extension`** — `provenance/manifest.json` records it with
  status `PLANNED`. It was never built, has no paths, and cannot receive a
  disposition. Recording one would assert work that did not happen.

## Relationship to `provenance/manifest.json`

The manifest's `harvestDisposition` field is a **bootstrap-era deferral**
(`HARVEST_OR_DELETE_AFTER_SUBMISSION`), correct when the evidence to choose did
not exist. This ledger is where that deferral is spent.

The manifest now carries `initialHarvestDisposition` and
`resolvedHarvestDisposition` as **separately validated** fields, with
`harvestScopeStatus` for the entry that cannot be resolved because it was never
built. `check-provenance.mjs` validates all three against enums. An earlier draft
added two free-text fields that nothing checked — which would have produced a
green `Provenance boundary` over a broken anchor or an arbitrary disposition, and
did in fact hold a value outside HAC-321's vocabulary.

Where the two files disagree: the manifest wins on provenance, this ledger wins on
disposition. Both are now machine-checked, so disagreeing is a build failure
rather than a judgment call.

## Deletion is deferred, not executed

Nothing marked `DELETE` is removed by this change. Deleting during freeze week
would alter paths that frozen evidence packets, the asset registry and the cockpit
resolve against, and a submission that cannot resolve its own evidence links is a
worse outcome than carrying two dead directories.

The deletions execute after the submission window under HAC-321's post-window
branch, and the ledger is the record that they were decided rather than forgotten.
When they execute, their rows leave the inventory in the same commit — the
coverage gate makes the two inseparable.
