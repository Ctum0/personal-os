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
}

/**
 * Best-effort client identity for throttling.
 *
 * Next's runtime does not hand the route a socket address, so this uses the
 * forwarded-for header when a reverse proxy sets it (Coolify/Traefik do) and
 * falls back to a single shared bucket. Behind the proxy that header is written
 * by the proxy itself, not by the browser, so it cannot be rotated freely.
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
