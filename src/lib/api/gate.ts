/**
 * Edge-safe request gate for the Personal OS API.
 *
 * This module is imported by `src/proxy.ts`, which runs on the Edge runtime, so it
 * must never import Node-only modules (better-sqlite3, node:fs, …). The crypto
 * helpers it uses are WebCrypto-based for exactly that reason.
 *
 * Security model
 *  - No credentials configured → open mode: a single trusted operator on a local
 *    workstation. Intended for `pnpm dev`; never for a public deployment.
 *  - Credentials configured → every `/api/*` request must carry a valid,
 *    unexpired, HMAC-signed session cookie. The login route is the only exempt
 *    path, and it can only ever authenticate the single configured account.
 *  - One account, no registration. Adding a second user is not a supported
 *    operation, so "who may act" has exactly one answer.
 */

import { SESSION_COOKIE, readAuthConfig, verifySessionToken } from '@/lib/auth/credentials';

const GATE_EXEMPT_PATHS = ['/api/auth/session'];

export interface GateRequestLike {
  headers: { get(name: string): string | null };
}

export interface GateResult {
  authorized: boolean;
  reason?: string;
  /** true when no credentials are configured */
  openMode: boolean;
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
  if (pathname && GATE_EXEMPT_PATHS.some(path => pathname === path)) {
    return { authorized: true, openMode: !readAuthConfig() };
  }

  const config = readAuthConfig();
  if (!config) {
    return { authorized: true, openMode: true };
  }

  if (!request) {
    return { authorized: false, openMode: false, reason: 'Missing request' };
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (await verifySessionToken(config, token)) {
    return { authorized: true, openMode: false };
  }

  return {
    authorized: false,
    openMode: false,
    reason: 'Sign in required: this instance is protected. POST /api/auth/session with your credentials.',
  };
}
