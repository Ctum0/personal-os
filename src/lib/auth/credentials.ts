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

/** The four variables that together define the operator account. */
export const REQUIRED_AUTH_ENV = [
  'PERSONAL_OS_USERNAME',
  'PERSONAL_OS_PASSWORD_SALT',
  'PERSONAL_OS_PASSWORD_HASH',
  'PERSONAL_OS_SESSION_SECRET',
] as const;

export type AuthConfigState =
  /** No credential variables present at all: an intentional local workstation. */
  | { kind: 'open' }
  /** Some but not all present: a misconfiguration, and it must not open the app. */
  | { kind: 'incomplete'; missing: string[] }
  /** All present and usable. */
  | { kind: 'configured'; config: AuthConfig };

/**
 * Classifies the environment.
 *
 * The three-way split matters. Treating "some variables are set" as "no
 * credentials configured" would fail **open**: a typo in one key name, or a
 * forgotten session secret, would leave an internet-facing instance fully
 * unauthenticated with no error anywhere. So an incomplete set is its own state,
 * and the gate refuses every request for it.
 */
export function readAuthState(env: Record<string, string | undefined> = process.env): AuthConfigState {
  const present = REQUIRED_AUTH_ENV.filter(key => (env[key] ?? '').trim().length > 0);
  if (present.length === 0) return { kind: 'open' };

  const missing = REQUIRED_AUTH_ENV.filter(key => (env[key] ?? '').trim().length === 0);
  if (missing.length > 0) return { kind: 'incomplete', missing: [...missing] };

  const username = env.PERSONAL_OS_USERNAME!.trim();
  const salt = env.PERSONAL_OS_PASSWORD_SALT!.trim();
  const passwordHash = env.PERSONAL_OS_PASSWORD_HASH!.trim().toLowerCase();
  const secret = env.PERSONAL_OS_SESSION_SECRET!.trim();

  const parsedIterations = Number.parseInt(env.PERSONAL_OS_PASSWORD_ITERATIONS ?? '', 10);
  const iterations =
    Number.isFinite(parsedIterations) && parsedIterations >= 10_000 ? parsedIterations : DEFAULT_ITERATIONS;

  return { kind: 'configured', config: { username, salt, passwordHash, iterations, sessionSecret: secret } };
}

/**
 * Reads the operator account, or `null` when the app should run open.
 *
 * Use `readAuthState` where the difference between "nothing configured" and
 * "misconfigured" matters — the gate does.
 */
export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const state = readAuthState(env);
  return state.kind === 'configured' ? state.config : null;
}

export function isAuthMisconfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readAuthState(env).kind === 'incomplete';
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
