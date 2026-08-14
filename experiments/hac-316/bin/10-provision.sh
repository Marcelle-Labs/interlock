#!/usr/bin/env bash
#
# Phase 7 provisioning. One block per row of the frozen resource manifest
# (evidence/resources.json), in manifest order.
#
# ## CLOUD SPEND BEGINS HERE
#
# Do not run this until Phases 0-6 are green. It creates a disposable Google
# Cloud project and bills against ${BILLING_ACCOUNT}. Teardown is
# bin/teardown.mjs, and it refuses any project id this script did not record.
#
# ## The order this script is written in is the whole safety property
#
# The previous version could strand a billed project that teardown would then
# refuse to remove, and it did so through ordering alone rather than through any
# individual line being wrong. It consumed four files under ${WORK_DIR} that
# nothing created; under `set -euo pipefail` it therefore died at P-05 - after a
# project had been created, billing linked, five APIs enabled, an IAM binding
# added and a repository created - and it wrote evidence/topology.json last.
# teardown.mjs refuses anything absent from that record (NO_DISPOSABLE_PROJECT_
# DECLARED, exit 3, deliberately), so the failure left a live billed project the
# teardown tool would not touch.
#
# Three rules fix that, and the file is laid out so they are checkable by reading
# it top to bottom:
#
#   1. PREFLIGHT. Every prerequisite that can be established locally is
#      established locally, before the first call that reaches Google. Missing
#      tooling, an unset or malformed environment variable, an unreadable
#      manifest, an unwritable directory, an unrenderable service environment -
#      all of them stop the run while there is nothing to strand.
#   2. DECLARE. evidence/topology.json is written with the generated project id
#      BEFORE `projects create` runs. The id is generated here rather than
#      returned by Google, so it can be recorded first. From that line onwards
#      every failure leaves a project teardown will accept.
#   3. PROVISION. Only then does anything reach Google, and an ERR trap prints
#      the exact teardown command for the declared id on any failure.
#
# The residual case is the reverse one: a declaration written for a project whose
# `projects create` then failed. That leaves a stale record naming a project that
# does not exist - teardown reads NOT_FOUND on every probe and reports it gone,
# which is true. Preflight refuses to overwrite an existing topology.json, so a
# stale declaration is surfaced to the operator rather than silently replaced.
# A declarable project that may not exist is the safe side of this trade; an
# existing project that is not declarable is not.
#
# ## Nothing is inherited
#
# Every gcloud call names ${PROJECT_ID} explicitly: as --project= where the verb
# accepts it, as the positional operand where it does not. `gcloud config` is
# never read and never set (REQ-070). The reason is specific rather than
# decorative: the ambient configuration on the operator's workstation still names
# a project that was deleted at an earlier teardown, so a script that inherits it
# aims at the wrong place or at nothing at all. An id that is generated here and
# passed explicitly can only ever mean one project.
#
# The region is pinned to the literal us-central1 for every regional resource,
# with no exceptions and no override.
#
# ## Not created
#
# X-01. No egress gateway, no network attachment, no PSC endpoint, no internal
# load balancer, no DNS peering, no authorization policy, no service extension.
# HAC-325 falsified that topology and this phase does not re-provision any part
# of it. REQ-069 and REQ-070 each check that independently of REQ-058.
#
# ## What this script does not do
#
# It does not create R-09 or R-10. Those are Agent Engine reasoning engines and
# there is no gcloud create verb for one; the ADK deploy entry point creates them
# through vertexai.agent_engines.create and appends their resource names to the
# topology record this script writes. Until it has, REQ-069 reports a declared
# resource that was never provisioned - which is the correct reading of a
# half-provisioned phase, not a defect in the check. The same is true between
# the DECLARE step and the end of a successful run: a topology.json in
# provisioningState=declared is a half-provisioned phase and REQ-069 should fail
# on it.
#
# ## Environment
#
# Required:
#   BILLING_ACCOUNT                      billing account id, XXXXXX-XXXXXX-XXXXXX
#   INTERLOCK_SIGNING_KEY_ID             receipt signing key id (proxy)
#   INTERLOCK_SIGNING_KEY_PEM            receipt signing private key, PEM (proxy)
#   INTERLOCK_VERIFICATION_KEYS          JSON keyId -> PEM public key (targets)
#   INTERLOCK_ENFORCE_CALLER_IDENTITY    literal true or false; identical across
#                                        both targets or the arms are not
#                                        comparable (REQ-045)
#
# Optional, with the defaults shown:
#   WORK_DIR                             experiments/hac-316/.work
#   INTERLOCK_EVIDENCE_PATH              /tmp/interlock-evidence.ndjson
#   INTERLOCK_SOURCE_REVISION            git rev-parse HEAD
#   INTERLOCK_TARGET_AUDIENCE            the deployed target URL
#
# Nothing else is read. No file under ${WORK_DIR} needs to exist beforehand:
# every one this script consumes, it renders.
#
# Usage:
#   BILLING_ACCOUNT=<id> INTERLOCK_SIGNING_KEY_ID=<id> \
#   INTERLOCK_SIGNING_KEY_PEM="$(cat key.pem)" \
#   INTERLOCK_VERIFICATION_KEYS='{"<id>":"<pem>"}' \
#   INTERLOCK_ENFORCE_CALLER_IDENTITY=true \
#     bash experiments/hac-316/bin/10-provision.sh

