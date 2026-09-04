# HAC-361 — frozen receiver protocol

**Status: FROZEN except for the test URL.** Questions, rubric, gate timings,
inclusion rules and the tested artifact are fixed as of this document. Nothing
below may be edited once the first respondent begins. A later revision is a new
cohort, not an overwrite.

This experiment tests one thing: whether the problem/relevance-first narrative
revision improved **receiver outcomes**. It is not a communication-engine task,
and a `PASS` earns only a cross-domain receiver-validation experiment in
Covenant Academy — not `@studio/communication`, a linter, LLM scoring,
`adapt()`, profile packs, a dashboard, a service, or a repository.

---

## 1. The frozen artifact

| | |
| --- | --- |
| Repository | `Marcelle-Labs/interlock` |
| Branch | `feature/hac-349-interlockjudge-ux-build-consequence-first-judge-landing` |
| Commit | `0fe88da948ec2e10098a51a15ef324be1b800aac` |
| Rendered output | `media/hac-336/rc1/exports/IL-MOT-022-interlock-rc1-1920x1080.mp4` |
| **sha256** | `7a5277c7f571362170c31a852397e7d67956f25796fc1c9985462dcbce0f4d74` |
| Bytes | 9,644,879 |
| Runtime | 215.238s (3:35) |
| Geometry / codec | 1920×1080, h264, 30fps |
| Audio | 1 track, aac, 48 kHz — spoken ElevenLabs narration, 30 lines, 136 wpm mean |
| Generator | `media/hac-336/rc1/bin/build-video.mjs` |
| Encoder | ffmpeg 8.0.1 |
| Gate | `pnpm run check:rc1` → **PASS**, 138 checks, 12 beats, 13 assets digest-bound |
| Test URL | **PENDING** — see §7 |

Machine-readable: [`evidence/artifact-freeze.json`](./evidence/artifact-freeze.json),
derived by `bin/freeze-artifact.mjs` and re-checkable with `bin/verify-artifact.mjs`.

### 1.1 The commit does not bind the media

The rendered file is **untracked** at freeze time. The commit binds the pipeline
that produced it; the **sha256 binds the media**. Stated rather than hidden,
because a reader who assumes the commit pins the bytes would be wrong.

### 1.2 Why not the newer render

`IL-MOT-024-interlock-final-1920x1080.mp4` (223.253s, sha256 `030bb2c3…`) exists
and is newer. It was **rejected**, not overlooked:

- it prepends an 8.0s generated Veo cold open whose own issue, HAC-351, carries
  disposition `VEO_REJECTED`, and whose `INTEGRATION.md` says in terms: *"Do not
  import … into the cut"* until reader evidence earns it;
- that intro is silent — no speech, no text — so the 5–8s gate would land
  entirely inside wordless abstract footage and the first spoken line would move
  to 0:09, past the gate;
- it would confound two variables (narrative order **and** a generated cold
  open) in an experiment designed to test one;
- `check:rc1` covers 215.238s, not 223.253s, so it is outside the gate;
- the intro's digest `e28c1bce…` is an 8.0s conform that appears in **no**
  manifest; HAC-351's derivative manifest records a 6.0s derivative,
  `6f0b96a7…`. The bytes in the final cut are unbound.

Using it would have been exactly the silent substitution of "whatever file is
newest" that HAC-361 forbids. If the Veo cold open is later to be earned, that is
HAC-351 Test 2 and a separate cohort.

---

## 2. What actually changed, and what else changed with it

### 2.1 The intended variable — narrative order

The pre-revision cut (`media/hac-336/evidence/cut.json`, shipped as `IL-MOT-020`)
opened on brand and mechanism:

| | Pre-revision | Frozen artifact |
| --- | --- | --- |
| 0:00–0:04 | `B01` **brand title card** — *"Interlock. Evidence-bound coordination before shared-state mutation."* | — no title card — |
| 0:00–0:29 | — | `R01` **PROBLEM**, proof class `EVAL`, recorded forensic replay |
| first line | *"Interlock. Evidence-bound coordination before shared-state mutation."* (product name + abstract mechanism) | **0:01.0** *"Two autonomous agents can each be right, and still be wrong together."* |
| second line | 0:04 *"Two agents propose two changes. Each one is valid when you check it on its own."* | **0:07.1** *"Together they break a constraint that spans both targets."* |
| mechanism enters | 0:00 (first words) | **0:29.1** *"Interlock isn't another agent. It's the deterministic boundary those actions pass through before shared state changes."* |

