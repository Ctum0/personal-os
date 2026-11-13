import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gateRequest, readCookie } from '@/lib/api/gate';
import {
  SESSION_COOKIE,
  createSessionToken,
  derivePasswordHash,
  readAuthConfig,
  verifyCredentials,
  verifySessionToken,
} from '@/lib/auth/credentials';
import {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
  clientKeyFromHeaders,
} from '@/lib/auth/throttle';
import { POST as sessionPost, DELETE as sessionDelete } from '@/app/api/auth/session/route';

/**
 * Authentication contract.
 *
 * One operator account configured from the environment, an HMAC-signed session
 * cookie with a signed expiry, constant-time credential checks, and throttled
 * failed attempts. No registration path exists, which is why these tests drive
 * the real endpoint rather than a mock.
 */

const USERNAME = 'ctum';
const PASSWORD = '<redacted-password>';
const SALT = '<redacted-salt>';
const ITERATIONS = 210_000;
const HASH = '<redacted-digest>';
const SECRET = 'test-session-secret-0123456789abcdef';

const ENV_KEYS = [
  'PERSONAL_OS_USERNAME',
  'PERSONAL_OS_PASSWORD_SALT',
  'PERSONAL_OS_PASSWORD_HASH',
  'PERSONAL_OS_PASSWORD_ITERATIONS',
  'PERSONAL_OS_SESSION_SECRET',
] as const;

let savedEnv: Record<string, string | undefined> = {};

function clearAuthEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureAuth(): void {
  process.env.PERSONAL_OS_USERNAME = USERNAME;
  process.env.PERSONAL_OS_PASSWORD_SALT = SALT;
  process.env.PERSONAL_OS_PASSWORD_HASH = HASH;
  process.env.PERSONAL_OS_PASSWORD_ITERATIONS = String(ITERATIONS);
  process.env.PERSONAL_OS_SESSION_SECRET = SECRET;
}

const requestWith = (cookie?: string): { headers: { get(name: string): string | null } } => ({
  headers: {
    get: (name: string) => (name.toLowerCase() === 'cookie' ? (cookie ?? null) : null),
  },
});

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  clearAuthEnv();
  resetLoginThrottle();
});

afterEach(() => {
  clearAuthEnv();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetLoginThrottle();
});

describe('password derivation', () => {
  it('reproduces the configured digest from the password', async () => {
    expect(await derivePasswordHash(PASSWORD, SALT, ITERATIONS)).toBe(HASH);
  });

  it('rejects a different password and a different username', async () => {
    const config = readAuthConfig({ ...process.env, PERSONAL_OS_USERNAME: USERNAME, PERSONAL_OS_PASSWORD_SALT: SALT, PERSONAL_OS_PASSWORD_HASH: HASH, PERSONAL_OS_SESSION_SECRET: SECRET })!;
    expect(await verifyCredentials(config, USERNAME, PASSWORD)).toBe(true);
    expect(await verifyCredentials(config, USERNAME, 'VillAiN@2002')).toBe(false);
    expect(await verifyCredentials(config, 'someone-else', PASSWORD)).toBe(false);
    expect(await verifyCredentials(config, USERNAME, '')).toBe(false);
  });
});

describe('session tokens', () => {
  const config = {
    username: USERNAME,
    salt: SALT,
    passwordHash: HASH,
    iterations: ITERATIONS,
    sessionSecret: SECRET,
  };

  it('accepts a freshly minted token', async () => {
    const token = await createSessionToken(config);
    expect(await verifySessionToken(config, token)).toBe(true);
  });

  it('rejects an expired token', async () => {
    const token = await createSessionToken(config, Date.now() - 30 * 24 * 60 * 60 * 1000, 1000);
    expect(await verifySessionToken(config, token)).toBe(false);
  });

  it('rejects an edited expiry (the signature covers it)', async () => {
    const token = await createSessionToken(config);
    const [version, , tag] = token.split('.');
    const extended = `${version}.${Date.now() + 10 * 365 * 24 * 60 * 60 * 1000}.${tag}`;
    expect(await verifySessionToken(config, extended)).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const foreign = await createSessionToken({ ...config, sessionSecret: 'another-secret' });
    expect(await verifySessionToken(config, foreign)).toBe(false);
  });

  it('rejects malformed and missing tokens', async () => {
    expect(await verifySessionToken(config, undefined)).toBe(false);
    expect(await verifySessionToken(config, '')).toBe(false);
    expect(await verifySessionToken(config, 'v1.123')).toBe(false);
    expect(await verifySessionToken(config, 'v2.9999999999999.abc')).toBe(false);
  });
});

