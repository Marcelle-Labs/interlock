/**
 * Environment reading that cannot silently disable a check.
 *
 * ## Two bugs, one shape
 *
 * `process.env.X ?? fallback` treats a *set but empty* variable as a value, and
 * `process.env.X !== undefined` treats it as present. Both are wrong, and both
 * were live in this experiment:
 *
 *   - `HAC316_FAULT_INJECT=''` made the fault variable non-null, which
 *     short-circuited REQ-026's live control and skipped the spawn of the
 *     deliberately broken verifier. The requirement that proves the gate can go
 *     red was itself skipped, and the packet still read PASS.
 *   - `VITEST=''` made the verifier believe it was running inside vitest, so
 *     every suite-backed requirement was downgraded to `NOT_EXERCISED` instead
 *     of being run.
 *
 * In both cases an *empty* value silently weakened the checking, and nothing in
 * the output said so. `X=` in a shell script, a CI matrix that renders an unset
 * key as an empty string, a `env: { X: '' }` in a spawn — all of them are
 * ordinary and all of them produced a quieter gate.
 *
 * ## The two rules
 *
 * 1. **Empty or whitespace-only is absent.** There is no value there; treating
 *    it as one is inventing input.
 * 2. **An unrecognised value is a hard error, never a skip.** If a variable is
 *    set to something the program does not understand, somebody meant something
 *    by it. Ignoring it and carrying on is the failure mode this module exists
 *    to remove: the operator believes a mode is active and the program has
 *    quietly chosen the default.
 *
 * Nothing here has a "close enough" branch. A value is understood, absent, or a
 * refusal to continue.
 */

/** Thrown when a variable is set to something the program cannot honour. */
export class EnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/**
 * The value of `name`, with empty and whitespace-only treated as absent.
 *
 * @returns {string|null} the trimmed value, or `null` when nothing was supplied.
 */
export function readEnv(name, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new EnvironmentError(
      `${name} is a ${typeof raw}, not a string; the environment cannot be read reliably`,
    );
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * One of `allowed`, or `null` if unset.
 *
 * @throws {EnvironmentError} for any other value. That is the point: a
 *         misspelled mode must stop the run, not select the default.
 */
export function readEnumEnv(name, allowed, env = process.env) {
  const value = readEnv(name, env);
  if (value === null) return null;
  if (!allowed.includes(value)) {
    throw new EnvironmentError(
      `${name}=${JSON.stringify(value)} is not one of ${allowed.map((entry) => JSON.stringify(entry)).join(', ')}. ` +
        'Refusing to continue: an unrecognised value means somebody asked for something this ' +
        'program does not implement, and carrying on with the default would hide that.',
    );
  }
  return value;
}

/** The values this project accepts as booleans, in either case. */
const TRUE_VALUES = Object.freeze(['true', '1']);
const FALSE_VALUES = Object.freeze(['false', '0']);

/**
 * A boolean, or `null` if unset.
 *
 * @throws {EnvironmentError} for anything that is not plainly true or false.
 *         `INTERLOCK_ENFORCE_CALLER_IDENTITY=yes` must not read as `false`.
 */
export function readBooleanEnv(name, env = process.env) {
  const value = readEnv(name, env);
  if (value === null) return null;
  const lowered = value.toLowerCase();
  if (TRUE_VALUES.includes(lowered)) return true;
  if (FALSE_VALUES.includes(lowered)) return false;
  throw new EnvironmentError(
    `${name}=${JSON.stringify(value)} is not a boolean (${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}). ` +
      'Refusing to continue: silently reading an unparseable value as false would turn a typo ' +
      'into a disabled setting.',
  );
}

/** Whether this process is running under vitest, by the same strict rules. */
export function insideVitest(env = process.env) {
  return readBooleanEnv('VITEST', env) === true;
}
