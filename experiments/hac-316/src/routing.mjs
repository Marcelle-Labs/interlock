/**
 * The experiment-local routing surface.
 *
 * ## Why it has to be local
 *
 * `ProxyOptions` binds exactly one `targetId` and one `TargetPort`, and receipt
 * minting reads that bound `targetId`. One proxy therefore cannot front two
 * targets, and `createProxyServer` is nominally typed to `InterlockProxy`, so a
 * structural stand-in does not compile. Widening either would be a product
 * change made to suit an experiment (X-10), so the dispatch lives out here
 * instead — two real proxies, one per partition, and a switch in front of them.
 *
 * ## The load-bearing line in this file
 *
 * There is exactly one store, and both proxies get the same object. That is the
 * whole treatment: `PendingIntent` carries no `targetId`, and arbitration reads
 * only the paths an intent writes, so two proxies sharing one store see each
 * other's in-flight work and can serialize across targets — with zero change to
 * production code. Object identity, not structural equality; two stores holding
 * equal contents would be two blind proxies.
 *
 * The separate-store configuration exists only as a negative control, and it
 * lives in the tests. It is not constructible from this module, which is the
 * point: the treatment deployment cannot accidentally become the control.
 *
 * ## What this surface must never do
 *
 * It does not inspect the co-change artifact, does not authorize, does not
 * transform arguments, does not mint receipts, and takes no part in arbitration
 * (X-15). It reads one field — which service the request writes — and hands the
 * whole request to the proxy that fronts that service, unaltered.
 *
 * Anything it cannot route is refused. Fail-closed is the default branch rather
 * than a gap in an allow-list: the routing table has a null prototype, so an
 * inherited property name is not a route either.
 */
import { InMemoryPendingIntentStore } from '../../../dist/broker/pairing/store.js';
import { InterlockProxy } from '../../../dist/proxy/service.js';

/** Refusal code for anything the surface cannot route. */
export const ROUTE_FAIL_CLOSED = 'ROUTE_FAIL_CLOSED';

/**
 * Two proxies, one shared pending-intent store.
 *
 * `alpha` and `beta` are complete `ProxyOptions` minus the store, assembled by
 * the caller. Assembling them here would mean this file reading things it is
 * forbidden to read.
 */
export function createRoutingSurface({ alpha, beta }) {
  const store = new InMemoryPendingIntentStore();

  const proxies = Object.create(null);
  proxies.alpha = new InterlockProxy({ ...alpha, store });
  proxies.beta = new InterlockProxy({ ...beta, store });

  return { store, proxies, services: Object.freeze(['alpha', 'beta']) };
}

/** Which service a request writes, without interpreting anything else. */
export function serviceOf(request) {
  return request?.intent?.arguments?.service;
}

/**
 * Resolve one request to one proxy.
 *
 * Every non-route — a name with no proxy, a missing name, a name that is not a
 * string — lands in the same refusal. There is no branch that returns "no route,
 * carry on".
 */
export function route(surface, service) {
  if (typeof service !== 'string' || service === '') {
    return {
      ok: false,
      failClosed: true,
      code: ROUTE_FAIL_CLOSED,
      detail: `a request must name the service it writes as a non-empty string; got ${typeof service}`,
    };
  }
  if (!Object.hasOwn(surface.proxies, service)) {
    return {
      ok: false,
      failClosed: true,
      code: ROUTE_FAIL_CLOSED,
      detail: `no proxy fronts service ${service}; refusing rather than picking one`,
    };
  }
  return { ok: true, failClosed: false, service, proxy: surface.proxies[service] };
}

/** Route a request and hand it over unaltered. */
export async function dispatch(surface, request) {
  const routed = route(surface, serviceOf(request));
  if (!routed.ok) {
    return {
      dispatched: false,
      correlationId: request?.correlationId,
      failClosed: true,
      code: routed.code,
      detail: routed.detail,
    };
  }
  return {
    dispatched: true,
    correlationId: request.correlationId,
    service: routed.service,
    response: await routed.proxy.handle(request),
  };
}
