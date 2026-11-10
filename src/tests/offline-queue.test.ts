import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Offline queue expansion + guardOffline() contract tests. These run in the
 * node environment with a minimal fake window/navigator (the queue module is
 * written defensively for both runtimes), using a stubbed fetchImpl passed
 * explicitly to guardOffline so no real network happens.
 */

function fakeBrowser(online = true) {
  const store = new Map<string, string>();
  const patch = (key: 'localStorage' | 'navigator' | 'window', value: unknown) =>
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  patch('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  patch('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  patch('navigator', { onLine: online });
  return store;
}

function clearBrowser() {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  delete (globalThis as any).navigator;
}

describe('offline queue expansion', () => {
  beforeEach(fakeBrowser);
  afterEach(clearBrowser);

  it('guardOffline delivers live when online (no queueing)', async () => {
    const { guardOffline, getOfflineQueue } = await import('../lib/offline/queue');
    const responses = [
      new Response(JSON.stringify({ task: { id: 't1' } }), { status: 201 }),
    ];
    const fetchImpl = vi.fn(async () => responses.pop() ?? new Response(null, { status: 500 }));

    const result = await guardOffline('create_task', { title: 'Hello' }, fetchImpl);
    expect(result.queuedOffline).toBe(false);
    expect(result.response?.status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' })
    );
    expect(getOfflineQueue().length).toBe(0);
  });

  it('creates transaction and calendar event route to their endpoints', async () => {
    const { guardOffline } = await import('../lib/offline/queue');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    await guardOffline('create_transaction', { accountId: 'a', amount: '5' }, fetchImpl);
    await guardOffline('create_calendar_event', { title: 'Standup' }, fetchImpl);
    const calls = (fetchImpl as any).mock.calls;
    expect(calls[0][0]).toBe('/api/finance/transactions');
    expect(calls[1][0]).toBe('/api/calendar');
    expect(calls[0][1].headers['X-Idempotency-Key']).toMatch(/^idem_/);
    expect(calls[1][1].headers['X-Idempotency-Key']).toMatch(/^idem_/);
    // idempotency keys must be distinct across mutations
    expect(calls[0][1].headers['X-Idempotency-Key']).not.toBe(calls[1][1].headers['X-Idempotency-Key']);
  });

  it('complete_task routes through PUT /api/tasks', async () => {
    const { guardOffline } = await import('../lib/offline/queue');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await guardOffline('complete_task', { id: 'tx_1', status: 'completed' }, fetchImpl);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('/api/tasks');
    expect(init.method).toBe('PUT');
  });

  it('parks the mutation in the queue when the browser reports offline', async () => {
    const { guardOffline, getOfflineQueue } = await import('../lib/offline/queue');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
    const fetchImpl = vi.fn();
    const result = await guardOffline('create_transaction', { accountId: 'a', amount: '9.99' }, fetchImpl);
    expect(result.queuedOffline).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    const queue = getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].type).toBe('create_transaction');
    expect(queue[0].status).toBe('queued');
    expect(queue[0].idempotencyKey).toMatch(/^idem_/);
  });

  it('parks on network failure (fetch throws) even when navigator says online', async () => {
    const { guardOffline, getOfflineQueue, markMutationStatus } = await import('../lib/offline/queue');
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const result = await guardOffline('create_calendar_event', { title: 'Lunch' }, fetchImpl);
    expect(result.queuedOffline).toBe(true);
    expect(getOfflineQueue()[0].type).toBe('create_calendar_event');

    // Replay path via syncOfflineQueue with fresh connectivity
    (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));    const { syncOfflineQueue } = await import('../lib/offline/queue');
    const { synced } = await syncOfflineQueue();
    expect(synced).toBe(1);
    expect(getOfflineQueue().filter(m => m.status === 'queued').length).toBe(0);
  });

  it('parks on 5xx but not on 4xx (4xx surfaces to the caller)', async () => {
    const { guardOffline, getOfflineQueue } = await import('../lib/offline/queue');
    const boom = vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    const r1 = await guardOffline('create_task', { title: 'Five' }, boom);
    expect(r1.queuedOffline).toBe(true);

    const bad = vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 }));
    const r2 = await guardOffline('create_task', { title: 'Four' }, bad);
    expect(r2.queuedOffline).toBe(false);
    expect(r2.response?.status).toBe(400);
    expect(getOfflineQueue().length).toBe(1);
  });
});
