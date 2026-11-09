import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '@/lib/db';
import {
  getPlanningContext,
  buildIntelligentDailySchedule,
  commitApprovedDailyPlan,
  reviseDailyPlan,
  savePlanningSession,
  getPlanningSession,
  DailyPlanProposal,
  PlanningContext,
} from '@/lib/productivity/planner';

describe('Planner Intelligence, Task Identity & Context Hardening', () => {
  let db: ReturnType<typeof getInMemoryDb>;
  const tenantId = 'tenant_planner_intel';
  const userId = 'user_planner_intel';

  beforeEach(() => {
    db = getInMemoryDb();

    db.prepare(`
      INSERT INTO tenants (id, name, slug) VALUES (?, 'Planner Intel Tenant', 'planner-intel')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, name, preferences)
      VALUES (?, ?, 'intel@personal-os.local', 'Intel Tester', ?)
    `).run(
      userId,
      tenantId,
      JSON.stringify({
        workStart: '09:00',
        workEnd: '18:00',
        maxDailyWorkloadHours: '6.5',
        focusWindowMinutes: '50',
        shortBreakMinutes: '10',
        enableFinancialInPlanning: false,
      })
    );

    db.prepare(`
      INSERT OR REPLACE INTO spaces (id, tenant_id, name, slug, icon, color, is_default)
      VALUES ('space_personal', ?, 'Personal', 'personal', 'User', '#10b981', 1)
    `).run(tenantId);
  });

  describe('1. Task Identity: Linking Existing Tasks Without Duplicating & Idempotent Approval', () => {
    it('links an existing backlog task by ID, updates due date/status in place, and produces 0 duplicate tasks', () => {
      // Create existing backlog task in inbox
      const backlogTaskId = 'task_backlog_api_design';
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, priority, status, estimated_duration, space_id)
        VALUES (?, ?, 'Design Clean API Contracts', 'high', 'inbox', 60, 'space_personal')
      `).run(backlogTaskId, tenantId);

      const plan: DailyPlanProposal = {
        planId: 'plan_link_test_1',
        targetDate: '2026-11-15',
        objective: 'API Architecture Focus',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 1.0,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_api_contract',
            title: 'Design Clean API Contracts',
            itemType: 'scheduled_task',
            startTime: '10:00',
            endTime: '11:00',
            durationMinutes: 60,
            priority: 'high',
            linkedTaskId: backlogTaskId,
            isExistingTask: true,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 0, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
      };

      // 1. Commit approved daily plan
      const commit1 = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(commit1.success).toBe(true);
      expect(commit1.createdTasksCount).toBe(0);

      // Verify task in DB was updated, not duplicated
      const tasksInDb = db.prepare('SELECT id, title, status, due_date, origin_plan_item_id FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
      expect(tasksInDb.length).toBe(1);
      expect(tasksInDb[0].id).toBe(backlogTaskId);
      expect(tasksInDb[0].status).toBe('next');
      expect(tasksInDb[0].due_date).toBe('2026-11-15');

      // Verify daily_plan_items and calendar_events linked to the backlog task
      const planItem = db.prepare('SELECT task_id FROM daily_plan_items WHERE plan_id = ?').get(commit1.planId) as any;
      expect(planItem.task_id).toBe(backlogTaskId);

      const calEvent = db.prepare('SELECT task_id FROM calendar_events WHERE tenant_id = ?').get(tenantId) as any;
      expect(calEvent.task_id).toBe(backlogTaskId);

      // 2. Re-approval is strictly idempotent
      const commit2 = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(commit2.success).toBe(true);
      expect(commit2.createdTasksCount).toBe(0);

      const tasksAfterRecommit = db.prepare('SELECT id FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
      expect(tasksAfterRecommit.length).toBe(1);
    });

    it('newly originated tasks get stable origin_plan_item_id and re-approval does not duplicate', () => {
      const plan: DailyPlanProposal = {
        planId: 'plan_origin_id_test',
        targetDate: '2026-11-16',
        objective: 'Write Research Summary',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 1.0,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_research_summary',
            title: 'Draft Research Findings',
            itemType: 'scheduled_task',
            startTime: '13:00',
            endTime: '14:00',
            durationMinutes: 60,
            priority: 'normal',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
      };

      const firstCommit = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(firstCommit.createdTasksCount).toBe(1);

      const created = db.prepare('SELECT id, origin_plan_item_id FROM tasks WHERE tenant_id = ?').get(tenantId) as any;
      expect(created.origin_plan_item_id).toBe('plan_origin_id_test:item_research_summary');

      // Re-commit
      const secondCommit = commitApprovedDailyPlan(db, tenantId, userId, plan);
      expect(secondCommit.createdTasksCount).toBe(0);

      const count = db.prepare('SELECT count(*) as count FROM tasks WHERE tenant_id = ?').get(tenantId) as any;
      expect(count.count).toBe(1);
    });
  });

  describe('2. Financial Data Quarantine in Productivity Planning Context', () => {
    it('strictly quarantines finance records when enableFinancialInPlanning is false (default)', () => {
      // Seed finance accounts and bills
      db.prepare(`
        INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance)
        VALUES ('acc_secret_vault', ?, 'Confidential Savings', 'savings', 'USD', '99999.00')
      `).run(tenantId);

      const context = getPlanningContext(db, tenantId, '2026-11-15');

      expect(context.financialContext).toBeDefined();
      expect(context.financialContext?.enabled).toBe(false);
      expect(context.financialContext?.quarantined).toBe(true);
      expect(context.financialContext?.upcomingBills).toEqual([]);
      expect(context.financialContext?.reason).toContain('Financial data quarantined');
    });

    it('allows financial records only when cross-domain permission enableFinancialInPlanning is explicitly true', () => {
      // Update preferences to enable financial context
      db.prepare(`
        UPDATE users SET preferences = ? WHERE id = ?
      `).run(
        JSON.stringify({
          workStart: '09:00',
          workEnd: '18:00',
          maxDailyWorkloadHours: '6.5',
          enableFinancialInPlanning: true,
        }),
        userId
      );

      const context = getPlanningContext(db, tenantId, '2026-11-15');

      expect(context.financialContext).toBeDefined();
      expect(context.financialContext?.enabled).toBe(true);
      expect(context.financialContext?.quarantined).toBe(false);
    });
  });

  describe('3. Intelligent Scheduling & Over-Capacity Trade-off Explanations', () => {
    it('provides clear structured explanations of what cannot fit, why, competing activities, and concrete alternatives', () => {
      const context: PlanningContext = {
        targetDate: '2026-11-18',
        workingHours: { start: '09:00', end: '17:00', maxFocusHours: 5.0 },
        existingCalendarEvents: [
          { id: 'ev_client_sync', title: 'Client Sync', startTime: '10:00', endTime: '11:00' },
        ],
      };

      // 4 tasks totalling 7.5 hours (450 minutes), exceeding 5.0h max focus capacity
      const commitments = [
        { id: 'c1', title: 'Critical Bugfix Patch', isFixed: false, durationMinutes: 120, priority: 'critical' as const },
        { id: 'c2', title: 'Database Migration Script', isFixed: false, durationMinutes: 120, priority: 'high' as const },
        { id: 'c3', title: 'Design System Documentation', isFixed: false, durationMinutes: 90, priority: 'normal' as const },
        { id: 'c4', title: 'Internal Tooling Polish', isFixed: false, durationMinutes: 120, priority: 'optional' as const },
      ];

      const proposal = buildIntelligentDailySchedule(context, commitments);

      expect(proposal.isOvercommitted).toBe(true);
      expect(proposal.capacityWarning).toBeDefined();
      const warning = proposal.capacityWarning!;

      // What cannot fit
      expect(warning.whatCannotFit?.length).toBeGreaterThan(0);
      expect(warning.suggestedDeferrals.length).toBeGreaterThan(0);

      // Why it cannot fit
      expect(warning.whyItCannotFit).toContain('exceeds daily focus capacity limit of 5h');

      // Competing activities
      expect(warning.competingActivities?.length).toBeGreaterThanOrEqual(4);
      expect(warning.competingActivities?.some(a => a.status === 'scheduled')).toBe(true);
      expect(warning.competingActivities?.some(a => a.status === 'deferred')).toBe(true);

      // Recommended trade-offs (defer, split, shorten)
      expect(warning.recommendedTradeoffs).toBeDefined();
      expect(warning.recommendedTradeoffs?.length).toBeGreaterThan(0);

      const deferOption = warning.recommendedTradeoffs?.find(t => t.type === 'defer');
      expect(deferOption).toBeDefined();
      expect(deferOption?.recommendedAction).toContain('Defer');

      const splitOption = warning.recommendedTradeoffs?.find(t => t.type === 'split');
      expect(splitOption).toBeDefined();
      expect(splitOption?.recommendedAction).toContain('Split');

      // Structured conflict summary
      expect(proposal.conflictSummary).toContain('⚠️ High Workload Conflict Detected');
      expect(proposal.conflictSummary).toContain('• What cannot fit:');
      expect(proposal.conflictSummary).toContain('• Why it cannot fit:');
      expect(proposal.conflictSummary).toContain('• Competing activities:');
      expect(proposal.conflictSummary).toContain('• Recommended trade-offs:');
    });
  });

  describe('4. Adaptive Plan Revision Preserving Unadjusted Blocks', () => {
    it('moves a target block while preserving all other existing scheduled blocks', () => {
      const context: PlanningContext = {
        targetDate: '2026-11-20',
        workingHours: { start: '09:00', end: '22:00', maxFocusHours: 7.0 },
      };

      const initialProposal: DailyPlanProposal = {
        planId: 'plan_initial_adjust',
        targetDate: '2026-11-20',
        objective: 'Productive Friday',
        totalAvailableHours: 7.0,
        estimatedWorkloadHours: 4.5,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_sync',
            title: 'Morning Team Sync',
            itemType: 'fixed_event',
            startTime: '09:30',
            endTime: '10:00',
            durationMinutes: 30,
            priority: 'high',
            isExistingTask: false,
          },
          {
            id: 'item_q3',
            title: 'Write Q3 Strategy',
            itemType: 'scheduled_task',
            startTime: '10:15',
            endTime: '12:15',
            durationMinutes: 120,
            priority: 'high',
            isExistingTask: false,
          },
          {
            id: 'item_gym',
            title: 'Gym & workout',
            itemType: 'habit',
            startTime: '13:00',
            endTime: '14:15',
            durationMinutes: 75,
            priority: 'normal',
            isExistingTask: false,
          },
          {
            id: 'item_groceries',
            title: 'Buy groceries',
            itemType: 'scheduled_task',
            startTime: '15:00',
            endTime: '15:30',
            durationMinutes: 30,
            priority: 'optional',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 2, calendarBlocksToCreate: 4, tasksToReschedule: 0 },
      };

      // Conversational adjustment: "Move gym to evening"
      const revision = reviseDailyPlan(context, initialProposal, 'Move gym to evening');

      expect(revision.changedItems).toContain('Gym & workout');
      expect(revision.preservedItems).toContain('Morning Team Sync');
      expect(revision.preservedItems).toContain('Write Q3 Strategy');
      expect(revision.preservedItems).toContain('Buy groceries');

      const gymBlock = revision.proposal.scheduledItems.find(i => i.title === 'Gym & workout')!;
      expect(gymBlock.startTime).toBe('18:00'); // Moved to evening
      expect(gymBlock.endTime).toBe('19:15');

      // Unchanged items remain at their exact prior start/end times
      const syncBlock = revision.proposal.scheduledItems.find(i => i.title === 'Morning Team Sync')!;
      expect(syncBlock.startTime).toBe('09:30');
      expect(syncBlock.endTime).toBe('10:00');

      const q3Block = revision.proposal.scheduledItems.find(i => i.title === 'Write Q3 Strategy')!;
      expect(q3Block.startTime).toBe('10:15');
      expect(q3Block.endTime).toBe('12:15');

      const groceryBlock = revision.proposal.scheduledItems.find(i => i.title === 'Buy groceries')!;
      expect(groceryBlock.startTime).toBe('15:00');
      expect(groceryBlock.endTime).toBe('15:30');
    });

    it('adds a new meeting and preserves non-overlapping blocks', () => {
      const context: PlanningContext = {
        targetDate: '2026-11-20',
        workingHours: { start: '09:00', end: '22:00', maxFocusHours: 7.0 },
      };

      const initialProposal: DailyPlanProposal = {
        planId: 'plan_add_meeting',
        targetDate: '2026-11-20',
        objective: 'Workday',
        totalAvailableHours: 7.0,
        estimatedWorkloadHours: 3.0,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_dev',
            title: 'Feature Development',
            itemType: 'scheduled_task',
            startTime: '10:00',
            endTime: '12:00',
            durationMinutes: 120,
            priority: 'high',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
      };

      const revision = reviseDailyPlan(context, initialProposal, 'I have another meeting with Alex at 14:00 for 45 minutes');

      expect(revision.changedItems).toContain('Meeting with Alex');
      expect(revision.preservedItems).toContain('Feature Development');

      const meetingBlock = revision.proposal.scheduledItems.find(i => i.title.includes('Alex'))!;
      expect(meetingBlock.startTime).toBe('14:00');
      expect(meetingBlock.endTime).toBe('14:45');

      // Feature Development block is preserved at 10:00 - 12:00
      const devBlock = revision.proposal.scheduledItems.find(i => i.title === 'Feature Development')!;
      expect(devBlock.startTime).toBe('10:00');
      expect(devBlock.endTime).toBe('12:00');
    });
  });

  describe('5. Planning Session Continuity & Interruption Across Reloads', () => {
    it('persists and restores extracted commitments, clarification questions, and proposal revisions across session reloads', () => {
      const sessionId = 'session_continuity_test_1';
      const targetDate = '2026-11-25';

      // Step 1: Save initial session during interviewing turn
      savePlanningSession(db, {
        id: sessionId,
        tenantId,
        userId,
        targetDate,
        conversation: [
          { role: 'user', content: 'Tomorrow I have a call and want to write the annual report.' },
          { role: 'assistant', content: 'What time is your call?' },
        ],
        extractedState: {
          commitments: [
            { id: 'c_call', title: 'Evening Call', isFixed: false, durationMinutes: 30, priority: 'high' },
            { id: 'c_report', title: 'Write Annual Report', isFixed: false, durationMinutes: 120, priority: 'high' },
          ],
          uncertainties: [
            {
              id: 'call_time',
              question: 'What time is your call in the evening?',
              relatedEntity: 'Evening Call',
              urgency: 'high',
            },
          ],
          clarificationQuestions: ['What time is your call in the evening?'],
          answers: {},
        },
        proposedPlan: null,
        status: 'interviewing',
      });

      // Step 2: Reload session (simulating browser reload / session restore)
      const restored1 = getPlanningSession(db, tenantId, sessionId);
      expect(restored1).not.toBeNull();
      expect(restored1?.status).toBe('interviewing');
      expect(restored1?.extractedState.commitments.length).toBe(2);
      expect(restored1?.extractedState.clarificationQuestions).toContain('What time is your call in the evening?');
      expect(restored1?.proposedPlan).toBeNull();

      // Step 3: User answers the clarification and a proposal is generated
      const proposal: DailyPlanProposal = {
        planId: 'plan_sess_res_1',
        targetDate,
        objective: 'Report & Call Focus',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 2.5,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: 'item_rep',
            title: 'Write Annual Report',
            itemType: 'scheduled_task',
            startTime: '10:00',
            endTime: '12:00',
            durationMinutes: 120,
            priority: 'high',
            isExistingTask: false,
          },
          {
            id: 'item_call',
            title: 'Evening Call',
            itemType: 'fixed_event',
            startTime: '18:00',
            endTime: '18:30',
            durationMinutes: 30,
            priority: 'high',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 2, tasksToReschedule: 0 },
      };

      savePlanningSession(db, {
        id: sessionId,
        tenantId,
        userId,
        targetDate,
        conversation: [
          ...restored1!.conversation,
          { role: 'user', content: 'Call is at 6pm' },
          { role: 'assistant', content: 'Here is your finalized schedule.' },
        ],
        extractedState: {
          commitments: [
            { id: 'c_call', title: 'Evening Call', isFixed: true, startTime: '18:00', endTime: '18:30', durationMinutes: 30, priority: 'high' },
            { id: 'c_report', title: 'Write Annual Report', isFixed: false, durationMinutes: 120, priority: 'high' },
          ],
          uncertainties: [],
          clarificationQuestions: [],
          answers: { call_time: '18:00' },
        },
        proposedPlan: proposal,
        status: 'proposed',
      });

      // Step 4: Reload again and verify proposal is intact
      const restored2 = getPlanningSession(db, tenantId, sessionId);
      expect(restored2?.status).toBe('proposed');
      expect(restored2?.extractedState.answers.call_time).toBe('18:00');
      expect(restored2?.proposedPlan?.scheduledItems.length).toBe(2);
      expect(restored2?.conversation.length).toBe(4);
    });
  });
});
