import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '@/lib/db';
import { commitApprovedDailyPlan, DailyPlanProposal } from '@/lib/productivity/planner';

describe('Task Stable Identity Hardening (Phase 4.1)', () => {
  let db: ReturnType<typeof getInMemoryDb>;
  const tenantId = 'tenant_test_task_identity';
  const userId = 'user_test_task_identity';

  beforeEach(() => {
    db = getInMemoryDb();

    db.prepare(`
      INSERT INTO tenants (id, name, slug) VALUES (?, 'Identity Test Tenant', 'id-test-tenant')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, name, preferences)
      VALUES (?, ?, 'tester@personal-os.local', 'Task Auditor', ?)
    `).run(
      userId,
      tenantId,
      JSON.stringify({ workStart: '09:00', workEnd: '18:00', maxDailyWorkloadHours: '6.5' })
    );

    db.prepare(`
      INSERT OR REPLACE INTO spaces (id, tenant_id, name, slug, icon, color, is_default)
      VALUES ('space_personal', ?, 'Personal', 'personal', 'User', '#10b981', 1)
    `).run(tenantId);
  });

  it('Requirement 1: Same plan approved twice is strictly idempotent (1 task created, not 2)', () => {
    const plan: DailyPlanProposal = {
      planId: 'plan_idempotent_test',
      targetDate: '2026-11-10',
      objective: 'Run infrastructure benchmark',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 2.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_1',
          title: 'Infrastructure Benchmark',
          itemType: 'scheduled_task',
          startTime: '09:00',
          endTime: '11:00',
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

    const firstCommit = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(firstCommit.success).toBe(true);
    expect(firstCommit.createdTasksCount).toBe(1);

    const tasksAfterFirst = db.prepare('SELECT id, title, origin_plan_item_id FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
    expect(tasksAfterFirst.length).toBe(1);
    expect(tasksAfterFirst[0].origin_plan_item_id).toBe('plan_idempotent_test:item_1');

    // Second commit (re-approval / retry of same plan)
    const secondCommit = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(secondCommit.success).toBe(true);
    expect(secondCommit.createdTasksCount).toBe(0); // ZERO new tasks created!

    const tasksAfterSecond = db.prepare('SELECT id, title, origin_plan_item_id FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
    expect(tasksAfterSecond.length).toBe(1);
    expect(tasksAfterSecond[0].id).toBe(tasksAfterFirst[0].id);
  });

  it('Requirement 2: Two different plans containing the same task title create two distinct tasks', () => {
    const planDay1: DailyPlanProposal = {
      planId: 'plan_2026-11-10',
      targetDate: '2026-11-10',
      objective: 'Morning Routine',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_day1',
          title: 'Morning Inbox Triage',
          itemType: 'scheduled_task',
          startTime: '09:00',
          endTime: '10:00',
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

    const planDay2: DailyPlanProposal = {
      planId: 'plan_2026-11-11',
      targetDate: '2026-11-11',
      objective: 'Next Day Morning Routine',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_day2',
          title: 'Morning Inbox Triage', // SAME TITLE!
          itemType: 'scheduled_task',
          startTime: '09:00',
          endTime: '10:00',
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

    const res1 = commitApprovedDailyPlan(db, tenantId, userId, planDay1);
    expect(res1.createdTasksCount).toBe(1);

    const res2 = commitApprovedDailyPlan(db, tenantId, userId, planDay2);
    expect(res2.createdTasksCount).toBe(1); // Second task created legitimately!

    const tasks = db.prepare('SELECT id, title, due_date, origin_plan_item_id FROM tasks WHERE tenant_id = ? ORDER BY due_date ASC').all(tenantId) as any[];
    expect(tasks.length).toBe(2);
    expect(tasks[0].title).toBe('Morning Inbox Triage');
    expect(tasks[1].title).toBe('Morning Inbox Triage');
    expect(tasks[0].id).not.toBe(tasks[1].id);
    expect(tasks[0].due_date).toBe('2026-11-10');
    expect(tasks[1].due_date).toBe('2026-11-11');
    expect(tasks[0].origin_plan_item_id).toBe('plan_2026-11-10:item_day1');
    expect(tasks[1].origin_plan_item_id).toBe('plan_2026-11-11:item_day2');
  });

  it('Requirement 3: Same task title with different deadlines remain independent and do not overwrite deadlines', () => {
    const plan1: DailyPlanProposal = {
      planId: 'plan_tax_nov',
      targetDate: '2026-11-15',
      objective: 'Q3 Prep',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.5,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_tax1',
          title: 'Prepare Tax Filing',
          itemType: 'scheduled_task',
          startTime: '10:00',
          endTime: '11:30',
          durationMinutes: 90,
          priority: 'high',
          isExistingTask: false,
        },
      ],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: [],
      diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
    };

    const plan2: DailyPlanProposal = {
      planId: 'plan_tax_dec',
      targetDate: '2026-12-15',
      objective: 'Annual Tax Review',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.5,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_tax2',
          title: 'Prepare Tax Filing', // SAME TITLE!
          itemType: 'scheduled_task',
          startTime: '10:00',
          endTime: '11:30',
          durationMinutes: 90,
          priority: 'high',
          isExistingTask: false,
        },
      ],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: [],
      diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
    };

    commitApprovedDailyPlan(db, tenantId, userId, plan1);
    commitApprovedDailyPlan(db, tenantId, userId, plan2);

    const tasks = db.prepare('SELECT id, due_date FROM tasks WHERE tenant_id = ? AND title = ? ORDER BY due_date ASC').all(tenantId, 'Prepare Tax Filing') as any[];
    expect(tasks.length).toBe(2);
    expect(tasks[0].due_date).toBe('2026-11-15');
    expect(tasks[1].due_date).toBe('2026-12-15'); // First deadline was NOT overwritten!
  });

  it('Requirement 4: Recurring tasks with identical titles are created as distinct task instances', () => {
    // Generate 3 recurring days
    for (let day = 1; day <= 3; day++) {
      const planDate = `2026-11-0${day}`;
      const plan: DailyPlanProposal = {
        planId: `plan_recur_${planDate}`,
        targetDate: planDate,
        objective: 'Daily Standup',
        totalAvailableHours: 6.5,
        estimatedWorkloadHours: 0.5,
        isOvercommitted: false,
        overloadHours: 0,
        scheduledItems: [
          {
            id: `item_standup_${day}`,
            title: 'Daily Team Sync',
            itemType: 'scheduled_task',
            startTime: '09:30',
            endTime: '10:00',
            durationMinutes: 30,
            priority: 'normal',
            isExistingTask: false,
          },
        ],
        suggestedDeferrals: [],
        identifiedUncertainties: [],
        assumptions: [],
        diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
      };
      commitApprovedDailyPlan(db, tenantId, userId, plan);
    }

    const tasks = db.prepare('SELECT id, due_date FROM tasks WHERE tenant_id = ? AND title = ? ORDER BY due_date ASC').all(tenantId, 'Daily Team Sync') as any[];
    expect(tasks.length).toBe(3);
    expect(tasks.map(t => t.due_date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('Requirement 5: Same title in separate projects maintains distinct records', () => {
    // Seed 2 projects
    db.prepare(`
      INSERT INTO projects (id, tenant_id, name, status) VALUES 
      ('proj_alpha', ?, 'Project Alpha', 'active'),
      ('proj_beta', ?, 'Project Beta', 'active')
    `).run(tenantId, tenantId);

    // Plan with 2 tasks with identical title "Architecture RFC" for two different projects
    const plan: DailyPlanProposal = {
      planId: 'plan_multi_project',
      targetDate: '2026-11-12',
      objective: 'Cross-project Architecture',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 3.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_rfc_alpha',
          title: 'Architecture RFC',
          itemType: 'scheduled_task',
          startTime: '10:00',
          endTime: '11:30',
          durationMinutes: 90,
          priority: 'high',
          isExistingTask: false,
        },
        {
          id: 'item_rfc_beta',
          title: 'Architecture RFC',
          itemType: 'scheduled_task',
          startTime: '13:00',
          endTime: '14:30',
          durationMinutes: 90,
          priority: 'high',
          isExistingTask: false,
        },
      ],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: [],
      diffSummary: { tasksToCreate: 2, calendarBlocksToCreate: 2, tasksToReschedule: 0 },
    };

    const res = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(res.createdTasksCount).toBe(2);

    const tasks = db.prepare('SELECT id, title, origin_plan_item_id FROM tasks WHERE tenant_id = ? AND title = ?').all(tenantId, 'Architecture RFC') as any[];
    expect(tasks.length).toBe(2);
    expect(tasks[0].id).not.toBe(tasks[1].id);
    expect(tasks[0].origin_plan_item_id).toBe('plan_multi_project:item_rfc_alpha');
    expect(tasks[1].origin_plan_item_id).toBe('plan_multi_project:item_rfc_beta');
  });

  it('Requirement 6: Existing manually created task is preserved; AI-generated task with same title is created independently', () => {
    // Manually created task on the board with specific status and notes
    const manualTaskId = 'task_manual_user_custom';
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, due_date, status, description, space_id)
      VALUES (?, ?, 'Quarterly Investor Update', 'urgent', '2026-11-20', 'in_progress', 'Do not overwrite this custom note', 'space_personal')
    `).run(manualTaskId, tenantId);

    // AI Plan proposal containing a task with the same title
    const plan: DailyPlanProposal = {
      planId: 'plan_ai_generated_pitch',
      targetDate: '2026-11-12',
      objective: 'Pitch Prep',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 2.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_pitch_1',
          title: 'Quarterly Investor Update', // SAME TITLE as manual task!
          itemType: 'scheduled_task',
          startTime: '14:00',
          endTime: '16:00',
          durationMinutes: 120,
          priority: 'normal',
          isExistingTask: false,
        },
      ],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: [],
      diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
    };

    const res = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(res.createdTasksCount).toBe(1);

    // Check manual task: completely preserved!
    const manualTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(manualTaskId) as any;
    expect(manualTask.title).toBe('Quarterly Investor Update');
    expect(manualTask.status).toBe('in_progress');
    expect(manualTask.due_date).toBe('2026-11-20'); // NOT overwritten!
    expect(manualTask.priority).toBe('urgent');     // NOT overwritten!
    expect(manualTask.description).toBe('Do not overwrite this custom note');
    expect(manualTask.origin_plan_item_id).toBeNull();

    // Check AI task: created as its own independent entity
    const aiTasks = db.prepare('SELECT * FROM tasks WHERE tenant_id = ? AND origin_plan_item_id = ?').all(tenantId, 'plan_ai_generated_pitch:item_pitch_1') as any[];
    expect(aiTasks.length).toBe(1);
    expect(aiTasks[0].id).not.toBe(manualTaskId);
    expect(aiTasks[0].due_date).toBe('2026-11-12');
  });

  it('Requirement 7: Completed task mentioned again in a new plan creates a new task; completed task remains completed', () => {
    // Previous completed task
    const completedTaskId = 'task_completed_yesterday';
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, due_date, status, completion_at, space_id)
      VALUES (?, ?, 'Read Research Paper', 'normal', '2026-11-09', 'completed', '2026-11-09 17:00:00', 'space_personal')
    `).run(completedTaskId, tenantId);

    // New plan mentions "Read Research Paper"
    const newPlan: DailyPlanProposal = {
      planId: 'plan_today_review',
      targetDate: '2026-11-10',
      objective: 'Follow-up reading',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.0,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_reading_2',
          title: 'Read Research Paper',
          itemType: 'scheduled_task',
          startTime: '10:00',
          endTime: '11:00',
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

    const res = commitApprovedDailyPlan(db, tenantId, userId, newPlan);
    expect(res.createdTasksCount).toBe(1);

    // Verify completed task is still completed with original timestamp
    const oldTask = db.prepare('SELECT status, completion_at FROM tasks WHERE id = ?').get(completedTaskId) as any;
    expect(oldTask.status).toBe('completed');
    expect(oldTask.completion_at).toBe('2026-11-09 17:00:00');

    // Verify new task is created with status 'next'
    const newTasks = db.prepare('SELECT id, status, due_date FROM tasks WHERE tenant_id = ? AND origin_plan_item_id = ?').all(tenantId, 'plan_today_review:item_reading_2') as any[];
    expect(newTasks.length).toBe(1);
    expect(newTasks[0].id).not.toBe(completedTaskId);
    expect(newTasks[0].status).toBe('next');
    expect(newTasks[0].due_date).toBe('2026-11-10');
  });

  it('Requirement 8: Scheduling an existing backlog task via linkedTaskId updates its due_date without duplicating', () => {
    // 1. Seed existing backlog task in inbox
    const backlogTaskId = 'task_backlog_refactor_core';
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, estimated_duration, space_id)
      VALUES (?, ?, 'Refactor Core Productivity Engine', 'high', 'inbox', 90, 'space_personal')
    `).run(backlogTaskId, tenantId);

    const initialTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(backlogTaskId) as any;
    expect(initialTask.status).toBe('inbox');
    expect(initialTask.due_date).toBeNull();

    // 2. Daily plan referencing existing backlog task via linkedTaskId
    const plan: DailyPlanProposal = {
      planId: 'plan_scheduled_backlog_work',
      targetDate: '2026-11-12',
      objective: 'Core Refactor Focus',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 1.5,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_refactor_block',
          title: 'Refactor Core Productivity Engine',
          itemType: 'scheduled_task',
          startTime: '10:00',
          endTime: '11:30',
          durationMinutes: 90,
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

    // 3. Commit approved plan
    const commitResult = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(commitResult.success).toBe(true);
    expect(commitResult.createdTasksCount).toBe(0); // STRICTLY 0 new tasks created!

    // Verify task count in database: still exactly 1 task
    const allTasks = db.prepare('SELECT * FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
    expect(allTasks.length).toBe(1);

    // Verify backlog task was updated in place
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(backlogTaskId) as any;
    expect(updatedTask.id).toBe(backlogTaskId);
    expect(updatedTask.due_date).toBe('2026-11-12'); // Scheduled date updated!
    expect(updatedTask.status).toBe('next');          // Advanced from 'inbox' to 'next'!

    // Verify daily_plan_items and calendar_events linked to the exact existing task ID
    const planItem = db.prepare('SELECT * FROM daily_plan_items WHERE plan_id = ?').get(commitResult.planId) as any;
    expect(planItem.task_id).toBe(backlogTaskId);

    const calEvent = db.prepare('SELECT * FROM calendar_events WHERE tenant_id = ? AND date(start_time) = ?').get(tenantId, '2026-11-12') as any;
    expect(calEvent.task_id).toBe(backlogTaskId);

    // 4. Repeated approval is strictly idempotent
    const secondCommit = commitApprovedDailyPlan(db, tenantId, userId, plan);
    expect(secondCommit.success).toBe(true);
    expect(secondCommit.createdTasksCount).toBe(0);

    const tasksAfterRetry = db.prepare('SELECT * FROM tasks WHERE tenant_id = ?').all(tenantId) as any[];
    expect(tasksAfterRetry.length).toBe(1);
    expect(tasksAfterRetry[0].id).toBe(backlogTaskId);
  });
});

