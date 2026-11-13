/**
 * Login attempt throttling.
 *
 * A single operator account with one password is the app's only barrier, so
 * unlimited guessing has to be the thing that is hard, not the password. The
 * limiter is in-process and keyed by client address: enough to make online
 * brute force impractical, cheap enough (one Map lookup) to run on every attempt,
 * and it costs no storage.
 *
 * It is deliberately simple: N failures in a window lock the address out for a
 * cooldown that doubles on each subsequent lockout, capped. A successful login
 * clears the record.
 */

interface AttemptRecord {
  failures: number;
  /** Epoch ms until which this address is refused. */
  lockedUntil: number;
  /** Epoch ms when the current counting window started. */
  windowStart: number;
  /** Consecutive lockouts, used to lengthen the cooldown. */
  lockouts: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const BASE_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;
/** Cap the map so a flood of spoofed addresses cannot exhaust memory. */
const MAX_TRACKED_CLIENTS = 5_000;

/**
 * Global backstop.
 *
 * Per-client keys are only as trustworthy as the header they come from. Behind a
 * CDN the proxy sets `x-forwarded-for` to its own peer, so many clients can
 * collapse into one bucket; and if the deployment trusts a client-supplied
 * header, an attacker can rotate the key and never reach the per-client limit.
 * A global counter bounds total guessing regardless: it is the property that
 * makes a single-password system non-brute-forceable.
 *
 * The tradeoff is deliberate and bounded — an attacker who triggers it blocks
 * sign-in attempts for the cooldown, but an existing session keeps working, so
 * the operator is not thrown out of the app.
 */
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_MAX_FAILURES = 20;
const GLOBAL_LOCKOUT_MS = 15 * 60 * 1000;

let globalFailures = 0;
let globalWindowStart = 0;
let globalLockedUntil = 0;

const attempts = new Map<string, AttemptRecord>();

export interface ThrottleDecision {
  allowed: boolean;
  /** Seconds until the caller may retry, when refused. */
  retryAfterSeconds?: number;
}

function prune(now: number): void {
  if (attempts.size <= MAX_TRACKED_CLIENTS) return;
  for (const [key, record] of attempts) {
    if (record.lockedUntil <= now && now - record.windowStart > WINDOW_MS) {
      attempts.delete(key);
    }
    if (attempts.size <= MAX_TRACKED_CLIENTS) break;
  }
}

/** True when this client may attempt a login right now. */
export function checkLoginAllowed(clientKey: string, now: number = Date.now()): ThrottleDecision {
  if (globalLockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((globalLockedUntil - now) / 1000) };
  }

  const record = attempts.get(clientKey);
  if (!record) return { allowed: true };
  if (record.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

/** Records a failed attempt and returns the decision for a follow-up attempt. */
export function recordLoginFailure(clientKey: string, now: number = Date.now()): ThrottleDecision {
  prune(now);

  // Global accounting runs first so the returned decision reflects the stronger
  // of the two limits.
  if (now - globalWindowStart > GLOBAL_WINDOW_MS) {
    globalWindowStart = now;
    globalFailures = 0;
  }
  globalFailures += 1;
  if (globalFailures >= GLOBAL_MAX_FAILURES) {
    globalLockedUntil = now + GLOBAL_LOCKOUT_MS;
    globalFailures = 0;
    globalWindowStart = now;
    return { allowed: false, retryAfterSeconds: Math.ceil(GLOBAL_LOCKOUT_MS / 1000) };
  }

  const record = attempts.get(clientKey) ?? { failures: 0, lockedUntil: 0, windowStart: now, lockouts: 0 };

  // A window that has fully elapsed resets the failure count but keeps the
  // lockout history so repeated lockouts still lengthen.
  if (now - record.windowStart > WINDOW_MS && record.lockedUntil <= now) {
    record.failures = 0;
    record.windowStart = now;
  }

  record.failures += 1;

  if (record.failures >= MAX_FAILURES) {
    const cooldown = Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** record.lockouts);
    record.lockedUntil = now + cooldown;
    record.lockouts += 1;
    record.failures = 0;
    record.windowStart = now;
    attempts.set(clientKey, record);
    return { allowed: false, retryAfterSeconds: Math.ceil(cooldown / 1000) };
  }

  attempts.set(clientKey, record);
  return { allowed: true };
}

/** Clears the record for a client that authenticated successfully. */
export function recordLoginSuccess(clientKey: string): void {
  attempts.delete(clientKey);
}

/** Test/tooling hook: forget every tracked client. */
export function resetLoginThrottle(): void {
  attempts.clear();
  globalFailures = 0;
  globalWindowStart = 0;
  globalLockedUntil = 0;
}

/**
 * Best-effort client identity for throttling.
 *
 * Next's runtime does not hand the route a socket address, so this reads the
 * first `x-forwarded-for` entry — the original client, as recorded by the edge.
 *
 * This is **not** a security boundary on its own: a proxy that appends to a
 * client-supplied header, or a CDN that rewrites it to its own peer, both make
 * the value weaker or coarser than it looks. The per-client limit is therefore
 * paired with a global backstop above, which is what actually bounds guessing.
 * `docs/DEPLOYMENT.md` records the proxy-side requirement (trusted proxies) that
 * makes this value meaningful.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'local';
}
