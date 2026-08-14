/**
 * The identity gate's judgement, exercised against injected readings.
 *
 * ## Why the readings are injected
 *
 * Every reading this gate consumes comes from a billed project that does not
 * exist yet and must not be created to run a test. So the cloud-facing half of
 * `bin/identity-preflight.mjs` is not exercised here at all; what is exercised
 * is `judgeIdentityPreflight`, which is where every decision lives, against
 * readings written by hand.
 *
 * That split is the point of the file's structure. A gate whose judgement is
 * entangled with its I/O can only be tested by standing up the thing it judges,
 * which in this case means spending money to find out whether the code that
 * decides not to spend money works.
 *
 * ## What has to be true of these cases
 *
 * The gate exists to refuse. A test suite for it that only proved the happy path
 * would be the same defect as the one erratum E-07 found in the X-01 scan: a
 * check that passes on the tree it was supposed to catch. So the happy case is
 * one test out of many, and every other case is a distinct way the deployment
 * can be broken while looking healthy.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AGENTS,
  ATTEMPTS_WHEN_QUALIFIED,
  CALLER_ASSERTED_SOURCES,
  EXPERIMENT_TRANSPORT,
  IdentityFailure,
  MCP_PATH,
  PLATFORM_VERIFIED_MARKER,
  PLATFORM_VERIFIED_SOURCES,
  PROBE_CODES,
  attemptsEligibleFor,
  isPlatformVerified,
  pickEffectiveIdentity,
  principalFromRefusal,
  judgeIdentityPreflight,
} from '../bin/identity-preflight.mjs';

const experimentDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(experimentDir, relative), 'utf8');

const SA_A = 'interlock-s1-agent-a@interlock-s1-0a1b2c3d.iam.gserviceaccount.com';
const SA_B = 'interlock-s1-agent-b@interlock-s1-0a1b2c3d.iam.gserviceaccount.com';
const DEFAULT_SA = '000000000000-compute@developer.gserviceaccount.com';

const expected = () => ({
  transport: EXPERIMENT_TRANSPORT,
  A: { serviceAccount: SA_A },
  B: { serviceAccount: SA_B },
});

/** One ingress observation, platform-verified and over the real transport. */
const observation = (agent, principal, overrides = {}) => ({
  agent,
  observedPrincipal: principal,
  verifiedBy: 'oidc-id-token/platform-verified:email',
  transport: EXPERIMENT_TRANSPORT,
  ...overrides,
});

/** The deployment as it is supposed to be. Every other case perturbs this one. */
const healthy = () => ({
  runtimes: {
    A: { effectiveIdentity: SA_A },
    B: { effectiveIdentity: SA_B },
  },
  ingressObservations: [observation('A', SA_A), observation('B', SA_B)],
});

const judge = (readings, expectation = expected()) =>
  judgeIdentityPreflight({ expected: expectation, readings });

const codes = (verdict) => verdict.failures.map((failure) => failure.code);

describe('the deployment the gate is supposed to admit', () => {
  it('qualifies when both identities are correct, distinct, and seen as themselves', () => {
    const verdict = judge(healthy());
    expect(verdict.failures).toEqual([]);
    expect(verdict.qualified).toBe(true);
    expect(verdict.summary).toContain('Attempt 1 of at most 3 is eligible');
  });

  it('reports every check it made, not just the verdict', () => {
    // A gate that returns only a boolean cannot be audited after the fact, and
    // this one runs against a project that will be deleted.
    const verdict = judge(healthy());
    expect(verdict.checks.every((check) => check.ok)).toBe(true);
    expect(verdict.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        'expected-identities-distinct',
        'runtime-A-effective-identity',
        'runtime-B-effective-identity',
        'deployed-identities-distinct',
        'ingress-identities-distinct',
      ]),
    );
  });
});

describe('the two runtimes are one runtime', () => {
  it('refuses when both report the same effectiveIdentity', () => {
    // The fatal case, and the one most likely to happen by omission: neither
    // deploy passed a service account, so both defaulted to the same one.
    const readings = healthy();
    readings.runtimes.A.effectiveIdentity = DEFAULT_SA;
    readings.runtimes.B.effectiveIdentity = DEFAULT_SA;
    readings.ingressObservations = [
      observation('A', DEFAULT_SA),
      observation('B', DEFAULT_SA),
    ];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.EFFECTIVE_IDENTITY_NOT_DISTINCT);
    expect(codes(verdict)).toContain(IdentityFailure.INGRESS_OBSERVATION_NOT_DISTINCT);
    expect(verdict.summary).toContain('FAIL/PIVOT');
  });

  it('refuses when the expectation itself names one identity twice', () => {
    const expectation = expected();
    expectation.B.serviceAccount = SA_A;
    const readings = healthy();
    readings.runtimes.B.effectiveIdentity = SA_A;
    readings.ingressObservations = [observation('A', SA_A), observation('B', SA_A)];

    const verdict = judge(readings, expectation);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.EXPECTED_IDENTITIES_NOT_DISTINCT);
  });
});