set -Eeuo pipefail

# --------------------------------------------------------------------------
# Paths and constants. Pure arithmetic over ${BASH_SOURCE}; touches nothing.
# --------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXPERIMENT_DIR="${REPO_ROOT}/experiments/hac-316"
EVIDENCE_DIR="${EXPERIMENT_DIR}/evidence"
MANIFEST="${EVIDENCE_DIR}/resources.json"
TOPOLOGY="${EVIDENCE_DIR}/topology.json"
WORK_DIR="${WORK_DIR:-${EXPERIMENT_DIR}/.work}"
TEARDOWN_CMD="node experiments/hac-316/bin/teardown.mjs"

REGION="us-central1"
REPO="interlock-s1"

# The shape teardown's G-4 fence enforces. Declared here as well so preflight can
# refuse to create a project whose id teardown would later be unable to accept.
DISPOSABLE_ID_PATTERN='^interlock-s1-[0-9a-f]{8}$'

# Flipped to 1 by the DECLARE step. The ERR trap reads it to decide whether a
# failure could have left something billing.
DECLARED=0

say() { printf 'provision: %s\n' "$*"; }

# What the operator must do about what exists right now. Printed by every exit
# path, because "the script stopped" and "the script stopped having created a
# billed project" call for different actions and the operator cannot be expected
# to reconstruct which happened from a stack of gcloud output.
disposition() {
  if [ "${DECLARED}" = "1" ]; then
    printf 'provision: %s is declared in %s. It may exist and it may be billing.\n' \
      "${PROJECT_ID}" "${TOPOLOGY}" >&2
    printf 'provision: remove it with\n  %s --project=%s --execute --confirm --verify\n' \
      "${TEARDOWN_CMD}" "${PROJECT_ID}" >&2
  else
    printf 'provision: nothing was created. The failure is before the first Google side effect.\n' >&2
  fi
}

fail() {
  printf 'provision: %s\n' "$*" >&2
  disposition
  exit 1
}

on_error() {
  local code=$?
  printf '\nprovision: FAILED with exit %s near line %s\n' "${code}" "${BASH_LINENO[0]}" >&2
  disposition
  exit "${code}"
}
trap on_error ERR

# ==========================================================================
# PREFLIGHT - local only. No Google side effect appears above the PROVISION
# banner, and the ordering test asserts that rather than trusting this comment.
# ==========================================================================

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is not on PATH; $2"
}

