import { Decimal } from 'decimal.js';
import type Database from 'better-sqlite3';
import { todayISO, toISODate } from "@/lib/time";

// Configure Decimal.js for financial accuracy
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface FinancialMetricExplainer {
  metricName: string;
  definition: string;
  formula: string;
  dateRange: { start?: string; end?: string; label: string };
  currency: string;
  includedEntities: string[];
  excludedEntities: string[];
  assumptions: string[];
  inputs: Record<string, string | number>;
  lastCalculatedAt: string;
  drillDownQuery?: string;
}

export interface AccountBalanceResult {
  accountId: string;
  accountName: string;
  accountType: string;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  pendingBalance: string;
  displayColor: string;
  explainer: FinancialMetricExplainer;
}

export interface IncomeExpenseResult {
  totalIncome: string;
  totalExpenses: string;
  netSavings: string;
  savingsRatePercent: string;
  currency: string;
  periodLabel: string;
  incomeByCategory: Array<{ categoryId: string; categoryName: string; amount: string; percentage: string; color: string }>;
  expenseByCategory: Array<{ categoryId: string; categoryName: string; amount: string; percentage: string; color: string }>;
  explainer: FinancialMetricExplainer;
}

export interface BudgetStatusItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  allocatedAmount: string;
  rolloverAmount: string;
  totalBudgeted: string;
  spentAmount: string;
  remainingAmount: string;
  percentUsed: string;
  status: 'under' | 'warning' | 'over';
}

export interface BudgetCalculationResult {
  budgetId: string;
  budgetName: string;
  budgetType: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  rolloverMode: string;
  totalAllocated: string;
  totalSpent: string;
  totalRemaining: string;
  overallPercentUsed: string;
  items: BudgetStatusItem[];
  explainer: FinancialMetricExplainer;
}

export interface SafeToSpendResult {
  safeToSpendAmount: string;
  currency: string;
  liquidFunds: string;
  upcomingObligations: string;
  earmarkedSavings: string;
  safetyBuffer: string;
  daysHorizon: number;
  isCreditIncluded: boolean;
  breakdown: Array<{ label: string; amount: string; operation: 'add' | 'subtract'; details: string }>;
  explainer: FinancialMetricExplainer;
}

export interface NetWorthResult {
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  currency: string;
  asOfDate: string;
  assetsList: Array<{ name: string; type: string; balance: string; color: string }>;
  liabilitiesList: Array<{ name: string; type: string; balance: string; color: string }>;
  explainer: FinancialMetricExplainer;
}

/**
 * Calculates current account balance based on opening balance and journal entries
 */