describe('one of the two is not what was expected', () => {
  it('refuses when a runtime runs as something other than its declared account', () => {
    const readings = healthy();
    readings.runtimes.B.effectiveIdentity = DEFAULT_SA;

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    const mismatch = verdict.failures.find(
      (failure) => failure.code === IdentityFailure.EFFECTIVE_IDENTITY_MISMATCH,
    );
    expect(mismatch.agent).toBe('B');
    // Distinctness alone must not rescue it. The identities differ here, so a
    // gate that only compared A to B would pass this deployment.
    expect(codes(verdict)).not.toContain(IdentityFailure.EFFECTIVE_IDENTITY_NOT_DISTINCT);
  });

  it('refuses when a runtime reports no identity at all', () => {
    const readings = healthy();
    delete readings.runtimes.A.effectiveIdentity;

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.MISSING_READING);
  });

  it('refuses when a runtime reading is missing entirely', () => {
    const readings = healthy();
    delete readings.runtimes.B;

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.MISSING_READING);
  });
});

describe('the control plane agrees but the wire does not', () => {
  it('refuses when the ingress observed neither agent', () => {
    const readings = healthy();
    readings.ingressObservations = [];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict).filter((code) => code === IdentityFailure.INGRESS_OBSERVATION_MISSING))
      .toHaveLength(2);
  });

  it('refuses when the ingress observed only one of the two', () => {
    const readings = healthy();
    readings.ingressObservations = [observation('A', SA_A)];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    const missing = verdict.failures.find(
      (failure) => failure.code === IdentityFailure.INGRESS_OBSERVATION_MISSING,
    );
    expect(missing.agent).toBe('B');
  });

  it('refuses when the ingress observed the wrong service account', () => {
    // Both runtimes are configured correctly and are distinct in the control
    // plane; something between them and the ingress flattens B onto the default
    // account. Only the wire reading catches this.
    const readings = healthy();
    readings.ingressObservations = [observation('A', SA_A), observation('B', DEFAULT_SA)];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    const wrong = verdict.failures.find(
      (failure) => failure.code === IdentityFailure.INGRESS_OBSERVED_WRONG_PRINCIPAL,
    );
    expect(wrong.agent).toBe('B');
  });

  it('refuses when the ingress reports an observation carrying no principal', () => {
    const readings = healthy();
    readings.ingressObservations = [observation('A', SA_A), observation('B', null)];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.INGRESS_OBSERVATION_MISSING);
  });

  it('refuses a duplicated observation rather than picking one', () => {
    const readings = healthy();
    readings.ingressObservations = [
      observation('A', SA_A),
      observation('A', DEFAULT_SA),
      observation('B', SA_B),
    ];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.INGRESS_OBSERVATION_AMBIGUOUS);
  });
});

describe('identity the caller chose is never identity the platform verified', () => {
  for (const source of CALLER_ASSERTED_SOURCES) {
    it(`refuses ${source} by name, with both principals otherwise correct`, () => {
      // This is the shape of the tempting repair: the identities are right, the
      // agents are distinguishable, and the only thing wrong is that the ingress
      // learned who was calling by being told. It must still fail.
      const readings = healthy();
      readings.ingressObservations = [
        observation('A', SA_A, { verifiedBy: source }),
        observation('B', SA_B, { verifiedBy: source }),
      ];

      const verdict = judge(readings);
      expect(verdict.qualified).toBe(false);
      expect(codes(verdict)).toContain(IdentityFailure.IDENTITY_CALLER_ASSERTED);
      expect(codes(verdict)).not.toContain(IdentityFailure.IDENTITY_NOT_PLATFORM_VERIFIED);
    });
  }

  it('refuses an unstated provenance rather than assuming it was verified', () => {
    const readings = healthy();
    readings.ingressObservations = [
      observation('A', SA_A, { verifiedBy: undefined }),
      observation('B', SA_B, { verifiedBy: 'something-new' }),
    ];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict).filter((code) => code === IdentityFailure.IDENTITY_NOT_PLATFORM_VERIFIED))
      .toHaveLength(2);
  });

  it('accepts each declared platform-verified source', () => {
    for (const source of PLATFORM_VERIFIED_SOURCES) {
      const readings = healthy();
      readings.ingressObservations = [
        observation('A', SA_A, { verifiedBy: source }),
        observation('B', SA_B, { verifiedBy: source }),
      ];
      expect(judge(readings).qualified, source).toBe(true);
    }
  });

  it('shares no value between the accepted and the refused lists', () => {
    // If a source were on both lists the order of the two branches would decide
    // the verdict, which is not a property anybody could reason about.
    for (const source of CALLER_ASSERTED_SOURCES) {
      expect(PLATFORM_VERIFIED_SOURCES, source).not.toContain(source);
    }
  });
});

