import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  calculateAccountBalances,
  calculateIncomeAndExpenses,
  calculateBudget,
  calculateSafeToSpend,
  calculateNetWorth,
  calculateDebtPayoffScenarios,
} from '../lib/finance/engine';
import { previewCsvImport, commitCsvImport, reverseImportBatch } from '../lib/finance/csv-import';
import type Database from 'better-sqlite3';

describe('Finance Real-World Operations & Workflows', () => {
  let db: Database.Database;
  const tenantId = 'tenant_workflow_test';

  const getBal = (balances: ReturnType<typeof calculateAccountBalances>, accountId: string) => {
    return balances.find(a => a.accountId === accountId)?.currentBalance;
  };

  beforeEach(() => {
    db = getInMemoryDb();

    // 1. Initialize tenant and user
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Workflow Test Tenant', 'wf-test')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES ('u_wf', ?, 'wf@os.local', 'Workflow User')").run(tenantId);

    // 2. Initialize accounts with known opening balances
    // Checking: 1000.00, Savings: 5000.00, Credit Card: 0.00
    db.prepare(`
      INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
      VALUES 
        ('acc_chk', ?, 'Checking Account', 'checking', 'USD', '1000.00'),
        ('acc_sav', ?, 'High Yield Savings', 'savings', 'USD', '5000.00'),
        ('acc_crd', ?, 'Rewards Credit Card', 'credit_card', 'USD', '0.00')
    `).run(tenantId, tenantId, tenantId);

    // 3. Initialize standard categories
    db.prepare(`
      INSERT INTO categories (id, tenant_id, name, type)
      VALUES 
        ('cat_sal', ?, 'Salary & Wages', 'income'),
        ('cat_gro', ?, 'Groceries & Household', 'expense'),
        ('cat_rnt', ?, 'Rent & Housing', 'expense'),
        ('cat_dbt', ?, 'Debt Payments', 'expense'),
        ('cat_uti', ?, 'Utilities', 'expense')
    `).run(tenantId, tenantId, tenantId, tenantId, tenantId);
  });

  it('Operation 1: Record income (salary $5,000.00) and verify exact balance update', () => {
    let balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('1000.00');

    // Post salary income
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_sal_01', ?, 'income', '2026-10-01', 'acc_chk', '5000.00', 'USD', '5000.00', 'Monthly Tech Corp Salary', 'posted', 'cat_sal')
    `).run(tenantId);

    balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('6000.00');

    // Verify income calculation
    const incExp = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    expect(incExp.totalIncome).toBe('5000.00');
    expect(incExp.netSavings).toBe('5000.00');
  });

  it('Operation 2: Record expense (groceries $120.50) and verify ledger debit', () => {
    // Post initial salary
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_sal_01', ?, 'income', '2026-10-01', 'acc_chk', '5000.00', 'USD', '5000.00', 'Monthly Tech Corp Salary', 'posted', 'cat_sal')
    `).run(tenantId);

    // Post grocery expense
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_gro_01', ?, 'expense', '2026-10-02', 'acc_chk', '120.50', 'USD', '120.50', 'Whole Foods Market', 'posted', 'cat_gro')
    `).run(tenantId);

    const balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('5879.50');

    const incExp = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    expect(incExp.totalExpenses).toBe('120.50');
    expect(incExp.netSavings).toBe('4879.50');
  });

  it('Operation 3: Transfer money between accounts ($1,000.00 checking to savings) with neutral P&L', () => {
    // Checking: 1000, Savings: 5000
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status
      ) VALUES ('tx_trf_01', ?, 'transfer', '2026-10-03', 'acc_chk', 'acc_sav', '1000.00', 'USD', '1000.00', 'Transfer to Emergency Fund', 'posted')
    `).run(tenantId);

    const balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('0.00');
    expect(getBal(balances, 'acc_sav')).toBe('6000.00');

    // Transfer must be strictly neutral in income & expense calculations
    const incExp = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    expect(incExp.totalIncome).toBe('0.00');
    expect(incExp.totalExpenses).toBe('0.00');
    expect(incExp.netSavings).toBe('0.00');
  });

  it('Operation 4: Create a monthly budget and verify allocated vs spent calculations', () => {
    // Create budget for October 2026
    db.prepare(`
      INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, rollover_mode)
      VALUES ('bud_2026_10', ?, 'October 2026 Living', 'category_limit', 'monthly', '2026-10-01', '2026-10-31', 'carry_unused')
    `).run(tenantId);

    // Groceries allocated $500.00
    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES ('bl_gro_01', ?, 'bud_2026_10', 'cat_gro', '500.00', '0.00')
    `).run(tenantId);

    // Spend $120.50 on groceries
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_gro_01', ?, 'expense', '2026-10-05', 'acc_chk', '120.50', 'USD', '120.50', 'Weekly Groceries', 'posted', 'cat_gro')
    `).run(tenantId);

    const budgetReport = calculateBudget(db, tenantId, 'bud_2026_10');
    expect(budgetReport).not.toBeNull();
    expect(budgetReport!.totalAllocated).toBe('500.00');
    expect(budgetReport!.totalSpent).toBe('120.50');
    expect(budgetReport!.totalRemaining).toBe('379.50');
    expect(budgetReport!.items.length).toBe(1);
    expect(budgetReport!.items[0].categoryName).toBe('Groceries & Household');
    expect(budgetReport!.items[0].remainingAmount).toBe('379.50');
  });

  it('Operation 5: Allocate savings goal and verify target tracking and safe-to-spend reservation', () => {
    // Settings: safety buffer = 500.00
    db.prepare(`
      INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon)
      VALUES (?, '500.00', 30)
    `).run(tenantId);

    // Create Savings Goal
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, status)
      VALUES ('sg_emergency_wf', ?, 'Emergency Cushion', '10000.00', '3000.00', 'active')
    `).run(tenantId);

    // Liquid funds = 1000 (checking) + 5000 (savings) = 6000.00
    // Earmarked savings goal = 3000.00, buffer = 500.00
    // Safe-to-spend = 6000 - 3000 - 500 = 2500.00
    let safeToSpend = calculateSafeToSpend(db, tenantId);
    expect(safeToSpend.liquidFunds).toBe('6000.00');
    expect(safeToSpend.earmarkedSavings).toBe('3000.00');
    expect(safeToSpend.safeToSpendAmount).toBe('2500.00');

    // Allocate an additional $1,000.00 to the goal
    db.prepare(`
      UPDATE savings_goals
      SET current_amount = '4000.00'
      WHERE id = 'sg_emergency_wf' AND tenant_id = ?
    `).run(tenantId);

    safeToSpend = calculateSafeToSpend(db, tenantId);
    expect(safeToSpend.earmarkedSavings).toBe('4000.00');
    expect(safeToSpend.safeToSpendAmount).toBe('1500.00');
  });

  it('Operation 6: Create a debt (credit card liability $1,500.00) and verify payoff scenarios', () => {
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment)
      VALUES ('debt_cc_wf', ?, 'Platinum Card Debt', 'credit_card', '1500.00', '18.0', '50.00')
    `).run(tenantId);

    const debtScenarios = calculateDebtPayoffScenarios(db, tenantId, '200.00');
    expect(debtScenarios.snowball.monthsToDebtFree).toBeGreaterThan(0);
    expect(debtScenarios.avalanche.monthsToDebtFree).toBeGreaterThan(0);
    expect(debtScenarios.snowball.totalPaid).toBeDefined();

    // Verify Net Worth accounts for debt liability
    // Assets: Checking (1000) + Savings (5000) = 6000.00
    // Liabilities: Standalone debt 1500.00
    // Net Worth = 6000 - 1500 = 4500.00
    const nw = calculateNetWorth(db, tenantId);
    expect(nw.totalAssets).toBe('6000.00');
    expect(nw.totalLiabilities).toBe('1500.00');
    expect(nw.netWorth).toBe('4500.00');
  });

  it('Operation 7: Record partial debt payment ($300.00) and verify liability and asset reduction', () => {
    // Initial debt: 1500.00
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment)
      VALUES ('debt_cc_wf', ?, 'Platinum Card Debt', 'credit_card', '1500.00', '18.0', '50.00')
    `).run(tenantId);

    // Pay $300 from checking toward debt
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_dbt_pay_01', ?, 'expense', '2026-10-10', 'acc_chk', '300.00', 'USD', '300.00', 'Credit Card Payment', 'posted', 'cat_dbt')
    `).run(tenantId);

    // Reduce debt record principal
    db.prepare(`
      UPDATE debts
      SET principal_balance = '1200.00'
      WHERE id = 'debt_cc_wf' AND tenant_id = ?
    `).run(tenantId);

    const balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('700.00'); // 1000 - 300

    const nw = calculateNetWorth(db, tenantId);
    // Assets: 700 + 5000 = 5700.00
    // Liabilities: 1200.00
    // Net Worth = 5700 - 1200 = 4500.00 (repayment is balance-sheet neutral for net worth)
    expect(nw.totalAssets).toBe('5700.00');
    expect(nw.totalLiabilities).toBe('1200.00');
    expect(nw.netWorth).toBe('4500.00');
  });

  it('Operation 8: Create and edit a recurring obligation ($1,200.00 rent) and verify safe-to-spend reservation', () => {
    // Settings: safety buffer = 500.00, 30 days horizon
    db.prepare(`
      INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon)
      VALUES (?, '500.00', 30)
    `).run(tenantId);

    const futureDue = new Date();
    futureDue.setDate(futureDue.getDate() + 5);
    const nextDueDate = futureDue.toISOString().slice(0, 10);

    // Rent obligation due in 5 days: $1,200.00
    db.prepare(`
      INSERT INTO recurring_financial_rules (
        id, tenant_id, name, rule_type, expected_amount, account_id, category_id, start_date, next_due_date, is_active
      ) VALUES ('rec_rent_wf', ?, 'Apartment Rent', 'bill', '1200.00', 'acc_chk', 'cat_rnt', '2026-01-01', ?, 1)
    `).run(tenantId, nextDueDate);

    // Safe-to-spend: Liquid = 6000.00. Recurring = 1200.00. Buffer = 500.00.
    // Safe-to-spend = 6000 - 1200 - 500 = 4300.00
    let safeToSpend = calculateSafeToSpend(db, tenantId);
    expect(safeToSpend.upcomingObligations).toBe('1200.00');
    expect(safeToSpend.safeToSpendAmount).toBe('4300.00');

    // Edit recurring obligation: rent increased to $1,250.00
    db.prepare(`
      UPDATE recurring_financial_rules
      SET expected_amount = '1250.00'
      WHERE id = 'rec_rent_wf' AND tenant_id = ?
    `).run(tenantId);

    safeToSpend = calculateSafeToSpend(db, tenantId);
    expect(safeToSpend.upcomingObligations).toBe('1250.00');
    expect(safeToSpend.safeToSpendAmount).toBe('4250.00');
  });

  it('Operation 9 & 10: Import CSV statement and atomically reverse imported batch without affecting existing records', () => {
    // 1. Record an existing manual transaction first
    db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id
      ) VALUES ('tx_manual_existing', ?, 'expense', '2026-10-01', 'acc_chk', '50.00', 'USD', '50.00', 'Manual Pharmacy', 'posted', 'cat_gro')
    `).run(tenantId);

    let balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('950.00'); // 1000 - 50

    // 2. CSV Statement data
    const csvContent = `Date,Amount,Description\n2026-10-15,4.50,Coffee Roasters\n2026-10-16,850.00,Consulting Invoice\n2026-10-17,75.50,Broadband Internet`;

    // Preview import
    const preview = previewCsvImport(db, tenantId, 'acc_chk', 'october_bank.csv', csvContent, {
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
    });
    expect(preview.validRowsCount).toBe(3);
    expect(preview.duplicateRowsCount).toBe(0);

    // Commit import (Operation 9)
    const commitResult = commitCsvImport(db, tenantId, 'acc_chk', 'october_bank.csv', preview.fileHash, preview.rows, true);
    expect(commitResult.importedCount).toBe(3);

    // Verify transactions in database have the import_batch_id
    const importedTxs = db.prepare(`
      SELECT count(*) as count FROM journal_transactions WHERE import_batch_id = ?
    `).get(commitResult.batchId) as { count: number };
    expect(importedTxs.count).toBe(3);

    // Operation 10: Reverse the imported batch
    const reversal = reverseImportBatch(db, tenantId, commitResult.batchId);
    expect(reversal.success).toBe(true);
    expect(reversal.reversedCount).toBe(3);

    // Verify checking account balance reverted to EXACT pre-import state (950.00)
    balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('950.00');

    // Verify existing manual transaction was completely untouched
    const manualTx = db.prepare(`
      SELECT * FROM journal_transactions WHERE id = 'tx_manual_existing'
    `).get() as any;
    expect(manualTx).toBeDefined();
    expect(manualTx.amount).toBe('50.00');

    // Verify batch status is 'reversed'
    const batchRecord = db.prepare(`
      SELECT status FROM import_batches WHERE id = ?
    `).get(commitResult.batchId) as { status: string };
    expect(batchRecord.status).toBe('reversed');
  });
});