export function calculateAccountBalances(db: Database.Database, tenantId: string): AccountBalanceResult[] {
  const accounts = db.prepare(`
    SELECT * FROM finance_accounts 
    WHERE tenant_id = ? AND is_active = 1
    ORDER BY sort_order ASC, name ASC
  `).all(tenantId) as Array<{
    id: string;
    name: string;
    type: string;
    currency: string;
    opening_balance: string;
    display_color: string;
  }>;

  return accounts.map(acc => {
    const opening = new Decimal(acc.opening_balance || '0.00');

    // Posted income to this account
    const incomeRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'income' AND status = 'posted'
    `).get(tenantId, acc.id) as { total: number };
    const income = new Decimal(incomeRow.total);

    // Posted expenses from this account
    const expenseRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'expense' AND status = 'posted'
    `).get(tenantId, acc.id) as { total: number };
    const expenses = new Decimal(expenseRow.total);

    // Posted transfers IN to this account
    const transfersInRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND to_account_id = ? AND transaction_type = 'transfer' AND status = 'posted'
    `).get(tenantId, acc.id) as { total: number };
    const transfersIn = new Decimal(transfersInRow.total);

    // Posted transfers OUT from this account
    const transfersOutRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'transfer' AND status = 'posted'
    `).get(tenantId, acc.id) as { total: number };
    const transfersOut = new Decimal(transfersOutRow.total);

    // Associated refunds to this account
    const refundsRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'refund' AND status = 'posted'
    `).get(tenantId, acc.id) as { total: number };
    const refunds = new Decimal(refundsRow.total);

    // Balance calculation based on account type
    let current: Decimal;
    if (acc.type === 'credit_card' || acc.type === 'loan' || acc.type === 'liability') {
      // For credit cards / loans, opening is debt; expenses increase debt, payments/transfers-in decrease debt
      // E.g. starting balance -620.50, + 142.85 expense -> -763.35 balance
      current = opening.minus(expenses).plus(transfersIn).plus(refunds).minus(transfersOut);
    } else {
      // Standard asset accounts
      current = opening.plus(income).minus(expenses).plus(transfersIn).minus(transfersOut).plus(refunds);
    }

    return {
      accountId: acc.id,
      accountName: acc.name,
      accountType: acc.type,
      currency: acc.currency,
      openingBalance: opening.toFixed(2),
      currentBalance: current.toFixed(2),
      pendingBalance: current.toFixed(2),
      displayColor: acc.display_color,
      explainer: {
        metricName: `${acc.name} Balance`,
        definition: 'Authoritative balance calculated from opening state plus posted ledger transactions.',
        formula: acc.type === 'credit_card' || acc.type === 'loan'
          ? 'Opening Balance - Expenses + Payments/Transfers In + Refunds'
          : 'Opening Balance + Income - Expenses + Transfers In - Transfers Out + Refunds',
        dateRange: { label: 'All-time posted history' },
        currency: acc.currency,
        includedEntities: ['Opening Balance', 'Posted Transactions', 'Posted Transfers', 'Refunds'],
        excludedEntities: ['Pending transactions', 'Voided transactions', 'Draft transactions'],
        assumptions: ['Transfers are ledger-balanced movements and not net wealth changes'],
        inputs: {
          opening: opening.toFixed(2),
          income: income.toFixed(2),
          expenses: expenses.toFixed(2),
          transfersIn: transfersIn.toFixed(2),
          transfersOut: transfersOut.toFixed(2),
          refunds: refunds.toFixed(2),
        },
        lastCalculatedAt: new Date().toISOString(),
      },
    };
  });
}

/**
 * Calculates Income vs Expenses over a specified date range
 */
export function calculateIncomeAndExpenses(
  db: Database.Database,
  tenantId: string,
  startDate: string,
  endDate: string,
  currency: string = 'USD'
): IncomeExpenseResult {
  // Income
  const incomeRows = db.prepare(`
    SELECT coalesce(c.id, 'uncategorized') as cat_id, coalesce(c.name, 'Uncategorized') as cat_name, coalesce(c.color, '#10b981') as cat_color, sum(CAST(t.amount AS REAL)) as total
    FROM journal_transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.tenant_id = ? AND t.status = 'posted' AND t.transaction_type = 'income'
      AND t.date >= ? AND t.date <= ?
    GROUP BY c.id
    ORDER BY total DESC
  `).all(tenantId, startDate, endDate) as Array<{ cat_id: string; cat_name: string; cat_color: string; total: number }>;

  // Expenses (accounting for refunds in the same period)
  const expenseRows = db.prepare(`
    SELECT coalesce(c.id, 'uncategorized') as cat_id, coalesce(c.name, 'Uncategorized') as cat_name, coalesce(c.color, '#64748b') as cat_color, sum(CAST(t.amount AS REAL)) as total
    FROM journal_transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.tenant_id = ? AND t.status = 'posted' AND t.transaction_type = 'expense'
      AND t.date >= ? AND t.date <= ?
    GROUP BY c.id
    ORDER BY total DESC
  `).all(tenantId, startDate, endDate) as Array<{ cat_id: string; cat_name: string; cat_color: string; total: number }>;

  // Period refunds
  const refundsRow = db.prepare(`
    SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
    FROM journal_transactions
    WHERE tenant_id = ? AND status = 'posted' AND transaction_type = 'refund'
      AND date >= ? AND date <= ?
  `).get(tenantId, startDate, endDate) as { total: number };
  const totalRefunds = new Decimal(refundsRow.total);

  let totalIncomeDec = new Decimal(0);
  const incomeByCategory = incomeRows.map(r => {
    const dec = new Decimal(r.total);
    totalIncomeDec = totalIncomeDec.plus(dec);
    return {
      categoryId: r.cat_id,
      categoryName: r.cat_name,
      amount: dec.toFixed(2),
      percentage: '0.0',
      color: r.cat_color,
    };
  });

  let rawExpenseDec = new Decimal(0);
  const expenseByCategory = expenseRows.map(r => {
    const dec = new Decimal(r.total);
    rawExpenseDec = rawExpenseDec.plus(dec);
    return {
      categoryId: r.cat_id,
      categoryName: r.cat_name,
      amount: dec.toFixed(2),
      percentage: '0.0',
      color: r.cat_color,
    };
  });

  const totalExpenseDec = rawExpenseDec.minus(totalRefunds);
  const netSavingsDec = totalIncomeDec.minus(totalExpenseDec);
  const savingsRate = totalIncomeDec.greaterThan(0)
    ? netSavingsDec.dividedBy(totalIncomeDec).times(100).toFixed(1)
    : '0.0';

  // Calculate percentages
  for (const item of incomeByCategory) {
    if (totalIncomeDec.greaterThan(0)) {
      item.percentage = new Decimal(item.amount).dividedBy(totalIncomeDec).times(100).toFixed(1);
    }
  }
  for (const item of expenseByCategory) {
    if (rawExpenseDec.greaterThan(0)) {
      item.percentage = new Decimal(item.amount).dividedBy(rawExpenseDec).times(100).toFixed(1);
    }
  }

  return {
    totalIncome: totalIncomeDec.toFixed(2),
    totalExpenses: totalExpenseDec.toFixed(2),
    netSavings: netSavingsDec.toFixed(2),
    savingsRatePercent: savingsRate,
    currency,
    periodLabel: `${startDate} to ${endDate}`,
    incomeByCategory,
    expenseByCategory,
    explainer: {
      metricName: 'Net Income & Operating Expense',
      definition: 'Operating income minus expense totals across posted journal entries in the target period.',
      formula: 'Net Savings = Total Posted Income - (Total Posted Expenses - Associated Refunds)',
      dateRange: { start: startDate, end: endDate, label: `${startDate} to ${endDate}` },
      currency,
      includedEntities: ['Posted Income Transactions', 'Posted Expense Transactions', 'Period Refunds'],
      excludedEntities: ['Transfers between accounts', 'Pending / Draft items', 'Reconciled adjustments'],
      assumptions: ['Transfers are zero-sum between accounts and excluded from income/expense'],
      inputs: {
        rawIncome: totalIncomeDec.toFixed(2),
        rawExpense: rawExpenseDec.toFixed(2),
        refundsOffset: totalRefunds.toFixed(2),
      },
      lastCalculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates budget status, remaining funds, and rollover allocations
 */
export function calculateBudget(
  db: Database.Database,
  tenantId: string,
  budgetId?: string
): BudgetCalculationResult | null {
  const budget = budgetId
    ? db.prepare('SELECT * FROM budgets WHERE tenant_id = ? AND id = ?').get(tenantId, budgetId)
    : db.prepare('SELECT * FROM budgets WHERE tenant_id = ? AND is_active = 1 ORDER BY start_date DESC LIMIT 1').get(tenantId);

  if (!budget) return null;
  const b = budget as {
    id: string;
    name: string;
    budget_type: string;
    period_type: string;
    start_date: string;
    end_date: string;
    currency: string;
    rollover_mode: string;
  };

  const lines = db.prepare(`
    SELECT bl.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM budget_lines bl
    JOIN categories c ON bl.category_id = c.id
    WHERE bl.budget_id = ? AND bl.tenant_id = ?
    ORDER BY c.name ASC
  `).all(b.id, tenantId) as Array<{
    category_id: string;
    category_name: string;
    category_color: string;
    category_icon: string;
    allocated_amount: string;
    rollover_amount: string;
  }>;

  let totalAllocatedDec = new Decimal(0);
  let totalSpentDec = new Decimal(0);

  const items: BudgetStatusItem[] = lines.map(line => {
    const allocated = new Decimal(line.allocated_amount || '0.00');
    const rollover = new Decimal(line.rollover_amount || '0.00');
    const totalBudgeted = allocated.plus(rollover);

    // Sum of expenses in this category during budget period
    const spentRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND category_id = ? AND transaction_type = 'expense'
        AND status = 'posted' AND date >= ? AND date <= ?
    `).get(tenantId, line.category_id, b.start_date, b.end_date) as { total: number };

    // Subtract refunds in this category during budget period
    const refundRow = db.prepare(`
      SELECT coalesce(sum(CAST(amount AS REAL)), 0) as total
      FROM journal_transactions
      WHERE tenant_id = ? AND category_id = ? AND transaction_type = 'refund'
        AND status = 'posted' AND date >= ? AND date <= ?
    `).get(tenantId, line.category_id, b.start_date, b.end_date) as { total: number };

    const spent = new Decimal(spentRow.total).minus(new Decimal(refundRow.total));
    const remaining = totalBudgeted.minus(spent);

    totalAllocatedDec = totalAllocatedDec.plus(totalBudgeted);
    totalSpentDec = totalSpentDec.plus(spent);

    const percentUsed = totalBudgeted.greaterThan(0)
      ? spent.dividedBy(totalBudgeted).times(100).toFixed(1)
      : '0.0';

    let status: 'under' | 'warning' | 'over' = 'under';
    if (spent.greaterThan(totalBudgeted)) {
      status = 'over';
    } else if (parseFloat(percentUsed) >= 85) {
      status = 'warning';
    }

    return {
      categoryId: line.category_id,
      categoryName: line.category_name,
      categoryColor: line.category_color,
      categoryIcon: line.category_icon,
      allocatedAmount: allocated.toFixed(2),
      rolloverAmount: rollover.toFixed(2),
      totalBudgeted: totalBudgeted.toFixed(2),
      spentAmount: spent.toFixed(2),
      remainingAmount: remaining.toFixed(2),
      percentUsed,
      status,
    };
  });

  const totalRemainingDec = totalAllocatedDec.minus(totalSpentDec);
  const overallPercentUsed = totalAllocatedDec.greaterThan(0)
    ? totalSpentDec.dividedBy(totalAllocatedDec).times(100).toFixed(1)
    : '0.0';

  return {
    budgetId: b.id,
    budgetName: b.name,
    budgetType: b.budget_type,
    currency: b.currency,
    periodStart: b.start_date,
    periodEnd: b.end_date,
    rolloverMode: b.rollover_mode,
    totalAllocated: totalAllocatedDec.toFixed(2),
    totalSpent: totalSpentDec.toFixed(2),
    totalRemaining: totalRemainingDec.toFixed(2),
    overallPercentUsed,
    items,
    explainer: {
      metricName: `Budget: ${b.name}`,
      definition: 'Category-level expense tracking against user-defined spending targets and rollovers.',
      formula: 'Remaining = (Allocated + Permitted Rollover) - (Posted Category Expenses - Period Refunds)',
      dateRange: { start: b.start_date, end: b.end_date, label: `${b.start_date} to ${b.end_date}` },
      currency: b.currency,
      includedEntities: ['Budgeted Categories', 'Posted Category Expenses', 'Associated Category Refunds'],
      excludedEntities: ['Transfers', 'Unbudgeted categories (reported separately)', 'Pending transactions'],
      assumptions: [`Rollover policy: ${b.rollover_mode}`],
      inputs: {
        totalAllocated: totalAllocatedDec.toFixed(2),
        totalSpent: totalSpentDec.toFixed(2),
        totalRemaining: totalRemainingDec.toFixed(2),
      },
      lastCalculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates Safe-To-Spend according to spec Section 7.7:
 * Safe-to-spend = eligible liquid account balances - reserved upcoming obligations - earmarked funds - safety buffer
 */
export function calculateSafeToSpend(db: Database.Database, tenantId: string): SafeToSpendResult {
  const settings = db.prepare('SELECT * FROM safe_to_spend_settings WHERE tenant_id = ?').get(tenantId) as {
    safety_buffer: string;
    include_credit_lines: number;
    days_horizon: number;
  } || { safety_buffer: '500.00', include_credit_lines: 0, days_horizon: 30 };

  const buffer = new Decimal(settings.safety_buffer || '500.00');
  const horizonDays = settings.days_horizon || 30;

  // 1. Calculate liquid funds (cash, checking, and savings accounts)
  const balances = calculateAccountBalances(db, tenantId);
  let liquidFunds = new Decimal(0);
  for (const acc of balances) {
    if (acc.accountType === 'checking' || acc.accountType === 'cash' || acc.accountType === 'savings') {
      const b = new Decimal(acc.currentBalance);
      if (b.greaterThan(0)) {
        liquidFunds = liquidFunds.plus(b);
      }
    }
  }

  // 2. Reserved upcoming obligations (recurring bills due in horizon)
  const today = todayISO();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + horizonDays);
  const horizonEndDate = toISODate(futureDate);

  const upcomingBills = db.prepare(`
    SELECT coalesce(sum(CAST(expected_amount AS REAL)), 0) as total
    FROM recurring_financial_rules
    WHERE tenant_id = ? AND is_active = 1 AND rule_type IN ('bill', 'subscription', 'loan_payment')
      AND next_due_date >= ? AND next_due_date <= ?
  `).get(tenantId, today, horizonEndDate) as { total: number };
  const upcomingObligations = new Decimal(upcomingBills.total);

  // 3. Earmarked funds from active savings goals not already counted
  const savingsGoalsRow = db.prepare(`
    SELECT coalesce(sum(CAST(current_amount AS REAL)), 0) as total
    FROM savings_goals
    WHERE tenant_id = ? AND status = 'active'
  `).get(tenantId) as { total: number };
  const earmarkedSavings = new Decimal(savingsGoalsRow.total);

  // Safe-to-spend calculation:
  // Liquid funds - obligations - earmarked savings - buffer
  const rawSafeToSpend = liquidFunds.minus(upcomingObligations).minus(earmarkedSavings).minus(buffer);
  const safeToSpend = rawSafeToSpend.greaterThan(0) ? rawSafeToSpend : new Decimal(0);

  const breakdown: SafeToSpendResult['breakdown'] = [
    { label: 'Liquid Account Balances', amount: liquidFunds.toFixed(2), operation: 'add', details: 'Checking, Savings, and Cash positive balances' },
    { label: 'Upcoming Obligations (Next 30 Days)', amount: upcomingObligations.toFixed(2), operation: 'subtract', details: 'Active recurring bills and subscriptions' },
    { label: 'Earmarked Savings Goals', amount: earmarkedSavings.toFixed(2), operation: 'subtract', details: 'Funds committed to active savings milestones' },
    { label: 'Safety Buffer', amount: buffer.toFixed(2), operation: 'subtract', details: 'Configurable emergency cushion' },
  ];

  return {
    safeToSpendAmount: safeToSpend.toFixed(2),
    currency: 'USD',
    liquidFunds: liquidFunds.toFixed(2),
    upcomingObligations: upcomingObligations.toFixed(2),
    earmarkedSavings: earmarkedSavings.toFixed(2),
    safetyBuffer: buffer.toFixed(2),
    daysHorizon: horizonDays,
    isCreditIncluded: Boolean(settings.include_credit_lines),
    breakdown,
    explainer: {
      metricName: 'Safe-To-Spend Projection',
      definition: 'Estimate of uncommitted funds available for discretionary spending without jeopardizing bills or savings goals.',
      formula: 'Safe-to-Spend = Liquid Balances - Upcoming Obligations - Earmarked Savings - Safety Buffer',
      dateRange: { start: today, end: horizonEndDate, label: `Next ${horizonDays} Days` },
      currency: 'USD',
      includedEntities: ['Liquid checking & cash accounts', 'Upcoming recurring bills', 'Earmarked savings balances', 'Emergency buffer'],
      excludedEntities: ['Available credit lines', 'Illiquid investments', 'Discretionary budget limits'],
      assumptions: ['No unexpected income or unrecorded liabilities occur during the planning horizon'],
      inputs: {
        liquidFunds: liquidFunds.toFixed(2),
        upcomingObligations: upcomingObligations.toFixed(2),
        earmarkedSavings: earmarkedSavings.toFixed(2),
        safetyBuffer: buffer.toFixed(2),
      },
      lastCalculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates Net Worth: Sum of Assets - Sum of Liabilities
 */
export function calculateNetWorth(db: Database.Database, tenantId: string): NetWorthResult {
  const balances = calculateAccountBalances(db, tenantId);

  let totalAssets = new Decimal(0);
  let totalLiabilities = new Decimal(0);

  const assetsList: NetWorthResult['assetsList'] = [];
  const liabilitiesList: NetWorthResult['liabilitiesList'] = [];

  for (const acc of balances) {
    const bal = new Decimal(acc.currentBalance);
    if (acc.accountType === 'credit_card' || acc.accountType === 'loan' || acc.accountType === 'liability') {
      // Outstanding liability is positive number in calculation
      const liabilityAmount = bal.isNegative() ? bal.abs() : bal;
      totalLiabilities = totalLiabilities.plus(liabilityAmount);
      liabilitiesList.push({
        name: acc.accountName,
        type: acc.accountType,
        balance: liabilityAmount.toFixed(2),
        color: acc.displayColor,
      });
    } else {
      // Asset account
      if (bal.greaterThan(0)) {
        totalAssets = totalAssets.plus(bal);
        assetsList.push({
          name: acc.accountName,
          type: acc.accountType,
          balance: bal.toFixed(2),
          color: acc.displayColor,
        });
      }
    }
  }

  const netWorth = totalAssets.minus(totalLiabilities);
  const today = todayISO();

  return {
    totalAssets: totalAssets.toFixed(2),
    totalLiabilities: totalLiabilities.toFixed(2),
    netWorth: netWorth.toFixed(2),
    currency: 'USD',
    asOfDate: today,
    assetsList,
    liabilitiesList,
    explainer: {
      metricName: 'Net Worth Valuation',
      definition: 'Total value of all financial assets minus all outstanding liabilities.',
      formula: 'Net Worth = Total Valued Assets - Total Outstanding Liabilities',
      dateRange: { label: `Snapshot as of ${today}` },
      currency: 'USD',
      includedEntities: ['Cash & Bank balances', 'Savings accounts', 'Credit card balances', 'Loan balances'],
      excludedEntities: ['Physical property without appraisal', 'Off-ledger assets'],
      assumptions: ['All account balances reflect confirmed ledger postings'],
      inputs: {
        totalAssets: totalAssets.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
        netWorth: netWorth.toFixed(2),
      },
      lastCalculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates Debt Payoff scenarios (Avalanche vs Snowball)
 */
export function calculateDebtPayoffScenarios(
  db: Database.Database,
  tenantId: string,
  extraMonthlyPayment: string = '100.00'
) {
  const debts = db.prepare(`
    SELECT * FROM debts WHERE tenant_id = ? ORDER BY CAST(interest_rate AS REAL) DESC
  `).all(tenantId) as Array<{
    id: string;
    name: string;
    principal_balance: string;
    interest_rate: string;
    minimum_payment: string;
  }>;

  const extra = new Decimal(extraMonthlyPayment || '0.00');

  // Avalanche: Sort by interest rate desc
  const avalancheDebts = [...debts].sort((a, b) => parseFloat(b.interest_rate) - parseFloat(a.interest_rate));
  // Snowball: Sort by principal balance asc
  const snowballDebts = [...debts].sort((a, b) => parseFloat(a.principal_balance) - parseFloat(b.principal_balance));

  return {
    extraMonthlyPayment: extra.toFixed(2),
    avalanche: simulatePayoff(avalancheDebts, extra),
    snowball: simulatePayoff(snowballDebts, extra),
  };
}

function simulatePayoff(
  debts: Array<{ id: string; name: string; principal_balance: string; interest_rate: string; minimum_payment: string }>,
  extraPayment: Decimal
) {
  let totalBalance = debts.reduce((sum, d) => sum.plus(new Decimal(d.principal_balance)), new Decimal(0));
  let totalInterest = new Decimal(0);
  let months = 0;

  let balances = debts.map(d => ({
    ...d,
    currentPrincipal: new Decimal(d.principal_balance),
    rate: new Decimal(d.interest_rate).dividedBy(100).dividedBy(12),
    minPay: new Decimal(d.minimum_payment),
  }));

  while (balances.some(b => b.currentPrincipal.greaterThan(0)) && months < 360) {
    months++;
    let availableExtra = new Decimal(extraPayment);

    // Apply minimums & interest
    for (const d of balances) {
      if (d.currentPrincipal.greaterThan(0)) {
        const monthlyInterest = d.currentPrincipal.times(d.rate);
        totalInterest = totalInterest.plus(monthlyInterest);
        d.currentPrincipal = d.currentPrincipal.plus(monthlyInterest);

        const payment = Decimal.min(d.currentPrincipal, d.minPay);
        d.currentPrincipal = d.currentPrincipal.minus(payment);
      }
    }

    // Apply extra payment to first active debt in chosen order
    for (const d of balances) {
      if (d.currentPrincipal.greaterThan(0) && availableExtra.greaterThan(0)) {
        const extraApplied = Decimal.min(d.currentPrincipal, availableExtra);
        d.currentPrincipal = d.currentPrincipal.minus(extraApplied);
        availableExtra = availableExtra.minus(extraApplied);
      }
    }
  }

  return {
    monthsToDebtFree: months,
    totalInterestPaid: totalInterest.toFixed(2),
    totalPaid: totalBalance.plus(totalInterest).toFixed(2),
  };
}
