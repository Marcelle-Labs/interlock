# HAC-316 — Implementation Spec

**S1 end-to-end composition counterfactual on real Google Agent Runtime.**

Reproduce the HAC-330 counterfactual against live Gemini-backed ADK agents: two
individually-valid mutations compose into an invalid joint state without
Interlock, and Interlock changes that outcome **for the intended reason**, using
the frozen HAC-326 S2 enforcement contract unchanged.

| Field | Value |
| -- | -- |
| Branch | `hac/316-agent-runtime-counterfactual` |
| Base / PR target | `main` (protected) |
| Audit SHA | `f44a6b83580c92776231d3507942a7ef6b1b54f4` |
| Package manager | pnpm 10.24.0 |
| Node | 22.19.0 (pinned) |
| Linter | **none exists** — do not invent a lint gate |

Throughout this document:

```sh
REPO=/Users/user1/dev/worktrees/interlock/hac-316-agent-runtime-counterfactual
```

Every verification command below assumes `cd "$REPO"` first. A command that
prints anything other than its stated expected output is a **FAIL**. There are
no judgment calls.

---

## 1. Scope Declaration

### 1.1 In scope

HAC-316 delivers an experiment package under `experiments/hac-316/` that:

1. Supersedes Preflight V1 with an immutable **Preflight V2** recording the
   falsification of the single-target baseline, with every changed field
   enumerated.
2. Deploys the canonical HAC-330 fixture as a **two-target projection** —
   `alpha` and `beta` partitions, each an unchanged `ProtectedTarget`.
3. Adds an experiment-local **global verifier** that independently rereads both
   targets and combines them with the immutable `gamma` value. **The global
   verifier is the harm oracle.**
4. Adds an experiment-local **routing surface** placing two `InterlockProxy`
   instances in one process sharing **one** `PendingIntentStore` object.
5. Adds an experiment-local **composition-unaware issuer** as the baseline arm.
6. Adds an experiment-local **lifecycle/timeline schema** that emits a state
   only when a boundary was actually observed.
7. Runs baseline, treatment, and perturbation arms against real Agent Runtime,
   and tears the disposable Google project down.
8. Corrects an inaccurate prose comment in `src/target/state.ts` as a
   **standalone documentation-only change**.

### 1.2 The counterfactual, stated precisely

Canonical fixture (`src/target/state.ts:35-38`, verified):

```
totalReservable = 130 ; services = { alpha: 40, beta: 40, gamma: 20 }
```

| Composition | Total | Verdict |
| -- | -- | -- |
| initial | 40+40+20 = **100** | `100 <= 130` holds |
| A only (alpha→60) | 60+40+20 = **120** | `120 <= 130` holds |
| B only (beta→60) | 40+60+20 = **120** | `120 <= 130` holds |
| A **and** B | 60+60+20 = **140** | `140 > 130` **BREACH** |

Each mutation is individually valid. Their composition is not. That is the
entire hazard, and no single-request check can see it.

### 1.3 Why the topology changed (the falsification being recorded)

Preflight V1 (`experiments/hac-316/evidence/preflight.json`) presumed a
single protected target plus an "unsafe" baseline target
(`fixture.genesisRevisionBaselineTarget`). That baseline is **falsified**: an
unchanged `ProtectedTarget` holding all three services refuses the second
mutation locally at `src/target/state.ts:120-126` (`INVARIANT_BREACH`) before
composition can occur. A single-target baseline therefore cannot reach the
invalid composed state, so it cannot demonstrate the counterfactual.

The correction — decided, not open:

- Partition the state across **two** targets, each retaining
  `totalReservable = 130`, so each local mutation is genuinely valid
  (alpha: `60 <= 130`; beta: `60 <= 130`), and neither target can locally
  observe the composition.
- Move the harm oracle **out** of the target and into an experiment-local
  global verifier that rereads both targets and adds the immutable `gamma`.
- Keep local target invariants enabled as defense-in-depth. They are not the
  oracle and they are not disabled.

### 1.4 Out of scope — recorded as debt only

Record in `experiments/hac-316/DEBT.md`; **do not fix here**, and **do not open
a new active critical-path issue**:

- HAC-325's missing `commands.log`.
- Stale HAC-325 README text.
- Absence of a lint tool (belongs to META-339).

---

## 2. Owned Files

### 2.1 Created (owned outright)

