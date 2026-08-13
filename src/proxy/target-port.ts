/**
 * The proxy's HTTP client for the protected target.
 *
 * Two calls, both deliberately explicit about failure. `revision` is what the
 * receipt binds to; `execute` presents the receipt. Neither retries: a retry of a
 * mutation whose outcome is unknown is how one authorization becomes two
 * mutations, and the caller is told the outcome is unknown instead.
 */
import { CORRELATION_HEADER, RECEIPT_HEADER } from '../correlation.js';
import type { SignedReceipt } from '../authorization/receipt.js';
import type { Intent } from '../authorization/intent.js';
import { encodeReceiptHeader } from '../target/http.js';
import type { TargetResponse } from '../target/service.js';
import type { TargetPort } from './service.js';

export interface HttpTargetPortOptions {
  readonly baseUrl: string;
  /**
   * Supplies a bearer token for target-to-target authentication.
   *
   * A function rather than a value because Cloud Run identity tokens expire, and
   * a token captured at construction would work in a test and fail in an hour.
   */
  readonly authToken?: () => Promise<string | undefined>;
  readonly fetchImpl?: typeof fetch;
}

export class HttpTargetPort implements TargetPort {
  public constructor(private readonly options: HttpTargetPortOptions) {}

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private async headers(correlationId?: string): Promise<Record<string, string>> {
    const token = await this.options.authToken?.();
    return {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(correlationId === undefined ? {} : { [CORRELATION_HEADER]: correlationId }),
    };
  }

  public async revision(): Promise<string> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/v1/state`, {
      method: 'GET',
      headers: await this.headers(),
    });
    if (!response.ok) {
      throw new Error(`target state read failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as { revision?: unknown };
    if (typeof body.revision !== 'string') {
      throw new TypeError('target state response carries no revision');
    }
    return body.revision;
  }

  public async execute(input: {
    readonly correlationId: string;
    readonly receipt: SignedReceipt;
    readonly intent: Intent;
  }): Promise<TargetResponse> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/v1/mutate`, {
      method: 'POST',
      headers: {
        ...(await this.headers(input.correlationId)),
        [RECEIPT_HEADER]: encodeReceiptHeader(input.receipt),
      },
      body: JSON.stringify(input.intent),
    });

    // The target answers with a structured body on both success and refusal, so
    // the body is parsed regardless of status. A non-2xx is not an exception
    // here: "the target refused" is an answer, not a transport fault.
    return (await response.json()) as TargetResponse;
  }
}

/**
 * An in-process port, for tests and for the single-process local run.
 *
 * Deliberately not a mock: it calls the same `ProtectedTarget` methods the HTTP
 * adapter calls, so a test using it exercises real enforcement and only skips the
 * socket.
 */
export class DirectTargetPort implements TargetPort {
  public constructor(
    private readonly target: {
      readonly revision: string;
      mutate(request: {
        readonly correlationId: string;
        readonly presented: unknown;
        readonly intent: Intent;
        readonly now: Date;
      }): TargetResponse;
    },
  ) {}

  public revision(): Promise<string> {
    return Promise.resolve(this.target.revision);
  }

  public execute(input: {
    readonly correlationId: string;
    readonly receipt: SignedReceipt;
    readonly intent: Intent;
  }): Promise<TargetResponse> {
    return Promise.resolve(
      this.target.mutate({
        correlationId: input.correlationId,
        presented: input.receipt,
        intent: input.intent,
        now: new Date(),
      }),
    );
  }
}