# Present and not whitespace-only. Read by name so a secret never reaches argv
# and therefore never reaches a process listing.
require_env() {
  local name="$1"
  local value="${!name-}"
  if [ -z "${value//[[:space:]]/}" ]; then
    fail "${name} is not set. Nothing has been created; set it and re-run."
  fi
}

validate_json_file() {
  local path="$1"
  [ -s "${path}" ] || fail "${path} was not written, or is empty"
  node -e '
    const { readFileSync } = require("node:fs");
    const path = process.argv[1];
    try {
      JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      process.stderr.write(`provision: ${path} is not valid JSON: ${error.message}\n`);
      process.exit(1);
    }
  ' "${path}"
}

# Render a Cloud Run --env-vars-file from named variables in this process's
# environment. Names on argv, values never: the signing key is read by name.
render_env_file() {
  local out="$1"
  shift
  HAC316_ENV_NAMES="$*" node -e '
    const names = String(process.env.HAC316_ENV_NAMES ?? "").split(/\s+/).filter(Boolean);
    if (names.length === 0) {
      process.stderr.write("provision: render_env_file was given no variable names\n");
      process.exit(1);
    }
    const map = {};
    for (const name of names) {
      const value = process.env[name];
      if (value === undefined || value.trim() === "") {
        process.stderr.write(`provision: ${name} is empty; refusing to deploy a blank value\n`);
        process.exit(1);
      }
      map[name] = value;
    }
    process.stdout.write(`${JSON.stringify(map, null, 2)}\n`);
  ' > "${out}"
  validate_json_file "${out}"
}

# The build recipe P-05 consumes. Written here rather than committed because it
# names ${IMAGE}, which contains the per-run project id. `gcloud builds submit`
# reads --config locally, so this file is not affected by the .gitignore rules
# that keep .work/ out of the uploaded source.
render_cloudbuild() {
  local out="$1"
  cat > "${out}" <<CLOUDBUILD
# Generated by experiments/hac-316/bin/10-provision.sh. Do not edit by hand.
# One image, three entry points behind it (R-05): identical bytes under all three
# Cloud Run services is what makes the arms comparable (REQ-056).
timeout: 1800s
options:
  logging: CLOUD_LOGGING_ONLY
steps:
  - id: build
    name: gcr.io/cloud-builders/docker
    entrypoint: bash
    args:
      - -c
      - |
        set -eu
        cat > /workspace/Dockerfile.hac316 <<'DOCKERFILE'
        FROM node:22-slim
        WORKDIR /app
        COPY . .
        RUN corepack enable && pnpm install --frozen-lockfile && pnpm run build
        DOCKERFILE
        docker build -f /workspace/Dockerfile.hac316 -t ${IMAGE} /workspace
images:
  - ${IMAGE}
CLOUDBUILD
  [ -s "${out}" ] || fail "${out} was not written, or is empty"
  grep -q "${IMAGE}" "${out}" || fail "${out} does not name the image it must build"
}

