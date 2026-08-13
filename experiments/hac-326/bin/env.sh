#!/usr/bin/env bash
# Shared settings for the HAC-326 Cloud Run arm.
#
# Values come from the environment; nothing secret is defined here. Override
# PROJECT_ID before running anything.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to a billing-enabled project id}"
export REGION="${REGION:-us-central1}"
export REPO="${REPO:-interlock-s2}"
export IMAGE_NAME="${IMAGE_NAME:-interlock-s2}"
export TARGET_SERVICE="${TARGET_SERVICE:-interlock-s2-target}"
export PROXY_SERVICE="${PROXY_SERVICE:-interlock-s2-proxy}"
export TARGET_ID="${TARGET_ID:-interlock-s2-target}"
export SIGNING_KEY_ID="${SIGNING_KEY_ID:-interlock-s2-cloudrun}"

export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:latest"

# Repository root, derived rather than assumed, so these scripts work from any cwd.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export EXPERIMENT_DIR="${HERE}/.."
export REPO_ROOT="$(cd "${EXPERIMENT_DIR}/../.." && pwd)"
export WORK_DIR="${EXPERIMENT_DIR}/.work"
export EVIDENCE_DIR="${EXPERIMENT_DIR}/evidence"

mkdir -p "${WORK_DIR}" "${EVIDENCE_DIR}"

# Key material lives only under .work/, which is gitignored. Never in evidence,
# never in the repository, never in a committed manifest.
export SIGNING_KEY_PEM_FILE="${WORK_DIR}/interlock-s2-signing.pem"
export VERIFICATION_KEY_PEM_FILE="${WORK_DIR}/interlock-s2-verification.pem"

gcloud() { command gcloud --project="${PROJECT_ID}" "$@"; }
export -f gcloud 2>/dev/null || true