describe('the probe has to have travelled the path the trials travel', () => {
  it('refuses an observation made over any other transport', () => {
    const readings = healthy();
    readings.ingressObservations = [
      observation('A', SA_A, { transport: 'debug-sidecar' }),
      observation('B', SA_B),
    ];

    const verdict = judge(readings);
    expect(verdict.qualified).toBe(false);
    const mismatch = verdict.failures.find(
      (failure) => failure.code === IdentityFailure.INGRESS_TRANSPORT_MISMATCH,
    );
    expect(mismatch.agent).toBe('A');
  });

  it('refuses an observation that states no transport', () => {
    const readings = healthy();
    readings.ingressObservations = [
      observation('A', SA_A, { transport: null }),
      observation('B', SA_B),
    ];
    expect(judge(readings).qualified).toBe(false);
  });
});

describe('nothing is admitted by default', () => {
  it('refuses empty readings rather than finding nothing to object to', () => {
    const verdict = judgeIdentityPreflight({});
    expect(verdict.qualified).toBe(false);
    expect(verdict.failures.length).toBeGreaterThan(0);
    expect(verdict.summary).toContain('FAIL/PIVOT');
  });

  it('refuses when the expectation supplies no service account', () => {
    const verdict = judge(healthy(), { transport: EXPERIMENT_TRANSPORT });
    expect(verdict.qualified).toBe(false);
    expect(codes(verdict)).toContain(IdentityFailure.EXPECTED_IDENTITY_ABSENT);
  });

  it('names both agents and only those', () => {
    expect(AGENTS).toEqual(['A', 'B']);
  });
});

describe('reading effectiveIdentity out of a describe payload', () => {
  it('prefers the effectiveIdentity the platform reports', () => {
    expect(
      pickEffectiveIdentity({
        effectiveIdentity: SA_A,
        spec: { deploymentSpec: { serviceAccount: SA_B } },
      }),
    ).toBe(SA_A);
  });

  it('falls back to the configured service account, and no further', () => {
    expect(pickEffectiveIdentity({ spec: { deploymentSpec: { serviceAccount: SA_B } } })).toBe(SA_B);
  });

  it('returns null rather than guessing when neither is present', () => {
    // null becomes MISSING_READING, which is a refusal. An identity that could
    // not be read must never resolve to one that could.
    expect(pickEffectiveIdentity({})).toBeNull();
    expect(pickEffectiveIdentity(null)).toBeNull();
    expect(pickEffectiveIdentity({ effectiveIdentity: '   ' })).toBeNull();
  });
});

