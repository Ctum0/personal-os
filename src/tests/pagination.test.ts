import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Direct route-handler tests for list pagination contracts, using an isolated
 * temp DB file (PERSONAL_OS_DB_PATH) so the user's real data is never touched.
 * Expectations are measured against a baseline count taken after bootstrap
 * seeding, so migration-seeded fixtures do not make the tests brittle.
 */

const TMP_DIR = '/tmp/opencode/personal-os-pagination-test';
const DB_FILE = path.join(TMP_DIR, 'personal_os.test.db');
const BASE = 'http://localhost/api/tasks';

/** Baseline row counts measured after bootstrap seeding. */
interface PaginationBaseline {
  tasksTotal: number;
  tasksUrgent: number;
  txTotal: number;
}

/** A task row as returned by GET /api/tasks (only the columns these tests read). */
interface TaskPageRow {
  id: string;
  priority: string;
}

let baseline: PaginationBaseline;

beforeAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;
  const { getDb } = await import('../lib/db');
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO tenants (id, name, slug) VALUES ('tenant_default', 'Test Tenant', 'test-tenant')`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO spaces (id, tenant_id, name, color) VALUES ('space_personal', 'tenant_default', 'Personal', '#999999')`
  ).run();
  const seed = db.prepare(
    `INSERT INTO tasks (id, tenant_id, space_id, title, status, priority, due_date)
     VALUES (?, 'tenant_default', 'space_personal', ?, 'next', ?, '2026-11-10')`
  );
  for (let i = 1; i <= 12; i++) {
    seed.run(`seed_task_${i}`, `Task ${i}`, i <= 4 ? 'urgent' : i <= 8 ? 'high' : 'normal');
  }
  db.prepare(
    `INSERT OR IGNORE INTO finance_accounts (id, tenant_id, name, type, opening_balance)
     VALUES ('acc_test_checking', 'tenant_default', 'Test Checking', 'checking', '0')`
  ).run();
  const seedTx = db.prepare(
    `INSERT INTO journal_transactions (id, tenant_id, account_id, transaction_type, amount, base_amount, currency, date, description, status)
     VALUES (?, 'tenant_default', 'acc_test_checking', 'expense', ?, ?, 'USD', ?, ?, 'posted')`
  );
  for (let i = 1; i <= 7; i++) {
    seedTx.run(`seed_tx_${i}`, '10.00', '10.00', '2026-11-10', `Tx ${i}`);
  }

  baseline = {
    tasksTotal: (db.prepare(`SELECT COUNT(*) c FROM tasks WHERE tenant_id='tenant_default'`).get() as { c: number }).c,
    tasksUrgent: (db.prepare(`SELECT COUNT(*) c FROM tasks WHERE tenant_id='tenant_default' AND priority='urgent'`).get() as { c: number }).c,
    txTotal: (db.prepare(`SELECT COUNT(*) c FROM journal_transactions WHERE tenant_id='tenant_default' AND account_id='acc_test_checking'`).get() as { c: number }).c,
  };
});

afterAll(() => {
  delete process.env.PERSONAL_OS_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('GET /api/tasks pagination contract', () => {
  it('default limit is 1000: full small dataset returned with total/hasMore metadata', async () => {
    const { GET } = await import('../app/api/tasks/route');
    const res = await GET(new Request(BASE));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.tasks.length).toBe(baseline.tasksTotal);
    expect(data.total).toBe(baseline.tasksTotal);
    expect(data.hasMore).toBe(false);
    expect(data.limit).toBe(1000);
    expect(data.offset).toBe(0);
  });

  it('limit/offset windows slice correctly across pages with no overlap or loss', async () => {
    const { GET } = await import('../app/api/tasks/route');
    const total = baseline.tasksTotal;
    const page1 = await (await GET(new Request(`${BASE}?limit=5&offset=0`))).json();
    const page2 = await (await GET(new Request(`${BASE}?limit=5&offset=5`))).json();
    const page3 = await (await GET(new Request(`${BASE}?limit=5&offset=10`))).json();
    expect(page1.tasks.length).toBe(Math.min(5, total));
    expect(page2.tasks.length).toBe(Math.max(0, Math.min(5, total - 5)));
    expect(page3.tasks.length).toBe(Math.max(0, Math.min(5, total - 10))); // LIMIT caps the window
    expect(page1.hasMore).toBe(total > 5);
    expect(page3.hasMore).toBe(total > 15); // newer pages exist when rows remain
    const ids = new Set([...page1.tasks, ...page2.tasks, ...page3.tasks].map((t: TaskPageRow) => t.id));
    // union of three 5-row windows: disjoint, covers the first 15 ordered rows
    expect(ids.size).toBe([
      page1.tasks.length,
      page2.tasks.length,
      page3.tasks.length,
    ].reduce((a, b) => a + b, 0));
  });

  it('unbounded limits are clamped into 1..1000', async () => {
    const { GET } = await import('../app/api/tasks/route');
    const zero = await (await GET(new Request(`${BASE}?limit=0`))).json();
    const huge = await (await GET(new Request(`${BASE}?limit=99999`))).json();
    expect(zero.limit).toBe(1);
    expect(zero.tasks.length).toBe(1);
    expect(huge.limit).toBe(1000);
  });

  it('negative offsets are clamped to 0', async () => {
    const { GET } = await import('../app/api/tasks/route');
    const r = await (await GET(new Request(`${BASE}?offset=-5`))).json();
    expect(r.offset).toBe(0);
  });

  it('filters compose with pagination (urgent priority, limit 2)', async () => {
    const { GET } = await import('../app/api/tasks/route');
    const r = await (await GET(new Request(`${BASE}?priority=urgent&limit=2`))).json();
    expect(r.total).toBe(baseline.tasksUrgent);
    expect(r.tasks.length).toBe(Math.min(2, baseline.tasksUrgent));
    expect(r.hasMore).toBe(baseline.tasksUrgent > 2);
    expect(r.tasks.every((t: TaskPageRow) => t.priority === 'urgent')).toBe(true);
  });
});

describe('GET /api/finance/transactions pagination contract', () => {

  it('paged request returns the exact window plus truthful total/hasMore', async () => {
    const { GET } = await import('../app/api/finance/transactions/route');
    const res = await GET(new Request('http://localhost/api/finance/transactions?limit=3&offset=0&accountId=acc_test_checking'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.total).toBe(baseline.txTotal);
    expect(data.transactions.length).toBe(3);
    expect(data.hasMore).toBe(baseline.txTotal > 3);
  });

  it('no paging params keeps the historical default-cap behavior plus total', async () => {
    const { GET } = await import('../app/api/finance/transactions/route');
    const plain = await (await GET(new Request('http://localhost/api/finance/transactions?accountId=acc_test_checking'))).json();
    expect(plain.transactions.length).toBe(baseline.txTotal);
    expect(plain.total).toBe(baseline.txTotal);
    expect(plain.limit).toBe(100);
  });
});
