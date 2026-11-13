import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Proxy routing under a misconfigured credential set.
 *
 * This is the layer `gateRequest` cannot cover: `src/proxy.ts` decides *what
 * shape* the refusal takes. A previous revision answered `/login` with raw JSON,
 * which made the page's own explanation unreachable — the response body still
 * contained the error string, so a substring assertion happily passed while the
 * UI was dead code. These tests assert status **and** content type.
 */

const ENV_KEYS = [
  'PERSONAL_OS_USERNAME',
  'PERSONAL_OS_PASSWORD_SALT',
  'PERSONAL_OS_PASSWORD_HASH',
  'PERSONAL_OS_PASSWORD_ITERATIONS',
  'PERSONAL_OS_SESSION_SECRET',
] as const;

let saved: Record<string, string | undefined> = {};

function setMisconfigured(): void {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.PERSONAL_OS_USERNAME = 'operator';
  process.env.PERSONAL_OS_PASSWORD_SALT = 'REPLACE_ME';
  process.env.PERSONAL_OS_PASSWORD_HASH = 'REPLACE_ME';
  process.env.PERSONAL_OS_SESSION_SECRET = 'REPLACE_ME';
}

// Imported lazily so the module reads the environment at call time, not at
// import time, and so each test pays the import only once.
async function callProxy(url: string): Promise<Response> {
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(url));
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe('proxy routing while misconfigured', () => {
  it('lets the sign-in page render so it can explain the problem', async () => {
    setMisconfigured();
    const response = await callProxy('http://localhost/login');
    // A pass-through, not a rendered body: the page component owns the markup.
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects other pages to the sign-in page', async () => {
    setMisconfigured();
    for (const path of ['/', '/finance/transactions', '/productivity/tasks']) {
      const response = await callProxy(`http://localhost${path}`);
      expect(response.status, `${path} must redirect`).toBe(307);
      expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    }
  });

  it('answers API calls with a JSON 503 naming the variables', async () => {
    setMisconfigured();
    const response = await callProxy('http://localhost/api/tasks');
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.error).toMatch(/misconfigured/i);
    expect(body.invalid).toContain('PERSONAL_OS_PASSWORD_SALT');
  });

  it('never lets a static asset request through the API branch', async () => {
    setMisconfigured();
    const response = await callProxy('http://localhost/api/tasks.json');
    expect(response.status, 'an /api path must not be treated as an asset').toBe(503);
  });
});
