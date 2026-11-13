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

/** Reachable without a session: the sign-in page, its endpoint and the manifest. */
const PUBLIC_PAGES = new Set(["/login", "/manifest.json", "/robots.txt"]);

/**
 * Extensions served from `public/` that must never require a session.
 *
 * Text-ish types (`json`, `txt`, `xml`) are deliberately absent: this check runs
 * before the `/api/` branch, so allowing them would let a future `/api/…​.json`
 * route bypass authentication entirely. `/manifest.json` is handled as a public
 * page instead.
 */
const ASSET_EXTENSION = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|webmanifest)$/i;

/**
 * True for static files that a signed-out browser legitimately requests.
 *
 * This is an extension check rather than a list of filenames on purpose: the PWA
 * manifest names `/icon-512.png`, and an enumerated list silently broke
 * installability the first time an icon was added (it redirected to `/login`).
 * No page route in this app ends in an asset extension, so the check is safe.
 */
function isStaticAsset(pathname: string): boolean {
  // Never treat an API path as an asset, whatever it is called.
  if (pathname.startsWith("/api/")) return false;
  return pathname.startsWith("/_next/") || ASSET_EXTENSION.test(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const state = readAuthState();

  // A partial credential set is a deployment error, not open mode. Refuse
  // everything (including the sign-in route) with a 503 that names the missing
  // variables, so a typo cannot silently publish an unauthenticated instance.
  if (state.kind === "incomplete") {
    // Let the sign-in page render the explanation itself: it is the URL a
    // browser is sent to, so the operator should read a sentence there, not a
    // raw JSON body. Every other path stays a machine-readable 503.
    if (pathname === "/login") {
      return NextResponse.next();
    }
    if (!pathname.startsWith("/api/")) {
      const target = request.nextUrl.clone();
      target.pathname = "/login";
      target.search = "";
      return NextResponse.redirect(target);
    }
    return NextResponse.json(
      {
        error: "Authentication is misconfigured",
        missing: state.missing,
        invalid: state.invalid,
        hint: state.invalid?.length
          ? `${state.invalid.join(", ")} cannot work as configured (placeholder or wrong shape). Generate real values, or unset all four to run in open mode.`
          : `Set ${state.missing.join(", ")}, or unset all four credential variables to run in open mode.`,
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
