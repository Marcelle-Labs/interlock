/**
 * The routing surface: dispatch, fail-closed, and the shared store.
 *
 * The load-bearing assertion is object identity. Two proxies holding two stores
 * with identical contents look the same in every structural comparison and are
 * completely blind to each other, so `toBe` is the check and `toEqual` would be
 * a false pass.
 *
 * The separate-store configuration is exercised here as a negative control. It
 * lives in the tests and nowhere else: the routing surface constructs exactly
 * one store and offers no way to ask for two, so the treatment deployment
 * cannot quietly become the control.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { InMemoryPendingIntentStore } from '../../../dist/broker/pairing/store.js';
import { InterlockProxy } from '../../../dist/proxy/service.js';
import { DirectTargetPort } from '../../../dist/proxy/target-port.js';
import { OPERATION_SET_RESERVATION } from '../../../dist/target/state.js';

import { ROUTE_FAIL_CLOSED, createRoutingSurface, dispatch, route } from '../src/routing.mjs';
import { TARGET_IDS, createPartitionedTargets } from '../src/partition.mjs';

const intentFor = (service) => ({
  operation: OPERATION_SET_RESERVATION,
  arguments: { service, reserved: 60 },
});

function proxyOptions() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keys = new Map([['routing-test', publicKey]]);
  const targets = createPartitionedTargets({ keys });
  const per = (service) => ({
    targetId: TARGET_IDS[service],
    target: new DirectTargetPort(targets[service]),
    signingKey: { keyId: 'routing-test', privateKey },
    evidence: null,
    sourceRevision: 'unused-in-these-tests',
  });
  return { alpha: per('alpha'), beta: per('beta'), targets };
}

describe('the routing surface', () => {
  it('routes service=alpha to proxy A', () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    const routed = route(surface, 'alpha');
    expect(routed.ok).toBe(true);
    expect(routed.proxy).toBe(surface.proxies.alpha);
  });

  it('routes service=beta to proxy B', () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    const routed = route(surface, 'beta');
    expect(routed.ok).toBe(true);
    expect(routed.proxy).toBe(surface.proxies.beta);
  });

  it('fails closed on an unknown service', () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    const routed = route(surface, 'gamma');
    expect(routed.ok).toBe(false);
    expect(routed.failClosed).toBe(true);
    expect(routed.code).toBe(ROUTE_FAIL_CLOSED);
  });

  it('fails closed on a missing service', async () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    expect(route(surface, undefined).failClosed).toBe(true);
    const dispatched = await dispatch(surface, {
      correlationId: 'ilk-aaaaaaaaaaaaaaaa',
      intent: { operation: OPERATION_SET_RESERVATION, arguments: {} },
    });
    expect(dispatched.dispatched).toBe(false);
    expect(dispatched.failClosed).toBe(true);
  });

  it('fails closed on a non-string service, including an inherited property name', () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    for (const value of [42, null, {}, ['alpha'], true]) {
      expect(route(surface, value).failClosed).toBe(true);
    }
    // A routing table on Object.prototype would resolve these to a function.
    for (const inherited of ['toString', 'constructor', '__proto__']) {
      expect(route(surface, inherited).failClosed).toBe(true);
    }
  });

  it('gives both proxies one shared store identity, not two equal stores', () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    const store = surface.store;
    expect(store).toBeInstanceOf(InMemoryPendingIntentStore);

    // Identity, reached through each proxy's own captured options. Equality
    // would pass with two blind stores; this cannot.
    const alphaStore = surface.proxies.alpha.options.store;
    const betaStore = surface.proxies.beta.options.store;
    expect(alphaStore).toBe(store);
    expect(betaStore).toBe(store);
    expect(alphaStore).toBe(betaStore);

    // And it behaves like one store: what A records, B can see.
    store.record({
      correlationId: 'ilk-bbbbbbbbbbbbbbbb',
      agent: 'a',
      operation: OPERATION_SET_RESERVATION,
      targets: ['services/alpha/reservation.json'],
      intentDigest: 'sha256:x',
      recordedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const seen = betaStore.active(new Date(), 'ilk-cccccccccccccccc');
    expect(seen.ok).toBe(true);
    expect(seen.value).toHaveLength(1);
  });

  it('negative control: two proxies with a separate store each are blind to one another', () => {
    const { alpha, beta } = proxyOptions();
    const storeA = new InMemoryPendingIntentStore();
    const storeB = new InMemoryPendingIntentStore();
    const proxyA = new InterlockProxy({ ...alpha, store: storeA });
    const proxyB = new InterlockProxy({ ...beta, store: storeB });

    expect(storeA).not.toBe(storeB);
    expect(proxyA.options.store).not.toBe(proxyB.options.store);

    storeA.record({
      correlationId: 'ilk-dddddddddddddddd',
      agent: 'a',
      operation: OPERATION_SET_RESERVATION,
      targets: ['services/alpha/reservation.json'],
      intentDigest: 'sha256:x',
      recordedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    // Structurally the two stores are the same class with the same interface,
    // and B still cannot see A's work. That is the whole reason the treatment
    // needs identity rather than equality.
    const seenByB = storeB.active(new Date(), 'ilk-eeeeeeeeeeeeeeee');
    expect(seenByB.ok).toBe(true);
    expect(seenByB.value).toHaveLength(0);
  });

  it('routes a real request through to the proxy it fronts', async () => {
    const { alpha, beta } = proxyOptions();
    const surface = createRoutingSurface({ alpha, beta });
    const outcome = await dispatch(surface, {
      correlationId: 'ilk-ffffffffffffffff',
      callerIdentity: 'routing-test',
      identitySource: 'test',
      intent: intentFor('alpha'),
      targets: ['services/alpha/reservation.json'],
    });
    expect(outcome.dispatched).toBe(true);
    expect(outcome.service).toBe('alpha');
    // Evidence is null in these fixtures, so the proxy must fail closed rather
    // than allow. Routing delivered the request; the proxy made the call.
    expect(outcome.response.decision).toBe('DENY');
  });
});
