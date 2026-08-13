# Hardening receipts

Owner: META-337 §9. Companion: [`merge-gate-matrix.md`](merge-gate-matrix.md).

One record per merge gate, in the shape enforced by
[`src/receipt.ts`](../../src/receipt.ts): a gate may only be described as
`blocking` **and recorded** if it carries a bidirectional proof — the defect that
was injected, the failure actually observed from the expected source app, and the
repair that returned it to green.

A gate that has never been observed failing has not been distinguished from a gate
that is silently skipped. That is the whole reason this file exists, and it is why
an inconclusive run is withdrawn below rather than counted.

## `Marcelle-Labs/interlock`

All four required contexts are proven. Each proof also records what stayed
**green**, because a gate set where any defect reddens everything cannot tell you
where the defect is.

### `test`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking — **required** |
| Injected defect | Dropped the blocking-gate bidirectional-proof requirement from `validateReceipt` — the invariant the module exists to hold (`fc847c8`) |
| Observed failure | 2 of 16 tests failed, both guarding that requirement |
| Repair | Reverted; `src/receipt.ts` byte-identical to `main` (`97e5600`) |
| Stayed green | `Provenance boundary` |
| Final state | Required on `main`, pinned to app `15368` |

### `SonarCloud Code Analysis`

| Field | Value |
| --- | --- |
| Source app | `sonarqubecloud` (12526) |
| Posture | blocking — **required** |
| Injected defect | Same commit as above (`fc847c8`); the injection used `void posture;` to silence the now-unused binding |
| Observed failure | `Sonar way` gate `ERROR` — `new_maintainability_rating` 3 (C) against threshold 1 (A), from `typescript:S3735` at `src/receipt.ts:179` |
| Repair | Reverted (`97e5600`); gate `OK` |
| Final state | Required on `main`, pinned to app `12526`; gate `Sonar way` (id 9), unmodified |

The violation was deliberate and bounded, but the specific rule it tripped was not
anticipated — the defect was designed to break tests, and Sonar caught the
mechanism rather than the intent. Recorded as observed, not as a prediction that
came true.