The product name is absent from the first 29 seconds of the frozen artifact.
Consequence and stakes come first; mechanism enters only at `R02`. That is the
revision under test, and its rationale is recorded in
[`media/hac-336/rc1/POSITIONING.md`](../../media/hac-336/rc1/POSITIONING.md).

### 2.2 A second change that is NOT controlled — declared confound

The baseline respondent wrote *"spoken word might have given it a little more
blood in the veins"* and complained of *"trying to survey the content and read
the subtitles which (for me) was changing too fast."* Both read as a
**captions-only, unnarrated** viewing. The frozen artifact carries **spoken
narration** and no burned-in subtitles (the `.srt`/`.vtt` are sidecar files and
are not composited into the picture).

So the pre/post spans two changes:

- **(a)** narrative order — problem/relevance ahead of mechanism and brand;
- **(b)** delivery — spoken narration replacing a captions-only read.

Both were human-derived, and HAC-361's criterion 4 explicitly contemplates
narration. But a `PASS` here **may not be attributed to ordering alone**. Any
disposition must say so. This is recorded before responses, not after.

### 2.3 The baseline media is not byte-bound

The baseline response was submitted **2026-08-30T16:40:44Z**. The RC1 pipeline
artifacts postdate it — `IL-MOT-021-forensic-replay` has an mtime later the same
day — and no digest of the media that respondent watched was recorded anywhere.
Per HAC-361: this is real receiver evidence about the pre-revision experience,
and byte-level baseline provenance must **not** be invented. The §2.1 table
therefore compares the frozen artifact against the *cut lineage* that preceded
it, not against a digest.

---

## 3. Gate timings, mapped to the frozen artifact

Scene boundaries are read from
`media/hac-336/rc1/evidence/scene-manifest.json`.

| Gate | HAC-361 says | Realized pause | Why there | What the reader has seen |
| --- | --- | --- | --- | --- |
| 1 | 5–8 s | **0:08** | inside the window; identical to the `NakAGCaC` baseline pause, so the two are directly comparable | `R01` PROBLEM: N01 complete (0:01.0–5.5), N02 begun (0:07.1) |
| 2 | ~30 s | **0:29** | the `R01`→`R02` **PROBLEM→MECHANISM** act boundary (29.000 / 28.600) | the whole ordinary-locking demonstration, N01–N04; **no** mechanism yet |
| 3 | ~60 s | **0:46** | the `R02`→`R03` **MECHANISM→COMPARISON** boundary (46.321 / 45.921) | mechanism, N05–N06; **not** the four-strategy comparison |
| 4 | full | **3:35** | end of film | everything |

### 3.1 Gate 3 is 14 seconds stricter than preregistered — and how that is scored

HAC-361 criterion 3 allows until "~60 seconds". At 0:60 the reader would already
be inside `R03`, the four-strategy comparison — and the comparison is precisely
what historically rescued comprehension in the `UrofcPg8` page baseline, where
both readers only reached value *"around the four-strategy comparison."*
Observing at 0:46 tests whether the revision earns differentiation *before* the
comparison bails it out.

To avoid failing the artifact on a harder test than was preregistered, criterion
3 is scored asymmetrically and this rule is fixed now, not after seeing answers:

- differentiation demonstrated **at 0:46** → criterion 3 **met** (46 < 60, so it
  is met *a fortiori*);
- **not** demonstrated at 0:46 → criterion 3 is **not** thereby failed. It is
  recorded as `NOT MET BY 0:46`, and the full-artifact stage is inspected for
  whether the reader reached it later. That is reported as
  `met later, not by the gate` — never silently upgraded to a pass, never
  silently counted as a failure.

---

## 4. The frozen question set

Built as Typeform **`q781OwQW`** — *Interlock Video Cold Read — Take 1.0
(HAC-361)*, **unpublished**. It is a **duplicate** of `NakAGCaC`, so the staged
structure and wording carry over and the pre/post stays interpretable. The
baseline instrument itself was **not edited**. Deltas are listed in §4.1;
machine-readable in [`evidence/protocol-freeze.json`](./evidence/protocol-freeze.json).

**Stage 1 — pause at 0:08**
1. After only those first 8 seconds, what problem do you think this project is about?
2. Why might that problem matter? *(new — HAC-361 requires it)*

**Stage 2 — pause at 0:29**
3. What did ordinary locking handle correctly?
4. What did it still fail to see?
5. Why does that limitation matter? *(new)*

