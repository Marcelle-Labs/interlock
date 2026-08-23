# HAC-335 — the judge-facing package

The frozen assembly of an already-approved factual system into one judge path.
This issue **authors almost no facts**. HAC-330 owns the causal experiment,
HAC-340 owns the cloud run, HAC-342 owns the public evidence, HAC-334 owns the
visual masters, HAC-341 owns the verification cockpit, HAC-333 owns the
storyboard, HAC-332 owns the identity and naming grammar. HAC-335 decides what a
judge meets, in what order, and what each artifact is allowed to claim.

## The rule the order exists to enforce

> A judge must never encounter a stronger claim later in the sequence than the
> first proof actually supports.

That is why behaviour comes before architecture, why the causal counterfactual
is the hero rather than the cockpit or a diagram, and why an explicit
proof-class reset sits between the local experiment and the cloud run.

## The sequence

| | Step | Question | Class | Lead asset |
| -- | -- | -- | -- | -- |
| 1 | Hero / thesis | What is this? | A | `IL-PROOF-010` |
| 2 | Controlled causal proof | What changed because Interlock existed? | A | `IL-PROOF-010` |
| 3 | Perturbation | How do I know the evidence did the work? | A | `IL-PROOF-011` |
| 4 | The Run — verify it | Can I verify this myself? | A | `IL-COCK-010` |
| 5 | Proof-class reset | Is what follows the same experiment? | — | SB-06 |
| 6 | Google Cloud participation | What actually ran on Google Cloud? | B | `IL-DIAG-011` |
| 7 | Fail-closed controls | What happens when the caller is wrong? | B | `IL-PROOF-013` |
| 8 | Architecture / trust boundary | Where does Google end and Interlock begin? | B | `IL-DIAG-012` |
| 9 | Claim boundary | What is not being claimed? | A+B | `IL-PROOF-014` |

Machine-readable in [`evidence/judge-sequence.json`](./evidence/judge-sequence.json).
HAC-336 consumes that order for final media assembly.

## Files

| Path | Role |
| --- | --- |
| `evidence/judge-sequence.json` | The ordered judge path. The editorial decision of this issue. |
| `evidence/asset-registry.json` | The one final registry. Generated. |
| `evidence/claim-ledger.json` | Every material claim, classified and bound to a source. |
| `evidence/capture-manifest.json` | Cockpit capture provenance. Generated. |
| `evidence/card-manifest.json` | Video card masters and derivatives. Generated. |
| `captures/` | Real captures of the merged HAC-341 cockpit. |
| `cards/` | Source-editable video title and end card masters. |
| `exports/` | Card derivatives. |
| `devpost/` | Frozen Devpost copy, screenshot order, thumbnail and architecture selections. |
| `bin/verify-package.mjs` | The gate. Dependency-free — no browser, no server, no network. |

## The cockpit is a verification surface, not the hero

`media/hac-341/README.md` states the downstream-use rule and this package obeys
it. The cockpit enters at step 4, answering *can I verify this?* — never as the
README hero, the Devpost thumbnail, a social image or an opening video frame.
The gate fails if the thumbnail becomes a cockpit capture.

Captures are cropped to the measured bounding box of the rendered content and
nothing else. **The pixels inside are unmodified.** Each row in the registry
records the deep-link address, the semantic state, the proof class and the
commit the cockpit was serving, so a crop cannot drift into reading as a
rendered claim.

### Captures cannot silently go stale

The manifest recorded `capturedFromSha` and nothing ever compared it to
anything, so editing the cockpit after a capture left stale screenshots in the
judge package with no mechanical signal at all. A commit SHA cannot close that
gap either, because the capture is committed in the same commit it would have to
name.

`captureSourceDigest` does. It is a sha256 over the path and contents of every
file whose bytes can change a captured pixel — `cockpit.html`, the view model,
`lib/arm-view.mjs`, `assets/styles.css`, every token file and every vendored
font face — computed by `bin/lib/capture-source.mjs` and recorded in the
manifest at capture time. `check:package` recomputes it and fails when the two
disagree, naming the recapture command. Token and lib directories are swept by
extension rather than listed, so a newly added file is covered without anyone
remembering to add it, and the manifest also states the covered set so a
hand-narrowed list is visible rather than merely wrong.

The commit SHA stays, as provenance. Freshness is the digest's job.

