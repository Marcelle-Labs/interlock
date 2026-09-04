# HAC-324 re-capture — the live Proof of Action segment

Fills `R08L`, the 30.0s slot at **1:49–2:19**. Until it is filled, `check:rc1`
reports `AWAITING LIVE CAPTURE` and RC1 cannot freeze.

## Why this exists

RC1 through 0.2 answered Devpost's Proof of Action with six frozen captures.
They are real evidence of a real run and digest-bound to HAC-324 — but they are
stills. Devpost weights **Demo & Production Readiness at 30% of Stage Two** and
asks whether the video shows an **unedited, live execution of the agent
performing its task**, plus visible proof the backend runs on Google Cloud. A
still asks a judge to trust that it came from something that happened.

The traversal is real and already written. Nothing is being invented here — it
is being **recorded** instead of screenshotted.

## Preconditions

```sh
gcloud auth login                      # interactive; cannot be scripted
gcloud config set project <PROJECT_ID> # a project with billing enabled
```

The stack was torn down on 2026-08-24 (`experiments/hac-324/evidence/teardown.json`),
so this provisions it again: 3 Cloud Run services, 3 service accounts, 1 Artifact
Registry repo, 2 Cloud Build images. Expect a few dollars and ~10 minutes.

## 1 · Deploy from the runtime source commit, not from HEAD

`ae6d0d3` is the approved runtime source SHA and the parity claim depends on it.
`10-provision.sh` tags its images with `git rev-parse --short HEAD`, so deploying
from a worktree at that commit reproduces the original image tags exactly. Do not
copy those files onto this branch.

```sh
git worktree add ../worktrees/interlock/hac-340-relive ae6d0d3
cd ../worktrees/interlock/hac-340-relive
PROJECT_ID=<PROJECT_ID> bash experiments/hac-340/bin/10-provision.sh
```

Writes `experiments/hac-340/.work/cloud/topology.json`. Sanity-check it names
your project and three `*.run.app` URLs before recording anything.

## 1b · The observer service account (not covered by `10-provision.sh`)

`20-cloud-run.mjs` authenticates its independent read-back with
`gcloud auth print-identity-token --audiences=<target>`. gcloud **refuses
audience-scoped identity tokens for a user account**, so this fails as the
operator. HAC-324 hit the same wall and recorded the resolution: the run
authenticates as a dedicated keyless observer service account, logged as a
`NON_MATERIAL` principal substitution.

`10-provision.sh` does not create it. Do this after provisioning:

```sh
P=<PROJECT_ID>; SA="interlock-hac340-observer@${P}.iam.gserviceaccount.com"
gcloud iam service-accounts create interlock-hac340-observer --project $P
gcloud iam service-accounts add-iam-policy-binding "$SA" --project $P   --member="user:$(gcloud config get-value account)"   --role=roles/iam.serviceAccountTokenCreator
for svc in agent proxy target; do
  gcloud run services add-iam-policy-binding "interlock-hac340-$svc"     --project $P --region us-central1     --member="serviceAccount:$SA" --role=roles/run.invoker
done
```

**IAM takes up to ~2 minutes to propagate.** Until it does, impersonation fails
with `IAM_PERMISSION_DENIED` on `iam.serviceAccounts.getAccessToken` even though
the binding is already visible in `get-iam-policy`. Poll before recording:

```sh
until gcloud auth print-identity-token --audiences=<agentUrl>   --impersonate-service-account="$SA" >/dev/null 2>&1; do sleep 10; done
```

The traversal is frozen runtime source at `ae6d0d3` and must not gain an
`--impersonate-service-account` flag. The flag is injected through the
`GCLOUD_BIN` indirection the script already reads:
`experiments/hac-340/.work/gcloud-observer` shims only
`auth print-identity-token` and passes everything else straight through, so
`logging read` still runs as the operator — the observer's job is the read-back,
not the whole session.

Leave that shim's stderr visible. gcloud prints
`WARNING: This command is using service account impersonation … as
[interlock-hac340-observer@…]`, which is exactly the independent identity the
segment is claiming, shown rather than asserted.

## 2 · Rehearse once, off camera

```sh
PROJECT_ID=<PROJECT_ID> node experiments/hac-340/bin/20-cloud-run.mjs
```

Confirm `decision: "ALLOW"`, a `receiptDigest`, and that
`evidence/cloud-run.json` shows `protectedMutation.status: "EXECUTED"` and an
`observation` reading `alpha: 45`. **Time it.** That number decides whether the
take needs a uniform speed-up.

A rehearsal is not a cut: it establishes the shot, and the recorded take is a
separate, complete run of its own.

## 3 · The take

**The stack is provisioned and the take is scripted and rehearsed.** All that
remains is the screen recording, which is a human action.

