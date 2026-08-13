/**
 * Minimal JSON-over-HTTP helpers, shared by the proxy and the target.
 *
 * Deliberately dependency-free. This repository ships no runtime dependencies,
 * and a web framework here would add a supply-chain surface to the two services
 * whose whole purpose is to be the trustworthy part of the path.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Refuse bodies larger than this rather than buffering whatever arrives. */
const MAX_BODY_BYTES = 64 * 1024;

export type BodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly detail: string };

/**
 * Read and parse a JSON request body.
 *
 * Bounded on purpose: an unbounded read is a denial-of-service on a service that
 * sits in front of a protected operation, and a proxy that can be starved is a
 * proxy that can be bypassed by starving it.
 */
export async function readJsonBody(request: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      total += buffer.length;
      if (total > MAX_BODY_BYTES) {
        return { ok: false, detail: `request body exceeds ${MAX_BODY_BYTES} bytes` };
      }
      chunks.push(buffer);
    }
  } catch (error) {
    return { ok: false, detail: `request body could not be read: ${(error as Error).message}` };
  }

  if (total === 0) return { ok: false, detail: 'request body is empty' };

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch (error) {
    return { ok: false, detail: `request body is not valid JSON: ${(error as Error).message}` };
  }
}

/** Send a JSON response. */
export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    // These services answer machines, and a cached authorization answer is a
    // replayed authorization answer.
    'cache-control': 'no-store',
  });
  response.end(payload);
}
