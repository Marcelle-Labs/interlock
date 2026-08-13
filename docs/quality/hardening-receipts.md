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

## Proven

### `workspacejson/integrations` — `parity-receipt-reproduction`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking — **promotion deferred**, see below |
| Injected defect | Deleted `docs/migration/parity-receipt.json` (`4b77a33`) |
| Observed failure | Job `failure`; annotation `Missing committed parity receipt` on the `Require a committed parity receipt` step |
| Repair | Restored the receipt from `main` (`4600e18`) |
| Final state | Proven; **not yet a required context** |

Promotion is deferred on purpose. Before
[integrations#15](https://github.com/workspacejson/integrations/pull/15), this same
tree concluded `success`: both substantive steps were gated on
`steps.check-receipt.outputs.has_receipt`, so a missing receipt skipped the
reproduction and the job went green having verified nothing. Requiring that would
have made deleting the receipt the cheapest way to satisfy a failing parity gate.
The check is promoted after #15 merges, not before.

### `workspacejson/integrations` — `standard-candidate-consumption`

| Field | Value |
| --- | --- |
| Source app | `github-actions` (15368) |
| Posture | blocking |
| Injected defect | Removed `.mcp.json` from the published `files[]` array (`4600e18`) |
| Observed failure | Harness assertion `tarball contains .mcp.json` failed; job `failure` |
| Repair | Restored `files[]` from `main` (`eff8bc5`) |
| Final state | Required on `main`, pinned to app `15368` |

Attribution is clean: this job runs no linter and no formatter, so the failure
cannot be confused with the formatting artifact that invalidated the withdrawn run
below. Note that `build-and-smoke` also greps the pack log for `.mcp.json`, so the
two jobs overlap on this particular assertion — established by reading the
workflow, **not** by that run.

### `workspacejson/integrations` — `SonarCloud Code Analysis`

| Field | Value |
| --- | --- |
| Source app | `sonarqubecloud` (12526) |
| Posture | blocking |
| Defect | **Observed, not injected** — PR #12 carried 10 unresolved issues, including `javascript:S2871` (`CRITICAL/BUG`): a sort comparator not based on `String.localeCompare` |
| Observed failure | `qualityGateStatus: ERROR`; check `SonarCloud Code Analysis` = `failure`, not required at the time and therefore not blocking |
| Repair | n/a — the red was a real defect on a real branch, not a fixture |
| Final state | Required on `main`, pinned to app `12526`; gate `Sonar way` (id 9), unmodified |
| Green counterpart | PRs #6, #10, #13, #14, #15, #16 all `OK` |

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

## Pending proof

| Repository | Check | Source app | Blocker |
| --- | --- | --- | --- |
| `Marcelle-Labs/interlock` | `test` | `github-actions` | awaiting first PR run post-rebase |
| `Marcelle-Labs/interlock` | `Provenance boundary` | `github-actions` | required by HAC-328; inherited, not yet independently proven here |
| `Marcelle-Labs/interlock` | `codecov/patch` | `codecov` | upload not yet wired |
| `Marcelle-Labs/interlock` | `SonarCloud Code Analysis` | `sonarqubecloud` | no Marcelle-Labs SonarCloud organization yet |
| `workspacejson/standard` | `SonarCloud Code Analysis` | `sonarqubecloud` | never observed red; needs an injected proof before promotion |
| `workspacejson/cli` | `SonarCloud Code Analysis` | `sonarqubecloud` | gate status `NONE` — one analysis ever, so no new-code baseline exists |