`experiments/hac-340/.work/capture-take.sh` runs the four real commands and
holds each to an **absolute mark**, so the take is 33.0s every time regardless of
whether Cloud Run is warm. The traversal itself runs 10–18s depending on cold
start; holding to a mark absorbs that variance without cutting anything.

Measured on three consecutive dry runs: `0.00 / 4.01 / 20.05 / 25.05 / 33.06`.

| Mark | On screen | Narration follows at |
| --- | --- | --- |
| 0.0s | three `interlock-hac340-*` services, `us-central1` | **1.5s** *"One run, start to finish, on Google Cloud."* |
| 4.0s | traversal begins; observer impersonation warnings; then `ALLOW` + `receiptId` + `receiptDigest` | **5.5s** *"Gemini proposes the action through Google ADK."* · **19.5s** *"Interlock returns ALLOW, with a receipt."* |
| 20.0s | `EXECUTED`, `total 105 <= 130`, `OBSERVED alpha: 45` | **23.3s** *"…is EXECUTED, and a separately authenticated observer OBSERVED the result."* |
| 25.0s | Cloud Logging row: service, correlation id, revision | **30.3s** *"Cloud Logging carries the same run id."* |
| 33.0s | end | — |

Every line lands **after** the screen event it names. An earlier cut said
"Interlock returns ALLOW" 3.5s before `ALLOW` appeared — the kind of mismatch a
judge reads as a reconstruction.

### Warm the path first — this is not optional

Cloud Run scales these services to zero. Interlock mines its evidence basis at
startup, so a traversal arriving milliseconds after the proxy begins listening
finds no qualifying evidence and **correctly fails closed with `DENY`**.

That is the absent-evidence behaviour working, not breaking — but it is not the
path being filmed, and a cold start also adds ~16s, which blows every stage mark.

A real take failed exactly this way. The proxy log is unambiguous:

```
18:49:36.567  Starting new instance. Reason: AUTOSCALING — no existing capacity
18:49:37.557  proxy.listening
18:49:37.604  proxy.request  ilk-hac340-cloud-1788202158061   ← 47ms after boot
```

Result: `decision: DENY`, no receipt, no execution, and mark 03 at **34.22s**
instead of 20.0s.

So, immediately before recording:

```sh
bash experiments/hac-340/.work/warm-up.sh
```

It runs the full path once, discards it, and prints `WARM` only on
`ALLOW` + `EXECUTED`. Record within ~10 minutes, before scale-to-zero.

`capture-take.sh` now aborts loudly if the decision is not `ALLOW`, instead of
dereferencing an undefined `protectedMutation` and printing a stack trace into
the middle of the take.

**The warm-up is a precondition, not a retry.** If a warm take still denies,
that is a real result: investigate it, do not shoot again until it is understood.
Re-rolling a recording until the decision comes out the way you wanted is
cherry-picking, and it would make the segment worthless.

### Recording

1. Full-screen terminal, large font, dark theme. Nothing else on the display —
   the recorder captures the whole screen.
2. Start recording. QuickTime (File ▸ New Screen Recording), or:
   `screencapture -v -V 40 ~/Desktop/hac340-live.mov`
3. Run, in the recording, from the worktree:
   ```sh
   bash experiments/hac-340/.work/capture-take.sh
   ```
4. Stop at the `05-end` mark. One take, no cuts, no splices.

**No speed-up is needed.** The Devpost speed-up allowance exists for long
runtimes; at 33.0s this take does not need it, so do not apply one — an
unnecessary `setpts` filter is a disclosure obligation bought for nothing.

Re-take if: the traversal overruns its 20.0s mark (visible in the printed
marks), any output is clipped by the window, or the font is too small to read
at 1080p.

## 4 · Substitute

```sh
# 1920x1080, exactly 30.000s, no audio
ffmpeg -i live-raw.mp4 -vf "scale=1920:1080,fps=30" -t 30 -an \
  media/hac-336/rc1/inserts/IL-MOT-023-live-cloud-traversal-1920x1080.mp4

# then in evidence/cut-rc1.json, on beat R08L:
#   delete  "pendingCapture": true
#   set     fixedDurationSeconds to the real length if it is not 30.0

pnpm run rc1:derive && pnpm run rc1:render && pnpm run check:rc1
```

Holds are derived, so the picture re-cuts to the new length on its own. The
`LIVE UNEDITED · CLOUD RUN` label and the run id are added by the render as
chrome outside the evidence, the same way the replay's proof-class label is.

## 5 · Tear down

```sh
PROJECT_ID=<PROJECT_ID> bash experiments/hac-340/bin/99-teardown.sh
git worktree remove ../worktrees/interlock/hac-340-relive
```

Then record the new run id, receipt id and teardown timestamp in
`experiments/hac-324/evidence/`, exactly as the first capture did. **The frozen
HAC-324 record is not edited** — this is a second run with its own identity, and
two runs in one act is the collapse HAC-324 exists to prevent. Whichever run the
film uses, it uses throughout.
