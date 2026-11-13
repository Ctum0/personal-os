/**
 * Edge-safe credential and session primitives.
 *
 * Runs in the Next `proxy` (Edge runtime), so it uses only WebCrypto — no
 * `node:crypto`, no filesystem, no database. Everything here is pure: given the
 * configured env values, it answers "are these credentials valid?" and "is this
 * session token authentic and unexpired?".
 *
 * Security model
 *  - Single operator. The account exists only in configuration: there is no
 *    signup route, no user table to insert into, and no way to add a second
 *    credential through the app.
 *  - The password is never stored in plaintext. `PERSONAL_OS_PASSWORD_HASH` is a
 *    PBKDF2-HMAC-SHA256 digest of the password over a per-deployment salt, and
 *    comparison is length-independent and non-short-circuiting.
 *  - The session cookie is an HMAC-SHA256 tag over `version|username|expiry`, so
 *    it cannot be forged or edited without the server secret, and it expires.
 */

export const SESSION_COOKIE = 'personal_os_session';
export const SESSION_VERSION = 'v1';

/** 7 days: long enough to not nag, short enough that a leaked cookie ages out. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** PBKDF2 work factor for verification. Must match how the hash was derived. */
export const DEFAULT_ITERATIONS = 210_000;

export interface AuthConfig {
  username: string;
  salt: string;
  passwordHash: string;
  iterations: number;
  sessionSecret: string;
}

/**
 * Reads the operator account from the environment.
 *
 * Returns `null` when credentials are not configured, which puts the app in open
 * workstation mode (the behaviour a local `pnpm dev` expects). A deployment that
 * exposes the port should always set them; `isAuthConfigured()` is what the
 * startup check and the docs use to state that plainly.
 */
export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const username = env.PERSONAL_OS_USERNAME?.trim();
  const salt = env.PERSONAL_OS_PASSWORD_SALT?.trim();
  const passwordHash = env.PERSONAL_OS_PASSWORD_HASH?.trim().toLowerCase();
  const secret = env.PERSONAL_OS_SESSION_SECRET?.trim();

  if (!username || !salt || !passwordHash || !secret) return null;

  const parsedIterations = Number.parseInt(env.PERSONAL_OS_PASSWORD_ITERATIONS ?? '', 10);
  const iterations =
    Number.isFinite(parsedIterations) && parsedIterations >= 10_000 ? parsedIterations : DEFAULT_ITERATIONS;

  return { username, salt, passwordHash, iterations, sessionSecret: secret };
}

export function isAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readAuthConfig(env) !== null;
}

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Length-independent, non-short-circuiting comparison of two hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** PBKDF2-HMAC-SHA256 of the password, hex-encoded. */
export async function derivePasswordHash(
  password: string,
  salt: string,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

/** HMAC-SHA256 tag, hex-encoded. */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * Verifies a username/password pair against the configured account.
 *
 * The username comparison runs first and equally strictly, so a wrong username
 * costs the same work as a wrong password and cannot be distinguished by timing.
 */
export async function verifyCredentials(
  config: AuthConfig,
  username: string,
  password: string
): Promise<boolean> {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (password.length === 0 || password.length > 1024) return false;

  const candidate = await derivePasswordHash(password, config.salt, config.iterations);
  const passwordOk = timingSafeEqualHex(candidate, config.passwordHash);
  const usernameOk = timingSafeEqualHex(username, config.username);
  return passwordOk && usernameOk;
}

/** Builds a signed session token: `v1.<expiresAt>.<hmac>`. */
export async function createSessionToken(
  config: AuthConfig,
  now: number = Date.now(),
  ttlMs: number = SESSION_TTL_MS
): Promise<string> {
  const expiresAt = now + ttlMs;
  const payload = `${SESSION_VERSION}.${config.username}.${expiresAt}`;
  const tag = await hmacHex(config.sessionSecret, payload);
  return `${SESSION_VERSION}.${expiresAt}.${tag}`;
}

/**
 * Verifies a session token's signature and expiry.
 *
 * The expiry is inside the signed payload, so a client cannot extend a session by
 * editing the cookie; an expired token fails the same way a forged one does.
 */
export async function verifySessionToken(
  config: AuthConfig,
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, rawExpiry, tag] = parts;
  if (version !== SESSION_VERSION) return false;

  const expiresAt = Number.parseInt(rawExpiry, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const expected = await hmacHex(config.sessionSecret, `${SESSION_VERSION}.${config.username}.${rawExpiry}`);
  return timingSafeEqualHex(tag, expected);
}
