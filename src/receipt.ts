/**
 * META-337 hardening receipts.
 *
 * A hardening receipt is the durable record that one merge gate was configured
 * *and proven*. It exists because "the check is green" and "the check works" are
 * different claims, and only the second one is worth anything at a merge gate.
 *
 * The load-bearing rule encoded here: a receipt may only describe a `blocking`
 * gate as recorded if it carries a bidirectional proof — an injected defect, the
 * failure that was actually observed from the expected source, and the repair
 * that returned it to green. A gate that was merely switched on has not been
 * shown to be able to fail, and a gate that cannot be shown to fail is
 * indistinguishable from a gate that is silently skipped.
 *
 * Advisory signals are held to a weaker bar on purpose. They do not authorize a
 * merge, so demanding a red/green proof of them would either manufacture busywork
 * or — worse — create pressure to promote them to blocking just to justify the
 * proof.
 */

export type Posture = 'blocking' | 'advisory';

export interface HardeningReceipt {
  /** `owner/repo` the gate is configured on. */
  readonly repository: string;
  /** Exact status-check context name, as GitHub branch protection sees it. */
  readonly check: string;
  /** App slug expected to produce the check, e.g. `github-actions`, `sonarqubecloud`. */
  readonly sourceApp: string;
  readonly posture: Posture;
  /** Final branch/ruleset state after the pass. */
  readonly finalState: string;

  /** The bounded violation deliberately introduced. Required when blocking. */
  readonly injectedDefect?: string;
  /** The red state observed, attributed to `sourceApp`. Required when blocking. */
  readonly observedFailure?: string;
  /** The repair that returned the gate to green. Required when blocking. */
  readonly repair?: string;
}

export interface ValidationIssue {
  readonly field: string;
  readonly reason: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly receipt: HardeningReceipt }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const POSTURES: readonly Posture[] = ['blocking', 'advisory'];

/** Fields every receipt must carry, whatever its posture. */
const IDENTITY_FIELDS = ['repository', 'check', 'sourceApp', 'finalState'] as const;

/** Fields that together constitute a bidirectional red/green proof. */
const PROOF_FIELDS = ['injectedDefect', 'observedFailure', 'repair'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a field that must be a non-blank string.
 *
 * Whitespace is treated as absence rather than as content: a receipt field
 * containing only spaces records nothing, and accepting it would let an empty
 * proof pass for a real one.
 */
function readNonBlankString(
  source: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string | undefined {
  const raw = source[field];

  if (raw === undefined || raw === null) {
    issues.push({ field, reason: 'is required and was missing' });
    return undefined;
  }

  if (typeof raw !== 'string') {
    issues.push({ field, reason: `must be a string, received ${typeof raw}` });
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    issues.push({ field, reason: 'must not be blank' });
    return undefined;
  }

  return trimmed;
}

function readPosture(
  source: Record<string, unknown>,
  issues: ValidationIssue[],
): Posture | undefined {
  const raw = source['posture'];

  if (typeof raw !== 'string') {
    issues.push({
      field: 'posture',
      reason: `must be one of ${POSTURES.join(' | ')}`,
    });
    return undefined;
  }

  const match = POSTURES.find((posture) => posture === raw);
  if (match === undefined) {
    issues.push({
      field: 'posture',
      reason: `must be one of ${POSTURES.join(' | ')}, received ${JSON.stringify(raw)}`,
    });
    return undefined;
  }

  return match;
}

/**
 * Validates an untrusted value as a hardening receipt.
 *
 * Returns every issue found rather than stopping at the first, so a caller
 * repairing a receipt sees the whole set in one pass instead of rediscovering
 * them one at a time.
 */
export function validateReceipt(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ field: '.', reason: 'receipt must be an object' }],
    };
  }

  const identity: Partial<Record<(typeof IDENTITY_FIELDS)[number], string>> = {};
  for (const field of IDENTITY_FIELDS) {
    const value = readNonBlankString(input, field, issues);
    if (value !== undefined) {
      identity[field] = value;
    }
  }

  if (identity.repository !== undefined && !REPOSITORY_PATTERN.test(identity.repository)) {
    issues.push({
      field: 'repository',
      reason: `must be in owner/repo form, received ${JSON.stringify(identity.repository)}`,
    });
  }

  const posture = readPosture(input, issues);

  const proof: Partial<Record<(typeof PROOF_FIELDS)[number], string>> = {};
  for (const field of PROOF_FIELDS) {
    const raw = input[field];

    // Absent proof fields are only an error for blocking gates, so they are
    // collected quietly here and adjudicated once the posture is known.
    if (raw === undefined || raw === null) {
      continue;
    }

    if (typeof raw !== 'string' || raw.trim() === '') {
      issues.push({ field, reason: 'must be a non-blank string when present' });
      continue;
    }

    proof[field] = raw.trim();
  }

  if (posture === 'blocking') {
    for (const field of PROOF_FIELDS) {
      if (proof[field] === undefined) {
        issues.push({
          field,
          reason:
            'is required for a blocking gate: a gate that has not been observed failing ' +
            'has not been distinguished from a gate that is skipped',
        });
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    receipt: {
      repository: identity.repository as string,
      check: identity.check as string,
      sourceApp: identity.sourceApp as string,
      finalState: identity.finalState as string,
      posture: posture as Posture,
      ...(proof.injectedDefect !== undefined ? { injectedDefect: proof.injectedDefect } : {}),
      ...(proof.observedFailure !== undefined ? { observedFailure: proof.observedFailure } : {}),
      ...(proof.repair !== undefined ? { repair: proof.repair } : {}),
    },
  };
}

/**
 * Narrows a validated receipt to one that carries a complete bidirectional proof.
 *
 * Callers that report "this gate is proven" should gate on this rather than on
 * `posture === 'blocking'`, so the claim tracks the evidence and not the intent.
 */
export function isProvenBlockingGate(receipt: HardeningReceipt): boolean {
  return (
    receipt.posture === 'blocking' &&
    PROOF_FIELDS.every((field) => receipt[field] !== undefined)
  );
}
