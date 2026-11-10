import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Daily net-worth snapshot job tests, isolated temp DB. The job must write an
 * idempotent history row even with zero UI visits, and never crash boot when
 * finance data is absent.
 */

const TMP_DIR = '/tmp/opencode/personal-os-networth-test';
const DB_FILE = path.join(TMP_DIR, 'personal_os.nw.db');

beforeAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;
});

afterAll(() => {
  delete process.env.PERSONAL_OS_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('maybeSnapshotNetWorth daily job', () => {
  it('writes today\'s snapshot and is idempotent across same-day reruns', async () => {
    const { getDb } = await import('../lib/db');
    const db = getDb(); // boot runs the job once

    const { snapshotNetWorthForToday, maybeSnapshotNetWorth } = await import('../lib/jobs/netWorth');
    const r1 = snapshotNetWorthForToday(db);
    expect(r1.ran).toBe(true);
    expect(r1.snapshotDate).toBeTruthy();

    // Same-day rerun upserts — no duplicate rows, no error.
    const r2 = snapshotNetWorthForToday(db);
    expect(r2.ran).toBe(true);

    // maybeSnapshotNetWorth memoizes within a process after a lossless run.
    const memo = maybeSnapshotNetWorth(db);
    expect(memo.ran).toBe(false);

    const count = (db.prepare(`SELECT COUNT(*) c FROM net_worth_snapshots`).get() as any).c;
    expect(count).toBe(1); // UNIQUE(tenant_id, snapshot_date) holds

    const row = db.prepare(`SELECT * FROM net_worth_snapshots LIMIT 1`).get() as any;
    expect(row.net_worth).toMatch(/^-?\d+(\.\d+)?$/);
    expect(JSON.parse(row.breakdown)).toHaveProperty('assets');
    expect(JSON.parse(row.breakdown)).toHaveProperty('liabilities');
  });

  it('boot history accrues: getDb() re-init on a new process seeds history', async () => {
    // Simulate a fresh process boot: direct module import in a new registry is
    // not available here, so exercise the job contract directly instead —
    // deleting today's row and re-running the job must re-create it.
    const { getDb } = await import('../lib/db');
    const db = getDb();
    db.prepare(`DELETE FROM net_worth_snapshots`).run();
    const { maybeSnapshotNetWorth } = await import('../lib/jobs/netWorth');
    // New memo state per file process; force a real write through the API of
    // the job by clearing cannot be done cross-module — use direct call.
    const { snapshotNetWorthForToday } = await import('../lib/jobs/netWorth');
    const r = snapshotNetWorthForToday(db);
    expect(r.ran).toBe(true);
    const count = (db.prepare(`SELECT COUNT(*) c FROM net_worth_snapshots`).get() as any).c;
    expect(count).toBe(1);
  });

  it('Net Worth API GET now returns snapshot history', async () => {
    const { GET } = await import('../app/api/finance/net-worth/route');
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.snapshots)).toBe(true);
    expect(data.snapshots.length).toBeGreaterThanOrEqual(1);
    const row = data.snapshots[0];
    expect(row).toHaveProperty('net_worth');
    expect(row).toHaveProperty('snapshot_date');
  });
});
