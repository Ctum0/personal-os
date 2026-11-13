/**
 * Edge-safe request gate for the Personal OS API.
 *
 * This module is imported by `src/proxy.ts`, which runs on the Edge runtime, so it
 * must never import Node-only modules (better-sqlite3, node:fs, …). The crypto
 * helpers it uses are WebCrypto-based for exactly that reason.
 *
 * Security model
 *  - No credential variables at all → open mode: a single trusted operator on a
 *    local workstation. Intended for `pnpm dev`; never for a public deployment.
 *  - Some but not all credential variables → **misconfigured**, and every
 *    request is refused. Failing closed here is deliberate: a typo in one key
 *    name must not silently publish an unauthenticated instance.
 *  - All configured → every `/api/*` request needs a valid, unexpired,
 *    HMAC-signed session cookie. The sign-in route is the only exempt path, and
 *    it can only ever authenticate the single configured account.
 *  - One account, no registration.
 */

import { SESSION_COOKIE, readAuthState, verifySessionToken } from '@/lib/auth/credentials';

const GATE_EXEMPT_PATHS = ['/api/auth/session'];

export interface GateRequestLike {
  headers: { get(name: string): string | null };
}

export interface GateResult {
  authorized: boolean;
  reason?: string;
  /** true when no credentials are configured at all */
  openMode: boolean;
  /** true when the credential set is present but incomplete */
  misconfigured?: boolean;
  /** variable names the deployment is missing, for logging */
  missing?: string[];
}

/** Extracts a named cookie from a raw `Cookie` header. */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export async function gateRequest(request: GateRequestLike, pathname?: string): Promise<GateResult> {
  const state = readAuthState();

  // Misconfiguration wins over every exemption: if the deployment cannot verify
  // sessions, it must not pretend to be open either.
  if (state.kind === 'incomplete') {
    return {
      authorized: false,
      openMode: false,
      misconfigured: true,
      missing: state.missing,
      reason: `Authentication is misconfigured: set ${state.missing.join(', ')} (or unset all four credential variables to run in open mode).`,
    };
  }

  if (state.kind === 'open') {
    return { authorized: true, openMode: true };
  }

  if (pathname && GATE_EXEMPT_PATHS.some(path => pathname === path)) {
    return { authorized: true, openMode: false };
  }

  if (!request) {
    return { authorized: false, openMode: false, reason: 'Missing request' };
  }

  const token = readCookie(request.headers.get('cookie') ?? '', SESSION_COOKIE);
  if (await verifySessionToken(state.config, token)) {
    return { authorized: true, openMode: false };
  }

  return {
    authorized: false,
    openMode: false,
    reason: 'Sign in required: this instance is protected. POST /api/auth/session with your credentials.',
  };
}
