import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Structured logger tests: JSON-lines append + tail reading, and the
 * withApiLogging wrapper contract (duration, correlation id, error capture).
 */

const TMP_DIR = '/tmp/opencode/personal-os-logger-test';
const DB_FILE = path.join(TMP_DIR, 'personal_os.logger.db');

beforeAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;
});

afterAll(() => {
  delete process.env.PERSONAL_OS_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('structured JSON-lines logger', () => {
  it('appends entries to logs/requests-<day>.log next to the DB', async () => {
    const { appendApiLog } = await import('../lib/api/logger');
    appendApiLog({
      ts: new Date().toISOString(),
      requestId: 'req_tail_test_1',
      method: 'GET',
      path: '/api/tasks',
      status: 200,
      durationMs: 12,
    });
    appendApiLog({
      ts: new Date().toISOString(),
      requestId: 'req_tail_test_2',
      method: 'POST',
      path: '/api/finance/transactions',
      status: 201,
      durationMs: 34,
    });
    const { readApiLogTail } = await import('../lib/api/logger');
    const tail = readApiLogTail(10);
    expect(tail.length).toBeGreaterThanOrEqual(2);
    expect(tail.at(-1)?.requestId).toBe('req_tail_test_2');
    expect(tail.at(-1)?.durationMs).toBe(34);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(fs.existsSync(path.join(path.dirname(DB_FILE), 'logs', `requests-${today}.log`))).toBe(true);
  });

  it('withApiLogging wraps a handler and logs status+duration', async () => {
    const { withApiLogging } = await import('../lib/api/log');
    const { readApiLogTail } = await import('../lib/api/logger');
    const handler = withApiLogging(async (req: Request) =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'x-request-id': 'req_wrap_9' } })
    );
    const res = await handler(new Request('http://localhost/api/tasks'));
    expect(res.status).toBe(200);
    const tail = readApiLogTail(5);
    const entry = tail.at(-1);
    expect(entry?.requestId).toBe('req_wrap_9');
    expect(entry?.status).toBe(200);
    expect(typeof entry?.durationMs).toBe('number');
  });

  it('withApiLogging captures thrown handler errors as 500 + error field', async () => {
    const { withApiLogging } = await import('../lib/api/log');
    const { readApiLogTail } = await import('../lib/api/logger');
    const handler = withApiLogging(async () => {
      throw new Error('boom: seeded failure');
    });
    const res = await handler(new Request('http://localhost/api/fail'));
    expect(res.status).toBe(500);
    const tail = readApiLogTail(5);
    const entry = tail.at(-1);
    expect(entry?.status).toBe(500);
    expect(entry?.error).toContain('boom');
  });

  it('observability endpoint returns the tail without leaking internals', async () => {
    const { GET } = await import('../app/api/observability/logs/route');
    const res = await GET(new Request('http://localhost/api/observability/logs?tail=20'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBeGreaterThan(0);
    expect(data.entries[0]).toHaveProperty('path');
  });
});
