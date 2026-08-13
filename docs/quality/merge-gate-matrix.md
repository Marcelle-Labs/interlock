# Merge-gate responsibility matrix

Owner: META-337. Companion: [`hardening-receipts.md`](hardening-receipts.md).

This document answers one question per repository: **for each way a change can be
wrong, which single tool is responsible for catching it, and is that tool
actually able to block a merge?**

Every value in the "measured" tables was read back from the GitHub, SonarCloud, or
Codecov API on **2026-08-12**, not inferred from configuration files. Where
something has not been measured, this document says so rather than guessing. The
APIs are the authority; if they disagree with this file, this file is stale and
correcting it is part of the PR that noticed.

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

Full stack, where each tool has a distinct job.

| Repository | CI (blocking) | Greptile | Sonar | Codecov | Sourcery |
| --- | --- | --- | --- | --- | --- |
| `workspacejson/standard` | `test (20)`, `test (22)`, `Four-path producer conformance` | **required** | reporting, **not required** — never observed red | absent | advisory |
| `workspacejson/integrations` | `build-and-smoke (20)`, `build-and-smoke (22)`, `standard-candidate-consumption` | **required**, but see §5 | **required** | absent | advisory |
| `workspacejson/cli` | `test (20)`, `test (22)`, `Compatibility parity vs frozen source` | reporting, **deliberately not required** | **gate status `NONE`** | absent | advisory |

`workspacejson/cli` not requiring Greptile is a deliberate outcome of the META-321
calibration, not an oversight. It is preserved.

`parity-receipt-reproduction` on `workspacejson/integrations` is proven but
**deliberately not yet required** — see gap 4 in §4.

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

2. **`workspacejson/cli`'s SonarCloud gate returns status `NONE`** and its check
   concludes `neutral` on `main`. The analyzer is not producing a verdict at all.
   Because the check is not required this does not currently admit a bad merge —
   but it is precisely the "analysis was skipped" state META-337 forbids treating
   as green, and it must be fixed before the check is ever promoted.

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

   `standard-candidate-consumption` is **now required** (proven, see
   [`hardening-receipts.md`](hardening-receipts.md)).

   `parity-receipt-reproduction` is proven but **deliberately still not required**,
   because promoting it as it stands would install a false green. Both of its
   substantive steps were gated on `steps.check-receipt.outputs.has_receipt`, so a
   branch with no committed receipt produced a **green job that had reproduced
   nothing**. Requiring that would make "delete the receipt" the cheapest way to
   satisfy a failing parity gate. The fix is
   [integrations#15](https://github.com/workspacejson/integrations/pull/15);
   the promotion follows the merge, not the other way round.

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

7. **Documentation drift in `workspacejson/standard`.**
   `.github/REVIEW-MERGE-PROTOCOL.md` states that Greptile "did not run" and is
   "Planned (not yet required)", and that code-owner review is "currently
   required". The API says Greptile Review *is* a required context and
   `require_code_owner_reviews` is `false`. The remediation sequence in that
   document was executed; the document was not updated to match.

## 5. Open decisions, recorded rather than assumed

* **Greptile is out of credits**, confirmed by the account owner on 2026-08-13.
  It produced no check on any `workspacejson/integrations` PR created after
  2026-08-12T15:39Z (#14, #15, #16), while continuing to report normally on
  `standard` (#36, created within a minute of #14) and `cli` — so the symptom was
  repository-scoped exhaustion, not an outage.

  `Greptile Review` is a required context on `integrations`, so the repository is
  **currently unmergeable except by administrator bypass**. That is the *correct*
  posture under META-337 — an unavailable analyzer must fail closed, never read as
  green — and `integrations` is under HAC-328's development freeze, so the cost is
  low. It is left required deliberately.

  The alternative, if `integrations` must merge before credits are restored, is a
  time-boxed waiver with owner, expiry and risk, as META-337's acceptance clause
  allows. Silently dropping the context is not on the table: it would convert a
  known-unavailable reviewer into an invisible one.

* **Socket Security** reports on all three WorkspaceJSON repositories and is
  required on none. It owns a real failure class nothing else covers. Promoting
  it is not in META-337's matrix, so it is recorded, not adopted.
* **`Marcelle-Labs/ai-swarm`** cannot have branch protection while it is private
  in a Free organization. It should not be made public — it is private swarm
  machinery, and HAC-328 forbids absorbing it into the submission. The options
  are a paid org plan or an explicit waiver with owner, expiry, and risk.
* **`Marcelle-Labs/director`** has no CI to require. Protecting it is premature
  while it is read-only.
