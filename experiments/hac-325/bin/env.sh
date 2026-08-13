#!/usr/bin/env bash
# Shared configuration and command-recording helpers for the HAC-325 / S0 gate.
# Source this; do not execute it.

set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to the Google Cloud project for the S0 spike}"
export REGION="${REGION:-us-central1}"
export PREFIX="${PREFIX:-interlock-s0}"

export GCLOUD="${GCLOUD:-$HOME/google-cloud-sdk/bin/gcloud}"

# Resource names. Every S0 resource carries the prefix so teardown can be
# exhaustive and auditable.
export NETWORK="${PREFIX}-vpc"
export SUBNET="${PREFIX}-subnet"
export SUBNET_RANGE="10.90.0.0/24"
export PROXY_SUBNET="${PREFIX}-proxy"
export PROXY_RANGE="10.90.1.0/24"
export PSC_SUBNET="${PREFIX}-psc"
export PSC_RANGE="10.90.2.0/24"

export AR_REPO="${PREFIX}-images"
export EXT_SERVICE="${PREFIX}-ext"
export TARGET_SERVICE="${PREFIX}-target"

export NEG="${PREFIX}-neg"
export BACKEND_SERVICE="${PREFIX}-bes"
export HEALTH_CHECK="${PREFIX}-hc"

export DNS_ZONE="${PREFIX}-internal"
export DNS_DOMAIN="s0.interlock.internal."
export EXT_FQDN="ext.s0.interlock.internal"

export NETWORK_ATTACHMENT="${PREFIX}-na"
export GATEWAY="${PREFIX}-gw"
export AUTHZ_EXTENSION="${PREFIX}-authz-ext"
export AUTHZ_POLICY="${PREFIX}-authz-policy"

# Per-message timeout. The schema documents the bound in milliseconds (10-10000)
# but the field is a protobuf Duration, so it must be written in seconds form:
# "1000ms" is rejected with "failed to parse seconds". 1s is the provisional
# envelope the ADR assumes; S0 measures against it.
export EXT_TIMEOUT="${EXT_TIMEOUT:-1s}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export EXPERIMENT_DIR="$(dirname "$HERE")"
export EVIDENCE_DIR="${EXPERIMENT_DIR}/evidence"
mkdir -p "$EVIDENCE_DIR"
export COMMAND_LOG="${EVIDENCE_DIR}/commands.log"

# run: echo the exact command into the receipt log, then execute it.
# Every Google-side mutation in this experiment goes through here so the
# receipt records what actually ran rather than what was intended to run.
run() {
  printf '\n$ %s\n' "$*" | tee -a "$COMMAND_LOG"
  "$@" 2>&1 | tee -a "$COMMAND_LOG"
  return "${PIPESTATUS[0]}"
}

# run_ok: same, but a non-zero exit is recorded and tolerated. Used where a
# failure is itself a finding (for example an allowlist rejection).
run_ok() {
  printf '\n$ %s\n' "$*" | tee -a "$COMMAND_LOG"
  set +e
  "$@" 2>&1 | tee -a "$COMMAND_LOG"
  local status="${PIPESTATUS[0]}"
  set -e
  printf '[exit %s]\n' "$status" | tee -a "$COMMAND_LOG"
  return 0
}

# ensure: a create that is satisfied if the resource is already there. Any other
# failure still aborts -- "already exists" is the only tolerated error, so a
# rerun converges without masking a real provisioning fault.
ensure() {
  printf '\n$ %s\n' "$*" | tee -a "$COMMAND_LOG"
  local out status
  set +e
  out="$("$@" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$out" | tee -a "$COMMAND_LOG"
  if [[ $status -ne 0 ]]; then
    if grep -qiE 'already exists|alreadyExists|Duplicate|already a backend' <<<"$out"; then
      printf '[exists; continuing]\n' | tee -a "$COMMAND_LOG"
      return 0
    fi
    printf '[exit %s]\n' "$status" | tee -a "$COMMAND_LOG"
    return "$status"
  fi
  return 0
}

note() { printf '\n--- %s\n' "$*" | tee -a "$COMMAND_LOG" >/dev/null; }
