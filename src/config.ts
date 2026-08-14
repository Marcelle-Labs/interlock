/**
 * Configuration, read from the environment.
 *
 * Pure readers over an environment record rather than direct `process.env`
 * access, so configuration is testable without mutating global state — and so a
 * misconfiguration fails at startup with a readable message instead of at the
 * first request with a stack trace.
 *
 * **Only variable names appear here.** No default key material, no default
 * project, no baked-in URL. `check:provenance` scans this repository for
 * credential-shaped strings, and the one way to be sure it never finds one is
 * for values to have no home in the source at all.
 */

/** Names of every environment variable these services read. */
export const ENV = Object.freeze({
  PORT: 'PORT',
  TARGET_ID: 'INTERLOCK_TARGET_ID',
  TARGET_URL: 'INTERLOCK_TARGET_URL',
  TARGET_AUDIENCE: 'INTERLOCK_TARGET_AUDIENCE',
  PROXY_AUDIENCE: 'INTERLOCK_PROXY_AUDIENCE',
  SIGNING_KEY_ID: 'INTERLOCK_SIGNING_KEY_ID',
  SIGNING_KEY_PEM: 'INTERLOCK_SIGNING_KEY_PEM',
  VERIFICATION_KEYS: 'INTERLOCK_VERIFICATION_KEYS',
  EVIDENCE_PATH: 'INTERLOCK_EVIDENCE_PATH',
  SOURCE_REVISION: 'INTERLOCK_SOURCE_REVISION',
  ENFORCE_CALLER_IDENTITY: 'INTERLOCK_ENFORCE_CALLER_IDENTITY',
  IDENTITY_MODE: 'INTERLOCK_IDENTITY_MODE',
  TEST_IDENTITY_SECRET: 'INTERLOCK_TEST_IDENTITY_SECRET',
  REQUIRE_TRANSPORT_IDENTITY: 'INTERLOCK_REQUIRE_TRANSPORT_IDENTITY',
  RECEIPT_TTL_MS: 'INTERLOCK_RECEIPT_TTL_MS',
  DECISION_TIMEOUT_MS: 'INTERLOCK_DECISION_TIMEOUT_MS',
});

export type Environment = Readonly<Record<string, string | undefined>>;

/** Thrown when required configuration is absent or unusable. */
export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function required(env: Environment, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new ConfigurationError(`${name} is required and was not set`);
  }
  return value.trim();
}

export function optional(env: Environment, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/**
 * Read a port.
 *
 * Cloud Run supplies `PORT`; anything else is a local run. An unparseable value
 * is an error rather than a silent fallback, because binding the wrong port
 * looks exactly like a crashed service.
 */
export function readPort(env: Environment, fallback: number): number {
  const raw = env[ENV.PORT];
  if (raw === undefined || raw.trim() === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new ConfigurationError(`${ENV.PORT} must be an integer 0-65535, got ${JSON.stringify(raw)}`);
  }
  return port;
}

/** Read a positive integer duration in milliseconds. */
export function readDurationMs(env: Environment, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Read a boolean flag. Anything other than an explicit `true` is false. */
export function readFlag(env: Environment, name: string): boolean {
  return optional(env, name, 'false').toLowerCase() === 'true';
}

/**
 * Read a `keyId -> PEM` map from a JSON environment value.
 *
 * The map form exists so a key can be rotated by adding the new public half
 * before the proxy starts signing with it, rather than by a flag day in which
 * some receipts verify and some do not.
 */
export function readKeyMap(env: Environment, name: string): Record<string, string> {
  const raw = required(env, name);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigurationError(`${name} must be JSON: ${(error as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigurationError(`${name} must be a JSON object of keyId -> PEM`);
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new ConfigurationError(`${name} must carry at least one verification key`);
  }

  for (const [keyId, pem] of entries) {
    if (typeof pem !== 'string' || !pem.includes('PUBLIC KEY')) {
      throw new ConfigurationError(`${name}[${keyId}] must be a PEM public key`);
    }
  }

  return Object.fromEntries(entries as [string, string][]);
}
