import { NextResponse, type NextRequest } from "next/server";
import { gateRequest } from "@/lib/api/gate";

/**
 * Global API gate (Next 16 `proxy` convention — replaces deprecated `middleware`).
 *
 * Enforced on every /api/* route. When operator credentials are configured, an
 * unauthenticated request receives 401 with a sign-in hint; the browser client
 * redirects to /login. When they are not configured the app runs in open
 * workstation mode (a local `pnpm dev`), but still stamps a request id so access
 * logs can be correlated.
 *
 * The request id is forwarded on the *request* headers as well as the response,
 * because route handlers log from Node land and the proxy is the only place that
 * knows the correlation id.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const result = await gateRequest(request as unknown as { headers: { get(name: string): string | null } }, pathname);

  if (!result.authorized) {
    return NextResponse.json(
      { error: result.reason || "Unauthorized", hint: "POST /api/auth/session with your credentials" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'PersonalOS-Session realm="Personal OS"',
        },
      }
    );
  }

  const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
