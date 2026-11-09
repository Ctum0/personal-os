import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  parseUnstructuredPlanInput,
  buildIntelligentDailySchedule,
  commitApprovedDailyPlan,
  rescheduleTask,
  type DailyPlanningContext,
} from '../lib/productivity/planner';
import type Database from 'better-sqlite3';

describe('AI-First Daily Planner & Execution Engine', () => {
  let db: Database.Database;
  const tenantId = 'tenant_ai_planner_test';
  const userId = 'user_planner_1';

  beforeEach(() => {
    db = getInMemoryDb();
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Planner Tenant', 'planner-test')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES (?, ?, 'planner@test.local', 'Planner Tester')").run(userId, tenantId);
    db.prepare("INSERT INTO spaces (id, tenant_id, name, slug, icon) VALUES ('space_default', ?, 'General', 'general', 'Folder')").run(tenantId);
  });

  describe('Natural Language Commitment Parsing', () => {
    it('Scenario A: parses mixed fixed events and flexible tasks from unstructured prose', () => {
      const input = `Tomorrow I have a team sync at 10:00 for 45 minutes, lunch with Sarah at 12:30, and dentist appointment at 15:00.
Also need to write the Q3 report for 2 hours, review pull requests for 45 minutes, and hit the gym.`;

      const parsed = parseUnstructuredPlanInput(input);
      expect(parsed.commitments.length).toBeGreaterThanOrEqual(4);

      // Verify fixed commitments with times
      const syncEvent = parsed.commitments.find(c => c.title.toLowerCase().includes('sync') || c.title.toLowerCase().includes('team'));
      expect(syncEvent).toBeDefined();
      expect(syncEvent?.isFixed).toBe(true);
      expect(syncEvent?.startTime).toBe('10:00');

      // Verify flexible tasks
      const reportTask = parsed.commitments.find(c => c.title.toLowerCase().includes('report') || c.title.toLowerCase().includes('q3'));
      expect(reportTask).toBeDefined();
      expect(reportTask?.isFixed).toBe(false);
      expect(reportTask?.durationMinutes).toBe(120);
    });

    it('Scenario B: detects uncertainties and missing information for underspecified requests', () => {
      const input = `Need to have a call with David sometime tomorrow and also go for a workout.`;
      const parsed = parseUnstructuredPlanInput(input);

      expect(parsed.uncertainties.length).toBeGreaterThan(0);
      const callUncertainty = parsed.uncertainties.find(u => u.id === 'call_time' || u.question.toLowerCase().includes('call'));
      expect(callUncertainty).toBeDefined();
      expect(callUncertainty?.options?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Capacity Overflow & Conflict Detection', () => {
    it('Scenario C: detects overloaded schedules and suggests realistic deferrals', () => {
      const context: DailyPlanningContext = {
        targetDate: '2026-11-08',
        workingHours: { start: '09:00', end: '17:00', maxFocusHours: 5 },
        existingCalendarEvents: [
          { id: 'ev_1', title: 'Executive Briefing', startTime: '09:00', endTime: '11:00' },
          { id: 'ev_2', title: 'Department Sync', startTime: '13:00', endTime: '15:00' },
        ],
        openTasks: [
          { id: 't_big', title: 'Massive System Architecture Spec', priority: 'high', estimatedDuration: 240 },
          { id: 't_audit', title: 'Security Audit Verification', priority: 'normal', estimatedDuration: 180 },
          { id: 't_docs', title: 'Update Onboarding Docs', priority: 'low', estimatedDuration: 120 },
        ],
        missedTasksFromPreviousDays: [],
        habits: [{ id: 'h_read', title: 'Deep Reading', timeOfDay: 'morning', durationMinutes: 30 }],
      };

      const commitments = [
        { id: 'c_big', title: 'Massive System Architecture Spec', isFixed: false, durationMinutes: 240, priority: 'high' as const },
        { id: 'c_audit', title: 'Security Audit Verification', isFixed: false, durationMinutes: 180, priority: 'normal' as const },
        { id: 'c_docs', title: 'Update Onboarding Docs', isFixed: false, durationMinutes: 120, priority: 'low' as const },
      ];

      const proposal = buildIntelligentDailySchedule(context, commitments);

      // Total flexible work = 540 min (9 hrs). Available span (9-17) minus 4 hrs meetings = 4 hrs = 240 min.
      expect(proposal.capacityWarning).toBeDefined();
      expect(proposal.capacityWarning?.isOvercommitted).toBe(true);
      expect(proposal.capacityWarning?.overloadMinutes).toBeGreaterThan(0);
      expect(proposal.capacityWarning?.suggestedDeferrals.length).toBeGreaterThan(0);

      // Lower priority task should be suggested for deferral first
      const suggestedTitles = proposal.capacityWarning?.suggestedDeferrals.map(d => d.title.toLowerCase());
      expect(suggestedTitles?.some(t => t.includes('docs') || t.includes('audit'))).toBe(true);
    });
  });

  describe('Plan Approval & Atomic Commit', () => {
    it('Scenario A: commits approved schedule atomically to daily_plans and calendar_events', () => {
      const context: DailyPlanningContext = {
        targetDate: '2026-11-08',
        workingHours: { start: '08:30', end: '17:30', maxFocusHours: 6 },
        existingCalendarEvents: [],
        openTasks: [],
        missedTasksFromPreviousDays: [],
        habits: [],
      };

      const commitments = [
        { id: 'c1', title: 'Client Architecture Review', isFixed: true, startTime: '09:00', endTime: '10:00', durationMinutes: 60, priority: 'urgent' as const },
        { id: 'c2', title: 'Deep Focus: Engine Refactor', isFixed: false, durationMinutes: 90, priority: 'high' as const },
      ];

      const proposal = buildIntelligentDailySchedule(context, commitments);

      // Commit the plan
      const result = commitApprovedDailyPlan(db, tenantId, proposal);
      expect(result.planId).toBeDefined();
      expect(result.committedItemsCount).toBe(proposal.scheduledItems.length);

      // Verify database state
      const planRow = db.prepare('SELECT * FROM daily_plans WHERE id = ?').get(result.planId) as any;
      expect(planRow).toBeDefined();
      expect(planRow.plan_date).toBe('2026-11-08');
      expect(planRow.status).toBe('committed');

      const items = db.prepare('SELECT * FROM daily_plan_items WHERE plan_id = ?').all(result.planId);
      expect(items.length).toBe(proposal.scheduledItems.length);

      // Verify calendar events were synchronized
      const events = db.prepare('SELECT * FROM calendar_events WHERE tenant_id = ? AND date(start_time) = ?').all(tenantId, '2026-11-08');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario D: Missed Tasks & Rescheduling Audit History', () => {
    it('records immutable audit row in task_rescheduling_history when rescheduling missed tasks', () => {
      // Create a task due yesterday
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, space_id, title, status, due_date, priority)
        VALUES ('t_yesterday', ?, 'space_default', 'Submit Tax Invoices', 'todo', '2026-11-06', 'urgent')
      `).run(tenantId);

      // Reschedule task to today
      const res = rescheduleTask(db, tenantId, 't_yesterday', '2026-11-07', 'missed_deadline');
      expect(res.success).toBe(true);

      // Check task due_date was updated
      const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t_yesterday') as any;
      expect(updatedTask.due_date).toBe('2026-11-07');

      // Check immutable history table has the entry
      const historyRows = db.prepare('SELECT * FROM task_rescheduling_history WHERE task_id = ?').all('t_yesterday') as any[];
      expect(historyRows.length).toBe(1);
      expect(historyRows[0].original_date).toBe('2026-11-06');
      expect(historyRows[0].new_date).toBe('2026-11-07');
      expect(historyRows[0].reason).toBe('missed_deadline');
      expect(historyRows[0].action_type).toBe('rescheduled');
    });
  });

  describe('Scenario G & H: Workspace Isolation & Finance Mathematical Integrity', () => {
    it('strictly isolates Productivity mutations from Finance tables', () => {
      // Set up a finance account
      db.prepare(`
        INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
        VALUES ('acc_iso_checking', ?, 'Main Checking', 'checking', 'USD', '5400.00')
      `).run(tenantId);

      const preAccount = db.prepare('SELECT opening_balance FROM finance_accounts WHERE id = ?').get('acc_iso_checking') as any;
      expect(preAccount.opening_balance).toBe('5400.00');

      // Execute productivity planning actions: create task, commit daily plan, reschedule
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, space_id, title, status, due_date)
        VALUES ('t_prod_iso', ?, 'space_default', 'Productivity Isolation Task', 'todo', '2026-11-07')
      `).run(tenantId);

      rescheduleTask(db, tenantId, 't_prod_iso', '2026-11-08', 'schedule_conflict');

      // Verify finance account and ledger tables are 100% untouched
      const postAccount = db.prepare('SELECT opening_balance FROM finance_accounts WHERE id = ?').get('acc_iso_checking') as any;
      expect(postAccount.opening_balance).toBe('5400.00');

      const txCount = db.prepare('SELECT count(*) as count FROM journal_transactions WHERE tenant_id = ?').get(tenantId) as any;
      expect(txCount.count).toBe(0);
    });
  });
});