**Sonar independently caught a real defect in this pass.** On
[#7](https://github.com/Marcelle-Labs/interlock/pull/7) it flagged
`codecov/codecov-action@v5` as `githubactions:S7637` (MAJOR/VULNERABILITY),
putting `new_security_rating` at 3 (C). A mutable tag on a third-party action that
handles coverage data with a job token is a genuine supply-chain weakness. It was
fixed by pinning to a commit SHA — not by excluding the rule. `pnpm/action-setup`
was pinned in the same commit, even though Sonar never flagged it: it was unflagged
only because it was not new code, and an analyzer's silence about unchanged code is
not evidence.

### `Provenance boundary`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking — **required** |
| Injected defect | A non-canonical product spelling appended to `README.md` (`56a0058`) |
| Observed failure | `Canonical product spelling` step failed and printed the offending line |
| Repair | Reverted (`d83cb3c`) |
| Stayed green | `test`, `SonarCloud Code Analysis` |
| Final state | Required on `main`, pinned to app `15368` |

Inherited from HAC-328, which required it before it had been observed failing.
This receipt closes that gap: it had been green on every head, including through a
deliberate semantic defect, but green-always and green-correctly are different
claims.

### `codecov/patch`

| Field | Value |
| --- | --- |
| Source app | `codecov` (254) |
| Posture | blocking — **required** |
| Injected defect | A module with two exported functions and no tests (`89de791`) |
| Observed failure | `0.00% of diff hit (target 90.00%)` |
| Repair | Added tests (`6ef461c`); patch green |
| Stayed green | `test`, `Provenance boundary`, `SonarCloud Code Analysis`, `Coverage upload` |
| Final state | Required on `main`, pinned to app `254` |

Untested-but-correct code reddened exactly one gate, and it was the one that owns
coverage. That is the responsibility matrix working.

### Deliberately **not** required

* **The six `codecov/patch/<component>` statuses.** They reported `success` on both
  the red and green heads while matching **zero changed files** — their paths are
  populated by HAC-317 and do not exist yet. A component with no referent passes
  vacuously, which is exactly what META-337 forbids reading as green. They become
  meaningful when HAC-317 lands the corresponding modules; until then a green
  component is not a discharged obligation.
* **`Coverage upload`.** Not required, because it does not need to be: `codecov/patch`
  *is* required and pinned, so if the upload never happens the patch status never
  reports, and a required context that never reports blocks the merge. The gate
  fails closed by construction. `codecov.yml` adds `if_no_uploads: error` and
  `if_not_found: failure` as belt and braces.

## `workspacejson/integrations`

### `parity-receipt-reproduction`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking — **required** |
| Injected defect | Deleted `docs/migration/parity-receipt.json` (`4b77a33`) |
| Observed failure | Annotation `Missing committed parity receipt` on the `Require a committed parity receipt` step |
| Repair | Restored the receipt (`4600e18`) |
| Final state | Required on `main`, pinned to app `15368` |

Promotion was deferred until the gate was worth requiring. Before
[integrations#15](https://github.com/workspacejson/integrations/pull/15), this same
tree concluded `success`: both substantive steps were gated on
`steps.check-receipt.outputs.has_receipt`, so a missing receipt skipped the
reproduction and the job went green having verified nothing. Requiring that would
have made deleting the receipt the cheapest way to satisfy a failing parity gate.

The proof above was taken **with the fix applied**, which is what makes it
meaningful: the same tree that had been green now fails, and names why. #15 merged
2026-08-13 and the context was promoted after, not before.

### `standard-candidate-consumption`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking — **required** |
| Injected defect | Removed `.mcp.json` from the published `files[]` array (`4600e18`) |
| Observed failure | Harness assertion `tarball contains .mcp.json` failed |
| Repair | Restored `files[]` (`eff8bc5`) |
| Final state | Required on `main`, pinned to app `15368` |

Attribution is clean: this job runs no linter and no formatter, so its failure
cannot be confused with the formatting artifact that invalidated the withdrawn run
below. `build-and-smoke` also greps the pack log for `.mcp.json`, so the two jobs
overlap on this assertion — established by reading the workflow, **not** by that
run.

### `SonarCloud Code Analysis`

| Field | Value |
| --- | --- |
| Source app | `sonarqubecloud` (12526) |
| Posture | blocking — **required** |
| Defect | **Observed, not injected** — PR #12 carried 10 unresolved issues including `javascript:S2871` (`CRITICAL/BUG`): a sort comparator not based on `String.localeCompare` |
| Observed failure | `qualityGateStatus: ERROR`; check `failure`, not required at the time and therefore not blocking |
| Repair | n/a — a real defect on a real branch, not a fixture |
| Green counterpart | PRs #6, #10, #13, #14, #15, #16 all `OK` |
| Final state | Required on `main`, pinned to app `12526`; gate `Sonar way` (id 9), unmodified |

This receipt does not satisfy META-337 §8 literally: nobody chose what the gate
would see. It is stronger evidence of *detection* — the finding was real — and
weaker evidence of *control*. Recorded as such rather than dressed up as an
injection.

## Withdrawn

### `workspacejson/integrations` — attempted isolation of the consumption gate (`65404e7`)

Intended to show `standard-candidate-consumption` red with `build-and-smoke` green,
by dropping `scripts/install.mjs` from `files[]` — an assertion only the consumption
harness makes.

Both halves failed:

* the injected defect had no effect — the consumption harness still passed, so
  `scripts/install.mjs` reached the tarball by some route other than `files[]`;
* `build-and-smoke` went red for an unrelated reason. Rewriting `package.json`
  through a `JSON.stringify` round trip reformatted the `files` array and tripped
  biome in the `Lint` step.

A run whose red is not attributable to its injected defect proves nothing. It is
recorded here so it is not later mistaken for evidence, and as a note on method:
mutate manifests with a targeted edit, not a serializer round trip.

## Still unproven

| Repository | Check | Source app | Blocker |
| --- | --- | --- | --- |
| `workspacejson/standard` | `SonarCloud Code Analysis` | `sonarqubecloud` | Never observed red — four PR analyses, all `OK`. Needs an injected proof before promotion. |
| `workspacejson/cli` | `SonarCloud Code Analysis` | `sonarqubecloud` | Gate status `NONE`: one analysis ever, so no new-code baseline exists. Must be fixed before the check could ever be required. |
| `workspacejson/standard` | `test (20)`, `test (22)`, `Four-path producer conformance` | `github-actions` | Required before this pass; inherited, not independently proven here. |
| `workspacejson/cli` | `test (20)`, `test (22)`, `Compatibility parity vs frozen source` | `github-actions` | As above. |