describe('gate', () => {
  it('open mode passes everything when nothing is configured', async () => {
    const result = await gateRequest(requestWith(), '/api/tasks');
    expect(result.authorized).toBe(true);
    expect(result.openMode).toBe(true);
  });

  it('rejects an unauthenticated request once credentials exist', async () => {
    configureAuth();
    const result = await gateRequest(requestWith(), '/api/tasks');
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/Sign in required/i);
  });

  it('accepts a valid session cookie', async () => {
    configureAuth();
    const config = readAuthConfig()!;
    const token = await createSessionToken(config);
    const result = await gateRequest(requestWith(`${SESSION_COOKIE}=${token}`), '/api/tasks');
    expect(result.authorized).toBe(true);
  });

  it('rejects a forged cookie', async () => {
    configureAuth();
    const result = await gateRequest(requestWith(`${SESSION_COOKIE}=v1.9999999999999.deadbeef`), '/api/tasks');
    expect(result.authorized).toBe(false);
  });

  it('exempts the sign-in route so the cookie can be obtained', async () => {
    configureAuth();
    const result = await gateRequest(requestWith(), '/api/auth/session');
    expect(result.authorized).toBe(true);
  });

  it('parses a cookie out of a multi-cookie header', () => {
    expect(readCookie('theme=dark; personal_os_session=abc.def.ghi; other=1', SESSION_COOKIE)).toBe('abc.def.ghi');
    expect(readCookie('theme=dark', SESSION_COOKIE)).toBeUndefined();
  });
});

describe('sign-in endpoint', () => {
  it('reports open mode when no credentials are configured', async () => {
    const res = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'anything', password: 'anything' }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).openMode).toBe(true);
  });

  it('sets a session cookie for the configured credentials', async () => {
    configureAuth();
    const res = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.openMode).toBe(false);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    const token = /personal_os_session=([^;]+)/.exec(setCookie)?.[1];
    expect(token).toBeTruthy();
    // The issued cookie must actually satisfy the gate.
    const config = readAuthConfig()!;
    expect(await verifySessionToken(config, token)).toBe(true);
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    configureAuth();
    const res = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
        body: JSON.stringify({ username: USERNAME, password: 'wrong-password' }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a wrong username even with the right password', async () => {
    configureAuth();
    const res = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
        body: JSON.stringify({ username: 'root', password: PASSWORD }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('locks an address out after repeated failures', async () => {
    configureAuth();
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.12' };
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await sessionPost(
        new Request('http://localhost/api/auth/session', {
          method: 'POST',
          headers,
          body: JSON.stringify({ username: USERNAME, password: `wrong-${attempt}` }),
        })
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    // Even the correct password is refused while the lockout stands.
    const correct = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
      })
    );
    expect(correct.status).toBe(429);
    expect(correct.headers.get('retry-after')).toBeTruthy();
  });

  it('clears the cookie on sign-out', async () => {
    configureAuth();
    const res = await sessionDelete(new Request('http://localhost/api/auth/session', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=`);
  });
});

describe('throttle primitives', () => {
  it('allows five failures then locks with an increasing cooldown', () => {
    const key = '198.51.100.7';
    for (let i = 0; i < 4; i++) expect(recordLoginFailure(key).allowed).toBe(true);
    const locked = recordLoginFailure(key);
    expect(locked.allowed).toBe(false);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkLoginAllowed(key).allowed).toBe(false);

    // A success clears the record entirely.
    recordLoginSuccess(key);
    expect(checkLoginAllowed(key).allowed).toBe(true);
  });

  it('derives the client key from proxy headers, not from the browser', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' });
    expect(clientKeyFromHeaders(headers)).toBe('198.51.100.9');
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '198.51.100.10' }))).toBe('198.51.100.10');
    expect(clientKeyFromHeaders(new Headers())).toBe('local');
  });
});
