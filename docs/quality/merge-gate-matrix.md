# Merge-gate responsibility matrix

Owner: META-337. Companion: [`hardening-receipts.md`](hardening-receipts.md).

This document answers one question per repository: **for each way a change can be
wrong, which single tool is responsible for catching it, and is that tool
actually able to block a merge?**

Every value in the "measured" tables was read back from the GitHub, SonarCloud, or
Codecov API, not inferred from configuration files. Where something has not been
measured, this document says so rather than guessing. The APIs are the authority;
if they disagree with this file, this file is stale and correcting it is part of
the PR that noticed.

Readings: **2026-08-12** (Phase A inventory) and **2026-08-25** (re-read before
submission freeze). The re-read found two drifts. They are recorded in
[§6](#6-re-read-2026-08-25) with the superseded value kept beside the current
one, rather than silently overwritten — a matrix that only ever shows today's
value cannot show that a gate was removed.

```bash
gh api repos/OWNER/REPO/branches/main/protection
gh api repos/OWNER/REPO/rulesets
curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=KEY"
```

## 1. One owner per failure class

Four tools reporting the same defect is not defense in depth — it is four places
to argue about the same finding, and three of them will eventually be turned off
by someone trying to recover green. Each row below has exactly one owner.

| Failure class | Owner | Why this owner and not another |
| --- | --- | --- |
| build, typecheck, deterministic tests | repository CI | The only signal that proves the code runs. Every other tool is interpreting a build this one already established was sound. Cannot be discharged by an external service. |
| executable architectural invariants, red tests, conformance | repository CI | These are product invariants. They must be testable without a network call, so an outage cannot make them unenforceable. |
| new-code reliability, security, maintainability, duplication, complexity | SonarQube Cloud | Whole-file analysis on the new-code period. Deliberately *not* CI's job: encoding these as bespoke lint rules would fork a rulebook we do not maintain. |
| coverage of changed production code | Codecov patch status | Sonar's coverage condition silently disappears when no coverage report is uploaded (observed: see §4). Codecov's `if_not_found: failure` does not. Coverage needs an owner that fails on absence. |
| WorkspaceJSON semantic and authority boundaries | Greptile | Repo-owned rules in `.greptile/`. Reads the whole repository, so it can see a boundary violation that is locally well-formed. |
| local implementation quality, decomposition, error handling | Sourcery | Advisory. See §2 — a completed review is not an approval. |
| dependency and supply-chain risk | Socket Security | Present and reporting on all three WorkspaceJSON repos today. Required on none. Recorded in §5 as an open decision, not silently adopted. |
| claim / evidence / rendered truth | purpose-built verification scripts | Blocking before freeze. Not yet built — owned by HAC-321. |

## 2. What a check state does and does not mean

Carried forward from `workspacejson/integrations`
[`docs/review/merge-policy.md`](https://github.com/workspacejson/integrations/blob/main/docs/review/merge-policy.md)
§5, because it is the reasoning this whole matrix rests on and it should not have
to be rediscovered per repository:

* A check that has **not run** is not a pass. Absence of a review is absence of
  evidence.
* A **completed** review is not an approval. Completion means a reviewer
  finished; it says nothing about whether it examined the defect class you care
  about. `Greptile Review` concludes `success` on a head carrying a P1 finding.
* A check green on an **older head** says nothing about the current head.
* A reviewer being **installed** is not a reviewer being **calibrated**.

This is why `Sourcery review` is required nowhere, and why every blocking gate in
this pass carries a recorded red/green proof rather than a screenshot of a green
check.

## 3. Repository classes

### 3a. Interlock submission repository — `Marcelle-Labs/interlock`

Available: deterministic CI, SonarQube Cloud, Codecov. Greptile and Sourcery are
**deliberately not** dependencies here, per META-337's submission posture.

| Failure class | Owner | Posture | State |
| --- | --- | --- | --- |
| provenance, authority files, canonical spelling | CI — `Provenance boundary` (app 15368) | blocking | **required, proven** |
| build / typecheck / test | CI — `test` (app 15368) | blocking | **required, proven** |
| new-code quality | SonarQube Cloud — `SonarCloud Code Analysis` (app 12526) | blocking | **required, proven** |
| coverage of changed code | Codecov — `codecov/patch` (app 254) | blocking | **required, proven** |
| coverage delivery | CI — `Coverage upload` (app 15368) | advisory | reporting; fails closed via `codecov/patch` |
| semantic boundaries | — | n/a | out of posture |

All four required contexts carry a bidirectional red/green proof from the expected
source app — see [`hardening-receipts.md`](hardening-receipts.md). Each proof also
records what stayed green, because a gate set where any defect reddens everything
cannot localize a defect.

The six `codecov/patch/<component>` statuses are **deliberately not required**:
their paths are populated by HAC-317 and currently match zero files, so they pass
vacuously. A component with no referent is not evidence.

`test` is deliberately a single unversioned context. `engines` declares
`>=22.0.0` and the repository pins `22.19.0`, so the `test (20)` / `test (22)`
matrix used in the workspacejson repositories would be testing a runtime this
package does not claim to support. Keeping the version out of the check name also
means bumping the pinned patch release cannot silently rename a required status
context out from under branch protection.

**Visibility change.** This repository was private in a GitHub Free organization,
where the branch-protection and rulesets APIs both return HTTP 403. No merge gate
of any kind was enforceable. It was made **public** on 2026-08-12 with the owner's
authorization, which restored free branch protection, rulesets, SonarQube Cloud,
and Codecov in one step. The history was audited before publication: one commit,
one file, no secrets. This intersects HAC-329's submission-posture decision and is
recorded here so it is not mistaken for an incidental setting.

### 3b. WorkspaceJSON ecosystem repositories

Full stack, where each tool has a distinct job. Values current as of the
**2026-08-25** re-read; superseded 2026-08-12 values are in [§6](#6-re-read-2026-08-25).

| Repository | CI (blocking) | Greptile | Sonar | Codecov | Sourcery |
| --- | --- | --- | --- | --- | --- |
| `workspacejson/standard` | `test (20)`, `test (22)`, `Four-path producer conformance` | **no longer required** — see §6 drift 1 | reporting, **not required** — never observed red; gate `OK` | absent | advisory |
| `workspacejson/integrations` | `build-and-smoke (20)`, `build-and-smoke (22)`, `standard-candidate-consumption`, `parity-receipt-reproduction` | **not required** — trial exhausted, see §5 | **required**; gate `OK` | absent | advisory |
| `workspacejson/cli` | `test (20)`, `test (22)`, `Compatibility parity vs frozen source` | reporting, **deliberately not required** | reporting, **not required**; gate **`ERROR`** — see §6 drift 2 | absent | advisory |

`workspacejson/cli` not requiring Greptile is a deliberate outcome of the META-321
calibration, not an oversight. It is preserved.

Semantic and authority-boundary review — the failure class §1 assigns to Greptile
— is therefore **unowned on all three** WorkspaceJSON repositories as of the
re-read. §1 still names an owner; no repository currently enforces it. That is the
single largest hole in this matrix and it is waived, not closed: [W-1](#w-1).

### 3c. Supporting repositories

| Repository | Role | State |
| --- | --- | --- |
| `Marcelle-Labs/ai-swarm` (Swarm) | execution / quality substrate | **private in a Free org — branch protection unavailable (HTTP 403)**. CI job `test` runs and reports. See §5. |
| `Marcelle-Labs/director` (Studio) | Studio v3 | public, **no workflows and no protection at all**. Read-only until an approved Studio issue activates work. See §5. |

## 4. Measured gaps

Findings from the Phase A inventory, in descending order of how easily each one
produces a false green.

1. ~~**SonarQube Cloud is required on no repository**~~ — **closed on
   `workspacejson/integrations`** (2026-08-12). It was observed *failing and not
   blocking* there on PR #12, whose analysis carried 10 unresolved issues
   including a `CRITICAL/BUG` (`javascript:S2871`, a sort comparator that does not
   depend on `String.localeCompare`). That is a real defect caught and ignored,
   which is why the check is now required and pinned to app `12526`.

   **Still open on `standard` and `cli`.** `standard` has four PR analyses, all
   `OK` — the gate has never been observed red there, so there is no proof and it
   is not promoted. `cli` is blocked behind gap 2.

   *Evidence note:* the integrations promotion rests on an **observed** red from a
   real defect rather than a deliberately **injected** one, which is not literally
   what META-337 §8 prescribes. It is stronger evidence of detection and weaker
   evidence of control — nobody chose what the gate would see. Recorded as such.

2. ~~**`workspacejson/cli`'s SonarCloud gate returns status `NONE`**~~ — **the
   `NONE` condition closed** by the 2026-08-25 re-read. A new-code baseline now
   exists and the analyzer produces a verdict.

   The verdict is **`ERROR`**: `new_reliability_rating` is `4` against a threshold
   of `1`, and `new_security_rating` is `2` against a threshold of `1`.

   This is worse than the state it replaced, not better. `NONE` was a gate that
   could not speak; `ERROR` is a gate that is speaking, is being ignored, and is
   not required — the exact condition that justified promoting Sonar on
   `integrations` in gap 1. The difference is that on `integrations` the finding
   was triaged before promotion, and here it has not been. Promotion without
   triage would make `main` unmergeable on `cli` during freeze week, which is why
   this is waived rather than acted on now: [W-2](#w-2).

3. **Sonar's coverage condition is absent from every project's gate.** The
   "Sonar way" gate nominally includes `new_coverage`, but SonarCloud drops the
   condition when no coverage report is uploaded — so the gate reports `OK` on
   projects with no coverage data. This is the strongest argument for Codecov
   owning coverage: it is the only configuration in the set that can be told to
   fail on absence.

4. **`workspacejson/integrations` produced two CI checks it did not require** —
   `parity-receipt-reproduction` and `standard-candidate-consumption`. Recorded in
   that repository's own merge policy as a known gap explicitly out of scope for
   META-322; it was in scope here.

   **Both are now required** and proven — see
   [`hardening-receipts.md`](hardening-receipts.md).

   `parity-receipt-reproduction` was held back until its false green was closed.
   Both of its substantive steps had been gated on
   `steps.check-receipt.outputs.has_receipt`, so a branch with no committed receipt
   produced a **green job that had reproduced nothing** — and requiring that would
   have made "delete the receipt" the cheapest way to satisfy a failing parity
   gate. [integrations#15](https://github.com/workspacejson/integrations/pull/15)
   made absence a hard failure and merged on 2026-08-13; the promotion followed the
   merge rather than preceding it. Review of that PR added an explicit
   `shell: bash`, on the reasoning that a gate whose failure mode is "silently did
   not fail" should not rest on a runner defaulting to the shell its
   `set -euo pipefail` needs.

5. ~~**`workspacejson/integrations` pins its CI contexts to `app_id: null`**~~ —
   **closed** (2026-08-12). Any app could previously satisfy
   `build-and-smoke (20)` / `(22)`; both are now pinned to app `15368`, matching
   `standard` and `cli`.

6. **`enforce_admins: false` on all three WorkspaceJSON repositories.** Every
   required check above is bypassable by an administrator, and the agents doing
   the implementation fan-out hold admin credentials. `standard`'s
   `REVIEW-MERGE-PROTOCOL.md` documents this as a deliberate calibration-period
   choice with a sole-code-owner deadlock behind it — the reasoning is sound and
   the remediation sequence it describes has partly completed. It is listed here
   because META-337 asks specifically that merge protection "not grant routine
   agent bypass", and this is the setting that decides that.

   Re-read 2026-08-25: unchanged on all three. **`Marcelle-Labs/interlock` is
   `enforce_admins: true`** — the submission repository does not grant the bypass,
   which is the asymmetry worth naming: the repository being judged is the strict
   one. Waived for the three ecosystem repositories: [W-3](#w-3).

7. **Documentation drift in `workspacejson/standard`.**
   `.github/REVIEW-MERGE-PROTOCOL.md` states that Greptile "did not run" and is
   "Planned (not yet required)", and that code-owner review is "currently
   required". On 2026-08-12 the API said Greptile Review *was* a required context
   and `require_code_owner_reviews` was `false`. The remediation sequence in that
   document was executed; the document was not updated to match.

   Re-read 2026-08-25: the drift **inverted on one half and persists on the
   other**. Greptile Review is no longer required (§6 drift 1), so the document's
   "not yet required" is now accidentally accurate — it describes the current state
   for a reason that is not the reason it gives. `require_code_owner_reviews` is
   still `false`, so "currently required" is still wrong.

   A document that becomes true by drifting past a change and back is not a
   documented state; it is a coincidence. Correcting it needs a write to
   `workspacejson/standard`, which the HAC-328 permissions matrix makes read-only
   and pinned to this repository. It cannot be fixed from here: [W-4](#w-4).

## 5. Open decisions, recorded rather than assumed

* **Greptile's trial ran out.** It produced no check on any
  `workspacejson/integrations` PR created after 2026-08-12T15:39Z (#14, #15, #16),
  while continuing to report normally on `standard` (#36, created within a minute
  of #14) and `cli` — so the symptom presented as repository-scoped, and the cause
  was the trial expiring. Recorded upstream in
  [integrations#18](https://github.com/workspacejson/integrations/pull/18) (GTM-45).

  With `Greptile Review` required and unable to report, `integrations` was
  unmergeable except by administrator bypass. The context has since been **removed
  from the required set** on that repository, which is the honest resolution: an
  analyzer that cannot run should either block or be openly stood down with the
  reason recorded, and GTM-45 records it. What must not happen is the third option
  — leaving it required and routinely bypassing it, which trains everyone to treat
  a red gate as noise.

  Semantic review on `integrations` is therefore **unowned** until credits are
  restored. `standard` still requires `Greptile Review` and still has credits.

* **Socket Security** reports on all three WorkspaceJSON repositories and is
  required on none. It owns a real failure class nothing else covers. Promoting
  it is not in META-337's matrix, so it is recorded, not adopted.
* **`Marcelle-Labs/ai-swarm`** cannot have branch protection while it is private
  in a Free organization. It should not be made public — it is private swarm
  machinery, and HAC-328 forbids absorbing it into the submission. The options
  are a paid org plan or an explicit waiver with owner, expiry, and risk.
* **`Marcelle-Labs/director`** has no CI to require. Protecting it is premature
  while it is read-only.

## 6. Re-read 2026-08-25

The §3 tables were re-read from the APIs before submission freeze, thirteen days
after the Phase A inventory. The commands are the ones at the top of this file.

Two values had drifted. Neither drift was announced by anything — no check turned
red, no workflow changed, no PR mentioned it. That is the argument for re-reading
rather than trusting a matrix: **a required check can stop being required without
producing a single signal**, and the only way to notice is to ask the API again.

### Drift 1 — `Greptile Review` is no longer required on `workspacejson/standard`

| | |
| --- | --- |
| 2026-08-12 | `standard` required contexts included `Greptile Review` |
| 2026-08-25 | `test (20)`, `test (22)`, `Four-path producer conformance` — **only** |
| Command | `gh api repos/workspacejson/standard/branches/main/protection --jq '.required_status_checks.contexts'` |

§5 already recorded Greptile being stood down on `integrations` when the trial
expired, and explicitly noted that `standard` "still requires `Greptile Review`
and still has credits". That is no longer true of the requirement. The Sonar gate
for `standard` reads `OK`, so nothing is currently red behind the removal.

The consequence is stated in §3b: the failure class §1 assigns to Greptile —
WorkspaceJSON semantic and authority boundaries — is now unowned on every
repository in the set. See [W-1](#w-1).

### Drift 2 — `workspacejson/cli`'s Sonar gate moved `NONE` → `ERROR`

| | |
| --- | --- |
| 2026-08-12 | `projectStatus.status: NONE` — no new-code baseline, check concluded `neutral` |
| 2026-08-25 | `projectStatus.status: ERROR` — `new_reliability_rating` 4 (threshold 1), `new_security_rating` 2 (threshold 1) |
| Command | `curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=workspacejson_cli"` |

Gap 2 asked for exactly this — a baseline — and getting it revealed real findings.
See [W-2](#w-2).

### Unchanged at re-read

* `Marcelle-Labs/interlock` — four required contexts, `enforce_admins: true`.
* `workspacejson/integrations` — five required contexts including
  `SonarCloud Code Analysis` pinned to app `12526`; gate `OK`.
* `enforce_admins: false` on all three WorkspaceJSON repositories.
* `require_code_owner_reviews: false` and `required_approving_review_count: 0`
  on all four repositories.
* No repository in the set uses rulesets; protection is classic branch protection
  throughout, so the `rulesets` reading is empty by configuration, not by error.

## 7. Waiver register

META-337's final acceptance clause permits a remaining gap to close as an explicit
waiver "with owner, expiry, and risk" rather than as work. This register discharges
that clause for every gap left open in §4, §5 and §6.

A waiver is not a dismissal. It records that a gap was measured, that the cost of
closing it now was judged higher than the risk of carrying it, and **when that
judgment expires**. An expired waiver is a defect. None of these outlive the
submission window by more than one sprint.

Owner is `qmarcelle` throughout — the repositories have a sole administrator, and
naming a fictional second owner would be the kind of decorative control this
document exists to refuse.

<a id="w-1"></a>
### W-1 · Semantic and authority-boundary review is unowned

| | |
| --- | --- |
| **Gap** | §3b, §6 drift 1, §5 Greptile decision |
| **Scope** | `workspacejson/standard`, `workspacejson/cli`, `workspacejson/integrations` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-14 |
| **Risk accepted** | A change that is locally well-formed but violates a WorkspaceJSON authority boundary — descriptive-not-prescriptive, evidence falsifiability, missing-is-not-green, reader/producer separation — can reach `main` without any tool objecting. This is the highest-value class in §1 and it is the one now uncovered. |
| **Why not closed now** | Restoring it requires Greptile credits (GTM-45), a paid decision outside META-337's scope, during a freeze week in which the ecosystem repositories are under a development freeze anyway. |
| **Compensating control** | The freeze itself. Through submission freeze the participating repositories accept only break/fix, security, and Interlock-pulled work — the change classes least likely to move an authority boundary. This control lapses when the freeze does, which is why the expiry is two weeks out and not longer. |
| **Discharge condition** | Either credits restored and `Greptile Review` required again on `standard` and `integrations`, or an explicit decision to retire Greptile and reassign the §1 row to a named replacement. Recorded in GTM-45. |

<a id="w-2"></a>
### W-2 · `workspacejson/cli` carries an unrequired red Sonar gate

| | |
| --- | --- |
| **Gap** | §4 gap 1 (open half), §4 gap 2, §6 drift 2 |
| **Scope** | `workspacejson/cli` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-07 |
| **Risk accepted** | Two new-code findings — one reliability at rating 4, one security at rating 2 — are visible, unresolved, and cannot block a merge. Their content has not been triaged, so their severity is unknown; the rating alone does not establish exploitability. |
| **Why not closed now** | Requiring the check today makes `main` unmergeable on `cli` until the findings are resolved, and `cli` is on the evidence path for META-382/383. Gap 1 promoted Sonar on `integrations` only *after* the finding there was read and understood; doing less here would be promoting a gate without knowing what it will block. |
| **Compensating control** | None. The check reports on every PR and is visible; nothing forces anyone to look. Recorded as absent rather than invented. |
| **Discharge condition** | Triage both findings, fix or file them, then require `SonarCloud Code Analysis` on `cli` pinned to app `12526`, matching `integrations`. |

<a id="w-3"></a>
### W-3 · `enforce_admins: false` on the three WorkspaceJSON repositories

| | |
| --- | --- |
| **Gap** | §4 gap 6 |
| **Scope** | `workspacejson/standard`, `workspacejson/cli`, `workspacejson/integrations` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-14 |
| **Risk accepted** | Every required check on those three repositories is administrator-bypassable, and the implementation agents hold admin credentials. META-337 asks specifically that protection "not grant routine agent bypass"; this setting grants it. |
| **Why not closed now** | `standard`'s `REVIEW-MERGE-PROTOCOL.md` records the sole-code-owner deadlock behind the choice: with one admin and `required_approving_review_count: 0`, enforcing admins can leave a repository with no path to merge its own fix. That reasoning is sound and has not changed. |
| **Compensating control** | `Marcelle-Labs/interlock`, the repository actually under judgement, runs `enforce_admins: true`. The bypass exists only upstream of the submission, and the submission consumes those repositories at pinned SHAs recorded in `provenance/manifest.json` — a bypassed merge upstream cannot silently enter the submission without a manifest change, and `check-provenance.mjs` gates that. |
| **Discharge condition** | A second administrator or a documented break-glass procedure, then `enforce_admins: true`. |

<a id="w-4"></a>
### W-4 · `standard`'s `REVIEW-MERGE-PROTOCOL.md` misstates its own protection

| | |
| --- | --- |
| **Gap** | §4 gap 7 |
| **Scope** | `workspacejson/standard` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-14 |
| **Risk accepted** | A contributor reading that document believes code-owner review is required when it is not, and believes Greptile is merely "planned" when it was required and has since been removed. The document is currently accidentally right about Greptile for the wrong reason. |
| **Why not closed now** | The HAC-328 permissions matrix makes `workspacejson/standard` read-only and pinned for the duration; changing it requires a separately approved Standard issue, which this issue does not authorize. Editing it from here would be the boundary violation this repository's own provenance gate exists to prevent. |
| **Compensating control** | This matrix is the authoritative reading, and §6 records both the measured value and its date. Anyone routed here gets the true state. |
| **Discharge condition** | A Standard-owned issue that rewrites the document from a fresh API reading. Not filed under META-337, which cannot authorize it. |

<a id="w-5"></a>
### W-5 · CI checks on `standard` and `cli` are inherited, not independently proven

| | |
| --- | --- |
| **Gap** | `hardening-receipts.md` § *Still unproven*, rows 3 and 4 |
| **Scope** | `standard` — `test (20)`, `test (22)`, `Four-path producer conformance`; `cli` — `test (20)`, `test (22)`, `Compatibility parity vs frozen source` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-14 |
| **Risk accepted** | These six contexts were required before this hardening pass and were not put through the §8 bidirectional proof. A gate that has never been observed failing has not been distinguished from a gate that is silently skipped — the premise of the receipts file. Each could in principle be passing vacuously. |
| **Why not closed now** | Injecting a defect into `standard` or `cli` requires a write to a repository the HAC-328 matrix holds read-only and pinned, on the evidence path for META-382/383, during freeze. The proof is cheap; the write permission is what is missing. |
| **Compensating control** | Partial and worth naming as partial: all six are observed *passing* on real PRs continuously, and `Four-path producer conformance` and `Compatibility parity vs frozen source` are purpose-built assertions that would have to be actively broken to pass vacuously. Neither fact is a substitute for an injected red. |
| **Discharge condition** | One injected-defect proof per context on a throwaway branch, recorded in `hardening-receipts.md`, once the freeze lifts and the repositories are writable. |

<a id="w-6"></a>
### W-6 · Sonar never observed red on `workspacejson/standard`

| | |
| --- | --- |
| **Gap** | §4 gap 1 (remaining half), `hardening-receipts.md` § *Still unproven*, row 1 |
| **Scope** | `workspacejson/standard` |
| **Owner** | `qmarcelle` |
| **Expires** | 2026-09-14 |
| **Risk accepted** | The gate reads `OK` and has read `OK` on every analysis. It is not required, and there is no evidence it *can* fail — an analyzer misconfigured to examine nothing would produce exactly this record. |
| **Why not closed now** | Same write-permission constraint as W-5. |
| **Compensating control** | The same analyzer, same app `12526`, is proven capable of failing on `integrations` (§4 gap 1) and is currently failing on `cli` (§6 drift 2). The tool works; what is unproven is that it is pointed correctly here. |
| **Discharge condition** | One injected new-code defect on a throwaway branch, observed red from app `12526`, then promotion. |

### Waivers at a glance

| ID | Gap | Expires | Blocked by |
| --- | --- | --- | --- |
| [W-1](#w-1) | semantic review unowned on all three | 2026-09-14 | Greptile credits — GTM-45 |
| [W-2](#w-2) | `cli` red Sonar gate, not required | 2026-09-07 | triage of two findings |
| [W-3](#w-3) | admin bypass on all three | 2026-09-14 | second admin or break-glass |
| [W-4](#w-4) | `standard` protocol doc misstates protection | 2026-09-14 | Standard-owned issue |
| [W-5](#w-5) | six inherited CI contexts unproven | 2026-09-14 | write access after freeze |
| [W-6](#w-6) | Sonar unproven on `standard` | 2026-09-14 | write access after freeze |

Every waiver above is blocked by permission, credit, or triage — none by effort.
That is the honest summary of this hardening pass: the submission repository's
gates are proven and enforced against its own administrator, and the ecosystem
repositories are measured, understood, and deliberately carried.