preflight() {
  say 'preflight: local prerequisites only, nothing is created'

  require_command gcloud 'the Google Cloud CLI is required to provision anything'
  require_command openssl 'the project id suffix is generated with openssl rand'
  require_command node 'the manifest and the service environments are rendered with node'
  require_command git 'the source revision recorded on receipts is read from git'

  require_env BILLING_ACCOUNT
  if ! printf '%s' "${BILLING_ACCOUNT}" | grep -Eq '^[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}$'; then
    fail 'BILLING_ACCOUNT is not a billing account id of the form XXXXXX-XXXXXX-XXXXXX'
  fi

  require_env INTERLOCK_SIGNING_KEY_ID
  require_env INTERLOCK_SIGNING_KEY_PEM
  require_env INTERLOCK_VERIFICATION_KEYS
  require_env INTERLOCK_ENFORCE_CALLER_IDENTITY

  # Re-exported so the validators and the renderers below read the same values
  # the operator supplied. `require_env` reads shell variables too; node does
  # not, and a value that validated here but rendered as absent later would be
  # exactly the kind of late failure this preflight exists to prevent.
  export BILLING_ACCOUNT INTERLOCK_SIGNING_KEY_ID INTERLOCK_SIGNING_KEY_PEM
  export INTERLOCK_VERIFICATION_KEYS INTERLOCK_ENFORCE_CALLER_IDENTITY

  case "${INTERLOCK_ENFORCE_CALLER_IDENTITY}" in
    true|false) ;;
    *) fail 'INTERLOCK_ENFORCE_CALLER_IDENTITY must be the literal true or false. src/config.ts readFlag treats every other value as false, so a typo would silently disable enforcement on both targets and the arms would still look comparable.' ;;
  esac

  case "${INTERLOCK_SIGNING_KEY_PEM}" in
    *'PRIVATE KEY'*) ;;
    *) fail 'INTERLOCK_SIGNING_KEY_PEM does not look like a PEM private key' ;;
  esac

  # Exactly the checks src/config.ts readKeyMap makes, made here instead of at
  # the first request of a service that has already been billed for.
  node -e '
    const raw = process.env.INTERLOCK_VERIFICATION_KEYS ?? "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      process.stderr.write(`provision: INTERLOCK_VERIFICATION_KEYS must be JSON: ${error.message}\n`);
      process.exit(1);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      process.stderr.write("provision: INTERLOCK_VERIFICATION_KEYS must be a JSON object of keyId -> PEM\n");
      process.exit(1);
    }
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      process.stderr.write("provision: INTERLOCK_VERIFICATION_KEYS carries no verification key\n");
      process.exit(1);
    }
    for (const [keyId, pem] of entries) {
      if (typeof pem !== "string" || !pem.includes("PUBLIC KEY")) {
        process.stderr.write(`provision: INTERLOCK_VERIFICATION_KEYS[${keyId}] is not a PEM public key\n`);
        process.exit(1);
      }
    }
  '

  # The manifest is the denominator REQ-069 matches against. An unreadable one
  # means this run has no closed set to be checked against, which is a reason to
  # stop before creating anything rather than a reason to carry on.
  [ -f "${MANIFEST}" ] || fail "the frozen resource manifest is missing: ${MANIFEST}"
  node -e '
    const { readFileSync } = require("node:fs");
    const path = process.argv[1];
    const region = process.argv[2];
    const projectId = process.argv[3];
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      process.stderr.write(`provision: ${path} is not valid JSON: ${error.message}\n`);
      process.exit(1);
    }
    const stop = (message) => {
      process.stderr.write(`provision: ${message}\n`);
      process.exit(1);
    };
    if (manifest.closedSet !== true || manifest.frozen !== true) {
      stop(`${path} is not the frozen closed set this phase provisions against`);
    }
    if (manifest.identifiers?.region !== region) {
      stop(`the manifest pins ${manifest.identifiers?.region}, this run pins ${region}`);
    }
    const pattern = manifest.identifiers?.projectIdPattern;
    if (typeof pattern !== "string" || !new RegExp(pattern).test(projectId)) {
      stop(`the generated project id ${projectId} does not match the manifest pattern ${pattern}`);
    }
    if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
      stop(`${path} enumerates no resources`);
    }
  ' "${MANIFEST}" "${REGION}" "${PROJECT_ID}"

  # An id teardown could not accept must never be created. This is the same fence
  # teardown.mjs applies, applied before the project exists rather than after.
  if ! printf '%s' "${PROJECT_ID}" | grep -Eq "${DISPOSABLE_ID_PATTERN}"; then
    fail "generated project id ${PROJECT_ID} does not match ${DISPOSABLE_ID_PATTERN}; teardown would refuse it"
  fi

  [ -d "${EVIDENCE_DIR}" ] || fail "${EVIDENCE_DIR} does not exist"
  [ -w "${EVIDENCE_DIR}" ] || fail "${EVIDENCE_DIR} is not writable; the declaration could not be recorded"
  if [ -e "${TOPOLOGY}" ]; then
    fail "${TOPOLOGY} already exists. It declares a project that may still be live; tear that one down (${TEARDOWN_CMD} --project=<id> --execute --confirm --verify) and remove the file before provisioning again."
  fi

  # 077 so the signing key this renders never lands world-readable.
  umask 077
  mkdir -p "${WORK_DIR}"
  [ -w "${WORK_DIR}" ] || fail "${WORK_DIR} is not writable"

  render_cloudbuild "${WORK_DIR}/cloudbuild.yaml"

  (
    export INTERLOCK_TARGET_ID="alpha"
    render_env_file "${WORK_DIR}/target-alpha.env.json" \
      INTERLOCK_TARGET_ID INTERLOCK_VERIFICATION_KEYS INTERLOCK_ENFORCE_CALLER_IDENTITY
  )
  (
    export INTERLOCK_TARGET_ID="beta"
    render_env_file "${WORK_DIR}/target-beta.env.json" \
      INTERLOCK_TARGET_ID INTERLOCK_VERIFICATION_KEYS INTERLOCK_ENFORCE_CALLER_IDENTITY
  )

  # proxy.env.json is the one input whose values are not all knowable locally:
  # two of them are the target URLs Cloud Run assigns at P-06 and P-07, so it is
  # rendered at P-08 from values read back out of the cloud. What preflight can
  # establish - that the renderer works and that every locally-sourced value is
  # present - it establishes now, with a throwaway file that is deleted again so
  # no sentinel value can ever be deployed.
  (
    export INTERLOCK_TARGET_URL_ALPHA="https://render-self-test.invalid"
    export INTERLOCK_TARGET_URL_BETA="https://render-self-test.invalid"
    export INTERLOCK_TARGET_AUDIENCE="https://render-self-test.invalid"
    render_env_file "${WORK_DIR}/.proxy.env.selftest.json" \
      INTERLOCK_TARGET_URL_ALPHA INTERLOCK_TARGET_URL_BETA INTERLOCK_TARGET_AUDIENCE \
      INTERLOCK_EVIDENCE_PATH INTERLOCK_SOURCE_REVISION \
      INTERLOCK_SIGNING_KEY_ID INTERLOCK_SIGNING_KEY_PEM INTERLOCK_ENFORCE_CALLER_IDENTITY
  )
  rm -f "${WORK_DIR}/.proxy.env.selftest.json"

  for input in cloudbuild.yaml target-alpha.env.json target-beta.env.json; do
    [ -s "${WORK_DIR}/${input}" ] || fail "${WORK_DIR}/${input} is missing after preflight"
  done

  say 'preflight: passed. Every local prerequisite is satisfied and nothing exists yet.'
}

