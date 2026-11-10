/**
 * Edge-safe request gate for the Personal OS API.
 *
 * This module must stay importable from middleware (Edge runtime), so it must
 * NOT import anything Node-only (better-sqlite3, node:fs, etc.).
 *
 * Security model (see docs/adr/0001-deployment-strategy.md):
 * - No PERSONAL_OS_PIN in the environment → open mode: the app assumes a single
 *   trusted user on a loopback workstation and allows everything.
 * - PERSONAL_OS_PIN set → every /api/* request must prove session possession:
 *   either an `x-personal-os-pin: <raw pin>` header, or a
 *   `personal_os_session: <sha256(pin)>` cookie (set by POST /api/auth/session).
 * - Comparison is constant-time over SHA-256 digests.
 */

const GATE_EXEMPT_PATHS = ["/api/auth/session"];

export interface GateRequestLike {
  headers: { get(name: string): string | null };
}

export interface GateResult {
  authorized: boolean;
  reason?: string;
  /** true when the app runs open (no pin configured) */
  openMode: boolean;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

/** Constant-time byte comparison for equal-length inputs (hex digests here). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function gateRequest(request: GateRequestLike, pathname?: string): Promise<GateResult> {
  const pin = process.env.PERSONAL_OS_PIN;

  if (pathname && GATE_EXEMPT_PATHS.some(p => pathname === p || pathname.startsWith(`${p}?`))) {
    return { authorized: true, openMode: !pin };
  }

  if (!pin) {
    // Local workstation mode: open on loopback by default.
    return { authorized: true, openMode: true };
  }

  if (!request) {
    return { authorized: false, openMode: false, reason: "Missing request" };
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const headerPin = request.headers.get("x-personal-os-pin");
  const sessionCookie = /personal_os_session\s*=\s*([A-Za-z0-9]+)/.exec(cookieHeader)?.[1];

  const expectedDigest = await sha256Hex(pin);

  if (headerPin) {
    const headerDigest = await sha256Hex(headerPin);
    if (constantTimeEqualHex(headerDigest, expectedDigest)) {
      return { authorized: true, openMode: false };
    }
  }

  if (sessionCookie) {
    if (constantTimeEqualHex(sessionCookie, expectedDigest)) {
      return { authorized: true, openMode: false };
    }
  }

  return {
    authorized: false,
    openMode: false,
    reason: "Invalid or missing Personal OS session (set via POST /api/auth/session or x-personal-os-pin header)",
  };
}
