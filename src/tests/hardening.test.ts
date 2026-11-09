import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '@/lib/db';
import { sumDecimalAmounts, calculateAccountBalances } from '@/lib/finance/engine';
import { validateApiRequest } from '@/lib/auth';
import { rescheduleTask } from '@/lib/productivity/planner';
import { Decimal } from 'decimal.js';

describe('Hardening - Exact Financial Arithmetic & Audit Invariants', () => {
  it('sumDecimalAmounts calculates exact sums without IEEE-754 float drift', () => {
    // Classic float issue: 0.1 + 0.2 = 0.30000000000000004
    const rows = [
      { amount: '0.10' },
      { amount: '0.20' },
      { amount: '0.05' },
    ];
    const sum = sumDecimalAmounts(rows);
    expect(sum.toString()).toBe('0.35');

    // Large numbers and high precision
    const largeRows = [
      { amount: '123456789.99' },
      { amount: '0.01' },
    ];
    expect(sumDecimalAmounts(largeRows).toString()).toBe('123456790');
  });

  it('preserves journal_lines when transaction is marked voided', () => {
    const db = getInMemoryDb();
    const tenantId = 't_test';
    const txId = 'tx_void_test';
    const accId = 'acc_test';

    db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (?, 'Test', 'test')`).run(tenantId);
    db.prepare(`
      INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
      VALUES (?, ?, 'Checking', 'checking', 'USD', '1000.00')
    `).run(accId, tenantId);

    // Insert posted transaction + journal line
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, status, date, amount, currency, base_amount, account_id, description)
      VALUES (?, ?, 'expense', 'posted', '2026-11-01', '150.00', 'USD', '150.00', ?, 'Groceries')
    `).run(txId, tenantId, accId);

    db.prepare(`
      INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
      VALUES ('jl_void_test_1', ?, ?, ?, 'credit', '150.00', 'USD', '150.00', 'Groceries expense')
    `).run(tenantId, txId, accId);

    // Initial balance should be 850.00
    let balances = calculateAccountBalances(db, tenantId);
    expect(balances[0].currentBalance).toBe('850.00');

    // Void the transaction (per defect 3 fix, journal_lines are NOT deleted)
    db.prepare(`
      UPDATE journal_transactions SET status = 'voided', updated_at = datetime('now') WHERE id = ?
    `).run(txId);

    // Balance should revert back to 1000.00 because status is not 'posted'
    balances = calculateAccountBalances(db, tenantId);
    expect(balances[0].currentBalance).toBe('1000.00');

    // journal_lines MUST still exist for audit integrity!
    const lines = db.prepare(`SELECT * FROM journal_lines WHERE transaction_id = ?`).all(txId);
    expect(lines.length).toBe(1);
    expect((lines[0] as any).amount).toBe('150.00');
  });

  it('validateApiRequest respects environment PIN when configured', () => {
    // Unset PIN: open mode for local workstation
    delete process.env.PERSONAL_OS_PIN;
    expect(validateApiRequest().authorized).toBe(true);

    // Configured PIN
    process.env.PERSONAL_OS_PIN = '9876';

    const unauthReq = new Request('http://localhost:3001/api/tasks');
    expect(validateApiRequest(unauthReq).authorized).toBe(false);

    const authHeaderReq = new Request('http://localhost:3001/api/tasks', {
      headers: { 'x-personal-os-pin': '9876' },
    });
    expect(validateApiRequest(authHeaderReq).authorized).toBe(true);

    const authCookieReq = new Request('http://localhost:3001/api/tasks', {
      headers: { cookie: 'personal_os_session=9876; other=123' },
    });
    expect(validateApiRequest(authCookieReq).authorized).toBe(true);

    // Cleanup
    delete process.env.PERSONAL_OS_PIN;
  });

  it('rescheduleTask strictly rejects attempts to access or modify other tenant tasks', () => {
    const db = getInMemoryDb();
    const tenantA = 'tenant_a';
    const tenantB = 'tenant_b';

    db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (?, 'Tenant A', 'tenant-a')`).run(tenantA);
    db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (?, 'Tenant B', 'tenant-b')`).run(tenantB);

    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, status, due_date)
      VALUES ('task_a_1', ?, 'Tenant A Secret Task', 'next', '2026-11-10')
    `).run(tenantA);

    // Tenant B attempts to reschedule Tenant A's task
    expect(() => {
      rescheduleTask(db, tenantB, 'task_a_1', '2026-11-12', 'Malicious reschedule', 'rescheduled');
    }).toThrow('Task not found');

    // Verify Tenant A's task was untouched
    const task = db.prepare('SELECT due_date FROM tasks WHERE id = ?').get('task_a_1') as { due_date: string };
    expect(task.due_date).toBe('2026-11-10');
  });

  it('composite performance indexes exist in database schema', () => {
    const db = getInMemoryDb();
    const indexRows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string }>;
    const indexNames = new Set(indexRows.map(r => r.name));

    expect(indexNames.has('idx_tasks_tenant_status_created')).toBe(true);
    expect(indexNames.has('idx_habit_logs_tenant_habit_date')).toBe(true);
    expect(indexNames.has('idx_calendar_events_tenant_time')).toBe(true);
    expect(indexNames.has('idx_focus_sessions_tenant_started')).toBe(true);
  });
});