# P-00  identifiers - generated locally, never inferred, and generated before
# preflight so that preflight can check the id against both the manifest pattern
# and the teardown fence while there is still nothing to strand.
PROJECT_ID="interlock-s1-$(openssl rand -hex 4)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/interlock-s1:latest"
INTERLOCK_EVIDENCE_PATH="${INTERLOCK_EVIDENCE_PATH:-/tmp/interlock-evidence.ndjson}"
INTERLOCK_SOURCE_REVISION="${INTERLOCK_SOURCE_REVISION:-$(git -C "${REPO_ROOT}" rev-parse HEAD)}"
export INTERLOCK_EVIDENCE_PATH INTERLOCK_SOURCE_REVISION

preflight

# ==========================================================================
# DECLARE - the teardown authority, written before anything exists.
#
# G-3's two-key rule needs a record teardown can read. Writing it here rather
# than at the end is the difference between a failure that leaves a removable
# project and one that leaves a billed project teardown refuses to touch. The
# actuals are filled in at the end of a successful run; until then this file
# says so, and REQ-069 correctly fails against it.
# ==========================================================================
cat > "${TOPOLOGY}" <<DECLARATION
{
  "experiment": "HAC-316",
  "artifact": "Phase 7 provisioning actuals",
  "producedBy": "experiments/hac-316/bin/10-provision.sh",
  "producedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "provisioningState": "declared",
  "provisioningStateNote": "Written before the first Google side effect so that a failure at any later point still leaves a project teardown.mjs will accept (G-3). Rewritten with the recorded actuals when the run completes.",
  "projectId": "${PROJECT_ID}",
  "projectNumber": null,
  "region": "${REGION}",
  "pendingActuals": ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10", "R-11", "R-12", "R-13"],
  "actuals": []
}
DECLARATION
DECLARED=1
say "declared ${PROJECT_ID} in ${TOPOLOGY} before creating it"
say "if anything below fails: ${TEARDOWN_CMD} --project=${PROJECT_ID} --execute --confirm --verify"

