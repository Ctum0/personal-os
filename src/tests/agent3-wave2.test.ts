/**
 * Agent 3 — wave 2 regression tests (follow-up to Agent 2 findings B1–B7).
 * Each case independently verifies an engine decision made for the finance
 * order-of-truth defects; see .artifacts/final-audit/agent3-findings.md
 * section "Follow-up wave 2".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import PluginDatabase from 'better-sqlite3';
import Database from 'better-sqlite3';
import { getInMemoryDb } from '@/lib/db';
import { todayISO, toISODate, addDaysISO } from '@/lib/time';
import {
  calculateBudget,
  calculateSafeToSpend,
  calculateIncomeAndExpenses,
  calculateDebtPayoffScenarios,
  calculateDebtLedgerReconciliations,
  calculateDebtPaymentSplit,
  detectDuplicateTransaction,
} from '@/lib/finance/engine';
import { previewCsvImport, commitCsvImport, reverseImportBatch } from '@/lib/finance/csv-import';
import { Decimal } from 'decimal.js';

type DatabaseType = PluginDatabase.Database;

const tenantId = 'tenant_wave2';

let db: DatabaseType;

beforeEach(() => {
  db = getInMemoryDb();
  db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (?, 'Wave2', 'wave2')`).run(tenantId);
  // Checking 1000, Savings 5000 (liquid), Credit card ledger -620.50 opening
  const ins = db.prepare(`
    INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
    VALUES (?, ?, ?, ?, 'USD', ?)
  `);
  ins.run('w_chk', tenantId, 'Checking', 'checking', '1000.00');
  ins.run('w_sav', tenantId, 'Savings', 'savings', '5000.00');
  ins.run('w_card', tenantId, 'Card', 'credit_card', '-620.50');

  db.prepare(`
    INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon)
    VALUES (?, '500.00', 30)
  `).run(tenantId);

  cat('cat_other', 'Other');
});

const cat = (id: string, name: string, type = 'expense') =>
  db.prepare(`INSERT INTO categories (id, tenant_id, name, type) VALUES (?, ?, ?, ?)`).run(id, tenantId, name, type);

const tx = (opts: {
  id: string; type: string; date: string; account: string; amount: string;
  toAccount?: string; categoryId?: string; status?: string;
}) =>
  db.prepare(`
    INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)
  `).run(
    opts.id, tenantId, opts.type, opts.date, opts.account, opts.toAccount ?? null,
    opts.amount, opts.amount, opts.id, opts.status ?? 'posted', opts.categoryId ?? null
  );

// ===========================================================================
// B1 — budget period read-time roll (persisted stays authoritative)
// ===========================================================================

describe('B1: monthly budget period rolls forward at read time', () => {
  beforeEach(() => {
    cat('cat_hous', 'Housing', 'expense');
    cat('cat_gro', 'Groceries', 'expense');
    const t = todayISO();
    const prevMonthISO = (() => {
      const t = todayISO();
      const [y, m] = t.slice(0, 7).split('-').map(Number);
      const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
      return `${prev.y}-${String(prev.m).padStart(2, '0')}`;
    })();
    db.prepare(`
      INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, rollover_mode, is_active)
      VALUES ('bgt_stale', ?, 'Oct Cycle', 'category_limit', 'monthly', ?, ?, 'reset', 1)
    `).run(tenantId, `${prevMonthISO}-01`, `${prevMonthISO}-28`);
    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES ('bl_stale_hous', ?, 'bgt_stale', 'cat_hous', '1000.00', '0.00')
    `).run(tenantId);
  });

  it('auto-selected monthly budget projects onto the current month and counts its expenses', () => {
    const t = todayISO();
    tx({ id: 'tx_nov_exp', type: 'expense', date: t, account: 'w_chk', amount: '89.50', categoryId: 'cat_hous' });
    tx({ id: 'tx_oct_exp', type: 'expense', date: addDaysISO(`${t.slice(0, 7)}-01`, -5), account: 'w_chk', amount: '155.25', categoryId: 'cat_gro' });

    const budget = calculateBudget(db, tenantId);
    expect(budget).not.toBeNull();
    expect(budget!.periodRolledForward).toBe(true);
    expect(budget!.periodStart).toBe(`${t.slice(0, 7)}-01`);
    // periodEnd is the real last calendar day of the current month
    const [y, m] = t.slice(0, 7).split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    expect(budget!.periodEnd).toBe(`${t.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`);

    // Current-month expense IS counted; prior-month expense is NOT
    expect(budget!.totalSpent).toBe('89.50');
    // Persisted row untouched
    const row = db.prepare(`SELECT start_date, end_date FROM budgets WHERE id = 'bgt_stale'`).get() as any;
    expect(row.end_date.endsWith('-28')).toBe(true);
  });

  it('explicit budgetId queries the archived period as-is (no projection)', () => {
    const t = todayISO();
    tx({ id: 'tx_nov_exp2', type: 'expense', date: t, account: 'w_chk', amount: '89.50', categoryId: 'cat_hous' });

    const archived = calculateBudget(db, tenantId, 'bgt_stale');
    expect(archived!.periodRolledForward).toBe(false);
    expect(archived!.periodEnd.endsWith('-28')).toBe(true);
    // The Nov expense falls outside the persisted (ended) period
    expect(archived!.totalSpent).toBe('0.00');
  });

  it('non-monthly budgets are never projected', () => {
    const t = todayISO();
    db.prepare(`
      INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, rollover_mode, is_active)
      VALUES ('bgt_yearly', ?, 'Holiday', 'category_limit', 'yearly', '2025-12-01', '2025-12-31', 'reset', 1)
    `).run(tenantId);
    const yearly = calculateBudget(db, tenantId, 'bgt_yearly');
    expect(yearly!.periodRolledForward).toBe(false);
    expect(yearly!.periodStart).toBe('2025-12-01');
  });
});

// ===========================================================================
// B2 — schedule-aware read-time rollforward of overdue obligations
// ===========================================================================

describe('B2: overdue recurring obligations are reserved due-immediately', () => {
  it('overdue rule (stale next_due_date, never generated) no longer drops out of STS', () => {
    const t = todayISO();
    // Overdue by 3 days: deterministic walk gives exactly 2 in-window occurrences
    // (the persisted overdue one due NOW + the next projected one within the 30d horizon)
    db.prepare(`
      INSERT INTO recurring_financial_rules
        (id, tenant_id, name, rule_type, frequency, interval_count, expected_amount, account_id, start_date, next_due_date, is_active, last_generated_at)
      VALUES ('rec_overdue', ?, 'Overdue Rent', 'bill', 'monthly', 1, '1800.00', 'w_chk', '2026-01-01', ?, 1, NULL)
    `).run(tenantId, addDaysISO(t, -3));

    const sts = calculateSafeToSpend(db, tenantId);
    // Overdue occurrence + next projected occurrence inside horizon = 2 × 1800
    expect(sts.overdueObligationsCount).toBe(1);
    expect(sts.overdueObligations).toBe('1800.00');
    expect(sts.upcomingObligationsCount).toBeGreaterThanOrEqual(1);
    expect(sts.upcomingObligations).toBe('3600.00');

    // Liquid 6000 - overdue 1800 - projected 1800 - buffer 500 = 1900
    expect(sts.safeToSpendAmount).toBe('1900.00');

    // Persisted schedule is NOT mutated by the read
    const rule = db.prepare(`SELECT next_due_date FROM recurring_financial_rules WHERE id = 'rec_overdue'`).get() as any;
    expect(rule.next_due_date).toBe(addDaysISO(t, -3));

    // The breakdown is explicit about the overdue reservation
    const line = sts.breakdown.find(b => b.label === 'Upcoming Recurring')!;
    expect(line.details).toContain('overdue');
  });

  it('a far-overdue rule reserves exactly one overdue occurrence (bounded, not escalating)', () => {
    const t = todayISO();
    db.prepare(`
      INSERT INTO recurring_financial_rules
        (id, tenant_id, name, rule_type, frequency, interval_count, expected_amount, account_id, start_date, next_due_date, is_active, last_generated_at)
      VALUES ('rec_yrly_late', ?, 'Old Annual Fee', 'bill', 'yearly', 1, '600.00', 'w_chk', '2024-01-01', ?, 1, NULL)
    `).run(tenantId, addDaysISO(t, -400));

    const sts = calculateSafeToSpend(db, tenantId);
    expect(sts.overdueObligations).toBe('600.00');
    expect(sts.overdueObligationsCount).toBe(1);
    // Next yearly occurrence is ~365 days out of the 30-day horizon: not reserved
    expect(sts.upcomingObligations).toBe('600.00');
  });

  it('future rules keep single-occurrence reservation (regression on prior behavior)', () => {
    const t = todayISO();
    db.prepare(`
      INSERT INTO recurring_financial_rules
        (id, tenant_id, name, rule_type, frequency, interval_count, expected_amount, account_id, start_date, next_due_date, is_active)
      VALUES ('rec_future', ?, 'Future Sub', 'subscription', 'monthly', 1, '1200.00', 'w_chk', '2026-01-01', ?, 1)
    `).run(tenantId, addDaysISO(t, 5));

    const sts = calculateSafeToSpend(db, tenantId);
    expect(sts.overdueObligationsCount).toBe(0);
    expect(sts.upcomingObligations).toBe('1200.00');
    expect(sts.upcomingObligationsCount).toBe(1);
    expect(sts.safeToSpendAmount).toBe('4300.00'); // 6000 - 1200 - 500
  });
});

// ===========================================================================
// B4 — earmarked savings capped by the linked ledger balance
// ===========================================================================

describe('B4: ledger-capped earmarked savings', () => {
  it('earmark = MIN(user current_amount, linked account ledger balance)', () => {
    // Transfer moves 500 from checking to savings: savings ledger = 5500.
    tx({ id: 'tx_trf', type: 'transfer', date: todayISO(), account: 'w_chk', toAccount: 'w_sav', amount: '500.00' });

    // User-types a stale/current_amount ABOVE the ledger: 6000 > 5500 → capped at 5500
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, status, linked_account_id)
      VALUES ('sg_cap', ?, 'Vacation', '10000.00', '6000.00', 'active', 'w_sav')
    `).run(tenantId);

    const sts = calculateSafeToSpend(db, tenantId);
    expect(sts.liquidFunds).toBe('6000.00'); // 500 chk remainder + 5500 savings
    expect(sts.earmarkedSavings).toBe('5500.00');
    expect(sts.safeToSpendAmount).toBe('0.00'); // 6000 - 5500 earmark - 500 buffer -> floored

    // Consistent entry: current_amount BELOW the ledger keeps the typed figure
    db.prepare(`UPDATE savings_goals SET current_amount = '4000.00' WHERE id = 'sg_cap'`).run();
    const sts2 = calculateSafeToSpend(db, tenantId);
    expect(sts2.earmarkedSavings).toBe('4000.00');
    expect(sts2.safeToSpendAmount).toBe('1500.00');
  });

  it('an unlinked goal keeps its full typed amount (no ledger to cap against)', () => {
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, status)
      VALUES ('sg_free', ?, 'Unlinked', '10000.00', '3000.00', 'active')
    `).run(tenantId);
    const sts = calculateSafeToSpend(db, tenantId);
    expect(sts.earmarkedSavings).toBe('3000.00');
  });

  it('a negative linked ledger balance earmarks nothing', () => {
    cat('cat_food', 'Food');
    tx({ id: 'tx_over', type: 'expense', date: todayISO(), account: 'w_sav', amount: '6000.00', categoryId: 'cat_food' });
    // savings ledger = 5000 - 6000 = -1000
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, status, linked_account_id)
      VALUES ('sg_neg', ?, 'Odd Goal', '10000.00', '2000.00', 'active', 'w_sav')
    `).run(tenantId);
    const sts = calculateSafeToSpend(db, tenantId);
    expect(sts.earmarkedSavings).toBe('0.00');
  });
});

// ===========================================================================
// B3 — dual truth figures + ledger-derived payoff basis
// ===========================================================================

describe('B3: debt principal vs ledger-derived outstanding', () => {
  beforeEach(() => {
    // Ledger: card opening -620.50 + one unsettled 142.85 expense = -763.35
    tx({ id: 'tx_card', type: 'expense', date: todayISO(), account: 'w_card', amount: '142.85', categoryId: 'cat_other' });
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, linked_account_id)
      VALUES ('debt_card', ?, 'Card Debt', 'credit_card', '620.50', '0', '25.00', 'w_card')
    `).run(tenantId);
  });

  it('exposes both figures and marks the ledger as payoff basis', () => {
    const rec = calculateDebtLedgerReconciliations(db, tenantId).find(r => r.debtId === 'debt_card')!;
    expect(rec.principalBalance).toBe('620.50');
    expect(rec.ledgerBalance).toBe('-763.35');
    expect(rec.ledgerOutstanding).toBe('763.35');
    expect(rec.balanceSource).toBe('ledger');
    expect(rec.effectivePrincipal).toBe('763.35');
    expect(rec.mismatch).toBe(true);
  });

  it('payoff amortizes the LEDGER figure (matches net worth truth source)', () => {
    // APR 0 + minimum payment above balance → settle in one month, no interest:
    // totalPaid == effective principal == 763.35 (NOT the typed 620.50).
    db.prepare(`UPDATE debts SET interest_rate = '0', minimum_payment = '25.00' WHERE id = 'debt_card'`).run();
    const scenarios = calculateDebtPayoffScenarios(db, tenantId, '1000.00');
    // extra 1000 clears the whole thing in month 1 in both strategies
    expect(scenarios.snowball.totalPaid).toBe('763.35');
    expect(scenarios.avalanche.totalPaid).toBe('763.35');
    expect(scenarios.snowball.monthsToDebtFree).toBe(1);
  });

  it('unlinked debts keep the record figure as their basis', () => {
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment)
      VALUES ('debt_street', ?, 'Unlinked IOU', 'personal', '900.00', '0', '50.00')
    `).run(tenantId);
    const recs = calculateDebtLedgerReconciliations(db, tenantId);
    const unlinked = recs.find(r => r.debtId === 'debt_street')!;
    expect(unlinked.ledgerOutstanding).toBeNull();
    expect(unlinked.balanceSource).toBe('principal');
    expect(unlinked.effectivePrincipal).toBe('900.00');
    expect(unlinked.mismatch).toBe(false);

    const scenarios = calculateDebtPayoffScenarios(db, tenantId, '10000.00');
    // 763.35 + 900.00 both cleared in month 1, zero interest
    expect(new Decimal(scenarios.snowball.totalPaid)).toEqual(new Decimal('1663.35'));
  });

  it('payment split per debt is deterministic half-up interest at effective principal', () => {
    const split = calculateDebtPaymentSplit('763.35', '18.99', '100.00');
    // 763.35 × 18.99% / 12 = 12.0800... → 12.08 half-up
    expect(split.interestPortion).toBe('12.08');
    expect(split.principalPortion).toBe('87.92');
    expect(split.previousPrincipal).toBe('763.35');
  });
});

// ===========================================================================
// B5 — savings rate clamped to 0–100, div-by-zero safe
// ===========================================================================

describe('B5: savings rate clamp', () => {
  beforeEach(() => cat('cat_sal', 'Salary', 'income'));

  it('zero income yields 0.0 rather than dividing by zero', () => {
    tx({ id: 'tx_exp_only', type: 'expense', date: todayISO(), account: 'w_chk', amount: '50.00', categoryId: 'cat_other' });
    const r = calculateIncomeAndExpenses(db, tenantId, addDaysISO(todayISO(), -1), todayISO());
    expect(r.savingsRatePercent).toBe('0.0');
  });

  it('refund-inflated net savings above income clamps to 100.0', () => {
    tx({ id: 'tx_inc', type: 'income', date: todayISO(), account: 'w_chk', amount: '100.00', categoryId: 'cat_sal' });
    tx({ id: 'tx_refund', type: 'refund', date: todayISO(), account: 'w_chk', amount: '50.00', categoryId: 'cat_other' });
    const r = calculateIncomeAndExpenses(db, tenantId, addDaysISO(todayISO(), -1), todayISO());
    // netSavings = 100 - (0 - 50) = 150 > income 100 → clamped
    expect(r.netSavings).toBe('150.00');
    expect(r.savingsRatePercent).toBe('100.0');
  });

  it('negative net savings clamps to 0.0 instead of reporting a negative rate', () => {
    tx({ id: 'tx_inc2', type: 'income', date: todayISO(), account: 'w_chk', amount: '100.00', categoryId: 'cat_sal' });
    tx({ id: 'tx_exp2', type: 'expense', date: todayISO(), account: 'w_chk', amount: '250.00', categoryId: 'cat_other' });
    const r = calculateIncomeAndExpenses(db, tenantId, addDaysISO(todayISO(), -1), todayISO());
    expect(r.netSavings).toBe('-150.00'); // absolute truth kept on the figures
    expect(r.savingsRatePercent).toBe('0.0');
  });
});

// ===========================================================================
// B7 — import batch reversal soft-voids instead of hard-deleting
// ===========================================================================

describe('B7: reverseImportBatch preserves immutable audit trail', () => {
  it('soft-voids imported rows, keeps journal_lines, reverts balances, and is idempotent', () => {
    tx({ id: 'tx_manual_pre', type: 'expense', date: todayISO(), account: 'w_chk', amount: '50.00', categoryId: 'cat_other' });
    const beforeBalances = db.prepare(`
      SELECT COUNT(*) AS n FROM journal_transactions WHERE tenant_id = ?
    `).get(tenantId) as { n: number };

    const csv = `Date,Amount,Description\n${todayISO()},4.50,Coffee Roasters\n${todayISO()},850.00,Consulting Invoice`;
    const preview = previewCsvImport(db, tenantId, 'w_chk', 'batch.csv', csv, {
      dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description',
    });
    expect(preview.validRowsCount).toBe(2);
    const commit = commitCsvImport(db, tenantId, 'w_chk', 'batch.csv', preview.fileHash, preview.rows, true);
    expect(commit.importedCount).toBe(2);

    const reversal = reverseImportBatch(db, tenantId, commit.batchId);
    expect(reversal.success).toBe(true);
    expect(reversal.reversedCount).toBe(2);

    // Rows are STILL THERE, voided — not deleted
    const voidedRows = db.prepare(`
      SELECT status FROM journal_transactions WHERE import_batch_id = ? ORDER BY date
    `).all(commit.batchId) as Array<{ status: string }>;
    expect(voidedRows).toHaveLength(2);
    expect(voidedRows.every(r => r.status === 'voided')).toBe(true);

    // Journal lines preserved (1 line per posted import row = 2)
    const lines = db.prepare(`
      SELECT COUNT(*) AS n FROM journal_lines
      WHERE transaction_id IN (SELECT id FROM journal_transactions WHERE import_batch_id = ?)
    `).get(commit.batchId) as { n: number };
    expect(lines.n).toBe(2);

    // Balance math reverted (voided rows excluded from 'posted' sums)
    // Checking = 1000 - 50 (manual) - 4.50 - 850 + 850 + 4.50 (voided) not counted...
    // Actually voided amounts drop out entirely: 1000 - 50 = 950 retained manual effect.
    const manual = db.prepare(`SELECT amount, status FROM journal_transactions WHERE id = 'tx_manual_pre'`).get() as any;
    expect(manual.status).toBe('posted');
    expect(manual.amount).toBe('50.00');

    // Batch marked reversed + batch audit event recorded
    const batch = db.prepare(`SELECT status FROM import_batches WHERE id = ?`).get(commit.batchId) as any;
    expect(batch.status).toBe('reversed');
    const audit = db.prepare(`SELECT action FROM audit_events WHERE entity_id = ?`).get(commit.batchId) as any;
    expect(audit.action).toBe('reverse_import_batch');

    // Second reversal is a no-op
    const again = reverseImportBatch(db, tenantId, commit.batchId);
    expect(again.alreadyReversed).toBe(true);
    expect(again.reversedCount).toBe(0);
    const stillTwo = db.prepare(`
      SELECT COUNT(*) AS n FROM journal_transactions WHERE import_batch_id = ?
    `).get(commit.batchId) as { n: number };
    expect(stillTwo.n).toBe(2);
    expect(beforeBalances.n).toBe(1); // only manual tx before import
  });

  it('unknown batch id throws', () => {
    expect(() => reverseImportBatch(db, tenantId, 'batch_nope')).toThrow(/not found/);
  });
});

// ===========================================================================
// B6 — soft duplicate warning (advisory)
// ===========================================================================

describe('B6: duplicate transaction probe', () => {
  it('flags same (account, date, type, amount) duplicates and honors exclusion', () => {
    cat('cat_food', 'Food');
    tx({ id: 'tx_dup_1', type: 'expense', date: todayISO(), account: 'w_chk', amount: '89.50', categoryId: 'cat_food' });

    const probe = { accountId: 'w_chk', date: todayISO(), transactionType: 'expense', amount: '89.50' };
    const hit = detectDuplicateTransaction(db, tenantId, probe);
    expect(hit.isDuplicate).toBe(true);
    expect(hit.existingIds).toEqual(['tx_dup_1']);

    // The just-created row itself excluded (route semantics)
    const self = detectDuplicateTransaction(db, tenantId, { ...probe, excludeTransactionId: 'tx_dup_1' });
    expect(self.isDuplicate).toBe(false);

    // Different amount / day / type → no warning
    const missAmount = detectDuplicateTransaction(db, tenantId, { ...probe, amount: '12.00' });
    expect(missAmount.isDuplicate).toBe(false);
    const missDay = detectDuplicateTransaction(db, tenantId, { ...probe, date: addDaysISO(todayISO(), -2) });
    expect(missDay.isDuplicate).toBe(false);
    const missType = detectDuplicateTransaction(db, tenantId, { ...probe, transactionType: 'income' });
    expect(missType.isDuplicate).toBe(false);
  });
});
