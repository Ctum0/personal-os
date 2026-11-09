import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '@/lib/db';
import {
  calculateSafeToSpend,
  calculateNetWorth,
  calculateAccountBalances,
} from '@/lib/finance/engine';
import {
  commitApprovedDailyPlan,
  DailyPlanProposal,
  getPlanningContext,
} from '@/lib/productivity/planner';
import { generateDailyPlanProposal } from '@/lib/productivity/engine';

describe('Phase 4 Closeout Verification: Financial Invariants & Operating Integrity', () => {
  let db: ReturnType<typeof getInMemoryDb>;
  const tenantId = 'tenant_test_phase4';
  const userId = 'user_test_phase4';

  beforeEach(() => {
    db = getInMemoryDb();

    // Seed tenant and user
    db.prepare(`
      INSERT INTO tenants (id, name, slug) VALUES (?, 'Phase 4 Tenant', 'phase4-tenant')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, name, preferences)
      VALUES (?, ?, 'auditor@personal-os.local', 'Lead Auditor', ?)
    `).run(
      userId,
      tenantId,
      JSON.stringify({
        currency: 'EUR',
        workStart: '09:00',
        workEnd: '18:00',
        maxDailyWorkloadHours: '6.5',
      })
    );
  });

  describe('Section 4: Task Deduplication & Idempotent Plan Approval', () => {
    it('does not create duplicate tasks when the same plan is committed repeatedly', () => {
      const plan: DailyPlanProposal = {
        targetDate: '2026-11-10',
        objective: 'Execute high-impact milestones',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 2.5,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_1',
            title: 'Audit System Architecture',
            itemType: 'scheduled_task',
            startTime: '09:30',
            endTime: '11:00',
            durationMinutes: 90,
            priority: 'high',
            isExistingTask: false,
          },
          {
            id: 'item_2',
            title: 'Client Status Review',
            itemType: 'fixed_event',
            startTime: '11:30',
            endTime: '12:30',
            durationMinutes: 60,
            priority: 'normal',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 2, tasksToReschedule: 0 },
      };

      // First commit
      const res1 = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(res1.success).toBe(true);
      expect(res1.createdTasksCount).toBe(1);

      // Verify task in DB
      const tasksAfterFirst = db.prepare('SELECT id, title FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
      expect(tasksAfterFirst.length).toBe(1);
      expect(tasksAfterFirst[0].title).toBe('Audit System Architecture');

      // Second commit with the exact same plan (re-approval / retry)
      const res2 = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(res2.success).toBe(true);
      expect(res2.createdTasksCount).toBe(0); // Should NOT re-create the task!

      // Verify NO duplicate task was created
      const tasksAfterSecond = db.prepare('SELECT id, title FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
      expect(tasksAfterSecond.length).toBe(1);
      expect(tasksAfterSecond[0].id).toBe(tasksAfterFirst[0].id);

      // Verify calendar events were updated cleanly without orphan duplicates
      const calendarBlocks = db.prepare('SELECT id, title, event_type FROM calendar_events WHERE tenant_id = ?').all(tenantId) as any[];
      expect(calendarBlocks.length).toBe(2);
    });
  });

  describe('Section 5: Operating Hours Consistency', () => {
    it('synchronizes working hours between preferences, engine proposal, and planning context', () => {
      const context = getPlanningContext(db, tenantId, '2026-11-10');
      expect(context.operatingRules?.workStart).toBe('09:00');
      expect(context.operatingRules?.workEnd).toBe('18:00');
      expect(context.operatingRules?.maxDailyWorkloadHours).toBe(6.5);

      const proposal = generateDailyPlanProposal(db, tenantId, '2026-11-10');
      expect(proposal.availableHours).toBe(6.5);
      expect(proposal.workStart).toBe('09:00');
      expect(proposal.workEnd).toBe('18:00');
    });
  });

  describe('Section 7: Financial Calculation Verification with Explicit Test Fixtures', () => {
    beforeEach(() => {
      // Seed finance accounts: Checking, Savings, Credit Card
      db.prepare(`
        INSERT OR REPLACE INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance, is_active)
        VALUES 
          ('acc_checking', ?, 'Primary Checking', 'checking', 'EUR', '2000.00', 1),
          ('acc_savings', ?, 'High Yield Savings', 'savings', 'EUR', '5000.00', 1),
          ('acc_credit', ?, 'Corporate Platinum', 'credit_card', 'EUR', '0.00', 1)
      `).run(tenantId, tenantId, tenantId);

      // Seed Safe-to-Spend settings
      db.prepare(`
        INSERT OR REPLACE INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon, include_credit_lines)
        VALUES (?, '300.00', 30, 0)
      `).run(tenantId);

      // Clean up previous transactions and rules for fresh fixture isolation
      db.prepare('DELETE FROM journal_transactions WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM recurring_financial_rules WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM budgets WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM budget_lines WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM savings_goals WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM debts WHERE tenant_id = ?').run(tenantId);
    });

    it('Fixture 1: Posted expenses and pending expenses are deducted once from liquid balances', () => {
      // Posted expense of 200.00 on checking account
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, account_id, date, amount, base_amount, transaction_type, status, description)
        VALUES ('tx_posted_1', ?, 'acc_checking', '2026-11-01', '200.00', '200.00', 'expense', 'posted', 'Office Supplies')
      `).run(tenantId);

      // Pending expense of 150.00 on checking account
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, account_id, date, amount, base_amount, transaction_type, status, description)
        VALUES ('tx_pending_1', ?, 'acc_checking', '2026-11-05', '150.00', '150.00', 'expense', 'pending', 'Hotel Reservation')
      `).run(tenantId);

      // Checking balance: opening (2000) - posted (200) = 1800.00
      // Savings balance: opening = 5000.00
      // Total liquidFunds = 1800 + 5000 = 6800.00
      // Pending deductions = 150.00
      // Safety buffer = 300.00
      // Safe to spend = 6800 - 150 - 300 = 6350.00
      const sts = calculateSafeToSpend(db, tenantId);
      expect(sts.liquidFunds).toBe('6800.00');
      expect(sts.safeToSpendAmount).toBe('6350.00');
      expect(sts.isDeficit).toBe(false);
      expect(sts.currency).toBe('EUR'); // Uses user preference!
    });

    it('Fixture 2: Pending transfers do not distort liquid funds or create double deductions', () => {
      // Pending transfer from checking to savings
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, account_id, date, amount, base_amount, transaction_type, status, description)
        VALUES ('tx_pend_transfer', ?, 'acc_checking', '2026-11-06', '500.00', '500.00', 'transfer', 'pending', 'Transfer to savings')
      `).run(tenantId);

      // Transfer has transaction_type = 'transfer', so it is NOT deducted as an expense in pendingDeductions
      const sts = calculateSafeToSpend(db, tenantId);
      // liquidFunds = 2000 (checking) + 5000 (savings) = 7000.00
      // buffer = 300.00
      // Safe to spend = 7000 - 300 = 6700.00
      expect(sts.liquidFunds).toBe('7000.00');
      expect(sts.safeToSpendAmount).toBe('6700.00');
    });

    it('Fixture 3: Recurring bills covered by budget allocations are not double-counted', () => {
      // Category: Housing
      db.prepare(`
        INSERT OR REPLACE INTO categories (id, tenant_id, name, type) VALUES ('cat_housing', ?, 'Housing', 'expense')
      `).run(tenantId);

      // Budget for Housing: 1200.00
      db.prepare(`
        INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date)
        VALUES ('bgt_nov', ?, 'Nov Budget', 'category_limit', 'monthly', '2026-11-01', '2026-11-30')
      `).run(tenantId);
      db.prepare(`
        INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount)
        VALUES ('bgt_item_1', ?, 'bgt_nov', 'cat_housing', '1200.00')
      `).run(tenantId);

      // Recurring bill for Rent: 1200.00 assigned to cat_housing due in 10 days
      db.prepare(`
        INSERT INTO recurring_financial_rules (id, tenant_id, account_id, start_date, name, rule_type, expected_amount, frequency, next_due_date, category_id, is_active)
        VALUES ('rule_rent', ?, 'acc_checking', '2026-11-01', 'Apartment Rent', 'bill', '1200.00', 'monthly', '2026-11-15', 'cat_housing', 1)
      `).run(tenantId);

      const sts = calculateSafeToSpend(db, tenantId);
      // Obligations should count the 1200 once (not double counted as 2400)
      expect(sts.upcomingObligations).toBe('1200.00');
      // Liquid = 7000, obligations = 1200, buffer = 300 => 7000 - 1200 - 300 = 5500.00
      expect(sts.safeToSpendAmount).toBe('5500.00');
    });

    it('Fixture 4: Negative account balance is counted as an overdraft liability in Net Worth', () => {
      // Overdraw checking by 500 (opening 2000, expense 2500)
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, account_id, date, amount, base_amount, transaction_type, status, description)
        VALUES ('tx_big_exp', ?, 'acc_checking', '2026-11-01', '2500.00', '2500.00', 'expense', 'posted', 'Overdraft Expense')
      `).run(tenantId);

      const balances = calculateAccountBalances(db, tenantId);
      const checkingBal = balances.find(b => b.accountId === 'acc_checking');
      expect(checkingBal?.currentBalance).toBe('-500.00');

      const nw = calculateNetWorth(db, tenantId);
      // Total assets: savings (5000.00)
      // Total liabilities: checking overdraft (500.00)
      // Net worth = 5000 - 500 = 4500.00
      expect(nw.totalAssets).toBe('5000.00');
      expect(nw.totalLiabilities).toBe('500.00');
      expect(nw.netWorth).toBe('4500.00');
      expect(nw.liabilitiesList.some(l => l.name.includes('Overdraft'))).toBe(true);
    });

    it('Fixture 5: Displays funding deficit separately when obligations exceed liquid capital', () => {
      // Set high upcoming bill of 10,000 EUR
      db.prepare(`
        INSERT INTO recurring_financial_rules (id, tenant_id, account_id, start_date, name, rule_type, expected_amount, frequency, next_due_date, is_active)
        VALUES ('rule_tax', ?, 'acc_checking', '2026-11-01', 'Annual Corporate Tax', 'bill', '10000.00', 'yearly', '2026-11-20', 1)
      `).run(tenantId);

      // Liquid funds = 7000.00, obligations = 10000.00, buffer = 300.00
      // Raw safe-to-spend = 7000 - 10000 - 300 = -3300.00
      const sts = calculateSafeToSpend(db, tenantId);
      expect(sts.safeToSpendAmount).toBe('0.00'); // Zero-floored
      expect(sts.isDeficit).toBe(true);
      expect(sts.fundingDeficit).toBe('3300.00'); // Explicit deficit!
      expect(sts.rawSafeToSpendAmount).toBe('-3300.00');
    });
  });
});
