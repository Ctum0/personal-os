import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  calculateAccountBalances,
  calculateIncomeAndExpenses,
  calculateBudget,
  calculateSafeToSpend,
  calculateNetWorth,
  rolloverBudgetPeriod,
  calculateDebtPaymentSplit,
} from '../lib/finance/engine';
import { Decimal } from 'decimal.js';
import type Database from 'better-sqlite3';

describe('Multi-Month Cumulative Financial Simulation & Accounting Integrity', () => {
  let db: Database.Database;
  const tenantId = 'tenant_sim_multi_month';

  const getBal = (balances: ReturnType<typeof calculateAccountBalances>, accountId: string) => {
    return balances.find(a => a.accountId === accountId)?.currentBalance;
  };

  const getPendingBal = (balances: ReturnType<typeof calculateAccountBalances>, accountId: string) => {
    return balances.find(a => a.accountId === accountId)?.pendingBalance;
  };

  beforeEach(() => {
    db = getInMemoryDb();

    // 1. Initialize tenant and user
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Simulation Tenant', 'sim-tenant')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name, preferences) VALUES ('u_sim', ?, 'sim@os.local', 'Sim Tester', '{\"baseCurrency\":\"USD\"}')").run(tenantId);

    // 2. Initialize accounts with known realistic opening balances
    // Checking: $2,500.00, Savings: $10,000.00, Credit Card: -$450.00 (debt liability)
    db.prepare(`
      INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
      VALUES 
        ('acc_chk', ?, 'Premier Checking', 'checking', 'USD', '2500.00'),
        ('acc_sav', ?, 'High Yield Savings', 'savings', 'USD', '10000.00'),
        ('acc_crd', ?, 'Rewards Credit Card', 'credit_card', 'USD', '-450.00')
    `).run(tenantId, tenantId, tenantId);

    // 3. Initialize categories
    db.prepare(`
      INSERT INTO categories (id, tenant_id, name, type)
      VALUES 
        ('cat_sal', ?, 'Salary & Wages', 'income'),
        ('cat_rnt', ?, 'Rent & Housing', 'expense'),
        ('cat_uti', ?, 'Utilities & Services', 'expense'),
        ('cat_gro', ?, 'Groceries & Provisions', 'expense'),
        ('cat_ent', ?, 'Dining & Leisure', 'expense'),
        ('cat_dbt', ?, 'Debt Financing Interest', 'expense'),
        ('cat_tax', ?, 'Tax Obligations', 'expense')
    `).run(tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId);

    // 4. Initialize Standalone Debt (Student Loan: $5,000.00 principal @ 6% APR)
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment)
      VALUES ('debt_stu', ?, 'Federal Student Loan', 'student_loan', '5000.00', '6.0', '100.00')
    `).run(tenantId);

    // 5. Initialize Earmarked Savings Goal: Japan Vacation ($1,000.00 earmarked)
    db.prepare(`
      INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, linked_account_id, status)
      VALUES ('sg_japan', ?, 'Japan Vacation Fund', '3000.00', '1000.00', 'acc_sav', 'active')
    `).run(tenantId);

    // 6. Safe-to-Spend settings: safety buffer $500.00, 30 days horizon
    db.prepare(`
      INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon)
      VALUES (?, '500.00', 30)
    `).run(tenantId);
  });

  it('verifies starting balances and baseline net worth match opening state exactly', () => {
    const balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('2500.00');
    expect(getBal(balances, 'acc_sav')).toBe('10000.00');
    // Credit card balance is -450.00
    expect(getBal(balances, 'acc_crd')).toBe('-450.00');

    // Net worth = Assets ($2500 + $10000 = $12500) - Liabilities (Credit card $450 + Student loan $5000 = $5450)
    // Net worth = $7,050.00
    const nw = calculateNetWorth(db, tenantId);
    expect(nw.totalAssets).toBe('12500.00');
    expect(nw.totalLiabilities).toBe('5450.00');
    expect(nw.netWorth).toBe('7050.00');
  });

  it('runs complete Month 1 & Month 2 cumulative simulation verifying all accounting contracts', () => {
    // =========================================================================
    // MONTH 1 (October 2026): Operating Cycle
    // =========================================================================

    // Day 01: Setup October Budget with rollover_mode = 'carry_unused'
    db.prepare(`
      INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, rollover_mode, is_active)
      VALUES ('bud_oct', ?, 'October 2026 Budget', 'category_limit', 'monthly', '2026-10-01', '2026-10-31', 'carry_unused', 1)
    `).run(tenantId);

    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES 
        ('bl_oct_gro', ?, 'bud_oct', 'cat_gro', '500.00', '0.00'),
        ('bl_oct_ent', ?, 'bud_oct', 'cat_ent', '200.00', '0.00'),
        ('bl_oct_rnt', ?, 'bud_oct', 'cat_rnt', '1600.00', '0.00'),
        ('bl_oct_uti', ?, 'bud_oct', 'cat_uti', '200.00', '0.00')
    `).run(tenantId, tenantId, tenantId, tenantId);

    // Setup recurring bill rules due in October
    db.prepare(`
      INSERT INTO recurring_financial_rules (id, tenant_id, name, rule_type, frequency, expected_amount, account_id, category_id, start_date, next_due_date, is_active)
      VALUES 
        ('rec_rnt', ?, 'Monthly Apartment Rent', 'bill', 'monthly', '1600.00', 'acc_chk', 'cat_rnt', '2026-10-01', '2026-10-05', 1),
        ('rec_uti', ?, 'Electric & Fiber Internet', 'bill', 'monthly', '185.50', 'acc_chk', 'cat_uti', '2026-10-01', '2026-10-12', 1)
    `).run(tenantId, tenantId);

    // Day 01: Salary deposit: $5,500.00 into Checking
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_sal_oct', ?, 'income', '2026-10-01', 'acc_chk', '5500.00', 'USD', '5500.00', 'Tech Corp Monthly Salary', 'posted', 'cat_sal')
    `).run(tenantId);

    // Checking: 2500 + 5500 = 8000.00
    let balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('8000.00');

    // Day 03: Inter-Account Transfer of $1,500.00 from Checking to Savings
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_trf_oct', ?, 'transfer', '2026-10-03', 'acc_chk', 'acc_sav', '1500.00', 'USD', '1500.00', 'Checking to HYSA Transfer', 'posted')
    `).run(tenantId);

    balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('6500.00'); // 8000 - 1500
    expect(getBal(balances, 'acc_sav')).toBe('11500.00'); // 10000 + 1500

    // VERIFY TRANSFER IS 100% P&L NEUTRAL
    let pnl = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-04');
    expect(pnl.totalIncome).toBe('5500.00');
    expect(pnl.totalExpenses).toBe('0.00');
    expect(pnl.netSavings).toBe('5500.00');

    // Day 05: Recurring Rent posted: $1,600.00
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_rnt_oct', ?, 'expense', '2026-10-05', 'acc_chk', '1600.00', 'USD', '1600.00', 'Apartment Rent Oct', 'posted', 'cat_rnt')
    `).run(tenantId);

    // Day 08: Grocery trip 1: $142.35
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_gro_oct_1', ?, 'expense', '2026-10-08', 'acc_chk', '142.35', 'USD', '142.35', 'Whole Foods Market', 'posted', 'cat_gro')
    `).run(tenantId);

    // Day 10: Debt Payment of $300.00 with Principal & Interest Split
    // Student Loan: $5,000.00 @ 6% APR -> Monthly interest = 5000 * 0.005 = $25.00
    // Principal reduction = $300 - $25 = $275.00. Remaining principal = $4,725.00
    const splitMonth1 = calculateDebtPaymentSplit('5000.00', '6.0', '300.00');
    expect(splitMonth1.interestPortion).toBe('25.00');
    expect(splitMonth1.principalPortion).toBe('275.00');
    expect(splitMonth1.remainingPrincipal).toBe('4725.00');

    // Post debt payment: $300 out of checking, with $25 booked as interest financing expense
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_dbt_int_oct', ?, 'expense', '2026-10-10', 'acc_chk', '25.00', 'USD', '25.00', 'Student Loan Interest', 'posted', 'cat_dbt')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_dbt_prn_oct', ?, 'transfer', '2026-10-10', 'acc_chk', '275.00', 'USD', '275.00', 'Student Loan Principal Repayment', 'posted')
    `).run(tenantId);

    // Update debt table principal balance
    db.prepare(`
      UPDATE debts SET principal_balance = ? WHERE id = 'debt_stu' AND tenant_id = ?
    `).run(splitMonth1.remainingPrincipal, tenantId);

    // Day 12: Utilities bill paid: $185.50
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_uti_oct', ?, 'expense', '2026-10-12', 'acc_chk', '185.50', 'USD', '185.50', 'Power & Fiber Oct', 'posted', 'cat_uti')
    `).run(tenantId);

    // Day 15: Dining & Leisure: $85.40
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_ent_oct_1', ?, 'expense', '2026-10-15', 'acc_chk', '85.40', 'USD', '85.40', 'Bistro Dinner', 'posted', 'cat_ent')
    `).run(tenantId);

    // Day 22: Grocery trip 2: $165.20
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_gro_oct_2', ?, 'expense', '2026-10-22', 'acc_chk', '165.20', 'USD', '165.20', 'Trader Joe Supermarket', 'posted', 'cat_gro')
    `).run(tenantId);

    // Day 25: Refund of $30.00 from grocery return
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_gro_ref_oct', ?, 'refund', '2026-10-25', 'acc_chk', '30.00', 'USD', '30.00', 'Grocery Item Return', 'posted', 'cat_gro')
    `).run(tenantId);

    // Day 26: Discretionary shopping: $110.00
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_disc_oct', ?, 'expense', '2026-10-26', 'acc_chk', '110.00', 'USD', '110.00', 'Hardware Tools', 'posted')
    `).run(tenantId);

    // Day 28: PENDING TRANSACTION TEST
    // An uncleared restaurant charge of $95.50
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_pending_oct', ?, 'expense', '2026-10-28', 'acc_chk', '95.50', 'USD', '95.50', 'Uncleared Lounge Card Auth', 'pending', 'cat_ent')
    `).run(tenantId);

    balances = calculateAccountBalances(db, tenantId);
    // Checking posted balance calculation:
    // 2500 (opening) + 5500 (income) - 1500 (trf) - 1600 (rent) - 142.35 (gro1) - 25 (interest)
    // - 275 (principal) - 185.50 (uti) - 85.40 (ent) - 165.20 (gro2) + 30.00 (refund) - 110 (disc)
    // = 3941.55 posted balance
    expect(getBal(balances, 'acc_chk')).toBe('3941.55');

    // VERIFY PENDING DEDUCTIONS DO NOT ALTER POSTED BALANCE BUT DO AFFECT PENDING / AVAILABLE BALANCE
    // pendingBalance should be 3941.55 - 95.50 = 3846.05
    expect(getPendingBal(balances, 'acc_chk')).toBe('3846.05');

    // Safe-to-spend must include pending deductions
    let sts = calculateSafeToSpend(db, tenantId);
    expect(sts.liquidFunds).toBe('15441.55'); // 3941.55 (chk) + 11500.00 (sav)
    // Check breakdown has pending deductions of $95.50
    const pendingItem = sts.breakdown.find(b => b.label.toLowerCase().includes('pending'));
    expect(pendingItem?.amount).toBe('95.50');

    // Day 30: Pending transaction clears and posts
    db.prepare(`
      UPDATE journal_transactions SET status = 'posted' WHERE id = 'tx_pending_oct' AND tenant_id = ?
    `).run(tenantId);

    balances = calculateAccountBalances(db, tenantId);
    expect(getBal(balances, 'acc_chk')).toBe('3846.05'); // Now settled on posted ledger!
    expect(getPendingBal(balances, 'acc_chk')).toBe('3846.05');

    // =========================================================================
    // MONTH 1 RECONCILIATION & BUDGET INTEGRITY
    // =========================================================================
    const octBudget = calculateBudget(db, tenantId, 'bud_oct');
    expect(octBudget).not.toBeNull();
    const octGroLine = octBudget!.items.find(i => i.categoryId === 'cat_gro');
    const octEntLine = octBudget!.items.find(i => i.categoryId === 'cat_ent');
    const octRntLine = octBudget!.items.find(i => i.categoryId === 'cat_rnt');

    // Groceries: $500 allocated. Spent: 142.35 + 165.20 - 30.00 = 277.55. Remaining = 222.45
    expect(octGroLine?.totalBudgeted).toBe('500.00');
    expect(octGroLine?.spentAmount).toBe('277.55');
    expect(octGroLine?.remainingAmount).toBe('222.45');

    // Dining: $200 allocated. Spent: 85.40 + 95.50 = 180.90. Remaining = 19.10
    expect(octEntLine?.totalBudgeted).toBe('200.00');
    expect(octEntLine?.spentAmount).toBe('180.90');
    expect(octEntLine?.remainingAmount).toBe('19.10');

    // Rent: $1600 allocated. Spent: 1600.00. Remaining = 0.00
    expect(octRntLine?.spentAmount).toBe('1600.00');
    expect(octRntLine?.remainingAmount).toBe('0.00');

    // Net Worth after Month 1:
    // Assets: Checking $3,846.05 + Savings $11,500.00 = $15,346.05
    // Liabilities: Credit Card $450.00 + Student Loan $4,725.00 = $5,175.00
    // Net Worth = $15,346.05 - $5,175.00 = $10,171.05
    const octNw = calculateNetWorth(db, tenantId);
    expect(octNw.totalAssets).toBe('15346.05');
    expect(octNw.totalLiabilities).toBe('5175.00');
    expect(octNw.netWorth).toBe('10171.05');

    // Initial Net Worth was $7,050.00. Increase = $10,171.05 - $7,050.00 = $3,121.05
    // P&L Net Savings: Income ($5500) - Operating expenses ($1600 + 25 + 185.50 + 85.40 + 277.55 + 110 + 95.50 = $2378.95)
    // Net Savings = $5500 - $2378.95 = $3121.05. EXACT MATCH TO THE CENT!
    pnl = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-10-31');
    expect(pnl.netSavings).toBe('3121.05');
    expect(new Decimal(octNw.netWorth).minus(new Decimal('7050.00')).toFixed(2)).toBe(pnl.netSavings);

    // =========================================================================
    // MONTH 2 (November 2026): Budget Rollovers & Consecutive Cycle
    // =========================================================================

    // Test Budget Rollover: Carry Unused vs Reset
    // 1. Rollover with 'carry_unused'
    const rolloverCarry = rolloverBudgetPeriod(
      db,
      tenantId,
      'bud_oct',
      'bud_nov_carry',
      '2026-11-01',
      '2026-11-30',
      'November 2026 (Carry Unused)',
      { rolloverModeOverride: 'carry_unused' }
    );

    expect(rolloverCarry.rolloverMode).toBe('carry_unused');
    const rolledGro = rolloverCarry.rolledLines.find(l => l.categoryId === 'cat_gro');
    const rolledEnt = rolloverCarry.rolledLines.find(l => l.categoryId === 'cat_ent');
    const rolledRnt = rolloverCarry.rolledLines.find(l => l.categoryId === 'cat_rnt');

    // Groceries carried 222.45 unused -> new total = 500 + 222.45 = 722.45
    expect(rolledGro?.rolloverAmount).toBe('222.45');
    expect(rolledGro?.newTotalBudgeted).toBe('722.45');

    // Dining carried 19.10 unused -> new total = 200 + 19.10 = 219.10
    expect(rolledEnt?.rolloverAmount).toBe('19.10');
    expect(rolledEnt?.newTotalBudgeted).toBe('219.10');

    // Rent had 0 remaining -> rollover 0.00, new total 1600.00
    expect(rolledRnt?.rolloverAmount).toBe('0.00');
    expect(rolledRnt?.newTotalBudgeted).toBe('1600.00');

    // 2. Rollover with 'reset'
    const rolloverReset = rolloverBudgetPeriod(
      db,
      tenantId,
      'bud_oct',
      'bud_nov_reset',
      '2026-11-01',
      '2026-11-30',
      'November 2026 (Reset Mode)',
      { rolloverModeOverride: 'reset' }
    );
    expect(rolloverReset.rolloverMode).toBe('reset');
    for (const line of rolloverReset.rolledLines) {
      expect(line.rolloverAmount).toBe('0.00');
      expect(line.newTotalBudgeted).toBe(line.newAllocated);
    }

    // Activate the carry budget for Month 2
    db.prepare("UPDATE budgets SET is_active = 0 WHERE tenant_id = ?").run(tenantId);
    db.prepare("UPDATE budgets SET is_active = 1 WHERE id = 'bud_nov_carry' AND tenant_id = ?").run(tenantId);

    // Month 2 Transactions:
    // Nov 01: Month 2 Salary deposit: $5,500.00
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_sal_nov', ?, 'income', '2026-11-01', 'acc_chk', '5500.00', 'USD', '5500.00', 'Tech Corp Monthly Salary Nov', 'posted', 'cat_sal')
    `).run(tenantId);

    // Nov 03: Transfer $1,000.00 to Savings
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_trf_nov', ?, 'transfer', '2026-11-03', 'acc_chk', 'acc_sav', '1000.00', 'USD', '1000.00', 'Monthly Auto-Savings', 'posted')
    `).run(tenantId);

    // Nov 05: Month 2 Rent: $1,600.00
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_rnt_nov', ?, 'expense', '2026-11-05', 'acc_chk', '1600.00', 'USD', '1600.00', 'Apartment Rent Nov', 'posted', 'cat_rnt')
    `).run(tenantId);

    // Nov 10: Second Debt Payment of $300.00 on $4,725.00 Principal
    // Interest = 4725 * 0.005 = 23.63
    // Principal reduction = 300 - 23.63 = 276.37. Remaining = 4448.63
    const splitMonth2 = calculateDebtPaymentSplit('4725.00', '6.0', '300.00');
    expect(splitMonth2.interestPortion).toBe('23.63');
    expect(splitMonth2.principalPortion).toBe('276.37');
    expect(splitMonth2.remainingPrincipal).toBe('4448.63');

    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_dbt_int_nov', ?, 'expense', '2026-11-10', 'acc_chk', '23.63', 'USD', '23.63', 'Student Loan Interest Nov', 'posted', 'cat_dbt')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_dbt_prn_nov', ?, 'transfer', '2026-11-10', 'acc_chk', '276.37', 'USD', '276.37', 'Student Loan Principal Repayment Nov', 'posted')
    `).run(tenantId);

    db.prepare(`
      UPDATE debts SET principal_balance = ? WHERE id = 'debt_stu' AND tenant_id = ?
    `).run(splitMonth2.remainingPrincipal, tenantId);

    // Nov 12: Month 2 Utilities: $192.15
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_uti_nov', ?, 'expense', '2026-11-12', 'acc_chk', '192.15', 'USD', '192.15', 'Power & Fiber Nov', 'posted', 'cat_uti')
    `).run(tenantId);

    // Nov 18: Groceries in Month 2: $450.00
    // With carry_unused budget ($722.45 budgeted), spent $450 leaves $272.45 remaining (Under budget)
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status, category_id)
      VALUES ('tx_gro_nov', ?, 'expense', '2026-11-18', 'acc_chk', '450.00', 'USD', '450.00', 'Costco Monthly Haul', 'posted', 'cat_gro')
    `).run(tenantId);

    const novBudget = calculateBudget(db, tenantId, 'bud_nov_carry');
    const novGroLine = novBudget?.items.find(i => i.categoryId === 'cat_gro');
    expect(novGroLine?.totalBudgeted).toBe('722.45');
    expect(novGroLine?.spentAmount).toBe('450.00');
    expect(novGroLine?.remainingAmount).toBe('272.45');
    expect(novGroLine?.status).toBe('under');

    // =========================================================================
    // SAFE-TO-SPEND DEFICIT & DUPLICATE RESERVATION PREVENTION TEST
    // =========================================================================
    // When obligations exceed liquid capital:
    // Create an extreme upcoming tax obligation of $30,000.00 due in 15 days
    db.prepare(`
      INSERT INTO recurring_financial_rules (id, tenant_id, name, rule_type, expected_amount, account_id, start_date, next_due_date, is_active)
      VALUES ('rec_tax_huge', ?, 'Annual Federal Tax Settlement', 'bill', '30000.00', 'acc_chk', '2026-11-01', '2026-11-20', 1)
    `).run(tenantId);

    sts = calculateSafeToSpend(db, tenantId);
    // Liquid funds ~ $18,303.90
    // Obligations: 1600 (rent) + 185.50 (uti) + 30000 (tax) = 31785.50
    // Buffer = 500.00, Earmarked = 1000.00
    // Obligations exceed liquid funds!
    expect(sts.isDeficit).toBe(true);
    expect(new Decimal(sts.rawSafeToSpendAmount).isNegative()).toBe(true);
    expect(sts.safeToSpendAmount).toBe('0.00'); // Zero-floored!
    expect(parseFloat(sts.fundingDeficit)).toBeGreaterThan(0);
    expect(sts.explainer.inputs['Funding Deficit']).toContain(sts.fundingDeficit);

    // Remove the temporary extreme tax rule
    db.prepare("DELETE FROM recurring_financial_rules WHERE id = 'rec_tax_huge' AND tenant_id = ?").run(tenantId);

    // Verify duplicate reservation prevention between recurring rules and budget envelopes
    const stsNoDup = calculateSafeToSpend(db, tenantId, { includeBudgetEnvelopes: true });
    expect(stsNoDup.explainer.assumptions).toContain('Recurring obligations are deduced once with zero duplicate reservations against envelope budgets');

    // =========================================================================
    // NET WORTH OVERDRAFT & DOUBLE-COUNTING HARDENING TEST
    // =========================================================================
    // Verify standalone vs linked debts:
    // Standalone debt 'debt_stu' is counted in liabilities.
    // If a debt is linked to 'acc_crd' (which already has balance -450), it must NOT double count!
    db.prepare(`
      INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, linked_account_id)
      VALUES ('debt_cc_linked', ?, 'Linked Credit Card Debt', 'credit_card', '450.00', 'acc_crd')
    `).run(tenantId);

    let nwTest = calculateNetWorth(db, tenantId);
    // Liabilities must STILL be only Credit card account ($450) + Student Loan ($4448.63) = $4898.63
    // Linked debt was NOT double counted!
    expect(nwTest.totalLiabilities).toBe('4898.63');

    // Overdraft test: Force checking into negative balance (-$200.00)
    db.prepare(`
      INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
      VALUES ('tx_emergency_overdraft', ?, 'expense', '2026-11-25', 'acc_chk', '6000.00', 'USD', '6000.00', 'Emergency Transmission Replacement', 'posted')
    `).run(tenantId);

    balances = calculateAccountBalances(db, tenantId);
    const chkBal = new Decimal(getBal(balances, 'acc_chk') || '0');
    expect(chkBal.isNegative()).toBe(true); // Checking is overdrawn!

    const nwOverdraft = calculateNetWorth(db, tenantId);
    // Overdraft must be listed in liabilities and NOT included in positive assets
    const overdraftItem = nwOverdraft.liabilitiesList.find(l => l.type === 'overdraft');
    expect(overdraftItem).toBeDefined();
    expect(overdraftItem?.balance).toBe(chkBal.abs().toFixed(2));
    // Assets only include positive savings account
    expect(nwOverdraft.totalAssets).toBe(getBal(balances, 'acc_sav'));

    // Revert the overdraft transaction for clean multi-month reconciliation
    db.prepare("DELETE FROM journal_transactions WHERE id = 'tx_emergency_overdraft' AND tenant_id = ?").run(tenantId);

    // =========================================================================
    // FINAL CUMULATIVE RECONCILIATION: ZERO UNEXPLAINED PENNY DRIFTS
    // =========================================================================
    balances = calculateAccountBalances(db, tenantId);
    const finalChk = new Decimal(getBal(balances, 'acc_chk') || '0');
    const finalSav = new Decimal(getBal(balances, 'acc_sav') || '0');
    const finalCrd = new Decimal(getBal(balances, 'acc_crd') || '0');

    // Checking Ledger Reconciliation:
    // Opening: 2500.00
    // Oct Income: +5500.00
    // Oct Transfer out: -1500.00
    // Oct Expenses: -1600 (rent) - 142.35 (gro1) - 25 (dbt_int) - 275 (dbt_prn) - 185.50 (uti) - 85.40 (ent) - 165.20 (gro2) + 30.00 (refund) - 110 (disc) - 95.50 (cleared pending) = -2553.95
    // Oct Closing = 3846.05
    // Nov Income: +5500.00
    // Nov Transfer out: -1000.00
    // Nov Expenses: -1600 (rent) - 23.63 (dbt_int) - 276.37 (dbt_prn) - 192.15 (uti) - 450.00 (gro) = -2542.15
    // Final Checking Balance = 3846.05 + 5500.00 - 1000.00 - 2542.15 = 5803.90
    expect(finalChk.toFixed(2)).toBe('5803.90');

    // Savings Ledger Reconciliation:
    // Opening: 10000.00 + Oct Transfer In 1500.00 + Nov Transfer In 1000.00 = 12500.00
    expect(finalSav.toFixed(2)).toBe('12500.00');

    // Credit Card Ledger Reconciliation:
    // Opening: -450.00 (No additional credit card charges) = -450.00
    expect(finalCrd.toFixed(2)).toBe('-450.00');

    // Net Worth Final Reconciliation:
    // Assets: 5803.90 + 12500.00 = 18303.90
    // Liabilities: Credit card 450.00 + Student Loan 4448.63 = 4898.63
    // Final Net Worth = 18303.90 - 4898.63 = 13405.27
    const finalNw = calculateNetWorth(db, tenantId);
    expect(finalNw.totalAssets).toBe('18303.90');
    expect(finalNw.totalLiabilities).toBe('4898.63');
    expect(finalNw.netWorth).toBe('13405.27');

    // P&L across both months:
    // Total Income: Oct 5500 + Nov 5500 = 11000.00
    // Total Expenses: Oct 2378.95 + Nov 2265.78 = 4644.73
    // Net Savings: 11000 - 4644.73 = 6355.27
    // Change in Net Worth: Final Net Worth (13405.27) - Initial Net Worth (7050.00) = 6355.27
    // Zero penny drift between cumulative P&L and balance sheet net worth!
    const cumulativePnl = calculateIncomeAndExpenses(db, tenantId, '2026-10-01', '2026-11-30');
    expect(cumulativePnl.totalIncome).toBe('11000.00');
    expect(cumulativePnl.netSavings).toBe('6355.27');

    const netWorthGrowth = new Decimal(finalNw.netWorth).minus(new Decimal('7050.00'));
    expect(netWorthGrowth.toFixed(2)).toBe('6355.27');
    expect(netWorthGrowth.minus(new Decimal(cumulativePnl.netSavings)).toNumber()).toBe(0);
  });
});