# ==========================================================================
# PROVISION - the first Google side effect is the next command, and every
# command below it is one. Nothing above this banner reaches Google.
# ==========================================================================
say "provisioning ${PROJECT_ID} in ${REGION}"

# P-01  R-01 + R-02  disposable project, billing linked
gcloud projects create "${PROJECT_ID}" --name="HAC-316 S1 disposable" --quiet
gcloud billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACCOUNT}" --quiet

# P-02  R-03  APIs - the five the topology needs, and only those
gcloud services enable --project="${PROJECT_ID}" --quiet \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com storage.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
PROXY_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# P-03  R-12  build role - absent on a fresh project, and its absence reads
# like a bucket fault (HAC-325 finding 1)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --quiet \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.builder --condition=None

# P-04  R-04  Artifact Registry
gcloud artifacts repositories create "${REPO}" --project="${PROJECT_ID}" --quiet \
  --repository-format=docker --location="${REGION}"

# P-05  R-05 + R-13  one image, built once, three entry points behind it
gcloud builds submit "${REPO_ROOT}" --project="${PROJECT_ID}" --quiet \
  --config="${WORK_DIR}/cloudbuild.yaml"

# P-06  R-06  alpha target - unchanged ProtectedTarget
gcloud run deploy interlock-s1-target-alpha --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=dist/target/main.js \
  --env-vars-file="${WORK_DIR}/target-alpha.env.json" --max-instances=1

# P-07  R-07  beta target - unchanged ProtectedTarget, same flags
gcloud run deploy interlock-s1-target-beta --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=dist/target/main.js \
  --env-vars-file="${WORK_DIR}/target-beta.env.json" --max-instances=1

ALPHA_URL="$(gcloud run services describe interlock-s1-target-alpha --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"
BETA_URL="$(gcloud run services describe interlock-s1-target-beta --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"
[ -n "${ALPHA_URL}" ] || fail 'the alpha target deployed but reported no URL'
[ -n "${BETA_URL}" ] || fail 'the beta target deployed but reported no URL'

# The routing surface fronts two targets, so its environment carries two target
# URLs. INTERLOCK_TARGET_URL_ALPHA and INTERLOCK_TARGET_URL_BETA are the
# provisioning-side half of that contract, recorded here so the deployment and
# the entry point cannot drift apart silently. Every other name is the one
# src/config.ts already defines.
(
  export INTERLOCK_TARGET_URL_ALPHA="${ALPHA_URL}"
  export INTERLOCK_TARGET_URL_BETA="${BETA_URL}"
  export INTERLOCK_TARGET_AUDIENCE="${INTERLOCK_TARGET_AUDIENCE:-${ALPHA_URL}}"
  render_env_file "${WORK_DIR}/proxy.env.json" \
    INTERLOCK_TARGET_URL_ALPHA INTERLOCK_TARGET_URL_BETA INTERLOCK_TARGET_AUDIENCE \
    INTERLOCK_EVIDENCE_PATH INTERLOCK_SOURCE_REVISION \
    INTERLOCK_SIGNING_KEY_ID INTERLOCK_SIGNING_KEY_PEM INTERLOCK_ENFORCE_CALLER_IDENTITY
)