| Path | Purpose |
| -- | -- |
| `experiments/hac-316/SPEC.md` | this document |
| `experiments/hac-316/DEBT.md` | recorded debt (§1.4) |
| `experiments/hac-316/evidence/preflight.v2.json` | Preflight V2 (immutable once committed) |
| `experiments/hac-316/evidence/toolchain.json` | mechanically captured toolchain (§6 Phase 0) |
| `experiments/hac-316/evidence/pins.json` | green-main SHA + artifact SHA pins |
| `experiments/hac-316/evidence/fixture.json` | canonical fixture digest + partition projection |
| `experiments/hac-316/bin/preflight-v2.mjs` | produces `preflight.v2.json` (mirrors the V1 producer's derive-from-`dist/` discipline) |
| `experiments/hac-316/bin/capture-toolchain.mjs` | produces `toolchain.json` |
| `experiments/hac-316/bin/verify-packet.mjs` | HAC-316 packet verifier |
| `experiments/hac-316/bin/run-arm.mjs` | arm driver (baseline / treatment / perturbation) |
| `experiments/hac-316/bin/teardown.mjs` | disposable-resource teardown + verification |
| `experiments/hac-316/src/partition.mjs` | fixture → two-target projection |
| `experiments/hac-316/src/global-verifier.mjs` | **the harm oracle** |
| `experiments/hac-316/src/routing.mjs` | experiment-local routing surface |
| `experiments/hac-316/src/baseline-issuer.mjs` | composition-unaware issuer |
| `experiments/hac-316/src/timeline.mjs` | experiment-local lifecycle schema |
| `experiments/hac-316/agents/` | ADK agent implementations (A, B) |
| `experiments/hac-316/test/global-verifier.test.mjs` | verifier tests |
| `experiments/hac-316/test/verifier-control.test.mjs` | **packet-failure control** |
| `experiments/hac-316/test/routing.test.mjs` | routing fail-closed tests |
| `experiments/hac-316/test/baseline-issuer.test.mjs` | issuer tests |
| `experiments/hac-316/test/partition.test.mjs` | partition + cross-target rejection |
| `experiments/hac-316/test/timeline.test.mjs` | lifecycle schema tests |
| `docs/receipts/HAC-316-s1-receipt.md` | run receipt |

### 2.2 Modified (bounded)

| Path | Permitted change | Forbidden |
| -- | -- | -- |
| `src/target/state.ts` | **prose comment only**, lines 12-16 | any executable change; extracting `computeNext` |
| `package.json` | add `check:packet:s1` script (and only that) | changing existing scripts |
| `.github/workflows/ci.yml` | add `check:packet:s1` to the gate | weakening any existing gate |

### 2.3 Preserved byte-for-byte (must NOT change)

| Path | Reason |
| -- | -- |
| `experiments/hac-316/evidence/preflight.json` | Preflight V1 — superseded, never rewritten |
| `experiments/hac-316/bin/preflight.mjs` | committed V1 producer |
| `src/**` except the `state.ts` comment | frozen S2 enforcement contract |
| `experiments/hac-330/**` | frozen S-1 evidence |
| `experiments/hac-326/**` | frozen S2 packet |
| `provenance/manifest.json` | provenance boundary |

### 2.4 Indirectly modified (enumerate; expected side effects)

These change as a *consequence* of the work and must be accounted for, not
discovered late:

1. `pnpm-lock.yaml` — **must not change.** No new runtime dependency is
   permitted in this repository. ADK/Python dependencies live in the agent
   environment, captured in `toolchain.json`, never in `package.json`.
2. `vitest.config.ts` — **must not change.** Its include glob is already
   `['test/**/*.test.ts', 'experiments/**/test/*.test.mjs']`
   (`vitest.config.ts:10`, verified), so new `experiments/hac-316/test/*.test.mjs`
   files are collected automatically.
3. Coverage totals reported by `test:coverage` — coverage `include` is
   `['src/**/*.ts']` (`vitest.config.ts:21`, verified), so experiment code does
   not enter coverage. The `state.ts` comment change touches no executable line
   and therefore adds no patch-coverage obligation.
4. Untracked scratch superseded and removed (§6 Phase 8):
   `experiments/hac-316/services/baseline-target.mjs`,
   `experiments/hac-316/services/ingress.mjs`,
   `experiments/hac-316/bin/local-smoke.mjs`.

---

## 3. Exclusion Fence

Hard prohibitions. Each is independently checkable (§6, §7).

| # | DO NOT |
| -- | -- |
| X-01 | **Do not retry Agent Gateway.** No `AGENT_TO_ANYWHERE`, no `CONTENT_AUTHZ`. HAC-325 falsified that topology; re-attempting it is out of scope. |
| X-02 | **Do not change WorkspaceJSON Standard**, or promote any experimental field into it. |
| X-03 | **Do not alter frozen S2 receipt semantics** — unless a *discovered defect* makes HAC-316 impossible, in which case stop and record on the Linear issue before changing anything. |
| X-04 | **Do not manufacture concurrency.** No sleeps in agents, no barrier in the proxy, no artificial target delay, no TTL widening, no cherry-picked undisclosed attempt. |
| X-05 | **Do not hide invalid or model-failure attempts.** Every attempt is retained and reported. |
| X-06 | **Do not implement HAC-317.** No distributed/shared-backend pending store. |
| X-07 | **Do not absorb META-339 quality-tooling work.** No linter, no formatter, no new quality gate beyond `check:packet:s1`. |
| X-08 | **Do not change repository branch topology.** Base is protected `main`; branch is `hac/316-agent-runtime-counterfactual`; PR target is `main`; there is no `dev` branch. |
| X-09 | **Do not vendor ai-swarm templates into Interlock.** The sibling is EXECUTE_READ_ONLY. |
| X-10 | **Do not widen `InterlockProxy` or `src/proxy/http.ts`** to accommodate routing. |
| X-11 | **Do not extract `computeNext`** from `src/target/state.ts`. The documentation correction is prose only. |
| X-12 | **Do not rewrite Preflight V1.** V2 supersedes; it does not replace. |
| X-13 | **Do not introduce 65/65 capacity caps.** Each partition keeps `totalReservable = 130`. |
| X-14 | **Do not create a gamma target**, and do not hardcode `20` or `130` as magic constants. |
| X-15 | **Do not let the routing surface** inspect evidence, decide authorization, alter arguments, mint receipts, or participate in arbitration. |
| X-16 | **Do not let the baseline issuer** read the peer intent, consume coupling evidence, use `PendingIntentStore` for composition, or perform joint arbitration. |
| X-17 | **Do not modify `src/observation/**`.** The lifecycle schema is experiment-local. |
| X-18 | **Do not manufacture `ACCEPTED`.** If it cannot be independently observed, record it as not-emitted. |
| X-19 | **Do not disable local target invariants** to make the global breach reachable. |
| X-20 | **Do not add a runtime dependency** to `package.json` or change `pnpm-lock.yaml`. |

---

## 4. Deferred Items Check

Items deliberately **not** done here, with the reason and the owner. An
implementer who finds themselves doing any of these has left scope.

| Item | Deferred to | Why |
| -- | -- | -- |
| Distributed pending-intent store | HAC-317 | Shared in-process object is sufficient and sound for this experiment (§5.3). |
| Independently observable `ACCEPTED` transition | HAC-317 | The frozen target exposes `EXECUTED`, not a separately observable acceptance boundary (§5.5). |
| Restart recovery | HAC-327 | Not required by the counterfactual. |
| Fleet-scale corpus | HAC-319 | Single coupling suffices. |
| Studio / UI | HAC-320 | No surface required. |
| Lint tooling | META-339 | No linter exists; do not add one. |
| HAC-325 `commands.log`, stale README | recorded debt (§1.4) | Out of scope; no new critical-path issue. |
| Generalising the routing surface into product infrastructure | — | Experiment-local by ruling. |

**Verification that nothing deferred leaked in:** REQ-046, REQ-047, REQ-050.

---

## 5. Architecture Constraints

Every claim in this section was verified against the audit SHA. Citations are
`file:line`.

### 5.1 What makes the two-target projection legal without production change

| Fact | Citation | Consequence |
| -- | -- | -- |
| `ProtectedTargetOptions.initialState` is **optional** | `src/target/service.ts:86` | A partitioned initial state can be injected; zero of 8 `new ProtectedTarget(` call sites pass it, so nothing regresses. |
| `genesisRevision(targetId, state)` folds `targetId` | `src/broker/revision/revision.ts:23-28` | Revisions are per-target by construction. Two targets cannot share a revision even with identical state. |
| Receipt carries `targetId` inside the signed payload | `src/authorization/receipt.ts:179` | Cross-target receipt replay is cryptographically bound, not merely checked. |
| Cross-target receipts are rejected | `src/authorization/receipt.ts:388-393` (`WRONG_TARGET`), fed from `src/target/service.ts:153-157` | A receipt minted for alpha cannot be presented to beta. Must be **measured**, not assumed (REQ-020). |
| `applyMutation` refuses unknown services | `src/target/state.ts:107` (`UNKNOWN_SERVICE`) | The alpha target refuses `beta` outright. Partitioning is enforced, not conventional. |
| `applyMutation` invariant check | `src/target/state.ts:120-126` (`INVARIANT_BREACH`) | On a partitioned single-service state, alpha 40→60 gives total `60 <= 130` → **PASS**. Same for beta. |
| `reservationPath` / `targetsForIntent` are pure functions of `intent.arguments.service` | `src/target/state.ts:47-49`, `src/proxy/http.ts:56-59` | Evidence paths are unaffected by partitioning. The join to co-change evidence survives. |

### 5.2 What makes the shared-store treatment legal without production change

| Fact | Citation | Consequence |
| -- | -- | -- |
| `PendingIntent` carries **no** `targetId` | `src/broker/pairing/store.ts:21-36` | Pending intents are target-agnostic. |
| `findCouplings` reads only `candidate.targets` / `other.targets` | `src/broker/pairing/arbitrate.ts:186-207` | Arbitration is over evidence paths, never over targets. |
| `store` is injectable | `src/proxy/service.ts:103` | One store object can be handed to two proxies. |
| `src/proxy/main.ts:82` constructs one store per process | `src/proxy/main.ts:82` | Production default is unchanged; the experiment composes differently without editing production. |

**Therefore:** two `InterlockProxy` instances sharing **one** `PendingIntentStore`
object arbitrate correctly with **zero production change**. This is the load-bearing
architectural finding of the audit.

### 5.3 Why routing must be experiment-local

| Fact | Citation | Consequence |
| -- | -- | -- |
| `ProxyOptions` binds exactly one `targetId` and one `TargetPort` | `src/proxy/service.ts:101-118` | One proxy cannot serve two targets. |
| Receipt minting uses `this.options.targetId` | `src/proxy/service.ts:207` | Per-proxy binding is structural. |
| `createProxyServer` is nominally typed to `InterlockProxy` | `src/proxy/http.ts:61-62`, `src/proxy/http.ts:268` | A structural stand-in fails with **TS2739**. Do not attempt substitution; do not widen the type (X-10). |

Routing therefore lives in `experiments/hac-316/src/routing.mjs`, dispatching
`service=alpha`→proxy A and `service=beta`→proxy B, and **failing closed**
otherwise.

### 5.4 The perturbation trap — `STALE_BASIS`

**This constraint was discovered during spec pre-flight and is not in the
original audit. It can silently falsify the entire perturbation arm.**

`src/broker/pairing/arbitrate.ts:352-361` enforces:

```
if (basisRevision !== sourceRevision) → DENY, reasonCode = STALE_BASIS
```

The two evidence artifacts carry **different** basis revisions (measured):

| Artifact | `basisRevision` |
| -- | -- |
| `experiments/hac-330/evidence/baseline.evidence.json` | `eb67a6f56b3bf7e71846e7324d21af44565c0b70` |
| `experiments/hac-330/evidence/perturbed.evidence.json` | `db8a63ec9405191bdd40d0ed0fc69684fca5d17b` |

If the perturbation arm swaps the evidence but reuses the baseline
`sourceRevision`, **both intents are DENIED for `STALE_BASIS`**. Superficially
this looks like "Interlock still held" — but it is the *wrong reason*, the
perturbation proves nothing, and Requirement 8 ("the decision must change for
the intended reason") is silently violated.

The perturbation arm **must** set `sourceRevision =
db8a63ec9405191bdd40d0ed0fc69684fca5d17b`. Enforced by REQ-038 and REQ-039.

### 5.5 Decision semantics — the three expected outcomes

Measured pair contents (`src/broker/pairing/arbitrate.ts:108`, `couplingMinSupport = 3`):

| Artifact | alpha↔beta pair | Other pairs |
| -- | -- | -- |
| baseline | **present**, support 8, occurrences 10 | `docs/runbook.md`↔`tests/smoke.test.mjs` (6/6) |
| perturbed | **absent** | alpha↔gamma (4/10), beta↔gamma (4/10), runbook↔smoke (6/6) |

`gamma` is never in flight, so its perturbed pairs cannot couple anything.

| Arm | Decision A | Decision B | Reason code | Executed | Global total |
| -- | -- | -- | -- | -- | -- |
| **baseline** (no Interlock) | n/a | n/a | n/a | both | **140 > 130 — BREACH** |
| **treatment** (baseline evidence) | `ALLOW_SERIALIZED` | `WITHHOLD_SERIALIZE` | `SERIALIZED_PRECEDENCE` / `COUPLING_OBSERVED` | leader only | **120 <= 130 — holds** |
| **perturbation** (perturbed evidence) | `ALLOW_PARALLEL` | `ALLOW_PARALLEL` | `NO_QUALIFYING_COUPLING` | both | **140 > 130 — BREACH** |

Cited: `arbitrate.ts:417` (`COUPLING_OBSERVED`), `:429` (`SERIALIZED_PRECEDENCE`),
`:442` (`NO_QUALIFYING_COUPLING`).

Treatment withholds **before target mutation** — it is serialization, not mutual
refusal (`arbitrate.ts:405-408`).

### 5.6 Lifecycle truth

`src/observation/events.ts:32-49` freezes eight states: `INTENT_RECEIVED`,
`DECIDED`, `RECEIPT_ISSUED`, `TARGET_ACCEPTED`, `MUTATION_EXECUTED`,
`CALLER_ACKNOWLEDGED`, `OBSERVED`, `OBSERVATION_MISMATCH`. `OBSERVED` is
producible **only** by `observe()` (`events.ts:117`); `record()` throws
`UnassertableStateError` for it (`events.ts:90-94`).

The experiment-local schema (`experiments/hac-316/src/timeline.mjs`) uses
`REQUESTED`, `WITHHELD`, `AUTHORIZED`, `ACCEPTED`, `EXECUTED`, `OBSERVED`,
`FAILED`, and emits a state **only when a boundary was directly observed**.

`ACCEPTED` is the honest gap: `src/target/http.ts:89` returns a single response
whose `status` is `EXECUTED` or a 403 — there is no separately observable
acceptance transition. **`ACCEPTED` is therefore recorded as
`unavailable/not-emitted`** and the distinction is preserved for HAC-317 (X-18).

### 5.7 Structural guarantees (record, do not re-derive)

- **TTL widening is structurally impossible.** `pendingTtlMs` exists on
  `ProxyOptions` (`src/proxy/service.ts:118`) but has **no** entry in `ENV`
  (`src/config.ts:16-29`, verified — 13 entries, none for pending TTL) and is
  **not** passed by `src/proxy/main.ts:80-95` (verified). A deployed proxy
  cannot have its pending TTL tuned. Record as a guarantee (REQ-042).
- **`INTERLOCK_ENFORCE_CALLER_IDENTITY`** (`src/config.ts:26`, consumed at
  `src/target/http.ts:86`) must be **identical** across both targets and the
  baseline issuer, or the arms are not comparable (REQ-045).

### 5.8 Verified baseline state at the audit SHA

| Measurement | Value |
| -- | -- |
| `npx tsc --noEmit` | exit 0 |
| Test files | 13 (12 `.test.ts` + `experiments/hac-330/test/decide.test.mjs`) |
| Tests | 295 passed, 295 total, 0 skipped |
| `new ProtectedTarget(` call sites | 8 |
| Lint script | **absent** |

codecov components inherit `patch: target 100%, threshold 0%` from
`codecov.yml:59-66`, with component paths at `:68-98`: `src/receipt.ts` +
`src/authorization/**`, `src/broker/bypass/**`, `src/broker/revision/**`,
`src/broker/pairing/**`, `src/broker/idempotency/**`, `src/observation/**`.
Global patch target 90%, threshold 0% (`codecov.yml:26-36`).

Since no `src/**` executable line changes, no component obligation is triggered
— verified by REQ-021.

**Do not misread a green component.** `codecov.yml:48-58` records that several
component paths are populated by HAC-317 and until then match few or no files; a
green zero-file component is not a discharged obligation. HAC-316 must not treat
component green as evidence of anything, and must not add files under those
paths to manufacture it.

---

## 6. Implementation Phases

Phases are ordered so that **cloud spend happens as late as possible**. Phases
0-6 are entirely local. Cloud resources are created only in Phase 7.

Each REQ carries a bash verification command and its expected output.

> **On REQ numbering.** REQ ids are stable unique identifiers, not an ordering.
> The set REQ-001 … REQ-068 is complete with no gaps; a few higher-numbered
> requirements appear in earlier phases because they were added after the
> initial numbering. Execute by phase, verify by id.

### Phase 0 — Governance, pinning, and Preflight V2 (no cloud spend)

---

**REQ-001 — The exact green `main` SHA is recorded before implementation.**

```sh
cd "$REPO" && node -e '
const p=require("./experiments/hac-316/evidence/pins.json");
const s=p.greenMainSha;
if(typeof s!=="string"||!/^[0-9a-f]{40}$/.test(s)) throw new Error("greenMainSha missing or malformed");
if(typeof p.greenMainVerifiedAt!=="string") throw new Error("greenMainVerifiedAt missing");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-002 — The recorded green `main` SHA is an ancestor of this branch.**

```sh
cd "$REPO" && git merge-base --is-ancestor \
  "$(node -p 'require("./experiments/hac-316/evidence/pins.json").greenMainSha')" HEAD \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-003 — HAC-330 and HAC-326 artifact SHAs are pinned by file digest.**

Pin the **file** digests (measured at the audit SHA), not only the internal
artifact field.

```sh
cd "$REPO" && node -e '
const {createHash}=require("crypto"),{readFileSync}=require("fs");
const p=require("./experiments/hac-316/evidence/pins.json");
const d=(f)=>createHash("sha256").update(readFileSync(f)).digest("hex");
const want={
 "experiments/hac-330/evidence/baseline.evidence.json":"f716297558dfa325e8eef222623af0a461d0879f739cd7d0f7853d7a1ebd6f22",
 "experiments/hac-330/evidence/perturbed.evidence.json":"b6dca507294c46997828f5f36d1018cfb3a72c5dd65b7b6e217ba2aedb3cf02b"};
for(const [f,h] of Object.entries(want)){
  if(d(f)!==h) throw new Error("drift: "+f);
  if(p.artifacts[f]!==h) throw new Error("not pinned: "+f);
}
if(p.artifacts["couplingArtifactSha256"]!=="2c021d0c593aac252c4f7f61d8d6bd03b3bfcccf7a2f647691a1a2b894eb21d6")
  throw new Error("coupling artifact sha not pinned");
if(p.artifacts["couplingProducerSha"]!=="defac1e5dce6fb692a48e775fb44854b371cbca4")
  throw new Error("producer sha not pinned");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-004 — Preflight V1 is byte-identical to its committed form.**

```sh
cd "$REPO" && git diff --quiet "$AUDIT_SHA" -- \
  experiments/hac-316/evidence/preflight.json \
  experiments/hac-316/bin/preflight.mjs \
  && echo PASS || echo FAIL
```
(with `AUDIT_SHA=f44a6b83580c92776231d3507942a7ef6b1b54f4`)

Expected output:
```
PASS
```

---

**REQ-005 — Preflight V2 exists and declares supersession of V1.**

```sh
cd "$REPO" && node -e '
const {createHash}=require("crypto"),{readFileSync}=require("fs");
const v2=require("./experiments/hac-316/evidence/preflight.v2.json");
const need={
 "schema.version":2,
 "supersedes":"experiments/hac-316/evidence/preflight.json",
 "reason":"single-target baseline falsified by local invariant/revision enforcement",
 "discovered_by":"swarm audit",
 "discovered_before_first_agent_runtime_trial":true,
 "discovered_before_cloud_spend":true};
const get=(o,p)=>p.split(".").reduce((a,k)=>a&&a[k],o);
for(const [k,want] of Object.entries(need)){
  const got=get(v2,k);
  if(got!==want) throw new Error(`${k}: expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
}
const actual=createHash("sha256").update(readFileSync(v2.supersedes)).digest("hex");
if(v2.superseded_sha256!==actual) throw new Error("superseded_sha256 does not match V1 on disk");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-006 — V2 enumerates every changed field explicitly (no silent replacement).**

Every field whose value differs from V1 must appear in `v2.changed_fields` as
`{path, v1, v2, why}`. Nothing may differ silently.

```sh
cd "$REPO" && node -e '
const v1=require("./experiments/hac-316/evidence/preflight.json");
const v2=require("./experiments/hac-316/evidence/preflight.v2.json");
const META=new Set(["schema","supersedes","superseded_sha256","reason","discovered_by",
 "discovered_before_first_agent_runtime_trial","discovered_before_cloud_spend",
 "changed_fields","carried_forward"]);
const flat=(o,p="",out={})=>{for(const[k,v] of Object.entries(o||{})){
 const q=p?`${p}.${k}`:k;
 if(v&&typeof v==="object"&&!Array.isArray(v)) flat(v,q,out); else out[q]=JSON.stringify(v);}
 return out;};
const a=flat(v1), b=flat(v2);
const declared=new Set((v2.changed_fields||[]).map(c=>c.path));
const undeclared=[];
for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
  if(META.has(k.split(".")[0])) continue;
  if(a[k]!==b[k] && !declared.has(k)) undeclared.push(k);
}
for(const c of v2.changed_fields||[]){
  if(!("v1" in c)||!("v2" in c)||!c.why) throw new Error("incomplete changed_fields entry: "+c.path);
}
if(undeclared.length) throw new Error("undeclared changes:\n  "+undeclared.join("\n  "));
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-007 — V2 carries forward the unchanged discipline fields verbatim.**

```sh
cd "$REPO" && node -e '
const v2=require("./experiments/hac-316/evidence/preflight.v2.json");
const c=v2.carried_forward;
const checks={
 "max_attempts":3,
 "artificial_delay_allowed":false,
 "barrier_allowed":false,
 "ttl_tuning_after_first_run":false,
 "hidden_retry_allowed":false,
 "same_intent_required":true,
 "evidence_perturbation_required":true,
 "independent_observation_required":true};
for(const [k,want] of Object.entries(checks)){
  if(c[k]!==want) throw new Error(`carried_forward.${k}: expected ${want} got ${JSON.stringify(c[k])}`);
}
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-008 — Toolchain values are mechanically captured, not asserted.**

`capture-toolchain.mjs` must invoke the real tools and record stdout verbatim.
Hand-written values are a FAIL.

```sh
cd "$REPO" && node -e '
const t=require("./experiments/hac-316/evidence/toolchain.json");
for(const k of ["python","google-adk","mcp","vertexai","node"]){
  const e=t.captured[k];
  if(!e) throw new Error("missing capture: "+k);
  if(typeof e.command!=="string"||!e.command.length) throw new Error("no command for "+k);
  if(typeof e.stdout!=="string"||!e.stdout.length) throw new Error("no captured stdout for "+k);
  if(e.method!=="executed") throw new Error(k+" is not mechanically captured (method="+e.method+")");
}
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-009 — The ADK import path actually used by the agents is captured, not
promoted from prior prose.**

V1's note about `google.adk.tools.mcp_tool.mcp_toolset` is **prose**, not
evidence. It may not be promoted unless reproduced.

```sh
cd "$REPO" && node -e '
const t=require("./experiments/hac-316/evidence/toolchain.json");
const i=t.adkImport;
if(!i||i.method!=="executed") throw new Error("adkImport not mechanically captured");
if(typeof i.modulePath!=="string"||!i.modulePath.length) throw new Error("no modulePath");
if(typeof i.resolvedFile!=="string"||!i.resolvedFile.length) throw new Error("no resolvedFile");
console.log("PASS");'
```

Expected output:
```
PASS
```

Cross-check that the captured path is the one the agents import:

```sh
cd "$REPO" && test "$(grep -rhoE 'google\.adk\.tools\.mcp_tool[.a-zA-Z_]*' experiments/hac-316/agents | sort -u | wc -l | tr -d ' ')" = "1" \
  && grep -rq "$(node -p 'require("./experiments/hac-316/evidence/toolchain.json").adkImport.modulePath')" experiments/hac-316/agents \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-067 — Preflight V2 is machine-generated from `dist/`, with no hand-typed
derivable value.**

V1's producer (`experiments/hac-316/bin/preflight.mjs:29-43`) dynamically imports
the compiled modules and derives every digest, revision, and intent digest rather
than typing them. V2's producer must hold that line — a hand-typed digest is a
digest nobody checked.

```sh
cd "$REPO" && grep -qE "dist/authorization/canonical\.js" experiments/hac-316/bin/preflight-v2.mjs \
  && grep -qE "dist/target/state\.js" experiments/hac-316/bin/preflight-v2.mjs \
  && test -z "$(grep -nE '\"sha256:[0-9a-f]{64}\"' experiments/hac-316/bin/preflight-v2.mjs)" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

Regenerating V2 must be a no-op (it is immutable once committed):

```sh
cd "$REPO" && cp experiments/hac-316/evidence/preflight.v2.json /tmp/hac316-v2.bak && \
  node experiments/hac-316/bin/preflight-v2.mjs >/dev/null 2>&1 && \
  diff -q /tmp/hac316-v2.bak experiments/hac-316/evidence/preflight.v2.json >/dev/null \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-010 — The canonical fixture is unchanged and its digest is recorded
before either arm executes.**

```sh
cd "$REPO" && node -e '
const {createHash}=require("crypto");
const s=require("./dist/target/state.js");
const canon=(v)=>JSON.stringify(v,Object.keys(v).sort());
const st=s.INITIAL_STATE;
if(st.totalReservable!==130) throw new Error("totalReservable changed");
if(st.services.alpha!==40||st.services.beta!==40||st.services.gamma!==20)
  throw new Error("fixture services changed");
const d="sha256:"+createHash("sha256").update(JSON.stringify(s.asCanonical(st))).digest("hex");
const f=require("./experiments/hac-316/evidence/fixture.json");
if(f.canonicalFixtureDigest!==d) throw new Error(`digest drift: recorded ${f.canonicalFixtureDigest} actual ${d}`);
if(f.recordedBeforeArms!==true) throw new Error("fixture digest not declared pre-arm");
console.log("PASS");'
```

Expected output:
```
PASS
```
(Run `pnpm run build` first.)

---

**REQ-011 — The two-target deployment is declared a projection, not a
replacement fixture.**

```sh
cd "$REPO" && node -e '
const f=require("./experiments/hac-316/evidence/fixture.json");
if(f.projection!==true) throw new Error("not declared a projection");
if(f.replacesCanonicalFixture!==false) throw new Error("must not replace the canonical fixture");
const p=f.partitions;
if(Object.keys(p).sort().join(",")!=="alpha,beta") throw new Error("partitions must be exactly alpha,beta");
for(const k of ["alpha","beta"]){
  if(p[k].totalReservable!==130) throw new Error(k+" must keep totalReservable 130");
  if(Object.keys(p[k].services).join(",")!==k) throw new Error(k+" must hold only its own service");
  if(p[k].services[k]!==40) throw new Error(k+" must start at 40");
}
if(f.gammaTargetExists!==false) throw new Error("gamma must not be a target");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-012 — No 65/65 cap appears anywhere in the experiment.**

```sh
cd "$REPO" && test -z "$(grep -rnE '\b65\b' experiments/hac-316/src experiments/hac-316/bin experiments/hac-316/evidence 2>/dev/null)" \
  && echo PASS || { echo FAIL; grep -rnE '\b65\b' experiments/hac-316/src experiments/hac-316/bin experiments/hac-316/evidence; }
```

Expected output:
```
PASS
```

---

### Phase 1 — Documentation correction (standalone, no cloud spend)

**This phase is a separate commit containing no executable change.**

---

**REQ-013 — The inaccurate `state.ts` prose is corrected.**

The current text at `src/target/state.ts:13-14` reads "It is not the enforcement
mechanism." — inaccurate, because `applyMutation` **is** the local target
integrity enforcement mechanism (`src/target/state.ts:120-126`). The correction
must distinguish *local target integrity enforcement* from the
*cross-resource/global composition invariant*.

WRONG (current, `src/target/state.ts:13-14`):
```
 * truth* for whether harm occurred. It is not the enforcement mechanism. A real
 * protected system usually cannot detect the harm locally at all; this fixture
```

RIGHT (required shape — must distinguish the two enforcement scopes):
```
 * truth* for whether harm occurred. It enforces *local* target integrity — a
 * single target refusing a mutation that would breach its own pool — but it is
 * not, and cannot be, the cross-resource composition invariant: no single
 * target observes the joint state that two uncoordinated writers produce.
```

```sh
cd "$REPO" && grep -q "It is not the enforcement mechanism" src/target/state.ts && echo FAIL || \
  { grep -qE "local[^.]*target integrity" src/target/state.ts && \
    grep -qE "composition invariant" src/target/state.ts && echo PASS || echo FAIL; }
```

Expected output:
```
PASS
```

---

**REQ-014 — The documentation correction changes no executable line.**

```sh
cd "$REPO" && pnpm run build >/dev/null 2>&1 && \
  git stash -q && pnpm run build >/dev/null 2>&1 && \
  shasum -a 256 dist/target/state.js | cut -d' ' -f1 > /tmp/hac316-before.txt && \
  git stash pop -q && pnpm run build >/dev/null 2>&1 && \
  shasum -a 256 dist/target/state.js | cut -d' ' -f1 > /tmp/hac316-after.txt && \
  diff -q /tmp/hac316-before.txt /tmp/hac316-after.txt >/dev/null && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-015 — `computeNext` was not extracted (X-11).**

```sh
cd "$REPO" && test -z "$(grep -rn 'computeNext' src/)" && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

### Phase 2 — Partitioned targets and the global verifier (local)

---

**REQ-016 — Each partition is an unchanged `ProtectedTarget` with
`totalReservable = 130` and exactly one service.**

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/partition.test.mjs 2>&1 | tail -3
```

Expected output (final line):
```
  Tests  <N> passed (<N>)
```
with zero failures. The suite must assert, per partition: `totalReservable === 130`,
exactly one service key, and initial value 40.

---

**REQ-017 — Local proofs: alpha 40→60 PASSES and beta 40→60 PASSES on their own
targets.**

```sh
cd "$REPO" && node -e '
const {applyMutation}=require("./dist/target/state.js");
const a={totalReservable:130,services:{alpha:40}};
const b={totalReservable:130,services:{beta:40}};
const ra=applyMutation(a,{service:"alpha",reserved:60});
const rb=applyMutation(b,{service:"beta",reserved:60});
if(!ra.ok) throw new Error("alpha 40->60 refused: "+ra.reasonCode);
if(!rb.ok) throw new Error("beta 40->60 refused: "+rb.reasonCode);
if(ra.invariant.total!==60||rb.invariant.total!==60) throw new Error("unexpected partition totals");
console.log("PASS alpha=60 beta=60");'
```

Expected output:
```
PASS alpha=60 beta=60
```

---

**REQ-018 — Partitioning is enforced: the alpha target refuses `beta`.**

```sh
cd "$REPO" && node -e '
const {applyMutation}=require("./dist/target/state.js");
const r=applyMutation({totalReservable:130,services:{alpha:40}},{service:"beta",reserved:60});
if(r.ok) throw new Error("alpha target accepted a beta mutation");
if(r.reasonCode!=="UNKNOWN_SERVICE") throw new Error("wrong reason: "+r.reasonCode);
console.log("PASS UNKNOWN_SERVICE");'
```

Expected output:
```
PASS UNKNOWN_SERVICE
```

---

**REQ-019 — The two targets have independent `targetId`s and therefore
independent genesis revisions.**

```sh
cd "$REPO" && node -e '
const {genesisRevision}=require("./dist/broker/revision/revision.js");
const {asCanonical}=require("./dist/target/state.js");
const f=require("./experiments/hac-316/evidence/fixture.json");
const ids=f.targetIds;
if(ids.alpha===ids.beta) throw new Error("targetIds must differ");
const ra=genesisRevision(ids.alpha,asCanonical(f.partitions.alpha));
const rb=genesisRevision(ids.beta,asCanonical(f.partitions.beta));
if(ra===rb) throw new Error("genesis revisions collided");
console.log("PASS distinct");'
```

Expected output:
```
PASS distinct
```

---

**REQ-020 — Cross-target receipt rejection is measured, not assumed.**

A receipt minted for the alpha target, presented to the beta target, must be
rejected with `WRONG_TARGET` (`src/authorization/receipt.ts:388-393`).

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/partition.test.mjs -t "cross-target" 2>&1 \
  | grep -qE "Tests +[1-9][0-9]* passed" && \
  grep -q "WRONG_TARGET" experiments/hac-316/test/partition.test.mjs && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-021 — `src/**` carries no executable change (frozen contract intact).**

```sh
cd "$REPO" && test -z "$(git diff --name-only "$AUDIT_SHA" -- src/ | grep -v '^src/target/state.ts$')" \
  && npx tsc --noEmit && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2
```

Expected output:
```
 Test Files  13 passed (13)
      Tests  295 passed (295)
```
(Experiment tests are additive; the 13/295 figures are the frozen-suite floor.
The final gate in §7 permits a strictly larger total, never a smaller one, and
never a failure.)

---

**REQ-022 — The global verifier derives `gamma` and `cap` from `INITIAL_STATE`;
no magic constants.**

```sh
cd "$REPO" && test -z "$(grep -nE '(^|[^0-9])(20|130)([^0-9]|$)' experiments/hac-316/src/global-verifier.mjs)" \
  && grep -q "INITIAL_STATE" experiments/hac-316/src/global-verifier.mjs \
  && echo PASS || { echo FAIL; grep -nE '(^|[^0-9])(20|130)([^0-9]|$)' experiments/hac-316/src/global-verifier.mjs; }
```

Expected output:
```
PASS
```

---

**REQ-023 — The global verifier mechanically proves the four composition facts.**

It must independently reread the alpha and beta targets and combine with the
immutable `gamma`.

```sh
cd "$REPO" && node experiments/hac-316/bin/verify-packet.mjs --selfcheck-composition
```

Expected output:
```
initial  100 <= 130  HOLDS
A only   120 <= 130  HOLDS
B only   120 <= 130  HOLDS
A and B  140 >  130  BREACH
PASS
```

---

**REQ-024 — The global verifier is the harm oracle: it rereads targets rather
than trusting reported state.**

```sh
cd "$REPO" && grep -qE 'reread|independentRead|fetchTargetState' experiments/hac-316/src/global-verifier.mjs \
  && test -z "$(grep -nE 'callerAck|acknowledg|reportedState|responseBody\.state' experiments/hac-316/src/global-verifier.mjs)" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-025 — The global verifier has its own tests.**

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/global-verifier.test.mjs 2>&1 \
  | grep -E "Tests " | tail -1
```

Expected output: a line of the form `Tests  <N> passed (<N>)` with `N >= 4`
(one per composition fact), zero failures.

---

**REQ-026 — A broken verifier cannot produce a green experiment
(packet-failure control).**

The control mutates the verifier (e.g. inverts the comparison / stubs the
reread) and asserts the packet check **fails**. If the control passes with a
broken verifier, the verifier is not load-bearing.

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/verifier-control.test.mjs 2>&1 \
  | grep -E "Tests " | tail -1
```

Expected output: `Tests  <N> passed (<N>)`, `N >= 2`, zero failures — where each
test asserts that a deliberately broken verifier yields a **non-zero** packet
exit code.

Independent spot-check of the same property:

```sh
cd "$REPO" && HAC316_FAULT_INJECT=invert-composition node experiments/hac-316/bin/verify-packet.mjs >/dev/null 2>&1; \
  test $? -ne 0 && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-066 — The packet verifier re-derives decisions; it does not merely read
back what the run recorded.**

A verifier that only compares recorded fields to recorded fields is circular and
cannot falsify anything. `experiments/hac-330/bin/verify-packet.mjs:22,136-164`
sets the precedent: it imports the real decision function and **re-derives** both
arms' decisions, then compares to what was recorded.

`experiments/hac-316/bin/verify-packet.mjs` must do the same — import the real
`arbitrate`/`decide` path from `dist/` and re-derive every recorded decision.

```sh
cd "$REPO" && grep -qE "from '.*dist/broker/pairing/arbitrate\.js'|require\(.*dist/broker/pairing/arbitrate\.js" \
    experiments/hac-316/bin/verify-packet.mjs \
  && grep -qE 'rederive|reDerive|recomputed' experiments/hac-316/bin/verify-packet.mjs \
  && node experiments/hac-316/bin/verify-packet.mjs --rederive-only 2>&1 | tail -1
```

Expected output:
```
rederived 2/2 treatment + 2/2 perturbation decisions match recorded  PASS
```

Control — a tampered recorded decision must be caught:

```sh
cd "$REPO" && HAC316_FAULT_INJECT=tamper-recorded-decision \
  node experiments/hac-316/bin/verify-packet.mjs --rederive-only >/dev/null 2>&1; \
  test $? -ne 0 && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-027 — Local target invariants remain enabled (defense in depth, X-19).**

```sh
cd "$REPO" && test -z "$(grep -rniE 'disable[_ -]?invariant|skipInvariant|INVARIANT_DISABLED|bypassInvariant' experiments/hac-316/)" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

### Phase 3 — Treatment routing surface (local)

---

**REQ-028 — Two `InterlockProxy` instances in one process share exactly one
`PendingIntentStore` object.**

Object identity, not structural equality.

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/routing.test.mjs -t "shared store identity" 2>&1 \
  | grep -qE "Tests +[1-9][0-9]* passed" && \
  grep -qE 'toBe\(.*store.*\)|===\s*store' experiments/hac-316/test/routing.test.mjs && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

The deployment code must construct exactly one store:

```sh
cd "$REPO" && test "$(grep -c 'new InMemoryPendingIntentStore(' experiments/hac-316/src/routing.mjs)" = "1" \
  && test "$(grep -c 'new InterlockProxy(' experiments/hac-316/src/routing.mjs)" = "2" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-029 — Routing dispatches alpha→A, beta→B, and fails closed otherwise.**

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/routing.test.mjs 2>&1 | grep -E "Tests " | tail -1
```

Expected output: `Tests  <N> passed (<N>)`, `N >= 5`, zero failures. The suite
must cover: `service=alpha`→A, `service=beta`→B, unknown service→closed,
missing `service`→closed, non-string `service`→closed.

Fail-closed must be the default branch, not an allow-list gap:

```sh
cd "$REPO" && grep -qE "DENY|fail-closed|failClosed" experiments/hac-316/src/routing.mjs \
  && test -z "$(grep -nE 'return\s+(null|undefined)\s*;?\s*//?\s*(pass|allow)' experiments/hac-316/src/routing.mjs)" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-030 — Routing does not inspect evidence, decide, alter arguments, mint
receipts, or arbitrate (X-15).**

```sh
cd "$REPO" && test -z "$(grep -nE 'evidence|arbitrate|decide|signReceipt|mintReceipt|Decision\.|reasonCode|arguments\s*=' experiments/hac-316/src/routing.mjs)" \
  && echo PASS || { echo FAIL; grep -nE 'evidence|arbitrate|decide|signReceipt|mintReceipt|Decision\.|reasonCode|arguments\s*=' experiments/hac-316/src/routing.mjs; }
```

Expected output:
```
PASS
```

---

**REQ-031 — `InterlockProxy` and `src/proxy/http.ts` were not widened (X-10).**

```sh
cd "$REPO" && git diff --quiet "$AUDIT_SHA" -- src/proxy/ && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-032 — The separate-store configuration exists only as a negative control,
never as the treatment deployment.**

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/routing.test.mjs -t "separate store" 2>&1 \
  | grep -qE "Tests +[1-9][0-9]* passed" && \
  node -e '
const r=require("./experiments/hac-316/evidence/arms.json");
if(r.treatment.storeTopology!=="shared-object") throw new Error("treatment must be shared-object");
if(r.negativeControl.storeTopology!=="separate-objects") throw new Error("control must be separate-objects");
if(r.negativeControl.countsAsTreatment!==false) throw new Error("control must not count as treatment");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-033 — No distributed store was introduced (X-06, HAC-317 boundary).**

```sh
cd "$REPO" && test -z "$(grep -rniE 'redis|firestore|memorystore|spanner|datastore|distributed[_ -]?store' experiments/hac-316/src experiments/hac-316/bin)" \
  && git diff --quiet "$AUDIT_SHA" -- pnpm-lock.yaml && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

### Phase 4 — Baseline: the composition-unaware issuer (local)

---

**REQ-034 — The baseline is a composition-unaware issuer, not an unsafe target.**

It validates each action independently, reads the appropriate target revision,
issues the frozen S2 receipt shape, preserves target/intent/revision/caller
binding, and uses the same cryptographic machinery
(`signReceipt` `src/authorization/receipt.ts:193`,
`RECEIPT_VERSION` `:43`, `signingKeyFromPem` `:430`,
`intentDigest` `src/authorization/intent.ts:33`).

```sh
cd "$REPO" && for s in signReceipt RECEIPT_VERSION signingKeyFromPem intentDigest; do \
  grep -q "$s" experiments/hac-316/src/baseline-issuer.mjs || { echo "FAIL missing $s"; exit 1; }; done; \
  echo PASS
```

Expected output:
```
PASS
```

---

**REQ-035 — The baseline issuer performs no composition reasoning (X-16).**

```sh
cd "$REPO" && test -z "$(grep -nE 'PendingIntentStore|arbitrate|findCouplings|coupling|peerIntent|otherIntent|evidence' experiments/hac-316/src/baseline-issuer.mjs)" \
  && echo PASS || { echo FAIL; grep -nE 'PendingIntentStore|arbitrate|findCouplings|coupling|peerIntent|otherIntent|evidence' experiments/hac-316/src/baseline-issuer.mjs; }
```

Expected output:
```
PASS
```

---

**REQ-036 — Both unchanged protected targets execute in the baseline arm.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const b=r.arms.baseline;
if(b.executed.length!==2) throw new Error("expected 2 executions, got "+b.executed.length);
for(const e of b.executed){ if(e.status!=="EXECUTED") throw new Error("non-EXECUTED: "+e.status); }
if(b.targetsUnchanged!==true) throw new Error("baseline targets must be unchanged ProtectedTarget instances");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-037 — The baseline arm reaches the invalid composed state.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const g=r.arms.baseline.globalVerification;
if(g.source!=="independent-reread") throw new Error("must be an independent reread");
if(g.total!==140) throw new Error("expected 140, got "+g.total);
if(g.cap!==130) throw new Error("expected cap 130, got "+g.cap);
if(g.holds!==false) throw new Error("baseline must BREACH");
console.log("PASS baseline 140 > 130 BREACH");'
```

Expected output:
```
PASS baseline 140 > 130 BREACH
```

---

**REQ-038 — Baseline and treatment initial-state digests match.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const f=require("./experiments/hac-316/evidence/fixture.json");
const b=r.arms.baseline.initialStateDigest, t=r.arms.treatment.initialStateDigest;
if(b!==t) throw new Error(`digest mismatch: baseline ${b} treatment ${t}`);
if(b!==f.canonicalFixtureDigest) throw new Error("arms do not match the canonical fixture digest");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-039 — `INTERLOCK_ENFORCE_CALLER_IDENTITY` is identical across both targets
and the baseline issuer.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const v=r.enforceCallerIdentity;
const seen=new Set([v.targetAlpha,v.targetBeta,v.baselineIssuer]);
if(seen.size!==1) throw new Error("divergent INTERLOCK_ENFORCE_CALLER_IDENTITY: "+JSON.stringify(v));
if(typeof v.targetAlpha!=="string") throw new Error("value not recorded as an observed string");
console.log("PASS uniform="+v.targetAlpha);'
```

Expected output:
```
PASS uniform=<value>
```
with a single literal value across all three.

---

### Phase 5 — Experiment-local lifecycle schema (local)

---

**REQ-040 — `src/observation/**` is unmodified (X-17).**

```sh
cd "$REPO" && git diff --quiet "$AUDIT_SHA" -- src/observation/ && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-041 — The experiment-local schema defines exactly the seven declared
states, and emits only observed boundaries.**

```sh
cd "$REPO" && node -e '
const t=require("./experiments/hac-316/src/timeline.mjs");
const want=["REQUESTED","WITHHELD","AUTHORIZED","ACCEPTED","EXECUTED","OBSERVED","FAILED"].sort();
const got=Object.keys(t.ExperimentState).sort();
if(JSON.stringify(got)!==JSON.stringify(want)) throw new Error("state set mismatch: "+got.join(","));
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-042 — `ACCEPTED` is not manufactured (X-18).**

The frozen target exposes `EXECUTED` (`src/target/http.ts:89`), not a separately
observable acceptance transition. `ACCEPTED` must be recorded as unavailable.

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const a=r.lifecycle.acceptedAvailability;
if(a.emitted!==false) throw new Error("ACCEPTED must not be emitted");
if(a.status!=="unavailable") throw new Error("ACCEPTED status must be unavailable, got "+a.status);
if(!a.deferredTo||!/HAC-317/.test(a.deferredTo)) throw new Error("must preserve the distinction for HAC-317");
const states=new Set(r.lifecycle.events.map(e=>e.state));
if(states.has("ACCEPTED")) throw new Error("an ACCEPTED event was emitted anyway");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-043 — An acknowledgement can never satisfy `OBSERVED`.**

```sh
cd "$REPO" && npx vitest run experiments/hac-316/test/timeline.test.mjs -t "acknowledgement cannot satisfy OBSERVED" 2>&1 \
  | grep -qE "Tests +[1-9][0-9]* passed" && \
  node -e '
const r=require("./experiments/hac-316/evidence/results.json");
for(const e of r.lifecycle.events.filter(e=>e.state==="OBSERVED")){
  if(e.producedBy!=="independent-reread") throw new Error("OBSERVED not produced by an independent reread");
}
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-044 — An independent reread establishes the final state of every arm.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
for(const [name,arm] of Object.entries(r.arms)){
  const g=arm.globalVerification;
  if(!g||g.source!=="independent-reread") throw new Error(name+": final state not independently reread");
  if(typeof g.total!=="number"||typeof g.cap!=="number") throw new Error(name+": non-numeric verification");
}
console.log("PASS");'
```

Expected output:
```
PASS
```

---

### Phase 6 — Full local dry run (still no cloud spend)

**Gate: Phase 7 may not begin until every REQ above passes.**

---

**REQ-045 — Normalized A intents match across baseline, treatment, and the
pre-declared expectation.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const v1=require("./experiments/hac-316/evidence/preflight.json");
const exp=v1.expectedIntents.A.intentDigest;
const b=r.arms.baseline.intents.A.digest, t=r.arms.treatment.intents.A.digest;
if(b!==exp||t!==exp) throw new Error(`A digest mismatch: expected ${exp} baseline ${b} treatment ${t}`);
console.log("PASS A "+exp);'
```

Expected output:
```
PASS A sha256:c5064be737d5990a03ba1f3c58917ed0970a5fd0cd153afd2431f1739b7d8bb2
```

---

**REQ-046 — Normalized B intents match across baseline, treatment, and the
pre-declared expectation.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const v1=require("./experiments/hac-316/evidence/preflight.json");
const exp=v1.expectedIntents.B.intentDigest;
const b=r.arms.baseline.intents.B.digest, t=r.arms.treatment.intents.B.digest;
if(b!==exp||t!==exp) throw new Error(`B digest mismatch: expected ${exp} baseline ${b} treatment ${t}`);
console.log("PASS B "+exp);'
```

Expected output:
```
PASS B sha256:f2d7e96f5d60474429ec6e263127a7ebc181f6e639d1c7695b5077342ee1711f
```

---

**REQ-047 — The perturbation arm pins `sourceRevision` to the perturbed
evidence basis (§5.4 `STALE_BASIS` trap).**

```sh
cd "$REPO" && node -e '
const {readFileSync}=require("fs");
const arms=require("./experiments/hac-316/evidence/arms.json");
const basis=(f)=>JSON.parse(readFileSync(f,"utf8")).selection.scoringBasis.basisRevision;
const pairs=[["treatment","experiments/hac-330/evidence/baseline.evidence.json"],
             ["perturbation","experiments/hac-330/evidence/perturbed.evidence.json"]];
for(const [arm,f] of pairs){
  if(arms[arm].evidencePath!==f) throw new Error(arm+" uses the wrong evidence artifact");
  const b=basis(f);
  if(arms[arm].sourceRevision!==b)
    throw new Error(`${arm}: sourceRevision ${arms[arm].sourceRevision} != evidence basis ${b} -> would DENY with STALE_BASIS`);
}
if(arms.treatment.sourceRevision===arms.perturbation.sourceRevision)
  throw new Error("the two arms must not share a sourceRevision");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-048 — The counterfactual reproduces locally, end to end, with no cloud
resource involved.**

```sh
cd "$REPO" && HAC316_MODE=local node experiments/hac-316/bin/run-arm.mjs --all --no-cloud 2>&1 | tail -5
```

Expected output:
```
baseline      executed=2  total=140  cap=130  BREACH
treatment     executed=1  total=120  cap=130  HOLDS
perturbation  executed=2  total=140  cap=130  BREACH
cloud-resources-created=0
PASS
```

---

### Phase 7 — Agent Runtime execution (**CLOUD SPEND BEGINS HERE**)

Do not enter this phase until Phases 0-6 are green.

---

**REQ-049 — Maximum concurrency attempts is 3.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const n=r.concurrency.attempts.length;
if(n>3) throw new Error("more than 3 attempts: "+n);
if(r.concurrency.maxAttempts!==3) throw new Error("declared maximum is not 3");
console.log("PASS attempts="+n);'
```

Expected output:
```
PASS attempts=<n>
```
with `n <= 3`.

---

**REQ-050 — Every attempt is retained and reported, valid or not (X-05).**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const a=r.concurrency.attempts;
if(!a.length) throw new Error("no attempts recorded");
a.forEach((x,i)=>{
  if(x.index!==i+1) throw new Error("attempt indices are not contiguous from 1");
  if(!x.outcome) throw new Error("attempt "+x.index+" has no outcome");
  if(x.retained!==true) throw new Error("attempt "+x.index+" not retained");
});
if(r.concurrency.discardedAttempts!==0) throw new Error("attempts were discarded");
console.log("PASS retained="+a.length);'
```

Expected output:
```
PASS retained=<n>
```
matching REQ-049's `n`.

---

**REQ-051 — No artificial delay, barrier, or TTL tuning (X-04).**

```sh
cd "$REPO" && test -z "$(grep -rniE 'sleep\(|setTimeout\([^)]*[0-9]{3,}|barrier|await delay|time\.sleep' experiments/hac-316/agents experiments/hac-316/src)" \
  && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const f=r.forbiddenTechniques;
for(const k of ["artificialDelay","barrier","ttlTuning","hiddenRetry","cherryPickedAttempt"]){
  if(f[k]!==false) throw new Error(k+" was used or not declared false");
}
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-052 — TTL widening is recorded as structurally impossible.**

```sh
cd "$REPO" && test -z "$(grep -n 'PENDING_TTL' src/config.ts)" \
  && test -z "$(grep -n 'pendingTtlMs' src/proxy/main.ts)" \
  && node -e '
const v2=require("./experiments/hac-316/evidence/preflight.v2.json");
const g=v2.guarantees.ttlWideningImpossible;
if(g.holds!==true) throw new Error("guarantee not recorded");
if(!/config\.ts/.test(g.evidence)||!/proxy\/main\.ts/.test(g.evidence)) throw new Error("guarantee lacks both citations");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-053 — Server-side overlap is measured mechanically, never inferred from
client launch time.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const o=r.concurrency.runtimeOverlap;
if(o.measuredAt!=="server") throw new Error("overlap must be measured server-side, got "+o.measuredAt);
if(o.usesClientLaunchTime!==false) throw new Error("client launch time must not be used");
if(typeof o.startA!=="number"||typeof o.endA!=="number"||typeof o.startB!=="number"||typeof o.endB!=="number")
  throw new Error("overlap timestamps missing");
const overlapped=Math.max(o.startA,o.startB) < Math.min(o.endA,o.endB);
if(o.overlapped!==overlapped) throw new Error("recorded overlap disagrees with the recorded timestamps");
console.log("PASS overlapped="+overlapped);'
```

Expected output:
```
PASS overlapped=true
```

---

**REQ-054 — Both relevant pending intents precede the first protected commit.**

Evidenced mechanically: the withheld intent's rationale cites the other
intent's correlation id with `reasonCode = COUPLING_OBSERVED`
(`src/broker/pairing/arbitrate.ts:417`).

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const t=r.arms.treatment;
const w=t.decisions.find(d=>d.decision==="WITHHOLD_SERIALIZE");
if(!w) throw new Error("no WITHHOLD_SERIALIZE decision in the treatment arm");
if(w.reasonCode!=="COUPLING_OBSERVED") throw new Error("wrong reason: "+w.reasonCode);
const peer=t.decisions.find(d=>d.correlationId!==w.correlationId);
if(!w.couplings.some(c=>c.correlationIds.includes(peer.correlationId)))
  throw new Error("withheld rationale does not cite the peer correlation id");
if(!(new Date(w.decidedAt) < new Date(t.firstProtectedCommitAt)))
  throw new Error("withhold did not precede the first protected commit");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-055 — The treatment arm prevents the invalid composed state.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const t=r.arms.treatment;
if(t.executed.length!==1) throw new Error("expected exactly 1 execution, got "+t.executed.length);
const g=t.globalVerification;
if(g.source!=="independent-reread") throw new Error("must be an independent reread");
if(g.total!==120||g.cap!==130||g.holds!==true) throw new Error(`expected 120<=130 HOLDS, got ${g.total}/${g.cap}/${g.holds}`);
if(t.withheldBeforeTargetMutation!==true) throw new Error("the conflicting operation was not withheld before target mutation");
console.log("PASS treatment 120 <= 130 HOLDS");'
```

Expected output:
```
PASS treatment 120 <= 130 HOLDS
```

---

**REQ-056 — Perturbing the load-bearing evidence changes the decision **for the
intended reason**.**

Deployment and implementation are identical to treatment; only the evidence
artifact (and its matching `sourceRevision`, REQ-047) changes.

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const p=r.arms.perturbation, t=r.arms.treatment;
if(p.deploymentDigest!==t.deploymentDigest) throw new Error("deployment differed between treatment and perturbation");
if(p.implementationDigest!==t.implementationDigest) throw new Error("implementation differed");
for(const d of p.decisions){
  if(d.reasonCode==="STALE_BASIS") throw new Error("STALE_BASIS: perturbation denied for the WRONG reason (see SPEC 5.4)");
  if(d.reasonCode!=="NO_QUALIFYING_COUPLING") throw new Error("unexpected reason: "+d.reasonCode);
  if(d.decision!=="ALLOW_PARALLEL") throw new Error("unexpected decision: "+d.decision);
}
if(p.decisions.length!==2) throw new Error("expected 2 decisions");
console.log("PASS NO_QUALIFYING_COUPLING x2");'
```

Expected output:
```
PASS NO_QUALIFYING_COUPLING x2
```

---

**REQ-057 — With the coupling removed, both execute and the global verifier
exposes the breach.**

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const p=r.arms.perturbation;
if(p.executed.length!==2) throw new Error("expected both to execute, got "+p.executed.length);
const g=p.globalVerification;
if(g.source!=="independent-reread") throw new Error("must be an independent reread");
if(g.total!==140||g.cap!==130||g.holds!==false) throw new Error(`expected 140>130 BREACH, got ${g.total}/${g.cap}/${g.holds}`);
console.log("PASS perturbation 140 > 130 BREACH");'
```

Expected output:
```
PASS perturbation 140 > 130 BREACH
```

---

**REQ-058 — Agent Gateway was not retried (X-01).**

```sh
cd "$REPO" && test -z "$(grep -rniE 'AGENT_TO_ANYWHERE|CONTENT_AUTHZ|agent[_ -]?gateway' experiments/hac-316/ --include='*.mjs' --include='*.json' --include='*.py' --include='*.yaml')" \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

### Phase 8 — Teardown, hygiene, and packet

---

**REQ-059 — Disposable Google resources are removed, verified by rereading the
cloud, not by trusting the delete call.**

```sh
cd "$REPO" && node experiments/hac-316/bin/teardown.mjs --verify 2>&1 | tail -3
```

Expected output:
```
agent-runtime-resources-remaining=0
disposable-project-state=DELETED
PASS
```

And recorded:

```sh
cd "$REPO" && node -e '
const r=require("./experiments/hac-316/evidence/results.json");
const t=r.teardown;
if(t.verifiedBy!=="independent-reread") throw new Error("teardown not independently verified");
if(t.remainingResources!==0) throw new Error("resources remain: "+t.remainingResources);
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-060 — Superseded scratch files are gone.**

```sh
cd "$REPO" && test ! -e experiments/hac-316/services/baseline-target.mjs \
  && test ! -e experiments/hac-316/services/ingress.mjs \
  && test ! -e experiments/hac-316/bin/local-smoke.mjs \
  && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-061 — Out-of-scope items are recorded as debt, with no new active
critical-path issue.**

`DEBT.md` must record the **root cause**, not just the symptom, for each item:

| Item | Required content |
| -- | -- |
| HAC-325 `commands.log` | absent because `.gitignore:24` carries a blanket `*.log`; the file *is* produced at runtime (`experiments/hac-325/bin/env.sh:50`, `tee -a` in the `run`/`run_ok`/`ensure` helpers at `:55-80`) and was never committed. Both `experiments/hac-325/README.md:84-86` and `docs/receipts/HAC-325-s0-receipt.md:37` cite it as the receipt's basis — a dangling reference. |
| HAC-325 stale README | `## Status` at `experiments/hac-325/README.md:10-15` still says "Not yet executed … nothing in `evidence/` is a measurement yet", contradicted by 19 committed evidence captures and the FAIL/pivot recorded only in `docs/receipts/HAC-325-s0-receipt.md:3`. The "Two deviations" block at `:36-42` also claims egress was out of scope, contradicted by `evidence/agent-gateway-egress.json`. |
| No lint tool | belongs to META-339; no linter exists in this repository. |

```sh
cd "$REPO" && node -e '
const d=require("fs").readFileSync("experiments/hac-316/DEBT.md","utf8");
const need=["commands.log",".gitignore","env.sh","README.md","HAC-325-s0-receipt.md","META-339","lint"];
for(const k of need){ if(!d.includes(k)) throw new Error("DEBT.md missing: "+k); }
if(/blocks HAC-316|critical path|must fix before/i.test(d)) throw new Error("debt escalated to critical path");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-062 — No linter or extra quality gate was added (X-07).**

```sh
cd "$REPO" && node -e '
const s=require("./package.json").scripts;
if(Object.keys(s).some(k=>/lint|format|prettier|eslint/i.test(k))) throw new Error("a lint/format script was added");
const added=Object.keys(s).filter(k=>k==="check:packet:s1");
if(added.length!==1) throw new Error("check:packet:s1 must be the only new script");
console.log("PASS");'
```

Expected output:
```
PASS
```

---

**REQ-063 — Branch topology is unchanged (X-08).**

```sh
cd "$REPO" && test "$(git branch --show-current)" = "hac/316-agent-runtime-counterfactual" \
  && test -z "$(git branch -a --list '*dev*')" && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-064 — No ai-swarm content was vendored (X-09).**

```sh
cd "$REPO" && test -z "$(grep -rniE 'ai-swarm|spec-writer|swarm/templates' experiments/hac-316/ src/ 2>/dev/null)" \
  && pnpm run check:provenance >/dev/null 2>&1 && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-065 — The HAC-316 packet verifier passes and is wired into the gate.**

```sh
cd "$REPO" && pnpm run check:packet:s1 >/dev/null 2>&1 && \
  grep -q "check:packet:s1" .github/workflows/ci.yml && echo PASS || echo FAIL
```

Expected output:
```
PASS
```

---

**REQ-068 — The new CI job matches the established job shape and weakens no
existing gate.**

**Measured baseline** (audit SHA): `.github/workflows/ci.yml` defines **5** jobs
— `provenance:21`, `test:103`, `coverage:190`, `concept-gate:265`,
`s2-enforcement-gate:320` — and **4** `Explain the failure` steps
(`:152`, `:216`, `:279`, `:365`). The `provenance` job has none.

That gap is **pre-existing and out of scope** — do not fix it here (X-07). The
requirement is only that the *new* job carries one, in the META-337 §7 shape
(Invariant / Why it matters / Authority / Evidence required / Do not weaken).
Node stays pinned at `22.19.0`.

Like `concept-gate` (`.github/workflows/ci.yml:263-264`) and
`s2-enforcement-gate` (`:318-319`), the HAC-316 job is **not** a required
context; it must carry the same explicit annotation rather than silently
becoming one.

```sh
cd "$REPO" && node -e '
const y=require("fs").readFileSync(".github/workflows/ci.yml","utf8");
const body=y.slice(y.indexOf("\njobs:"));
const jobs=(body.match(/^  [a-z0-9_-]+:$/gm)||[]).length;
const explains=(y.match(/Explain the failure/g)||[]).length;
if(jobs!==6) throw new Error(`expected 6 jobs (5 existing + HAC-316), got ${jobs}`);
if(explains!==5) throw new Error(`expected 5 Explain-the-failure steps (4 existing + HAC-316), got ${explains}`);
if(!/check:packet:s1/.test(y)) throw new Error("HAC-316 gate not wired");
for(const k of ["Invariant","Why it matters","Authority","Evidence required","Do not weaken"]){
  if(!y.includes(k)) throw new Error("missing META-337 section: "+k);
}
if(!/22\.19\.0/.test(y)) throw new Error("Node pin lost");
console.log(`PASS jobs=${jobs} explains=${explains}`);'
```

Expected output:
```
PASS jobs=6 explains=5
```

Sanity: the same command run at the audit SHA reports
`expected 6 jobs (5 existing + HAC-316), got 5` — confirming the check is
load-bearing and not vacuously true.

Existing gates unweakened:

```sh
cd "$REPO" && for c in check:provenance check:packet check:packet:s2 typecheck build test:coverage hac326; do \
  grep -q "$c" .github/workflows/ci.yml || { echo "FAIL missing $c"; exit 1; }; done; echo PASS
```

Expected output:
```
PASS
```

---

## 7. Completion Gate

HAC-316 is done when — and only when — every command below produces its stated
output **in one uninterrupted run, from a clean checkout of the branch**.

### 7.1 Frozen-contract gate

```sh
cd "$REPO" && AUDIT_SHA=f44a6b83580c92776231d3507942a7ef6b1b54f4 && \
  git diff --name-only "$AUDIT_SHA" -- src/ | grep -v '^src/target/state.ts$' | wc -l | tr -d ' '
```
Expected: `0`

```sh
cd "$REPO" && git diff --quiet "$AUDIT_SHA" -- \
  src/observation/ src/proxy/ src/authorization/ src/broker/ \
  experiments/hac-330/ experiments/hac-326/ \
  experiments/hac-316/evidence/preflight.json experiments/hac-316/bin/preflight.mjs \
  provenance/manifest.json pnpm-lock.yaml vitest.config.ts && echo CLEAN
```
Expected: `CLEAN`

### 7.2 Build and test gate

```sh
cd "$REPO" && pnpm install --frozen-lockfile >/dev/null 2>&1 && \
  pnpm run build >/dev/null 2>&1 && echo BUILD_OK && \
  npx tsc --noEmit && echo TYPECHECK_OK
```
Expected:
```
BUILD_OK
TYPECHECK_OK
```

```sh
cd "$REPO" && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2
```
Expected: `Test Files  <F> passed (<F>)` and `Tests  <N> passed (<N>)` with
`F >= 13`, `N >= 295`, and **zero** failed or skipped.

```sh
cd "$REPO" && pnpm run test:coverage >/dev/null 2>&1 && echo COVERAGE_OK
```
Expected: `COVERAGE_OK`

### 7.3 Packet gate

```sh
cd "$REPO" && pnpm run check:provenance >/dev/null 2>&1 && echo PROVENANCE_OK && \
  pnpm run check:packet >/dev/null 2>&1 && echo PACKET_330_OK && \
  pnpm run check:packet:s2 >/dev/null 2>&1 && echo PACKET_326_OK && \
  pnpm run check:packet:s1 >/dev/null 2>&1 && echo PACKET_316_OK
```
Expected:
```
PROVENANCE_OK
PACKET_330_OK
PACKET_326_OK
PACKET_316_OK
```

### 7.4 Requirement gate

Every REQ-001 … REQ-068 verification command produces its expected output.
The packet verifier `experiments/hac-316/bin/verify-packet.mjs` must execute
**all** of them and enumerate any failure by REQ id.

```sh
cd "$REPO" && node experiments/hac-316/bin/verify-packet.mjs --all 2>&1 | tail -2
```
Expected:
```
REQ 68/68 PASS
PACKET OK
```

The verifier must accumulate every failure rather than stopping at the first —
the `experiments/hac-326/bin/verify-packet.mjs:29-30,245-249` pattern — so one
run enumerates all outstanding work.

### 7.5 Counterfactual gate — the claim itself

```sh
cd "$REPO" && node experiments/hac-316/bin/verify-packet.mjs --counterfactual
```
Expected:
```
baseline      executed=2  total=140  cap=130  BREACH
treatment     executed=1  total=120  cap=130  HOLDS   reason=COUPLING_OBSERVED
perturbation  executed=2  total=140  cap=130  BREACH  reason=NO_QUALIFYING_COUPLING
attribution   OK
PASS
```

`attribution OK` requires all of: identical initial-state digests across arms
(REQ-038); identical normalized intents across arms (REQ-045, REQ-046);
identical deployment and implementation digests between treatment and
perturbation (REQ-056); `STALE_BASIS` absent from every arm (REQ-047, REQ-056);
and every final state established by an independent reread (REQ-044).

### 7.6 Anti-gaming control

```sh
cd "$REPO" && HAC316_FAULT_INJECT=invert-composition node experiments/hac-316/bin/verify-packet.mjs --all >/dev/null 2>&1; \
  test $? -ne 0 && echo CONTROL_OK || echo CONTROL_FAILED
```
Expected: `CONTROL_OK`

A green packet with a broken verifier is a failed experiment, not a passed one.

### 7.7 Teardown gate

```sh
cd "$REPO" && node experiments/hac-316/bin/teardown.mjs --verify 2>&1 | tail -1
```
Expected: `PASS`

---

## Appendix A — Verified citation index

Every symbol named in this spec was verified by `grep`/`sed` at audit SHA
`f44a6b83580c92776231d3507942a7ef6b1b54f4`.

| Symbol / fact | Location |
| -- | -- |
| `ProtectedTargetOptions.initialState` optional | `src/target/service.ts:86` |
| `admit(...)` expectations construction | `src/target/service.ts:153-157` |
| `genesisRevision(targetId, initialState)` | `src/broker/revision/revision.ts:23-28` |
| `RECEIPT_WRONG_TARGET` check | `src/authorization/receipt.ts:388-393` |
| `targetId` inside signed payload | `src/authorization/receipt.ts:179` |
| `signReceipt` | `src/authorization/receipt.ts:193` |
| `RECEIPT_VERSION` | `src/authorization/receipt.ts:43` |
| `signingKeyFromPem` | `src/authorization/receipt.ts:430` |
| `intentDigest` | `src/authorization/intent.ts:33` |
| `INITIAL_STATE` (130 / 40,40,20) | `src/target/state.ts:35-38` |
| `reservationPath` | `src/target/state.ts:47-49` |
| `applyMutation` | `src/target/state.ts:106-130` |
| `UNKNOWN_SERVICE` | `src/target/state.ts:107` |
| `INVARIANT_BREACH` | `src/target/state.ts:120-126` |
| inaccurate prose to correct | `src/target/state.ts:13-14` |
| `PendingIntent` (no `targetId`) | `src/broker/pairing/store.ts:21-36` |
| `findCouplings` | `src/broker/pairing/arbitrate.ts:186-207` |
| `couplingMinSupport: 3` | `src/broker/pairing/arbitrate.ts:108` |
| `STALE_BASIS` guard | `src/broker/pairing/arbitrate.ts:352-361` |
| `COUPLING_OBSERVED` verdict | `src/broker/pairing/arbitrate.ts:417` |
| `SERIALIZED_PRECEDENCE` verdict | `src/broker/pairing/arbitrate.ts:429` |
| `NO_QUALIFYING_COUPLING` verdict | `src/broker/pairing/arbitrate.ts:442` |
| `ProxyOptions` (one targetId, one port) | `src/proxy/service.ts:101-118` |
| `store` injectable | `src/proxy/service.ts:103` |
| receipt minting `targetId` | `src/proxy/service.ts:207` |
| one store per process (production) | `src/proxy/main.ts:82` |
| `TOOL_DEFINITION` | `src/proxy/http.ts:37` |
| `targetsForIntent` | `src/proxy/http.ts:56-59` |
| `createProxyServer` nominal typing | `src/proxy/http.ts:61-62`, `:268` |
| `ENV` (13 entries, no pending TTL) | `src/config.ts:16-29` |
| `ENFORCE_CALLER_IDENTITY` | `src/config.ts:26` |
| `enforceCallerIdentity` consumption | `src/target/http.ts:86` |
| target response `EXECUTED` / 403 | `src/target/http.ts:89` |
| `LifecycleState` (8 frozen states) | `src/observation/events.ts:32-49` |
| `UnassertableStateError` | `src/observation/events.ts:79-94` |
| `observe()` sole producer of `OBSERVED` | `src/observation/events.ts:117` |
| vitest include glob | `vitest.config.ts:10` |
| coverage include `src/**/*.ts` | `vitest.config.ts:21` |

## Appendix B — Measured evidence facts

| Fact | Value |
| -- | -- |
| `baseline.evidence.json` file sha256 | `f716297558dfa325e8eef222623af0a461d0879f739cd7d0f7853d7a1ebd6f22` |
| `perturbed.evidence.json` file sha256 | `b6dca507294c46997828f5f36d1018cfb3a72c5dd65b7b6e217ba2aedb3cf02b` |
| coupling artifact sha256 (internal field) | `2c021d0c593aac252c4f7f61d8d6bd03b3bfcccf7a2f647691a1a2b894eb21d6` |
| producer pinned sha | `defac1e5dce6fb692a48e775fb44854b371cbca4` |
| baseline `basisRevision` | `eb67a6f56b3bf7e71846e7324d21af44565c0b70` |
| perturbed `basisRevision` | `db8a63ec9405191bdd40d0ed0fc69684fca5d17b` |
| baseline pairs | alpha↔beta (8/10); runbook↔smoke (6/6) |
| perturbed pairs | runbook↔smoke (6/6); alpha↔gamma (4/10); beta↔gamma (4/10) — **alpha↔beta absent** |

**Note on the artifact digest.** The audit cited
`2c021d0c593aac…` as "artifact sha256". That is the value of the internal
`artifact.sha256` field, **not** the digest of the file on disk. Pin both
(REQ-003); confusing them silently weakens the pin.
