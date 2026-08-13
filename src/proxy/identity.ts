/**
 * Caller identity, as actually observed at the proxy.
 *
 * HAC-326 forbids inferring identity fields from documentation. This module
 * therefore reads only what a request carries, names how it was established, and
 * has an explicit representation for "nothing usable arrived" — because a
 * receipt bound to an identity the proxy invented would be worse than a receipt
 * with no identity binding at all.
 *
 * ## Why the token is decoded rather than verified here
 *
 * On Cloud Run with `--no-allow-unauthenticated`, the platform verifies the
 * caller's Google-signed ID token *before* the container is invoked; a request
 * with an absent, expired or badly signed token never arrives. What reaches the
 * container is therefore an already-verified token, and re-verifying it would
 * mean fetching and trusting a JWKS from inside the request path for a signature
 * the platform has already checked.
 *
 * That reasoning is only valid while the deployment posture holds, so it is
 * recorded in the identity source string itself — `oidc-id-token/platform-verified`
 * — rather than left as a comment. A deployment that allowed unauthenticated
 * access would be presenting unverified claims under that label, which is why the
 * evidence packet records the deployment flag alongside the identity fixture.
 */

/** Identity the proxy observed, and the provenance of that observation. */
export interface ObservedIdentity {
  readonly identity: string;
  readonly identitySource: string;
}

/** Placeholder recorded when no usable identity reached the proxy. */
export const IDENTITY_UNAVAILABLE: ObservedIdentity = Object.freeze({
  identity: 'unavailable',
  identitySource: 'none/no-authenticated-principal-observed',
});

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (payload === undefined || payload === '') return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    // A token whose payload is not JSON tells us nothing about who is calling.
    // Returning null routes that to IDENTITY_UNAVAILABLE, which is the honest
    // answer, rather than throwing inside a request handler.
    return null;
  }
}

/**
 * Extract the caller identity from request headers.
 *
 * Preference order reflects how specific each source is about *who* is calling:
 * a verified end-user header beats a service identity beats nothing.
 */
export function observeIdentity(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): ObservedIdentity {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  // Set by IAP / Cloud Run when an end-user identity is forwarded.
  const authenticatedUser = header('x-goog-authenticated-user-email');
  if (authenticatedUser !== undefined && authenticatedUser !== '') {
    return {
      identity: authenticatedUser.replace(/^accounts\.google\.com:/, ''),
      identitySource: 'x-goog-authenticated-user-email/platform-verified',
    };
  }

  const authorization = header('authorization');
  if (authorization !== undefined && /^bearer /i.test(authorization)) {
    const claims = decodeJwtPayload(authorization.slice('bearer '.length).trim());
    if (claims !== null) {
      const email = claims['email'];
      if (typeof email === 'string' && email !== '') {
        return { identity: email, identitySource: 'oidc-id-token/platform-verified:email' };
      }
      const subject = claims['sub'];
      if (typeof subject === 'string' && subject !== '') {
        return { identity: subject, identitySource: 'oidc-id-token/platform-verified:sub' };
      }
    }
  }

  return IDENTITY_UNAVAILABLE;
}
