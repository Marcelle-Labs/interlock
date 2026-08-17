# Devpost — evidence and verification

> Submission field: how a judge checks the claims.
> Frozen under HAC-335. Every link below is commit-pinned and was re-tested
> logged out, with no GitHub session and no token.

## The controlled local experiment (HAC-330)

Reproduce it from a clone:

```sh
pnpm install
pnpm hac330          # run the controlled local experiment
pnpm check:packet    # verify the frozen packet — 24 checks
```

The 24 checks include pinned-revision and clean-checkout assertions on the
upstream WorkspaceJSON repositories, so a pass also asserts which upstream bytes
produced the result.

Inspect the arms interactively — serve the repository root, then:

```
/media/hac-341/cockpit.html?run=hac330-local&proof=local&state=run.local.treatment
/media/hac-341/cockpit.html?run=hac330-local&proof=local&state=run.local.baseline
/media/hac-341/cockpit.html?run=hac330-local&proof=local&state=run.local.perturbed
```

## The Google Cloud run (HAC-340), published by HAC-342

Immutable, commit-pinned, publicly readable without authentication:

| Artifact | Link |
| -- | -- |
| Cloud evidence packet | https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/cloud-run.public.json |
| Independent verifier | https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/bin/verify-public-packet.mjs |
| Redaction manifest | https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/redaction-manifest.json |
| Runtime source snapshot | https://github.com/Marcelle-Labs/interlock/blob/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/runtime-source-snapshot.json |
| Publication bindings | https://github.com/Marcelle-Labs/interlock/blob/9da4cb95b6eec6030fe0c622b67a319eeaf20230/experiments/hac-342/evidence/publication-bindings.json |

Recompute the packet digest:

```sh
curl -sL https://raw.githubusercontent.com/Marcelle-Labs/interlock/75253e38791e69f7e2a4bb3a041044a9114c32f0/experiments/hac-342/evidence/cloud-run.public.json \
  | shasum -a 256
# ea1d6993ca937bb5ae14ad43954e48bd1a91ceb5e959719f8a99492b0b0dbf0d
```

Or run the verifier against the repository:

```sh
pnpm check:packet:public
```

## Digests, and which of them you can check

| Digest | Value | Can a reader recompute it? |
| -- | -- | -- |
| `publicPacketSha256` | `ea1d6993…` | **Yes** — over the published bytes above |
| `evidencePublicationSha` | `75253e38…` | **Yes** — it is the commit the links pin to |
| `publicationBindingsSha` | `9da4cb95…` | **Yes** — it is the commit the bindings pin to |
| `runtimeSourceSnapshotSha256` | `9aaa4ad1…` | **Yes** — over the published snapshot |
| `sourcePacketSha256` | `794befb8…` | **No** — private commitment; the source bytes are unpublished |
| `runtimeSourceSha` | `ae6d0d3c…` | **No public URL** — see below |

`runtimeSourceSha` is deliberately not published. Its commit tree contains a
Google Cloud project identifier that this package exists to remove. Publishing a
reference to it would expose exactly that, and rewriting the tree would change
the SHA and misstate which bytes ran. The public snapshot records the executed
source content separately, across 36 files.

**No revision URL is fabricated for it.** The unavailable state is rendered as
unavailable.

`runtimeSourceSha` and `evidencePublicationSha` are distinct values describing
different things: what ran, and where the evidence about it was published.

Claims used: `CL-005`, `CL-008`, `CL-017`, `CL-018`, `CL-019`.
