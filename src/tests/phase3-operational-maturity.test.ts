import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  calculateSafeToSpend,
  calculateNetWorth,
} from '../lib/finance/engine';
import {
  calculateDurationMinutes,
  buildIntelligentDailySchedule,
  commitApprovedDailyPlan,
} from '../lib/productivity/planner';
import type Database from 'better-sqlite3';

describe('Phase 3: Operational Maturity, Mathematical Rigor & Edge Cases', () => {
  let db: Database.Database;
  const tenantId = 'tenant_p3';

  beforeEach(() => {
    db = getInMemoryDb();

    // Create test tenant and user
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Phase 3 Tenant', 'p3')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES ('u_p3', ?, 'p3@os.local', 'P3 Operator')").run(tenantId);
  });

  // --------------------------------------------------------------------------
  // 1. Net Worth Edge Cases & Invariant Preservation
  // --------------------------------------------------------------------------
  describe('Net Worth Edge Cases', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
        VALUES 
          ('acc_chk', ?, 'Checking Account', 'checking', 'USD', '1000.00'),
          ('acc_sav', ?, 'Savings Account', 'savings', 'USD', '5000.00'),
          ('acc_crd', ?, 'Credit Card', 'credit_card', 'USD', '0.00')
      `).run(tenantId, tenantId, tenantId);
    });

    it('treats negative asset balances (overdrafts) as liabilities rather than vanishing', () => {
      // Overdraw checking by spending $1,200 when only $1,000 opening exists
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_od', ?, 'expense', '2026-11-01', 'acc_chk', '1200.00', 'USD', '1200.00', 'Overdraft Expense', 'posted')
      `).run(tenantId);

      const nw = calculateNetWorth(db, tenantId);
      // Checking is -$200.00.
      // Savings is $5,000.00.
      // Overdraft -$200 must be counted in liabilities!
      // Total Assets: $5,000.00 (Savings)
      // Total Liabilities: $200.00 (Overdraft)
      // Net Worth: $5,000.00 - $200.00 = $4,800.00
      expect(nw.totalAssets).toBe('5000.00');
      expect(nw.totalLiabilities).toBe('200.00');
      expect(nw.netWorth).toBe('4800.00');
      expect(nw.liabilitiesList.some(l => l.name.includes('Overdraft'))).toBe(true);
    });

    it('preserves Net Worth invariant across account transfers (zero net change)', () => {
      const initialNw = calculateNetWorth(db, tenantId);
      expect(initialNw.netWorth).toBe('6000.00'); // 1000 + 5000

      // Transfer $800 from Checking to Savings
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_tr', ?, 'transfer', '2026-11-02', 'acc_chk', 'acc_sav', '800.00', 'USD', '800.00', 'Transfer', 'posted')
      `).run(tenantId);

      const postTransferNw = calculateNetWorth(db, tenantId);
      expect(postTransferNw.totalAssets).toBe('6000.00'); // 200 + 5800
      expect(postTransferNw.totalLiabilities).toBe('0.00');
      expect(postTransferNw.netWorth).toBe(initialNw.netWorth);
    });

    it('ensures debt payments reduce cash and liabilities symmetrically', () => {
      // Create credit card expense of $500
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_crd_exp', ?, 'expense', '2026-11-01', 'acc_crd', '500.00', 'USD', '500.00', 'Flight', 'posted')
      `).run(tenantId);

      const prePayment = calculateNetWorth(db, tenantId);
      expect(prePayment.totalAssets).toBe('6000.00');
      expect(prePayment.totalLiabilities).toBe('500.00');
      expect(prePayment.netWorth).toBe('5500.00');

      // Pay credit card from checking: transfer $500 from acc_chk to acc_crd
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_crd_pay', ?, 'transfer', '2026-11-03', 'acc_chk', 'acc_crd', '500.00', 'USD', '500.00', 'CC Payment', 'posted')
      `).run(tenantId);

      const postPayment = calculateNetWorth(db, tenantId);
      // Assets: checking (500) + savings (5000) = 5500
      // Liabilities: credit card is paid off = 0.00
      // Net Worth: 5500 - 0 = 5500
      expect(postPayment.totalAssets).toBe('5500.00');
      expect(postPayment.totalLiabilities).toBe('0.00');
      expect(postPayment.netWorth).toBe('5500.00');
    });

    it('prevents double-counting between debt records and linked liability accounts', () => {
      // 1. Debt linked to credit card account (which already has liability balance)
      db.prepare(`
        INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, linked_account_id)
        VALUES ('debt_linked', ?, 'Credit Card Debt', 'credit_card', '750.00', '19.99', '50.00', 'acc_crd')
      `).run(tenantId);

      // Card has $750 expense
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_cc_750', ?, 'expense', '2026-11-01', 'acc_crd', '750.00', 'USD', '750.00', 'Retail', 'posted')
      `).run(tenantId);

      // 2. Standalone unlinked debt (e.g. Student Loan tracked outside banking ledger)
      db.prepare(`
        INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, linked_account_id)
        VALUES ('debt_unlinked', ?, 'Student Loan', 'student_loan', '15000.00', '4.50', '200.00', NULL)
      `).run(tenantId);

      const nw = calculateNetWorth(db, tenantId);
      // Total Assets: 1000 + 5000 = 6000
      // Total Liabilities: Credit Card ($750) + Standalone Student Loan ($15,000) = $15,750
      // The linked debt of $750 MUST NOT be added again (which would have yielded 16,500)!
      expect(nw.totalAssets).toBe('6000.00');
      expect(nw.totalLiabilities).toBe('15750.00');
      expect(nw.netWorth).toBe('-9750.00');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Safe-to-Spend Reservation Model & Deductions
  // --------------------------------------------------------------------------
  describe('Safe-to-Spend Reservation Model', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
        VALUES 
          ('acc_chk', ?, 'Checking Account', 'checking', 'USD', '2500.00'),
          ('acc_sav', ?, 'Emergency Savings', 'savings', 'USD', '10000.00')
      `).run(tenantId, tenantId);

      db.prepare(`
        INSERT INTO safe_to_spend_settings (tenant_id, safety_buffer, days_horizon, include_credit_lines)
        VALUES (?, '300.00', 30, 0)
      `).run(tenantId);
    });

    it('deducts pending expenses from liquid funds', () => {
      // Pending expense of $120.00
      db.prepare(`
        INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, description, status)
        VALUES ('tx_pending', ?, 'expense', '2026-11-07', 'acc_chk', '120.00', 'USD', '120.00', 'Pending Hotel Hold', 'pending')
      `).run(tenantId);

      const sts = calculateSafeToSpend(db, tenantId);
      // Liquid: 2500 + 10000 = 12500.00
      // Pending: -120.00
      // Safety Buffer: -300.00
      // Safe-to-spend: 12500 - 120 - 300 = 12080.00
      expect(sts.liquidFunds).toBe('12500.00');
      expect(sts.safeToSpendAmount).toBe('12080.00');
      expect(sts.breakdown.some(b => b.label === 'Pending Uncleared Expenses' || b.label === 'Pending Deductions')).toBe(true);
    });

    it('deducts earmarked liquid savings goals while preserving clear audit breakdown', () => {
      db.prepare(`
        INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, linked_account_id, status)
        VALUES ('sg_car', ?, 'Car Downpayment', '5000.00', '4000.00', 'acc_sav', 'active')
      `).run(tenantId);

      const sts = calculateSafeToSpend(db, tenantId);
      // Liquid: 12500.00
      // Earmarked: 4000.00
      // Buffer: 300.00
      // Safe to spend: 12500 - 4000 - 300 = 8200.00
      expect(sts.earmarkedSavings).toBe('4000.00');
      expect(sts.safeToSpendAmount).toBe('8200.00');
    });
  });

  // --------------------------------------------------------------------------
  // 3. AI Planner Adversarial Edge Cases
  // --------------------------------------------------------------------------
  describe('AI Planner Adversarial Real-World Edge Cases', () => {
    it('correctly calculates durations for commitments spanning midnight', () => {
      // Shift from 23:00 to 01:30 (2.5 hours = 150 minutes)
      const duration = calculateDurationMinutes('23:00', '01:30');
      expect(duration).toBe(150);

      // Night shift from 22:00 to 06:00 (8 hours = 480 minutes)
      const nightShift = calculateDurationMinutes('22:00', '06:00');
      expect(nightShift).toBe(480);
    });

    it('detects and surfaces direct conflicts between overlapping fixed commitments', () => {
      const context = {
        targetDate: '2026-11-08',
        workingHours: { start: '08:00', end: '20:00', maxFocusHours: 8 },
        existingEvents: [
          { id: 'ev_1', title: 'Dentist Appointment', startTime: '10:00', endTime: '11:30' },
          { id: 'ev_2', title: 'Executive Board Meeting', startTime: '11:00', endTime: '12:30' },
        ],
      };

      const plan = buildIntelligentDailySchedule(context as any, []);
      expect(plan.conflictSummary).toBeDefined();
      expect(plan.conflictSummary).toContain('Direct Schedule Conflict');
      expect(plan.conflictSummary).toContain('Dentist Appointment');
      expect(plan.conflictSummary).toContain('Executive Board Meeting');
    });

    it('never deletes manually created non-plan calendar events when committing a plan revision', () => {
      const targetDate = '2026-11-10';

      // 1. User manually created a calendar appointment
      db.prepare(`
        INSERT INTO calendar_events (id, tenant_id, title, start_time, end_time, is_all_day, event_type)
        VALUES ('manual_doc', ?, 'Doctor Visit (Personal)', '2026-11-10T14:00:00', '2026-11-10T15:00:00', 0, 'personal')
      `).run(tenantId);

      // 2. Commit Plan Revision 1
      const proposal1 = {
        targetDate,
        objective: 'Revision 1 Execution',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 2.0,
        isOvercommitted: false,
        overloadHours: 0,
        suggestedDeferrals: [],
        scheduledItems: [
          {
            id: 'item_1',
            title: 'Study Architecture',
            itemType: 'scheduled_task' as const,
            startTime: '09:00',
            endTime: '11:00',
            durationMinutes: 120,
            priority: 'high' as const,
            isExistingTask: false,
          },
        ],
        scheduleTimeline: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
      };

      commitApprovedDailyPlan(db, tenantId, 'u_p3', proposal1);

      // Verify doctor visit exists alongside plan block
      let events = db.prepare('SELECT id, title, event_type FROM calendar_events WHERE tenant_id = ?').all(tenantId) as any[];
      expect(events.some(e => e.id === 'manual_doc')).toBe(true);
      expect(events.some(e => e.event_type === 'daily_plan_block')).toBe(true);

      // 3. Commit Plan Revision 2 (Re-planning the day)
      const proposal2 = {
        ...proposal1,
        objective: 'Revision 2 Execution',
        scheduledItems: [
          {
            id: 'item_2',
            title: 'Refactored Deep Focus',
            itemType: 'scheduled_task' as const,
            startTime: '08:30',
            endTime: '10:30',
            durationMinutes: 120,
            priority: 'urgent' as const,
            isExistingTask: false,
          },
        ],
      };

      commitApprovedDailyPlan(db, tenantId, 'u_p3', proposal2);

      // Verify: manual doctor appointment is STILL intact, while old daily_plan_block was replaced with revision 2
      events = db.prepare('SELECT id, title, event_type FROM calendar_events WHERE tenant_id = ?').all(tenantId) as any[];
      const manualEvent = events.find(e => e.id === 'manual_doc');
      expect(manualEvent).toBeDefined();
      expect(manualEvent.title).toBe('Doctor Visit (Personal)');

      const planBlocks = events.filter(e => e.event_type === 'daily_plan_block');
      expect(planBlocks.length).toBe(1);
      expect(planBlocks[0].title).toBe('Refactored Deep Focus');
    });
  });
});
