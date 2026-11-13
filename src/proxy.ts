import { NextResponse, type NextRequest } from "next/server";
import { gateRequest } from "@/lib/api/gate";
import { SESSION_COOKIE, readAuthState, verifySessionToken } from "@/lib/auth/credentials";
import { readCookie } from "@/lib/api/gate";

/**
 * Global gate (Next 16 `proxy` convention — replaces deprecated `middleware`).
 *
 * It guards **both** surfaces, because gating only the API is not protection:
 *
 *  - `/api/*`  → 401 JSON, so the client can redirect to `/login`.
 *  - any page  → 307 to `/login?next=<path>`, so a signed-out visitor never sees
 *                 the shell, the sidebar, or a skeleton of somebody's finances.
 *
 * When operator credentials are not configured the app runs in open workstation
 * mode (a local `pnpm dev`) and pages pass through untouched.
 *
 * `x-request-id` is stamped on the forwarded request headers as well as the
 * response, because route handlers log from Node land and the proxy is the only
 * place that knows the correlation id.
 */

/** Reachable without a session: the sign-in page and its own endpoint. */
const PUBLIC_PAGES = new Set(["/login"]);

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/icon.svg" ||
    pathname === "/icon.png" ||
    pathname === "/robots.txt"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const state = readAuthState();

  // A partial credential set is a deployment error, not open mode. Refuse
  // everything (including the sign-in route) with a 503 that names the missing
  // variables, so a typo cannot silently publish an unauthenticated instance.
  if (state.kind === "incomplete") {
    return NextResponse.json(
      {
        error: "Authentication is misconfigured",
        missing: state.missing,
        hint: `Set ${state.missing.join(", ")}, or unset all four credential variables to run in open mode.`,
      },
      { status: 503 }
    );
  }

  const config = state.kind === "configured" ? state.config : null;

  // Open mode, or a public/static asset: pass through with a correlation id.
  if (!config || isStaticAsset(pathname) || PUBLIC_PAGES.has(pathname)) {
    const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const token = readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE);
  if (await verifySessionToken(config, token)) {
    const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  // API: machine-readable rejection. The client turns 401 into a redirect.
  //
  // `gateRequest` is consulted rather than assumed, because it owns the exempt
  // list: `/api/auth/session` must stay reachable while signed out or sign-in is
  // impossible. Its answer is authoritative.
  if (pathname.startsWith("/api/")) {
    const result = await gateRequest(request, pathname);
    if (result.authorized) {
      const requestId = request.headers.get("x-request-id") || `req_${crypto.randomUUID()}`;
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-request-id", requestId);
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.headers.set("x-request-id", requestId);
      return response;
    }
    return NextResponse.json(
      { error: result.reason || "Unauthorized", hint: "POST /api/auth/session with your credentials" },
      { status: 401, headers: { "WWW-Authenticate": 'PersonalOS-Session realm="Personal OS"' } }
    );
  }

  // Pages: send the visitor to sign in, preserving where they were going.
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const target = `${pathname}${search}`;
  if (target !== "/") loginUrl.searchParams.set("next", target);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next's static internals and image optimisation. Assets are
  // also allowed through explicitly above, which keeps this list readable.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
