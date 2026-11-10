import { appendApiLog } from "./logger";

/**
 * Route-level request logging wrapper. The edge proxy assigns x-request-id
 * on every /api/* response; this wrapper (Node runtime, per route) measures
 * duration and appends a JSON-lines entry keyed by that id so access flow can
 * be traced end-to-end without introducing middleware runtime storage.
 */
export function withApiLogging(
  handler: (request: Request, ctx?: unknown) => Promise<Response>
): (request: Request, ctx?: unknown) => Promise<Response> {
  return async (request: Request, ctx?: unknown) => {
    const start = Date.now();
    let response: Response;
    try {
      response = await handler(request, ctx);
    } catch (err) {
      response = new Response(
        JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
      appendApiLog({
        ts: new Date().toISOString(),
        requestId: request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`,
        method: request.method,
        path: new URL(request.url).pathname,
        status: 500,
        durationMs: Date.now() - start,
        error: (err as Error).message,
      });
      return response;
    }
    appendApiLog({
      ts: new Date().toISOString(),
      requestId: response.headers.get("x-request-id") || request.headers.get("x-request-id") || "?",
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Date.now() - start,
    });
    return response;
  };
}
