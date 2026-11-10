import { NextResponse, type NextRequest } from "next/server";
import { gateRequest } from "@/lib/api/gate";

/**
 * Global API gate (Next 16 `proxy` convention — replaces deprecated `middleware`).
 *
 * Enforced on every /api/* route. When PERSONAL_OS_PIN is set in the
 * environment, unauthenticated requests receive 401 with the session unlock
 * path in the WWW-Authenticate hint. When unset, requests pass (local
 * workstation mode) but still get an x-request-id for log correlation.
 *
 * Note: security checks must ALSO tolerate direct route hits bypassing
 * proxy in exotic runtimes — the /api/auth/session route validates its
 * own pin input server-side, and validateApiRequest remains available for
 * route-level defense in depth.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const result = await gateRequest(request as unknown as { headers: { get(name: string): string | null } }, pathname);

  if (!result.authorized) {
    return NextResponse.json(
      { error: result.reason || "Unauthorized", hint: "POST /unlock or POST /api/auth/session" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'PersonalOS-PIN realm="Personal OS"',
        },
      }
    );
  }

  const response = NextResponse.next();
  const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