The Devpost upload order is bound to the current capture-manifest filename for
every cockpit asset. A previous PNG may remain in the repository as historical
evidence, but it cannot silently remain in the judge upload list after a
recapture.

## Regenerating

Deterministic, no browser:

```sh
pnpm run package:build     # cards, then the registry
pnpm run check:package     # the gate
```

Re-capturing the cockpit needs a browser and a served repository root, which is
why it is a separate step and not part of `check`:

```sh
# playwright is deliberately NOT a dependency of this repository — the
# deterministic core and every gate must stay installable without a browser.
mkdir -p /tmp/il-capture && cd /tmp/il-capture
npm init -y && npm i playwright && npx playwright install chromium

cd <repo> && python3 -m http.server 4173 &      # serve the ROOT, not media/
PLAYWRIGHT_MODULE=/tmp/il-capture/node_modules/playwright pnpm run package:capture
```

Serve the **repository root**: the cockpit resolves shared identity from
`/assets`, so serving `media/hac-341/` alone renders it without its typefaces
and mark.

## What the gate checks

It binds prose to evidence **in both directions**, which is the only way a
synthesis gate avoids becoming constants that agree with themselves. Editing the
frozen evidence without the copy fails; editing the copy without the evidence
fails.

- the two proof classes never merge into one purported run, and no sentence
  chains `WITHHOLD_SERIALIZE` to `alpha=45`;
- `AUTHORIZED`, `Agent Runtime`, `Agent Gateway` and `CONTENT_AUTHZ` never
  appear without a disclaimer;
- cloud controls stay `403` / `401` / `403`, and wrong-audience is never
  described as a cloud result;
- `140`, `120`, `130`, `24/24` and `alpha=45` are read from the frozen records
  and compared against the prose;
- every public evidence URL is commit-pinned, never a branch, and present in the
  registry;
- `runtimeSourceUrl` is never fabricated, and `runtimeSourceSha` never collapses
  into `evidencePublicationSha`;
- `sourcePacketSha256` is never described as reader-recomputable;
- no unevidenced deployment revision is named;
- every HAC-343 figure matches a frozen `display` value in the judge export,
  Panel 1 never travels without Panel 2, the A3 credibility strip is present,
  and every `mustNotClaim` reading is refused;
- HAC-319 proper stays unbound: no precision, recall or fleet-scale value, and
  `IL-DIAG-013` stays out of the judge-facing registry with its seam recorded;
- every capture's proof class agrees with its URL and its semantic state;
- every filename passes the frozen HAC-332 naming grammar;
- no derivative is stale relative to its source, checked by digest and PNG
  header;
- every judge-critical asset is in the registry and every material claim is in
  the ledger;
- the sequence opens on class A, resets between classes, and never puts
  architecture before the result.

**33 negative cases** in `test/hac-335-package-gates.test.mjs` prove each of
these still fails when violated.

## The evaluation: HAC-343 bound, HAC-319 still not

These are two different things and the package keeps them apart.

**HAC-343 is bound.** The bounded four-arm evaluation has a frozen canonical
result at `7ede0f9`, and every judge-facing figure in this package is read from
`experiments/hac-343/evidence/judge-export.json` — never recalculated here.
HAC-335 authors no evaluation facts; it decides where the comparison sits in the
judge path and what it is allowed to claim.

The gate enforces four properties that prose alone cannot hold:

- every HAC-343 figure in judge-facing copy matches a frozen `display` value in
  the export, so a number cannot drift or be invented;
- Panel 1 never appears without Panel 2 in the same file — the four-strategy
  comparison and the evidence ablation travel together, because Panel 1 alone
  reads as "Interlock is the safe one" and the export forbids that reading;
- the A3 credibility strip (`2/2`, `4/4`, `2/2`) is present wherever the
  comparison is, so the per-target lock cannot be quietly reduced to a straw man;
- every entry in the export's own `mustNotClaim` list is checked against the
  prose, so the forbidden readings fail the build rather than a review.

**HAC-319 is still not bound.** Precision, recall and fleet-scale behaviour have
no frozen packet. HAC-343 is a bounded child of HAC-319, not a substitute, and
the package says so rather than letting the bound child imply the unbound parent.

## Still open

The real three-reader cold-read has **not** been run against this assembled
sequence. No cold-read result is claimed anywhere in this package. The protocol
lives in `media/hac-341/README.md`; per the HAC-335 execution-sequencing
amendment it runs against the assembled experience before final freeze and
before HAC-336.
