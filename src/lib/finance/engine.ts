import { Decimal } from 'decimal.js';
import type Database from 'better-sqlite3';
import { todayISO, toISODate } from "@/lib/time";

// Configure Decimal.js for financial accuracy
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Exact Decimal summation over an array of string amount rows or string values.
 * Prevents IEEE-754 binary floating-point drift caused by SQL CAST(... AS REAL).
 */
export function sumDecimalAmounts(rows: Array<{ amount?: string; total?: string } | string | null | undefined>): Decimal {
  let total = new Decimal('0.00');
  for (const r of rows) {
    if (!r) continue;
    const val = typeof r === 'string' ? r : (r.amount || r.total);
    if (val) {
      total = total.plus(new Decimal(val));
    }
  }
  return total;
}

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
  /** Configured credit limit for credit accounts ('0.00' when unset). */
  creditLimit: string;
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
  /** Read-time projection: persisted row stays authoritative. */
  persistedPeriodStart: string;
  persistedPeriodEnd: string;
  /** True when the auto-selected monthly budget's ended period was projected into the current month. */
  periodRolledForward: boolean;
  periodType: string;
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
  rawSafeToSpendAmount: string;
  fundingDeficit: string;
  isDeficit: boolean;
  currency: string;
  liquidFunds: string;
  upcomingObligations: string;
  /** Amount of recurring obligations whose persisted next_due_date is already past — reserved immediately. */
  overdueObligations: string;
  overdueObligationsCount: number;
  upcomingObligationsCount: number;
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
    credit_limit: string | null;
  }>;

  return accounts.map(acc => {
    const opening = new Decimal(acc.opening_balance || '0.00');

    // Posted income to this account
    const incomeRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'income' AND status = 'posted'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const income = sumDecimalAmounts(incomeRows);

    // Posted expenses from this account
    const expenseRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'expense' AND status = 'posted'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const expenses = sumDecimalAmounts(expenseRows);

    // Posted transfers IN to this account
    const transfersInRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND to_account_id = ? AND transaction_type = 'transfer' AND status = 'posted'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const transfersIn = sumDecimalAmounts(transfersInRows);

    // Posted transfers OUT from this account
    const transfersOutRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'transfer' AND status = 'posted'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const transfersOut = sumDecimalAmounts(transfersOutRows);

    // Associated refunds to this account
    const refundsRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'refund' AND status = 'posted'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const refunds = sumDecimalAmounts(refundsRows);

    // Pending transactions for this account (affect available balance without altering posted ledger)
    const pendingIncomeRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'income' AND status = 'pending'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const pendingIncome = sumDecimalAmounts(pendingIncomeRows);

    const pendingExpenseRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'expense' AND status = 'pending'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const pendingExpenses = sumDecimalAmounts(pendingExpenseRows);

    const pendingTransfersInRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND to_account_id = ? AND transaction_type = 'transfer' AND status = 'pending'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const pendingTransfersIn = sumDecimalAmounts(pendingTransfersInRows);

    const pendingTransfersOutRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'transfer' AND status = 'pending'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const pendingTransfersOut = sumDecimalAmounts(pendingTransfersOutRows);

    const pendingRefundsRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND account_id = ? AND transaction_type = 'refund' AND status = 'pending'
    `).all(tenantId, acc.id) as Array<{ amount: string }>;
    const pendingRefunds = sumDecimalAmounts(pendingRefundsRows);

    // Balance calculation based on account type
    let current: Decimal;
    let pending: Decimal;
    if (acc.type === 'credit_card' || acc.type === 'loan' || acc.type === 'liability') {
      // For credit cards / loans, opening is debt; expenses increase debt, payments/transfers-in decrease debt
      current = opening.minus(expenses).plus(transfersIn).plus(refunds).minus(transfersOut);
      pending = current.minus(pendingExpenses).plus(pendingTransfersIn).plus(pendingRefunds).minus(pendingTransfersOut);
    } else {
      // Standard asset accounts
      current = opening.plus(income).minus(expenses).plus(transfersIn).minus(transfersOut).plus(refunds);
      pending = current.plus(pendingIncome).minus(pendingExpenses).plus(pendingTransfersIn).minus(pendingTransfersOut).plus(pendingRefunds);
    }

    return {
      accountId: acc.id,
      accountName: acc.name,
      accountType: acc.type,
      currency: acc.currency,
      openingBalance: opening.toFixed(2),
      currentBalance: current.toFixed(2),
      pendingBalance: pending.toFixed(2),
      creditLimit: acc.credit_limit ?? '0.00',
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
          pendingExpenses: pendingExpenses.toFixed(2),
          availablePendingBalance: pending.toFixed(2),
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
  const rawIncomeRows = db.prepare(`
    SELECT coalesce(c.id, 'uncategorized') as cat_id, coalesce(c.name, 'Uncategorized') as cat_name, coalesce(c.color, '#10b981') as cat_color, t.amount
    FROM journal_transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.tenant_id = ? AND t.status = 'posted' AND t.transaction_type = 'income'
      AND t.date >= ? AND t.date <= ?
  `).all(tenantId, startDate, endDate) as Array<{ cat_id: string; cat_name: string; cat_color: string; amount: string }>;

  const incomeMap = new Map<string, { cat_id: string; cat_name: string; cat_color: string; total: Decimal }>();
  let totalIncomeDec = new Decimal(0);
  for (const r of rawIncomeRows) {
    const amt = new Decimal(r.amount || '0.00');
    totalIncomeDec = totalIncomeDec.plus(amt);
    const existing = incomeMap.get(r.cat_id);
    if (existing) {
      existing.total = existing.total.plus(amt);
    } else {
      incomeMap.set(r.cat_id, { cat_id: r.cat_id, cat_name: r.cat_name, cat_color: r.cat_color, total: amt });
    }
  }

  const incomeByCategory = Array.from(incomeMap.values())
    .sort((a, b) => b.total.minus(a.total).toNumber())
    .map(r => ({
      categoryId: r.cat_id,
      categoryName: r.cat_name,
      amount: r.total.toFixed(2),
      percentage: '0.0',
      color: r.cat_color,
    }));

  // Expenses (accounting for refunds in the same period)
  const rawExpenseRows = db.prepare(`
    SELECT coalesce(c.id, 'uncategorized') as cat_id, coalesce(c.name, 'Uncategorized') as cat_name, coalesce(c.color, '#64748b') as cat_color, t.amount
    FROM journal_transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.tenant_id = ? AND t.status = 'posted' AND t.transaction_type = 'expense'
      AND t.date >= ? AND t.date <= ?
  `).all(tenantId, startDate, endDate) as Array<{ cat_id: string; cat_name: string; cat_color: string; amount: string }>;

  const expenseMap = new Map<string, { cat_id: string; cat_name: string; cat_color: string; total: Decimal }>();
  let rawExpenseDec = new Decimal(0);
  for (const r of rawExpenseRows) {
    const amt = new Decimal(r.amount || '0.00');
    rawExpenseDec = rawExpenseDec.plus(amt);
    const existing = expenseMap.get(r.cat_id);
    if (existing) {
      existing.total = existing.total.plus(amt);
    } else {
      expenseMap.set(r.cat_id, { cat_id: r.cat_id, cat_name: r.cat_name, cat_color: r.cat_color, total: amt });
    }
  }

  const expenseByCategory = Array.from(expenseMap.values())
    .sort((a, b) => b.total.minus(a.total).toNumber())
    .map(r => ({
      categoryId: r.cat_id,
      categoryName: r.cat_name,
      amount: r.total.toFixed(2),
      percentage: '0.0',
      color: r.cat_color,
    }));

  // Period refunds
  const refundsRows = db.prepare(`
    SELECT amount
    FROM journal_transactions
    WHERE tenant_id = ? AND status = 'posted' AND transaction_type = 'refund'
      AND date >= ? AND date <= ?
  `).all(tenantId, startDate, endDate) as Array<{ amount: string }>;
  const totalRefunds = sumDecimalAmounts(refundsRows);

  const totalExpenseDec = rawExpenseDec.minus(totalRefunds);
  const netSavingsDec = totalIncomeDec.minus(totalExpenseDec);
  // Savings rate is clamped to 0–100%: a refund-heavy period can otherwise exceed
  // 100% and a zero-income period would divide by zero. Both are meaningless as a
  // rate; the absolute figures above carry the truth.
  const savingsRate = totalIncomeDec.greaterThan(0)
    ? Decimal.min(100, Decimal.max(0, netSavingsDec.dividedBy(totalIncomeDec).times(100))).toFixed(1)
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

  // Read-time period projection (B-wave 2): a monthly budget whose persisted period
  // has ALREADY ENDED is projected onto the calendar month containing today, so the
  // "current" budget is never silently stale. The persisted row stays authoritative
  // (no write); an explicit `budgetId` query is NOT projected (archived viewing).
  const persistedPeriodStart = b.start_date;
  const persistedPeriodEnd = b.end_date;
  let periodStart = b.start_date;
  let periodEnd = b.end_date;
  let periodRolledForward = false;
  if (!budgetId && b.period_type === 'monthly') {
    const today = todayISO();
    if (today > b.end_date) {
      periodStart = `${today.slice(0, 7)}-01`;
      const [y, m] = today.slice(0, 7).split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of current
      periodEnd = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
      periodRolledForward = true;
    }
  }

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
    const spentRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND category_id = ? AND transaction_type = 'expense'
        AND status = 'posted' AND date >= ? AND date <= ?
    `).all(tenantId, line.category_id, periodStart, periodEnd) as Array<{ amount: string }>;
    const categorySpent = sumDecimalAmounts(spentRows);

    // Subtract refunds in this category during budget period
    const refundRows = db.prepare(`
      SELECT amount
      FROM journal_transactions
      WHERE tenant_id = ? AND category_id = ? AND transaction_type = 'refund'
        AND status = 'posted' AND date >= ? AND date <= ?
    `).all(tenantId, line.category_id, periodStart, periodEnd) as Array<{ amount: string }>;
    const categoryRefunds = sumDecimalAmounts(refundRows);

    const spent = categorySpent.minus(categoryRefunds);
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
    periodStart,
    periodEnd,
    persistedPeriodStart,
    persistedPeriodEnd,
    periodRolledForward,
    periodType: b.period_type,
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
      dateRange: { start: periodStart, end: periodEnd, label: `${periodStart} to ${periodEnd}` },
      currency: b.currency,
      includedEntities: ['Budgeted Categories', 'Posted Category Expenses', 'Associated Category Refunds'],
      excludedEntities: ['Transfers', 'Unbudgeted categories (reported separately)', 'Pending transactions'],
      assumptions: periodRolledForward
        ? [`Rollover policy: ${b.rollover_mode}`, `Persisted period ${persistedPeriodStart} to ${persistedPeriodEnd} has ended; read-time projection onto the current calendar month is in effect (persisted data untouched).`]
        : [`Rollover policy: ${b.rollover_mode}`],
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
export function calculateSafeToSpend(
  db: Database.Database,
  tenantId: string,
  options?: {
    includeBudgetEnvelopes?: boolean;
    daysHorizon?: number;
  }
): SafeToSpendResult {
  const rawSettings = db.prepare('SELECT * FROM safe_to_spend_settings WHERE tenant_id = ?').get(tenantId) as {
    safety_buffer: string;
    include_credit_lines: number;
    days_horizon: number;
  } | undefined;

  // Settings are operator input, not a trusted invariant: a previously persisted
  // non-numeric buffer ('NaN' from an unvalidated write) must degrade to the
  // default instead of poisoning every downstream number in the app.
  const parsedBuffer = new Decimal(rawSettings?.safety_buffer ?? '500.00');
  const buffer = parsedBuffer.isFinite() && !parsedBuffer.isNegative() ? parsedBuffer : new Decimal('500.00');
  const rawHorizon = options?.daysHorizon ?? rawSettings?.days_horizon ?? 30;
  const horizonDays = Number.isFinite(rawHorizon) && rawHorizon > 0 ? Math.trunc(rawHorizon) : 30;
  const includeCreditLines = Boolean(rawSettings?.include_credit_lines);

  // 1. Calculate liquid funds (cash, checking, and savings accounts).
  // An overdrawn account is a liability, not a zero: dropping the negative part
  // would inflate safe-to-spend by exactly the amount the operator owes.
  const balances = calculateAccountBalances(db, tenantId);
  let liquidFunds = new Decimal(0);
  let overdrawnLiquid = new Decimal(0);
  const liquidAccountIds = new Set<string>();

  for (const acc of balances) {
    if (acc.accountType === 'checking' || acc.accountType === 'cash' || acc.accountType === 'savings') {
      liquidAccountIds.add(acc.accountId);
      const b = new Decimal(acc.currentBalance);
      if (b.greaterThan(0)) {
        liquidFunds = liquidFunds.plus(b);
      } else if (b.isNegative()) {
        overdrawnLiquid = overdrawnLiquid.plus(b.abs());
      }
    }
  }
  liquidFunds = liquidFunds.minus(overdrawnLiquid);

  // Opt-in: count available credit as spendable capacity (a credit line is
  // borrowing capacity, so it is off by default). Only the headroom between the
  // credit limit and the current (negative) balance is added.
  let availableCredit = new Decimal(0);
  if (includeCreditLines) {
    for (const acc of balances) {
      if (acc.accountType !== 'credit_card') continue;
      const limit = new Decimal(acc.creditLimit);
      if (!limit.isFinite() || limit.lte(0)) continue;
      const owed = Decimal.max(0, new Decimal(acc.currentBalance).neg());
      const headroom = limit.minus(owed);
      if (headroom.greaterThan(0)) availableCredit = availableCredit.plus(headroom);
    }
    liquidFunds = liquidFunds.plus(availableCredit);
  }

  // 2. Pending transactions on liquid accounts (reduce available liquid capital)
  const pendingRows = db.prepare(`
    SELECT amount
    FROM journal_transactions
    WHERE tenant_id = ? AND status = 'pending' AND transaction_type = 'expense'
      AND account_id IN (SELECT id FROM finance_accounts WHERE tenant_id = ? AND type IN ('checking', 'cash', 'savings'))
  `).all(tenantId, tenantId) as Array<{ amount: string }>;
  const pendingDeductions = sumDecimalAmounts(pendingRows);

  // 3. Reserved upcoming obligations (recurring bills due in horizon)
  // 3. Reserved upcoming obligations (schedule-aware, read-time; no writes)
  //
  // Persisted `next_due_date` is authoritative, but a rule whose period has
  // already passed (never generated: last_generated_at NULL, e.g. Rent due
  // 2026-10-01 still showing on 2026-11-09) must NOT silently drop out of the
  // reservation. Overdue occurrences are counted as due immediately; further
  // in-horizon occurrences are projected from the persisted schedule via
  // advanceRecurringNextDueDate (pure function, no DB write).
  const today = todayISO();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + horizonDays);
  const horizonEndDate = toISODate(futureDate);

  const activeObligationRules = db.prepare(`
    SELECT id, name, expected_amount as amount, category_id, next_due_date, frequency, interval_count, day_of_month
    FROM recurring_financial_rules
    WHERE tenant_id = ? AND is_active = 1 AND rule_type IN ('bill', 'subscription', 'loan_payment')
  `).all(tenantId) as Array<{
    id: string; name: string; amount: string; category_id?: string;
    next_due_date: string; frequency: string; interval_count: number; day_of_month: number | null;
  }>;

  const upcomingBills = db.prepare(`
    SELECT id, name, expected_amount as amount, category_id
    FROM recurring_financial_rules
    WHERE tenant_id = ? AND is_active = 1 AND rule_type IN ('bill', 'subscription', 'loan_payment')
      AND next_due_date >= ? AND next_due_date <= ?
  `).all(tenantId, today, horizonEndDate) as Array<{ id: string; name: string; amount: string; category_id?: string }>;

  // Overdue rules: reserve the persisted (unknown-paid) occurrence NOW, plus any
  // projected occurrence that still lands inside the horizon. Bounded walk.
  const overdueRules = activeObligationRules.filter(r => r.next_due_date < today);
  const overdueObligationsDec = sumDecimalAmounts(overdueRules.map(r => r.amount));
  const projectedOccurrences: Array<{ id: string; name: string; amount: string; category_id?: string }> = [];
  for (const rule of overdueRules) {
    let cursor = rule.next_due_date;
    let guard = 0;
    while (cursor < today && guard++ < 120) {
      cursor = advanceRecurringNextDueDate(cursor, rule.frequency, rule.interval_count, rule.day_of_month);
    }
    if (cursor >= today && cursor <= horizonEndDate) {
      projectedOccurrences.push({ id: `${rule.id}@${cursor}`, name: rule.name, amount: rule.amount, category_id: rule.category_id });
    }
  }

  const allOccurrences = [...upcomingBills, ...projectedOccurrences];

  // Check active budget to avoid double-counting between category budget envelopes and recurring obligations
  const activeBudget = calculateBudget(db, tenantId);
  const budgetedCategoryIds = new Set(activeBudget ? activeBudget.items.map(it => it.categoryId) : []);

  let unbudgetedObligations = new Decimal(0);
  let budgetedObligationsSum = new Decimal(0);

  // Group scheduled+overdue recurring bills by category to prevent duplicate reservations
  const billsByCategory = new Map<string, Decimal>();
  for (const bill of allOccurrences) {
    const billAmt = new Decimal(bill.amount || '0.00');
    if (bill.category_id && budgetedCategoryIds.has(bill.category_id)) {
      budgetedObligationsSum = budgetedObligationsSum.plus(billAmt);
      const prev = billsByCategory.get(bill.category_id) || new Decimal(0);
      billsByCategory.set(bill.category_id, prev.plus(billAmt));
    } else {
      unbudgetedObligations = unbudgetedObligations.plus(billAmt);
    }
  }

  let totalUpcomingObligations = unbudgetedObligations.plus(budgetedObligationsSum).plus(overdueObligationsDec);

  // If includeBudgetEnvelopes is requested, add non-recurring budget envelope remaining balances without double-counting
  if (options?.includeBudgetEnvelopes && activeBudget) {
    let envelopeAdditions = new Decimal(0);
    for (const item of activeBudget.items) {
      const remaining = new Decimal(item.remainingAmount);
      if (remaining.greaterThan(0)) {
        const recurringForCat = billsByCategory.get(item.categoryId) || new Decimal(0);
        // Reserve only the excess of budget envelope over already reserved recurring bills
        if (remaining.greaterThan(recurringForCat)) {
          envelopeAdditions = envelopeAdditions.plus(remaining.minus(recurringForCat));
        }
      }
    }
    totalUpcomingObligations = totalUpcomingObligations.plus(envelopeAdditions);
  }

  // 4. Earmarked funds from active savings goals (only linked to liquid accounts or general savings)
  const savingsGoalsRows = db.prepare(`
    SELECT id, name, current_amount as amount, target_amount, linked_account_id
    FROM savings_goals
    WHERE tenant_id = ? AND status = 'active'
  `).all(tenantId) as Array<{ id: string; name: string; amount: string; target_amount: string; linked_account_id?: string }>;

  const balancesById = new Map(balances.map(a => [a.accountId, new Decimal(a.currentBalance)]));

  let earmarkedSavings = new Decimal(0);
  for (const sg of savingsGoalsRows) {
    // Only earmark if the goal is backed by liquid funds
    if (!sg.linked_account_id || liquidAccountIds.has(sg.linked_account_id)) {
      let amt = new Decimal(sg.amount || '0.00');
      const linkedLedgerBalance = sg.linked_account_id ? balancesById.get(sg.linked_account_id) : undefined;
      if (linkedLedgerBalance !== undefined) {
        // Ledger is the source of truth: a user-typed current_amount that exceeds
        // what the linked account actually holds must NOT earmark money that is
        // not there (and a negative balance earmarks nothing).
        amt = Decimal.min(amt, Decimal.max(0, linkedLedgerBalance));
      }
      earmarkedSavings = earmarkedSavings.plus(amt);
    }
  }

  const upcomingObligationsDetails = overdueRules.length === 0
    ? `${upcomingBills.length} active recurring commitments due before horizon`
    : `${allOccurrences.length} scheduled occurrences before horizon plus ${overdueRules.length} overdue persisted occurrence(s) reserved immediately (schedule-aware read-time projection; persisted data untouched)`;

  // Safe-to-spend calculation:
  // Liquid funds - pending deductions - upcoming obligations - earmarked savings - safety buffer
  const rawSafeToSpend = liquidFunds
    .minus(pendingDeductions)
    .minus(totalUpcomingObligations)
    .minus(earmarkedSavings)
    .minus(buffer);

  const isDeficit = rawSafeToSpend.isNegative();
  const safeToSpend = isDeficit ? new Decimal(0) : rawSafeToSpend;
  const fundingDeficit = isDeficit ? rawSafeToSpend.abs().toFixed(2) : '0.00';

  // Read configured currency
  const user = db.prepare('SELECT preferences FROM users WHERE tenant_id = ? LIMIT 1').get(tenantId) as { preferences?: string } | undefined;
  let currency = 'USD';
  try {
    const p = JSON.parse(user?.preferences || '{}');
    if (p.currency || p.baseCurrency) currency = p.currency || p.baseCurrency;
  } catch {}

  const breakdown: SafeToSpendResult['breakdown'] = [
    { label: 'Liquid Cash', amount: liquidFunds.toFixed(2), operation: 'add', details: 'Positive checking, savings, and cash ledger balances' },
    ...(pendingDeductions.greaterThan(0) ? [
      { label: 'Pending Deductions', amount: pendingDeductions.toFixed(2), operation: 'subtract' as const, details: 'Authorized transactions pending ledger settlement' }
    ] : []),
    { label: 'Upcoming Recurring', amount: totalUpcomingObligations.toFixed(2), operation: 'subtract', details: upcomingObligationsDetails },
    { label: 'Earmarked Savings', amount: earmarkedSavings.toFixed(2), operation: 'subtract', details: 'Liquid funds dedicated to active savings milestones — capped at the linked account ledger balance when one is linked (MIN entered current_amount, ledger balance)' },
    { label: 'Safety Buffer', amount: buffer.toFixed(2), operation: 'subtract', details: 'Configurable emergency reserve' },
    ...(isDeficit ? [
      { label: 'Funding Deficit', amount: fundingDeficit, operation: 'subtract' as const, details: 'Obligations exceed liquid capital; safe-to-spend is zero-floored' }
    ] : []),
  ];

  return {
    safeToSpendAmount: safeToSpend.toFixed(2),
    rawSafeToSpendAmount: rawSafeToSpend.toFixed(2),
    fundingDeficit,
    isDeficit,
    currency,
    liquidFunds: liquidFunds.toFixed(2),
    upcomingObligations: totalUpcomingObligations.toFixed(2),
    overdueObligations: overdueObligationsDec.toFixed(2),
    overdueObligationsCount: overdueRules.length,
    upcomingObligationsCount: allOccurrences.length,
    earmarkedSavings: earmarkedSavings.toFixed(2),
    safetyBuffer: buffer.toFixed(2),
    daysHorizon: horizonDays,
    isCreditIncluded: includeCreditLines,
    breakdown,
    explainer: {
      metricName: 'Safe-To-Spend Projection',
      definition: 'Deterministic uncommitted liquid funds available for discretionary spending without jeopardizing obligations or reserves.',
      formula: 'Safe-to-Spend = Liquid Balances - Pending Expenses - Upcoming Obligations - Earmarked Savings - Safety Buffer',
      dateRange: { start: today, end: horizonEndDate, label: `Next ${horizonDays} Days` },
      currency,
      includedEntities: ['Liquid checking & cash accounts', 'Pending expenses', 'Upcoming recurring bills', 'Earmarked liquid savings', 'Safety buffer'],
      excludedEntities: ['Available credit lines', 'Illiquid investments', 'Duplicate budgeted obligations'],
      assumptions: [
        'Recurring obligations are deduced once with zero duplicate reservations against envelope budgets',
        'Overdue recurring obligations (persisted next_due_date in the past) are reserved immediately; later in-horizon occurrences are projected read-time from the persisted schedule without writing to it',
        'Earmarked savings are capped at the linked account ledger balance when a liquid account is linked',
        'Multi-currency limitation: All multi-currency operations use configured base currency without live external FX feeds',
      ],
      inputs: {
        'Liquid Cash': `$${liquidFunds.toFixed(2)}`,
        'Pending Deductions': `-$${pendingDeductions.toFixed(2)}`,
        'Upcoming Recurring': `-$${totalUpcomingObligations.toFixed(2)}`,
        'Overdue (Due Immediately)': `-$${overdueObligationsDec.toFixed(2)}`,
        'Earmarked Savings': `-$${earmarkedSavings.toFixed(2)}`,
        'Safety Buffer': `-$${buffer.toFixed(2)}`,
        'Funding Deficit': isDeficit ? `-$${fundingDeficit}` : '$0.00',
        'Raw Safe-to-Spend': `$${rawSafeToSpend.toFixed(2)}`,
        'Safe-to-Spend (Effective)': `$${safeToSpend.toFixed(2)}`,
        liquidFunds: liquidFunds.toFixed(2),
        pendingExpenses: pendingDeductions.toFixed(2),
        upcomingObligations: totalUpcomingObligations.toFixed(2),
        earmarkedSavings: earmarkedSavings.toFixed(2),
        safetyBuffer: buffer.toFixed(2),
        fundingDeficit,
      },
      lastCalculatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Calculates Net Worth: Sum of Assets - Sum of Liabilities
 * - Accurately incorporates negative balances on asset accounts as overdraft liabilities.
 * - Incorporates standalone debts from debts table while preventing double-counting with linked accounts.
 */
export function calculateNetWorth(db: Database.Database, tenantId: string): NetWorthResult {
  const balances = calculateAccountBalances(db, tenantId);

  let totalAssets = new Decimal(0);
  let totalLiabilities = new Decimal(0);

  const assetsList: NetWorthResult['assetsList'] = [];
  const liabilitiesList: NetWorthResult['liabilitiesList'] = [];
  const processedAccountIds = new Set<string>();

  for (const acc of balances) {
    processedAccountIds.add(acc.accountId);
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
      // Asset account (checking, savings, cash, investment)
      if (bal.isNegative()) {
        // Negative balance on an asset account represents an overdraft liability
        const overdraftAmount = bal.abs();
        totalLiabilities = totalLiabilities.plus(overdraftAmount);
        liabilitiesList.push({
          name: `${acc.accountName} (Overdraft)`,
          type: 'overdraft',
          balance: overdraftAmount.toFixed(2),
          color: '#ef4444',
        });
      } else {
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

  // Incorporate standalone debts from debts table that are NOT linked to a ledger account already processed
  const standaloneDebts = db.prepare(`
    SELECT id, name, liability_type, principal_balance, linked_account_id
    FROM debts
    WHERE tenant_id = ?
  `).all(tenantId) as Array<{ id: string; name: string; liability_type: string; principal_balance: string; linked_account_id: string | null }>;

  for (const d of standaloneDebts) {
    if (d.linked_account_id && processedAccountIds.has(d.linked_account_id)) {
      // Already counted through the linked liability account balance; skip to prevent double counting!
      continue;
    }
    const debtBalance = new Decimal(d.principal_balance || '0.00');
    if (debtBalance.greaterThan(0)) {
      totalLiabilities = totalLiabilities.plus(debtBalance);
      liabilitiesList.push({
        name: d.name,
        type: d.liability_type || 'debt',
        balance: debtBalance.toFixed(2),
        color: '#f59e0b',
      });
    }
  }

  const netWorth = totalAssets.minus(totalLiabilities);
  const today = todayISO();

  // Read configured currency
  const user = db.prepare('SELECT preferences FROM users WHERE tenant_id = ? LIMIT 1').get(tenantId) as { preferences?: string } | undefined;
  let currency = 'USD';
  try {
    const p = JSON.parse(user?.preferences || '{}');
    if (p.currency || p.baseCurrency) currency = p.currency || p.baseCurrency;
  } catch {}

  return {
    totalAssets: totalAssets.toFixed(2),
    totalLiabilities: totalLiabilities.toFixed(2),
    netWorth: netWorth.toFixed(2),
    currency,
    asOfDate: today,
    assetsList,
    liabilitiesList,
    explainer: {
      metricName: 'Net Worth Valuation',
      definition: 'Total value of all verified financial assets minus all outstanding liabilities and debt obligations.',
      formula: 'Net Worth = Total Valued Assets - Total Outstanding Liabilities (including overdrafts and non-double-counted debts)',
      dateRange: { label: `Snapshot as of ${today}` },
      currency,
      includedEntities: ['Liquid cash & bank balances', 'Investments', 'Credit card balances', 'Loan balances', 'Overdrafts', 'Unlinked debts'],
      excludedEntities: ['Physical property without appraisal', 'Off-ledger assets', 'Double-counted linked debts'],
      assumptions: ['All balances reflect confirmed ledger postings and reconciled standalone debt records'],
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
 * Resolves, for every debt, both truth figures plus the effective payoff basis:
 * - `principalBalance`: the user-typed debts.principal_balance record
 * - `ledgerBalance` / `ledgerOutstanding`: the linked ledger account's signed / absolute balance
 * - `effectivePrincipal`: ledger-derived amount when a linked account exists and holds a
 *   positive outstanding balance; the record figure otherwise. The ledger is the source
 *   of truth (this is the same figure calculateNetWorth books as the liability).
 */
export function calculateDebtLedgerReconciliations(
  db: Database.Database,
  tenantId: string
): Array<{
  debtId: string;
  principalBalance: string;
  ledgerBalance: string | null;
  ledgerOutstanding: string | null;
  balanceSource: 'ledger' | 'principal';
  effectivePrincipal: string;
  mismatch: boolean;
}> {
  const balances = calculateAccountBalances(db, tenantId);
  const balanceById = new Map(balances.map(b => [b.accountId, b]));

  const debts = db.prepare(`
    SELECT id, principal_balance, linked_account_id
    FROM debts WHERE tenant_id = ?
  `).all(tenantId) as Array<{ id: string; principal_balance: string; linked_account_id: string | null }>;

  return debts.map(d => {
    const acc = d.linked_account_id ? balanceById.get(d.linked_account_id) : undefined;
    const principal = new Decimal(d.principal_balance || '0.00');
    let ledgerBalance: string | null = null;
    let ledgerOutstanding: string | null = null;
    let effective = principal;
    let balanceSource: 'ledger' | 'principal' = 'principal';
    if (acc) {
      const bal = new Decimal(acc.currentBalance);
      ledgerBalance = bal.toFixed(2);
      const outstanding = Decimal.max(0, bal.abs());
      ledgerOutstanding = outstanding.toFixed(2);
      if (outstanding.greaterThan(0)) {
        effective = outstanding;
        balanceSource = 'ledger';
      }
    }
    return {
      debtId: d.id,
      principalBalance: principal.toFixed(2),
      ledgerBalance,
      ledgerOutstanding,
      balanceSource,
      effectivePrincipal: effective.toFixed(2),
      mismatch: ledgerOutstanding !== null && !principal.equals(effective),
    };
  });
}

/**
 * Calculates Debt Payoff scenarios (Avalanche vs Snowball)
 *
 * Payoff basis: when a debt is linked to a ledger account, the amortization runs on the
 * LEDGER-derived outstanding balance (source of truth, same figure booked in net worth),
 * not on the possibly-stale typed principal_balance record.
 */
export function calculateDebtPayoffScenarios(
  db: Database.Database,
  tenantId: string,
  extraMonthlyPayment: string = '100.00'
) {
  const debts = db.prepare(`
    SELECT * FROM debts WHERE tenant_id = ?
  `).all(tenantId) as Array<{
    id: string;
    name: string;
    principal_balance: string;
    interest_rate: string;
    minimum_payment: string;
    linked_account_id: string | null;
  }>;

  // Ledger reconciliation drives the effective principal per debt
  const reconciliations = new Map(
    calculateDebtLedgerReconciliations(db, tenantId).map(r => [r.debtId, r])
  );

  const effectiveDebts = debts.map(d => {
    const rec = reconciliations.get(d.id);
    return { ...d, principal_balance: rec?.effectivePrincipal ?? d.principal_balance };
  });

  const extra = new Decimal(extraMonthlyPayment || '0.00');

  // Avalanche: Sort by interest rate desc
  const avalancheDebts = [...effectiveDebts].sort((a, b) => new Decimal(b.interest_rate || '0').minus(new Decimal(a.interest_rate || '0')).toNumber());
  // Snowball: Sort by principal balance asc
  const snowballDebts = [...effectiveDebts].sort((a, b) => new Decimal(a.principal_balance || '0').minus(new Decimal(b.principal_balance || '0')).toNumber());

  return {
    extraMonthlyPayment: extra.toFixed(2),
    avalanche: simulatePayoff(avalancheDebts, extra),
    snowball: simulatePayoff(snowballDebts, extra),
  };
}

/**
 * Canonical duplicate fingerprint: tenant + account + date + type + amount
 * normalized to 2dp. Must stay byte-identical with the SQL backfill produced
 * in migration v5 (see src/lib/db/index.ts).
 */
export function transactionFingerprint(
  tenantId: string,
  probe: { accountId: string; date: string; transactionType: string; amount: string }
): string {
  const normalized = new Decimal(probe.amount || '0').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  return `${tenantId}|${probe.accountId}|${probe.date}|${probe.transactionType}|${normalized}`;
}

/**
 * Soft duplicate-warning (reconciliation-noise guard, advisory only — never blocks).
 * Detects prior posted transactions with the same (account, date, type, amount).
 * Used by POST /api/finance/transactions; the import flow has its own preview-time
 * duplicate detection.
 */
export function detectDuplicateTransaction(
  db: Database.Database,
  tenantId: string,
  probe: { accountId: string; date: string; transactionType: string; amount: string; excludeTransactionId?: string }
): { isDuplicate: boolean; existingIds: string[]; existingCount: number } {
  const rows = db.prepare(`
    SELECT id FROM journal_transactions
    WHERE tenant_id = ? AND account_id = ? AND date = ? AND transaction_type = ?
      AND amount = ? AND status = 'posted' AND id != coalesce(?, '')
    LIMIT 5
  `).all(
    tenantId,
    probe.accountId,
    probe.date,
    probe.transactionType,
    probe.amount,
    probe.excludeTransactionId ?? null
  ) as Array<{ id: string }>;

  return { isDuplicate: rows.length > 0, existingIds: rows.map(r => r.id), existingCount: rows.length };
}

/** Simulates the payoff of a set of debts month by month until all are settled. */
function simulatePayoff(
  debts: Array<{ id: string; name: string; principal_balance: string; interest_rate: string; minimum_payment: string }>,
  extraPayment: Decimal
) {
  const totalBalance = debts.reduce((sum, d) => sum.plus(new Decimal(d.principal_balance)), new Decimal(0));
  let totalInterest = new Decimal(0);
  let months = 0;

  const balances = debts.map(d => ({
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

export interface BudgetRolloverResult {
  previousBudgetId: string;
  newBudgetId: string;
  rolloverMode: 'carry_unused' | 'reset';
  rolledLines: Array<{
    categoryId: string;
    categoryName: string;
    previousAllocated: string;
    previousSpent: string;
    previousRemaining: string;
    rolloverAmount: string;
    newAllocated: string;
    newTotalBudgeted: string;
  }>;
}

/**
 * Rolls over an expired budget into a new consecutive monthly cycle.
 * - carry_unused: unspent remaining balances roll over as positive envelope additions.
 * - reset: category balances reset to base allocated targets with zero rollover.
 */
export function rolloverBudgetPeriod(
  db: Database.Database,
  tenantId: string,
  sourceBudgetId: string,
  newBudgetId: string,
  newPeriodStart: string,
  newPeriodEnd: string,
  newBudgetName?: string,
  options?: {
    rolloverModeOverride?: 'carry_unused' | 'reset';
    categoryAllocations?: Record<string, string>;
  }
): BudgetRolloverResult {
  const sourceBudget = calculateBudget(db, tenantId, sourceBudgetId);
  if (!sourceBudget) {
    throw new Error(`Source budget ${sourceBudgetId} not found`);
  }

  const rolloverMode = options?.rolloverModeOverride || (sourceBudget.rolloverMode as 'carry_unused' | 'reset') || 'carry_unused';
  const name = newBudgetName || `${sourceBudget.budgetName} (Next Cycle)`;

  let result: BudgetRolloverResult = {
    previousBudgetId: sourceBudgetId,
    newBudgetId,
    rolloverMode,
    rolledLines: [],
  };

  // Atomic roll: budget header + all lines commit together or not at all.
  db.transaction(() => {
    db.prepare(`
      INSERT INTO budgets (
        id, tenant_id, name, budget_type, period_type, start_date, end_date, currency, rollover_mode, is_active
      ) VALUES (?, ?, ?, ?, 'monthly', ?, ?, ?, ?, 1)
    `).run(
      newBudgetId,
      tenantId,
      name,
      sourceBudget.budgetType,
      newPeriodStart,
      newPeriodEnd,
      sourceBudget.currency,
      rolloverMode
    );

    const rolledLines: BudgetRolloverResult['rolledLines'] = [];

    for (const item of sourceBudget.items) {
      let rolloverAmt = new Decimal(0);
      if (rolloverMode === 'carry_unused') {
        const remaining = new Decimal(item.remainingAmount);
        // Unused positive balance rolls over as additional budget
        if (remaining.greaterThan(0)) {
          rolloverAmt = remaining;
        }
      }

      const newAllocatedStr = options?.categoryAllocations?.[item.categoryId] ?? item.allocatedAmount;
      const newAllocated = new Decimal(newAllocatedStr);
      const newTotal = newAllocated.plus(rolloverAmt);

      db.prepare(`
        INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `bl_${newBudgetId}_${item.categoryId}`,
        tenantId,
        newBudgetId,
        item.categoryId,
        newAllocated.toFixed(2),
        rolloverAmt.toFixed(2)
      );

      rolledLines.push({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        previousAllocated: item.allocatedAmount,
        previousSpent: item.spentAmount,
        previousRemaining: item.remainingAmount,
        rolloverAmount: rolloverAmt.toFixed(2),
        newAllocated: newAllocated.toFixed(2),
        newTotalBudgeted: newTotal.toFixed(2),
      });
    }

    result = {
      previousBudgetId: sourceBudgetId,
      newBudgetId,
      rolloverMode,
      rolledLines,
    };
  })();

  return result;
}

export interface DebtPaymentSplitResult {
  totalPayment: string;
  interestPortion: string;
  principalPortion: string;
  previousPrincipal: string;
  remainingPrincipal: string;
  effectiveMonthlyRate: string;
}

/**
 * Deterministically splits a debt payment between financing interest cost and principal reduction.
 */
export function calculateDebtPaymentSplit(
  principalBalance: string | Decimal,
  annualInterestRatePercent: string | Decimal,
  totalPaymentAmount: string | Decimal
): DebtPaymentSplitResult {
  const principal = new Decimal(principalBalance || '0.00');
  const annualRate = new Decimal(annualInterestRatePercent || '0.00');
  const totalPay = new Decimal(totalPaymentAmount || '0.00');

  // Monthly interest rate = (APR % / 100) / 12
  const monthlyRate = annualRate.dividedBy(100).dividedBy(12);
  const interest = principal.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Principal reduction = payment - interest (capped at principal)
  const availableForPrincipal = Decimal.max(new Decimal(0), totalPay.minus(interest));
  const principalReduction = Decimal.min(principal, availableForPrincipal);
  const remaining = principal.minus(principalReduction);

  return {
    totalPayment: totalPay.toFixed(2),
    interestPortion: interest.toFixed(2),
    principalPortion: principalReduction.toFixed(2),
    previousPrincipal: principal.toFixed(2),
    remainingPrincipal: remaining.toFixed(2),
    effectiveMonthlyRate: monthlyRate.toFixed(6),
  };
}

/**
 * Advances a recurring rule's next_due_date by one occurrence.
 *
 * - Calendar-arithmetic on ISO date strings (no DST wall-clock drift; month-end
 *   overflows clamp to the last valid day, e.g. Jan 31 -> Feb 28).
 * - For monthly/quarterly/yearly cadences the anchored day of month is
 *   preserved (from `dayOfMonth` when provided, otherwise from the current date).
 * - Pure function: safe to re-run; the caller persists the result inside the
 *   same transaction that records the generated transaction to prevent
 *   duplicate generations.
 */
export function advanceRecurringNextDueDate(
  currentDueDate: string,
  frequency: string,
  intervalCount: number = 1,
  dayOfMonth?: number | null
): string {
  const [y, m, d] = currentDueDate.split('-').map(Number);
  const interval = Math.max(1, Math.floor(intervalCount || 1));

  const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1 + 1, 0)).getUTCDate();

  const clamp = (year: number, month1: number, day: number) =>
    `${String(year).padStart(4, '0')}-${String(month1 + 1).padStart(2, '0')}-${String(
      Math.min(day, daysInMonth(year, month1))
    ).padStart(2, '0')}`;

  switch (frequency) {
    case 'daily': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + interval);
      return dt.toISOString().slice(0, 10);
    }
    case 'weekly':
    case 'biweekly': {
      const weeks = frequency === 'biweekly' ? interval * 2 : interval;
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + weeks * 7);
      return dt.toISOString().slice(0, 10);
    }
    case 'monthly':
    case 'quarterly': {
      const months = frequency === 'quarterly' ? interval * 3 : interval;
      const anchorDay = dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : d;
      let targetMonth = m - 1 + months;
      const targetYear = y + Math.floor(targetMonth / 12);
      targetMonth = ((targetMonth % 12) + 12) % 12;
      return clamp(targetYear, targetMonth, anchorDay);
    }
    case 'yearly': {
      const anchorDay = dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : d;
      return clamp(y + interval, m - 1, anchorDay);
    }
    default: {
      // Unknown cadence: conservative monthly step with clamping.
      const anchorDay = dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : d;
      let targetMonth = m - 1 + interval;
      const targetYear = y + Math.floor(targetMonth / 12);
      targetMonth = ((targetMonth % 12) + 12) % 12;
      return clamp(targetYear, targetMonth, anchorDay);
    }
  }
}