**Stage 3 — pause at 0:46**
6. What does Interlock add or change?
7. Why is that useful compared with the obvious alternative? *(new)*

**Stage 4 — full film**
8. What was the four-approach comparison trying to show?
9. What did the evidence-present versus evidence-removed section establish?
10. How did you understand the relationship between the controlled evaluation and the Google Cloud demonstration? *(free text + the 4-choice `proof_separation` item, unchanged)*
11. What remains unproven? *(promoted to its own question)*
12. Where did the film first click for you?
13. Where did it make you work too hard?
14. Unsupported-inference checklist — **preserved unchanged**, all 8 options
15. If you were judging 50 projects with limited patience, would you keep investigating? Why?
16. Brutal verdict
17. Reader background — **last**, so it cannot prime the cold read

**No aggregate communication score is computed, stored, or shown.** The seven
criteria in §5 are reported separately and are never summed.

### 4.1 Deltas from `NakAGCaC`, and why

| Change | Reason |
| --- | --- |
| pauses 0:08 / 0:37 / 1:09 → **0:08 / 0:29 / 0:46** | HAC-361 mandates 5–8s / ~30s / ~60s; the new points are act boundaries in the frozen artifact (§3) |
| "Why might that problem matter?" added | HAC-361 early gate, question 2 — the relevance probe the baseline lacked |
| "Why does that limitation matter?" added | HAC-361 30-second gate, question 3 |
| lock question split into *handled correctly* / *failed to see* | HAC-361 asks them separately; `NakAGCaC` merged them into one prompt |
| "Why is that useful compared with the obvious alternative?" added | HAC-361 60-second gate, question 2 — the differentiation probe |
| "What remains unproven?" promoted from a hint inside `brutal_verdict` | HAC-361 lists it as its own full-artifact question |
| "where did it click" / "where too hard" split into two fields | they score different criteria (2 and 4); merged, a reader who answers one leaves the other unscoreable — as the baseline reader did, answering only `DK` |
| `unsupported_inferences` | **unchanged**, deliberately — it is the truth-preservation control |
| `proof_separation` 4-choice item | **unchanged**, deliberately — criterion 7 |
| `keep_investigating` 3-choice item | **unchanged**, deliberately — criterion 5 |
| `reader_background` | **unchanged**, still last |

`NakAGCaC` and `UrofcPg8` are **not modified**. The baseline instruments stay
exactly as they are.

---

## 5. Preregistered rubric — seven criteria, scored separately

Per reader, then the cohort pattern. No criterion may be relaxed after reading
responses.

| # | Criterion | Cohort threshold | Baseline (`NakAGCaC`, n=1) |
| --- | --- | --- | --- |
| 1 | **Early problem comprehension** — identifies the joint/concurrent interaction risk in plain language at 0:08. Not "AI agents", not "locks", not "three states". | ≥2 of 3, or all if n=2 | **FAIL** — *"No clue. maybe comparisons of three states"* |
| 2 | **Relevance** — can say why it matters, without needing the four-strategy comparison to discover the stakes | same readers as (1) | **FAIL** — never reached; reader went to `DK` |
| 3 | **Differentiation** — explains what Interlock adds beyond ordinary locking / global serialization, in practical terms, no internal vocabulary required | ≥2 of 3, or all if n=2 (scoring rule §3.1) | **FAIL** — *"not sure"* |
| 4 | **Attention** — no majority reports working too hard before understanding the problem; pacing must not recreate the earlier failure | no majority adverse | **FAIL** — *"challenging trying to survey the content and read the the subtitles which (for me) was changing too fast"* |
| 5 | **Investigation intent** — materially improves on the baseline `No`; at minimum no reader answers `No` for lack of understanding of the core problem/value | no `No` for non-comprehension | **FAIL** — `No` |
| 6 | **Truth preservation** — zero readers leave with a material unsupported inference from the prohibited list | zero | **PASS** — *"None of these"* |
| 7 | **Proof separation** — distinguishes the controlled evaluation from the Google Cloud participation demonstration by the end | all readers | **FAIL** — *"I could not tell how the two sections related"* |

Prohibited inferences (criterion 6), verbatim from the preserved checklist:
Interlock guarantees safety in general · Interlock is production-ready · the
controlled evaluation itself ran in Google Cloud · Agent Runtime or Agent Gateway
was part of the demonstrated path · the 403/401/403 controls prove the route is
broadly secure · the animation speed represented real execution timing ·
Interlock is basically just another lock.

