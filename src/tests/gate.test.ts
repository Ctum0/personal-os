import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gateRequest, sha256Hex } from '../lib/api/gate';

const PIN = 's3cr3t-pin';

function reqWith(headers: Record<string, string>) {
  return { headers: { get(name: string) { return headers[name.toLowerCase()] ?? null; } } };
}

let savedEnv: string | undefined;

describe('gateRequest (middleware security gate)', () => {
  beforeEach(() => {
    savedEnv = process.env.PERSONAL_OS_PIN;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.PERSONAL_OS_PIN;
    else process.env.PERSONAL_OS_PIN = savedEnv;
  });

  it('open mode: authorizes everything when no pin is configured', async () => {
    delete process.env.PERSONAL_OS_PIN;
    const r = await gateRequest(reqWith({}), '/api/tasks');
    expect(r.authorized).toBe(true);
    expect(r.openMode).toBe(true);
  });

  it('locked mode: rejects requests without credentials', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const r = await gateRequest(reqWith({}), '/api/tasks');
    expect(r.authorized).toBe(false);
    expect(r.reason).toMatch(/session/i);
  });

  it('locked mode: accepts a matching x-personal-os-pin header', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const r = await gateRequest(reqWith({ 'x-personal-os-pin': PIN }), '/api/tasks');
    expect(r.authorized).toBe(true);
  });

  it('locked mode: rejects a wrong pin header (constant-time digest mismatch)', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const r = await gateRequest(reqWith({ 'x-personal-os-pin': 'wrong' }), '/api/tasks');
    expect(r.authorized).toBe(false);
  });

  it('locked mode: accepts the session cookie holding sha256(pin)', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const digest = await sha256Hex(PIN);
    const r = await gateRequest(reqWith({ cookie: `other=v; personal_os_session=${digest}` }), '/api/tasks');
    expect(r.authorized).toBe(true);
  });

  it('locked mode: rejects a cookie holding a stale/different digest', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const otherDigest = await sha256Hex('other-pin');
    const r = await gateRequest(reqWith({ cookie: `personal_os_session=${otherDigest}` }), '/api/tasks');
    expect(r.authorized).toBe(false);
  });

  it('exempt path: /api/auth/session passes even while locked (unlock must be reachable)', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const r = await gateRequest(reqWith({}), '/api/auth/session');
    expect(r.authorized).toBe(true);
  });

  it('cookie parser handles whitespace and delimiter variants', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const digest = await sha256Hex(PIN);
    const spaced = await gateRequest(reqWith({ cookie: `a=b; personal_os_session = ${digest}; x=y` }), '/api/tasks');
    // regex tolerates spaces around value
    expect(spaced.authorized).toBe(true);
  });
});

describe('/api/auth/session route', () => {
  beforeEach(() => {
    savedEnv = process.env.PERSONAL_OS_PIN;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.PERSONAL_OS_PIN;
    else process.env.PERSONAL_OS_PIN = savedEnv;
  });

  it('sets an httpOnly session cookie on correct pin', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const { POST } = await import('../app/api/auth/session/route');
    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('personal_os_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).not.toContain(PIN); // digest, never the raw pin
  });

  it('rejects a wrong pin with 401 + WWW-Authenticate hint', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const { POST } = await import('../app/api/auth/session/route');
    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: 'nope' }),
    });
    const res = await POST(request);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('PersonalOS-PIN');
  });

  it('rejects malformed bodies with 400', async () => {
    process.env.PERSONAL_OS_PIN = PIN;
    const { POST } = await import('../app/api/auth/session/route');
    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it('open mode: returns authorized:true with no cookie', async () => {
    delete process.env.PERSONAL_OS_PIN;
    const { POST } = await import('../app/api/auth/session/route');
    const request = new Request('http://localhost/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    expect((await res.json()).openMode).toBe(true);
  });
});