# P-08  R-08  routing surface - ONE process, ONE PendingIntentStore (REQ-028).
# --max-instances=1 is load-bearing: a second instance is a second store, and
# the coupling would go unobserved without anything looking wrong.
gcloud run deploy interlock-s1-proxy --project="${PROJECT_ID}" --quiet \
  --image="${IMAGE}" --region="${REGION}" --no-allow-unauthenticated \
  --command=node --args=experiments/hac-316/src/routing.mjs \
  --env-vars-file="${WORK_DIR}/proxy.env.json" --max-instances=1

# P-09  R-11  Agent Engine staging bucket
gcloud storage buckets create "gs://${PROJECT_ID}-agent-staging" --project="${PROJECT_ID}" \
  --location="${REGION}"

# P-10  R-12  invoker bindings - least privilege, no allUsers anywhere
gcloud run services add-iam-policy-binding interlock-s1-target-alpha --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:${PROXY_SA}" --role=roles/run.invoker
gcloud run services add-iam-policy-binding interlock-s1-target-beta --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:${PROXY_SA}" --role=roles/run.invoker
gcloud run services add-iam-policy-binding interlock-s1-proxy --project="${PROJECT_ID}" \
  --region="${REGION}" --quiet \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com" \
  --role=roles/run.invoker

PROXY_URL="$(gcloud run services describe interlock-s1-proxy --project="${PROJECT_ID}" \
  --region="${REGION}" --format='value(status.url)')"

# ==========================================================================
# RECORD - the declaration written before creation, rewritten with what was
# actually created. R-09 and R-10 are appended by the ADK deploy entry point.
# ==========================================================================
cat > "${TOPOLOGY}" <<ACTUALS
{
  "experiment": "HAC-316",
  "artifact": "Phase 7 provisioning actuals",
  "producedBy": "experiments/hac-316/bin/10-provision.sh",
  "producedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "provisioningState": "provisioned",
  "projectId": "${PROJECT_ID}",
  "projectNumber": "${PROJECT_NUMBER}",
  "region": "${REGION}",
  "pendingActuals": ["R-09", "R-10"],
  "pendingActualsNote": "Agent Engine reasoning engines, appended by the ADK deploy entry point. REQ-069 fails until they are, and that is the correct reading of a half-provisioned phase.",
  "actuals": [
    { "id": "R-01", "name": "${PROJECT_ID}" },
    { "id": "R-02", "name": "billingAccounts/${BILLING_ACCOUNT}" },
    { "id": "R-03", "name": "run,cloudbuild,artifactregistry,aiplatform,storage" },
    { "id": "R-04", "name": "projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO}" },
    { "id": "R-05", "name": "${IMAGE}" },
    { "id": "R-06", "name": "interlock-s1-target-alpha", "url": "${ALPHA_URL}" },
    { "id": "R-07", "name": "interlock-s1-target-beta", "url": "${BETA_URL}" },
    { "id": "R-08", "name": "interlock-s1-proxy", "url": "${PROXY_URL}" },
    { "id": "R-11", "name": "gs://${PROJECT_ID}-agent-staging" },
    { "id": "R-12", "name": "iam bindings per resources.json R-12" },
    { "id": "R-13", "name": "cloudbuild builds (transient)" }
  ]
}
ACTUALS
validate_json_file "${TOPOLOGY}"

say "wrote ${TOPOLOGY}"
say "provisioned project=${PROJECT_ID} region=${REGION}"
say "next: deploy the ADK agents (R-09, R-10) and append their resource names to topology.json"
say "teardown: ${TEARDOWN_CMD} --project=${PROJECT_ID} --execute --confirm --verify"