**Criterion 6 was already passing at baseline.** A new pass on it is *not*
evidence of improvement — it is evidence of non-regression. Any disposition must
treat it that way. Criteria 1, 2, 3, 5 and 7 are where the revision has to earn
its result.

### 5.1 Baseline caveat that limits every comparison

`NakAGCaC` n=1, non-technical, and that reader **disengaged partway**: *"The
whole thing looks too cody for me. can't answer your specific question. goin
forward i'll just say 'DK'"*. Their later answers are non-informative rather than
wrong. So criteria 2, 3 and 7 have a baseline of *"did not reach"*, not
*"reached and got it wrong"* — a weaker baseline than a naive reading suggests.

`UrofcPg8` (page, n=2) is **supporting** evidence only, not a substitute for the
video pre/post: first-screen readings were *"AI agents"* and *"i have no
idea…"*; both readers reached value only around the four-strategy comparison;
one could not distinguish Interlock from global locking.

### 5.2 Statistical honesty

n=2–3 against n=1. **No significance, confidence interval, effect size or
percentage may be computed or reported.** The question is solely whether the
*direction* of the receiver outcome changed. A split cohort is a real result and
must be reported as one.

---

## 6. Respondent inclusion and exclusion

**Required cohort: 2–3 readers**, and it must include:

- ≥1 **non-technical / non-coding** reader;
- ≥1 **technically literate** reader with no involvement in Interlock.

**Excluded, without exception:**

- the author (Qwynn Marcelle);
- any implementation agent, and **any model** — an LLM read is not a receiver
  outcome and may never be recorded as one, nor used to fill a missing reader;
- prior reviewers who already know the narrative;
- anyone who saw the 2026-08-31 feedback or the positioning paragraph;
- the `NakAGCaC` baseline respondent — they have seen the pre-revision film, and
  a second read would confound learning with revision;
- anyone who has read this document.

Readers must not discuss the film with each other until all have submitted.

---

## 7. Hosting — the artifact is not respondent-ready until this passes

The recorded sha256 only describes what a respondent watched if the serving path
returns those bytes unchanged. Verified so far:

- the Vercel + Cloudflare static path **does not transcode** — an already-deployed
  `.mp4` was downloaded and reproduced its digest exactly
  (`344d5954…`, 15,974,400 bytes, byte-identical via `cmp`);
- `interlock-preview.marcellelabs.io` currently returns **404
  `DEPLOYMENT_NOT_FOUND`** — DNS resolves through Cloudflare but no Vercel
  deployment is bound to that hostname;
- `preview-interlock.marcellelabs.io` is live, but serves **byte-identical
  content to `interlock.marcellelabs.io`** (both `3d1f9f76…`). It is an alias of
  the same production deployment, so publishing through it **would modify the
  judge environment** — which is prohibited. **Rejected.**
- the **branch deployment**
  `interlock-git-feature-hac-349-interlockjudg-8847df-marcellelabs.vercel.app`
  is isolated from production, publicly reachable with no auth wall, returns
  `content-type: video/mp4`, and was verified **byte-identical** on the same
  probe file. It satisfies every provenance requirement; it is simply not on the
  requested hostname.

So the byte-integrity requirement is **satisfiable**, and the only open item is
which hostname serves it. `interlock-preview.marcellelabs.io` needs a domain
binding on the Vercel project before it can resolve — an account-settings change,
not something to do unasked.

Before the protocol is frozen and any link is sent:

```sh
node experiments/hac-361/bin/verify-artifact.mjs --url <TEST_URL>
```

must report `PASS` on *served sha256 reproduces the frozen digest*. If any layer
rewrites the media, **reject that path** rather than weaken the provenance claim.
After the first respondent begins, the file at that URL must not be mutated.

---

## 8. Deliverables still outstanding

1. a test URL that satisfies §7;
2. 2–3 unfamiliar-reader responses (§6) — **human only**;
3. per-criterion scoring against §5, no aggregate;
4. explicit misconceptions and unsupported inferences;
5. the exact point relevance first became clear, per reader;
6. disposition: `PASS` / `NOT VALIDATED` / `MIXED — ITERATION WARRANTED`,
   applied exactly as HAC-361 preregisters it, and stating the §2.2 confound;
7. recommendation: stop, run one narrow iteration naming the single variable, or
   promote the receiver-validation protocol to a Covenant Academy generalization
   experiment.