describe('the gate speaks the vocabulary the ingress actually emits', () => {
  // These are drift checks, not style checks. The gate decides whether an
  // identity was platform-verified by reading a string produced somewhere else;
  // if that string changes and this does not, the gate starts refusing every
  // healthy deployment, or worse, stops refusing an unhealthy one.

  it('accepts exactly the source strings src/proxy/identity.ts produces', () => {
    const identityModule = readFileSync(
      join(experimentDir, '..', '..', 'src', 'proxy', 'identity.ts'),
      'utf8',
    );
    const produced = [...identityModule.matchAll(/identitySource: '([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(produced.length, 'no identity sources found to check against').toBeGreaterThan(0);

    for (const source of produced) {
      // Every source that claims platform verification is accepted, and the one
      // that reports having seen nothing is refused. Nothing is left to a
      // default.
      const claimsVerification = source.includes(PLATFORM_VERIFIED_MARKER);
      expect(isPlatformVerified(source), source).toBe(claimsVerification);
    }
    expect(produced).toContain('none/no-authenticated-principal-observed');
    expect(isPlatformVerified('none/no-authenticated-principal-observed')).toBe(false);
  });

  it('keeps the documented source list consistent with the predicate', () => {
    for (const source of PLATFORM_VERIFIED_SOURCES) {
      expect(isPlatformVerified(source), source).toBe(true);
    }
  });

  it('probes the same ingress path the trials use', () => {
    // Imported by value rather than by import: bin/ingress-service.mjs builds a
    // routing surface from the environment when it is loaded, and a preflight
    // has no business doing that. Read as text instead, so the two cannot drift.
    const ingress = read('bin/ingress-service.mjs');
    const declared = /export const MCP_PATH = '([^']+)'/.exec(ingress);
    expect(declared, 'the ingress no longer declares MCP_PATH').not.toBeNull();
    expect(MCP_PATH).toBe(declared[1]);
  });

  it('interprets the ingress refusal codes the ingress actually returns', () => {
    const ingress = read('bin/ingress-service.mjs');
    const identity = read('src/agent-identity.mjs');
    const routing = read('src/routing.mjs');
    expect(`${identity}${ingress}`).toContain(PROBE_CODES.notAttributed);
    expect(routing).toContain(PROBE_CODES.attributed);
  });

  it('reads the observed principal out of a real refusal message', () => {
    // The exact sentence src/agent-identity.mjs produces when the platform
    // reports a caller that is neither expected agent.
    const message =
      'the platform reported caller stranger@example.iam.gserviceaccount.com ' +
      '(oidc-id-token/platform-verified:email), which is neither expected agent. Refusing: ...';
    expect(principalFromRefusal(message)).toEqual({
      principal: 'stranger@example.iam.gserviceaccount.com',
      identitySource: 'oidc-id-token/platform-verified:email',
    });
  });

  it('returns null for a message it cannot parse rather than half a reading', () => {
    expect(principalFromRefusal('something else entirely')).toBeNull();
    expect(principalFromRefusal(undefined)).toBeNull();
  });

  it('probes with a service no proxy fronts, so nothing can be mutated', () => {
    // The probe reaches identity resolution and stops at routing. If this ever
    // named a real partition the preflight would mutate a protected target.
    const preflight = read('bin/identity-preflight.mjs');
    const service = /UNROUTABLE_SERVICE = '([^']+)'/.exec(preflight)[1];
    const surfaceServices = /services: Object\.freeze\(\[([^\]]*)\]\)/.exec(read('src/routing.mjs'));
    expect(surfaceServices, 'the routing surface no longer declares its services').not.toBeNull();
    expect(surfaceServices[1]).not.toContain(service);
  });
});

// ---------------------------------------------------------------------------
// Step 5 of the ordering: nothing but a passing gate makes an attempt eligible
// ---------------------------------------------------------------------------

describe('a failing preflight blocks attempt eligibility', () => {
  it('gives a qualified deployment its attempts and a refused one none', () => {
    expect(attemptsEligibleFor(judge(healthy()))).toBe(ATTEMPTS_WHEN_QUALIFIED);
    expect(ATTEMPTS_WHEN_QUALIFIED).toBe(3);

    // The fatal case: both runtimes came up as the project default account.
    const collapsed = healthy();
    collapsed.runtimes.B.effectiveIdentity = SA_A;
    collapsed.ingressObservations = [observation('A', SA_A), observation('B', SA_A)];
    const refused = judge(collapsed);
    expect(refused.qualified).toBe(false);
    expect(attemptsEligibleFor(refused)).toBe(0);
  });

  it('fails closed on anything that is not exactly a qualified verdict', () => {
    // A gate that reads `verdict.qualified` loosely buys three attempts for an
    // object that never passed anything. Absent, truthy-but-not-true and
    // malformed all have to come out at zero — this is the one place in the
    // experiment where failing open would spend money on an unfalsifiable run.
    for (const value of [undefined, null, {}, { qualified: 'yes' }, { qualified: 1 }, { qualified: false }]) {
      expect(attemptsEligibleFor(value), JSON.stringify(value) ?? 'undefined').toBe(0);
    }
  });

  it('is the value provisioning writes into the blocked gate it declares', () => {
    // bin/10-provision.sh writes the gate in the blocked state before either
    // runtime exists, and names this file as the only thing that may raise it.
    const script = read('bin/10-provision.sh');
    expect(script).toContain('"attemptsEligible": 0');
    expect(script).toContain('"blockedBy": "identity-preflight"');
    expect(attemptsEligibleFor({ qualified: false })).toBe(0);

    // And the writer of the verdict artifact derives it rather than restating it.
    expect(read('bin/identity-preflight.mjs')).toContain(
      'attemptsEligible: attemptsEligibleFor(verdict)',
    );
  });
});
