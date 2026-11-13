import { NextResponse } from "next/server";
import { appendApiLog } from "./logger";
import { IDEMPOTENCY_HEADER } from "./idempotency-key";
import { readIdempotentResponse, storeIdempotentResponse } from "./idempotency";
import { getCurrentSession } from "@/lib/auth";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Route-level request logging wrapper.
 *
 * Responsibilities, in order:
 *  1. Replay: a repeated `X-Idempotency-Key` on a mutation returns the stored
 *     response instead of running the handler a second time. This is what makes
 *     the offline queue's retry safe after a lost response.
 *  2. Logging: every /api/* call appends one JSON-lines entry keyed by the
 *     request id that `src/proxy.ts` stamped on the request and response, so the
 *     client-visible header can be looked up in the log.
 *  3. Failure containment: a thrown handler becomes a 500 with the real message
 *     (routes normally catch their own errors through `routeError`).
 */
export function withApiLogging<Ctx = unknown>(
  handler: (request: Request, ctx?: Ctx) => Promise<Response>
): (request: Request, ctx?: Ctx) => Promise<Response> {
  return async (request: Request, ctx?: Ctx) => {
    const start = Date.now();
    const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;
    const path = new URL(request.url).pathname;

    const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER);
    const shouldReplay = Boolean(idempotencyKey) && MUTATING_METHODS.has(request.method);

    if (shouldReplay && idempotencyKey) {
      const replay = resolveReplay(idempotencyKey, request);
      if (replay) {
        appendApiLog({
          ts: new Date().toISOString(),
          requestId,
          method: request.method,
          path,
          status: replay.status,
          durationMs: Date.now() - start,
        });
        return replay;
      }
    }

    let response: Response;
    try {
      response = await handler(request, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      appendApiLog({
        ts: new Date().toISOString(),
        requestId,
        method: request.method,
        path,
        status: 500,
        durationMs: Date.now() - start,
        error: message,
      });
      return NextResponse.json({ error: message }, { status: 500, headers: { "x-request-id": requestId } });
    }

    // Never mutate the handler's own headers: NextResponse bodies can be
    // immutable, and a set() there would throw inside the wrapper and turn a
    // successful request into a 500. The proxy already stamped the response, so
    // the header is only *read* for correlation.
    const responseRequestId = response.headers.get("x-request-id") || requestId;

    if (shouldReplay && idempotencyKey && response.status < 500) {
      await persistReplay(idempotencyKey, request, response);
    }

    appendApiLog({
      ts: new Date().toISOString(),
      requestId: responseRequestId,
      method: request.method,
      path,
      status: response.status,
      durationMs: Date.now() - start,
    });
    return response;
  };
}

/** Returns a stored response for this key, or null on a first attempt. */
function resolveReplay(key: string, request: Request): NextResponse | null {
  try {
    const tenantId = getCurrentSession().tenantId;
    const stored = readIdempotentResponse(tenantId, key, {
      method: request.method,
      path: new URL(request.url).pathname,
    });
    if (!stored) return null;
    return new NextResponse(stored.body, {
      status: stored.status,
      headers: { "content-type": stored.contentType, "idempotent-replay": "true" },
    });
  } catch {
    // No session (or no database): treat as a first attempt rather than failing.
    return null;
  }
}

/** Buffers the response body so a retry can be answered without re-running. */
async function persistReplay(key: string, request: Request, response: Response): Promise<void> {
  try {
    const tenantId = getCurrentSession().tenantId;
    const body = await response.clone().text();
    storeIdempotentResponse(tenantId, key, request.method, new URL(request.url).pathname, {
      status: response.status,
      body,
      contentType: response.headers.get("content-type") ?? "application/json",
    });
  } catch {
    // Caching a replay is a durability optimization; never fail the request.
  }
}
