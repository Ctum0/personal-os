import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Migration v5 (transaction duplicate fingerprint) + ?strict=1 409 contract
 * tests, against an isolated temp DB.
 */

const TMP_DIR = '/tmp/opencode/personal-os-strictdup-test';
const DB_FILE = path.join(TMP_DIR, 'personal_os.strictdup.db');

beforeAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;
});

afterAll(() => {
  delete process.env.PERSONAL_OS_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

async function seed() {
  const { getDb } = await import('../lib/db');
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO finance_accounts (id, tenant_id, name, type, opening_balance)
     VALUES ('acc_dup_checking', 'tenant_default', 'Dup Checking', 'checking', '0')`
  ).run();
  return db;
}

describe('migration v5 + strict duplicate gate', () => {
  it('migration ran: dup_fingerprint column + backfilled fingerprints exist', async () => {
    const db = await seed();
    const cols = (db.prepare(`PRAGMA table_info(journal_transactions)`).all() as any[]).map(c => c.name);
    expect(cols).toContain('dup_fingerprint');
    // Insert legacy-style rows (no fingerprint) and replay the v5 backfill to
    // prove the migration logic rather than the insert path.
    db.prepare(
      `INSERT INTO journal_transactions (id, tenant_id, account_id, transaction_type, amount, base_amount, currency, date, description, status)
       VALUES ('dupseed_1','tenant_default','acc_dup_checking','expense','12.00','12.00','USD','2026-11-01','Wifi','posted')`
    ).run();
    const { backfillTransactionFingerprints } = await import('../lib/db');
    backfillTransactionFingerprints(db);
    const fp = (db.prepare(`SELECT dup_fingerprint fp FROM journal_transactions WHERE id='dupseed_1'`).get() as any).fp;
    expect(fp).toBe('tenant_default|acc_dup_checking|2026-11-01|expense|12.00');
  });

  it('default POST is advisory: creates with duplicateWarning, second identical POST is still allowed', async () => {
    await seed();
    const { POST } = await import('../app/api/finance/transactions/route');
    const body = {
      accountId: 'acc_dup_checking',
      amount: '42.00',
      date: '2026-11-05',
      description: 'Advisory Dup',
      transactionType: 'expense',
    };
    const r1 = await POST(new Request('http://localhost/api/finance/transactions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(r1.status).toBe(201);
    const d1 = await r1.json();
    expect(d1.duplicateWarning.isDuplicate).toBe(false);

    const r2 = await POST(new Request('http://localhost/api/finance/transactions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(r2.status).toBe(201);
    const d2 = await r2.json();
    expect(d2.duplicateWarning.isDuplicate).toBe(true);
  });

  it('?strict=1 returns 409 with duplicateOf for identical posted transaction', async () => {
    await seed();
    const { POST } = await import('../app/api/finance/transactions/route');
    const body = {
      accountId: 'acc_dup_checking',
      amount: '33.00',
      date: '2026-11-06',
      description: 'Strict Dup',
      transactionType: 'expense',
    };
    const first = await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(first.status).toBe(201);
    const { transaction } = await first.json();

    const dup = await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    expect(dup.status).toBe(409);
    const data = await dup.json();
    expect(data.duplicateOf).toBe(transaction.id);
    expect(data.fingerprint).toMatch(/\|33\.00$/);
  });

  it('?strict=1 normalizes amount formatting (42.0 vs 42.00 collide)', async () => {
    await seed();
    const { POST } = await import('../app/api/finance/transactions/route');
    const base = {
      accountId: 'acc_dup_checking',
      amount: '7.50',
      date: '2026-11-07',
      description: 'Normalize Dup',
      transactionType: 'expense',
    };
    const first = await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base),
    }));
    expect(first.status).toBe(201);

    expect((await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...base, amount: '7.5' }),
    }))).status).toBe(409);
  });

  it('pending status bypasses strict gate (pending entries are not duplicates yet)', async () => {
    await seed();
    const { POST } = await import('../app/api/finance/transactions/route');
    const base = {
      accountId: 'acc_dup_checking',
      amount: '9.10',
      date: '2026-11-08',
      description: 'Pending Dup',
      transactionType: 'expense',
      status: 'pending',
    };
    const r1 = await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base),
    }));
    const r2 = await POST(new Request('http://localhost/api/finance/transactions?strict=1', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base),
    }));
    expect([r1.status, r2.status]).toEqual([201, 201]);
  });
});
