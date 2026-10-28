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

describe('Finance Deterministic Calculation Engine', () => {
  let db: Database.Database;
  const tenantId = 'tenant_test';

  beforeEach(() => {
    db = getInMemoryDb();

    // Create test tenant and user
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Test Tenant', 'test')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES ('u1', ?, 'test@os.local', 'Tester')").run(tenantId);

    // Create test accounts
    db.prepare(`
      INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
      VALUES 
        ('acc_chk', ?, 'Checking Account', 'checking', 'USD', '1000.00'),
        ('acc_sav', ?, 'Savings Account', 'savings', 'USD', '5000.00'),
        ('acc_crd', ?, 'Credit Card', 'credit_card', 'USD', '0.00')
    `).run(tenantId, tenantId, tenantId);

    // Create test categories
    db.prepare(`
      INSERT INTO categories (id, tenant_id, name, type)
      VALUES 
        ('cat_inc', ?, 'Job Salary', 'income'),
        ('cat_gro', ?, 'Groceries', 'expense'),
        ('cat_rent', ?, 'Rent', 'expense')
    `).run(tenantId, tenantId, tenantId);
  });

  it('calculates account balance with exact decimal precision after income, expense, and transfers', () => {
    // Income of $2500.50 into Checking
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_1', ?, 'income', '2026-10-01', 'acc_chk', '2500.50', 'USD', '2500.50', 'Salary', 'posted')
    `).run(tenantId);

    // Expense of $150.25 from Checking
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_2', ?, 'expense', '2026-10-02', 'acc_chk', '150.25', 'USD', '150.25', 'Grocery Store', 'posted')
    `).run(tenantId);

    // Transfer $500.00 from Checking to Savings
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_3', ?, 'transfer', '2026-10-03', 'acc_chk', 'acc_sav', '500.00', 'USD', '500.00', 'Transfer to savings', 'posted')
    `).run(tenantId);

    const balances = calculateAccountBalances(db, tenantId);
    const checking = balances.find(a => a.accountId === 'acc_chk');
    const savings = balances.find(a => a.accountId === 'acc_sav');

    // Checking: 1000.00 (opening) + 2500.50 (income) - 150.25 (expense) - 500.00 (transfer out) = 2850.25
    expect(checking?.currentBalance).toBe('2850.25');

    // Savings: 5000.00 (opening) + 500.00 (transfer in) = 5500.00
    expect(savings?.currentBalance).toBe('5500.00');
  });

  it('strictly excludes transfers from income and expenses', () => {
    // Add income, expense, and a large transfer
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES 
        ('t1', ?, 'income', '2026-10-05', 'acc_chk', '3000.00', 'USD', '3000.00', 'Paycheck', 'posted'),
        ('t2', ?, 'expense', '2026-10-06', 'acc_chk', '800.00', 'USD', '800.00', 'Rent', 'posted')
    `).run(tenantId, tenantId);

    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
      VALUES ('t3', ?, 'transfer', '2026-10-07', 'acc_chk', 'acc_sav', '1500.00', 'USD', '1500.00', 'Internal transfer', 'posted')
    `).run(tenantId);

    const result = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    expect(result.totalIncome).toBe('3000.00');
    expect(result.totalExpenses).toBe('800.00');
    expect(result.netSavings).toBe('2200.00');
  });

  it('correctly nets refunds against expenses', () => {
    // Expense $200, followed by $50 refund
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, category_id, amount, currency, base_amount, description, status)
      VALUES 
        ('t1', ?, 'expense', '2026-10-10', 'acc_chk', 'cat_gro', '200.00', 'USD', '200.00', 'Store purchase', 'posted'),
        ('t2', ?, 'refund', '2026-10-11', 'acc_chk', 'cat_gro', '50.00', 'USD', '50.00', 'Store return', 'posted')
    `).run(tenantId, tenantId);

    const result = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    // Net expense should be $150.00
    expect(result.totalExpenses).toBe('150.00');
  });

  it('calculates category budget remaining amounts with rollovers', () => {
    // Create monthly budget
    db.prepare(`
      INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, rollover_mode)
      VALUES ('b1', ?, 'October Budget', 'category_limit', 'monthly', '2026-10-01', '2026-10-31', 'carry_unused')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES ('bl_gro', ?, 'b1', 'cat_gro', '500.00', '50.00')
    `).run(tenantId);

    // Spend $320.00 on groceries
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, category_id, amount, currency, base_amount, description, status)
      VALUES ('tx_g', ?, 'expense', '2026-10-15', 'acc_chk', 'cat_gro', '320.00', 'USD', '320.00', 'Food', 'posted')
    `).run(tenantId);

    const bgtResult = calculateBudget(db, tenantId, 'b1');
    expect(bgtResult).not.toBeNull();
    const groLine = bgtResult!.items.find(i => i.categoryId === 'cat_gro');

    // Total budgeted = 500 + 50 = 550.00; Spent = 320.00; Remaining = 230.00
    expect(groLine?.totalBudgeted).toBe('550.00');
    expect(groLine?.spentAmount).toBe('320.00');
    expect(groLine?.remainingAmount).toBe('230.00');
    expect(groLine?.status).toBe('under');
  });

  it('calculates safe-to-spend without double counting reserves or buffers', () => {
    const futureDue = new Date();
    futureDue.setDate(futureDue.getDate() + 10);
    const nextDueDate = futureDue.toISOString().slice(0, 10);

    // Setup recurring bill of $200 due in 10 days
    db.prepare(`
      INSERT INTO recurring_financial_rules (id, tenant_id, name, expected_amount, account_id, start_date, next_due_date, is_active)
      VALUES ('r1', ?, 'Electricity & WiFi', '200.00', 'acc_chk', '2026-01-01', ?, 1)
    `).run(tenantId, nextDueDate);

    // Active savings goal of $1000 earmarked
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, status)
      VALUES ('sg1', ?, 'Trip to Kyoto', '2000.00', '1000.00', 'active')
    `).run(tenantId);

    // Settings: safety buffer = 500.00
    db.prepare(`
      INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon)
      VALUES (?, '500.00', 30)
    `).run(tenantId);

    // Liquid funds = 1000 (checking) + 5000 (savings) = 6000.00
    // Upcoming obligations = 200.00
    // Earmarked savings = 1000.00
    // Buffer = 500.00
    // Safe to spend = 6000 - 200 - 1000 - 500 = 4300.00
    const safeSpend = calculateSafeToSpend(db, tenantId);
    expect(safeSpend.liquidFunds).toBe('6000.00');
    expect(safeSpend.upcomingObligations).toBe('200.00');
    expect(safeSpend.earmarkedSavings).toBe('1000.00');
    expect(safeSpend.safetyBuffer).toBe('500.00');
    expect(safeSpend.safeToSpendAmount).toBe('4300.00');
  });

  it('calculates net worth as valued assets minus liabilities', () => {
    // Checking ($1000) + Savings ($5000) = Assets $6000
    // Credit card expense of $450 = Liability $450
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_crd', ?, 'expense', '2026-10-12', 'acc_crd', '450.00', 'USD', '450.00', 'Electronics', 'posted')
    `).run(tenantId);

    const netWorth = calculateNetWorth(db, tenantId);
    expect(netWorth.totalAssets).toBe('6000.00');
    expect(netWorth.totalLiabilities).toBe('450.00');
    expect(netWorth.netWorth).toBe('5550.00');
  });

  it('imports CSV transactions, flags duplicates, commits atomically, and supports batch reversal', () => {
    const csvContent = `Date,Amount,Description,Category\n2026-10-01,120.00,Target Superstore,Groceries\n2026-10-02,45.50,Uber Trip,Transport\n2026-10-01,120.00,Target Superstore,Groceries\n`;

    const preview = previewCsvImport(db, tenantId, 'acc_chk', 'test_bank.csv', csvContent, {
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
    });

    expect(preview.totalRows).toBe(3);
    expect(preview.validRowsCount).toBe(3);

    // Commit import batch
    const commit = commitCsvImport(db, tenantId, 'acc_chk', 'test_bank.csv', preview.fileHash, preview.rows, false);
    expect(commit.importedCount).toBe(3);

    // Re-check preview with duplicates detection
    const secondPreview = previewCsvImport(db, tenantId, 'acc_chk', 'test_bank.csv', csvContent, {
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
    });
    // Now existing transactions are found as duplicates
    expect(secondPreview.duplicateRowsCount).toBeGreaterThanOrEqual(1);

    // Verify batch reversal
    const reversal = reverseImportBatch(db, tenantId, commit.batchId);
    expect(reversal.success).toBe(true);
    expect(reversal.reversedCount).toBe(3);

    // Account balance after reversal should be untouched
    const balances = calculateAccountBalances(db, tenantId);
    const checking = balances.find(a => a.accountId === 'acc_chk');
    expect(checking?.currentBalance).toBe('1000.00');
  });
});
