import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  calculateProjectProgress,
  calculateGoalProgress,
  calculateHabitStreak,
  generateDailyPlanProposal,
} from '../lib/productivity/engine';
import type Database from 'better-sqlite3';

describe('Productivity Domain Engine', () => {
  let db: Database.Database;
  const tenantId = 'tenant_prod_test';

  beforeEach(() => {
    db = getInMemoryDb();
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Test Prod Tenant', 'prod-test')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES ('u_prod', ?, 'p@test.local', 'Prod Tester')").run(tenantId);
  });

  describe('Project Progress Calculations', () => {
    it('calculates completion-based progress (completed / total tasks)', () => {
      db.prepare(`
        INSERT INTO projects (id, tenant_id, name, progress_method)
        VALUES ('proj_1', ?, 'Alpha Launch', 'completion')
      `).run(tenantId);

      db.prepare(`
        INSERT INTO tasks (id, tenant_id, project_id, title, status)
        VALUES 
          ('t1', ?, 'proj_1', 'Task 1', 'completed'),
          ('t2', ?, 'proj_1', 'Task 2', 'completed'),
          ('t3', ?, 'proj_1', 'Task 3', 'in_progress'),
          ('t4', ?, 'proj_1', 'Task 4', 'inbox')
      `).run(tenantId, tenantId, tenantId, tenantId);

      const prog = calculateProjectProgress(db, tenantId, 'proj_1');
      // 2 completed out of 4 total tasks = 50%
      expect(prog?.progressPercentage).toBe(50);
      expect(prog?.completedTasks).toBe(2);
      expect(prog?.totalTasks).toBe(4);
    });

    it('calculates weighted task progress based on estimated durations', () => {
      db.prepare(`
        INSERT INTO projects (id, tenant_id, name, progress_method)
        VALUES ('proj_w', ?, 'Beta Engineering', 'weighted')
      `).run(tenantId);

      db.prepare(`
        INSERT INTO tasks (id, tenant_id, project_id, title, status, estimated_duration)
        VALUES 
          ('t1', ?, 'proj_w', 'Big architecture piece', 'completed', 90),
          ('t2', ?, 'proj_w', 'Minor bugfix', 'in_progress', 10),
          ('t3', ?, 'proj_w', 'Doc update', 'inbox', 20)
      `).run(tenantId, tenantId, tenantId);

      const prog = calculateProjectProgress(db, tenantId, 'proj_w');
      // Total estimated = 90 + 10 + 20 = 120; Completed = 90; 90 / 120 = 75%
      expect(prog?.progressPercentage).toBe(75);
    });

    it('calculates milestone-based progress', () => {
      db.prepare(`
        INSERT INTO projects (id, tenant_id, name, progress_method)
        VALUES ('proj_m', ?, 'Marketing Campaign', 'milestone')
      `).run(tenantId);

      db.prepare(`
        INSERT INTO project_milestones (id, tenant_id, project_id, title, is_completed)
        VALUES 
          ('m1', ?, 'proj_m', 'Copy approval', 1),
          ('m2', ?, 'proj_m', 'Design signoff', 1),
          ('m3', ?, 'proj_m', 'Launch live', 0)
      `).run(tenantId, tenantId, tenantId);

      const prog = calculateProjectProgress(db, tenantId, 'proj_m');
      // 2 of 3 milestones completed = 67%
      expect(prog?.progressPercentage).toBe(67);
      expect(prog?.completedMilestones).toBe(2);
      expect(prog?.totalMilestones).toBe(3);
    });
  });

  describe('Goal Progress Calculations', () => {
    it('handles ascending goals with start, current, and target values', () => {
      db.prepare(`
        INSERT INTO goals (id, tenant_id, title, direction, start_value, current_value, target_value)
        VALUES ('g_asc', ?, 'Savings Target', 'ascending', 0, 75, 100)
      `).run(tenantId);

      const res = calculateGoalProgress(db, tenantId, 'g_asc');
      expect(res?.progressPercentage).toBe(75);
    });

    it('handles descending targets correctly (e.g. weight reduction)', () => {
      db.prepare(`
        INSERT INTO goals (id, tenant_id, title, direction, start_value, current_value, target_value)
        VALUES ('g_desc', ?, 'Weight Loss Goal', 'descending', 90, 82.5, 75)
      `).run(tenantId);

      // Total delta needed = 90 - 75 = 15; Current delta made = 90 - 82.5 = 7.5; 7.5 / 15 = 50%
      const res = calculateGoalProgress(db, tenantId, 'g_desc');
      expect(res?.progressPercentage).toBe(50);
    });
  });

  describe('Habit Streaks & Schedules', () => {
    it('calculates consecutive habit streaks and respects missed days', () => {
      db.prepare(`
        INSERT INTO habits (id, tenant_id, title, tracking_type, target_value, minimum_threshold, schedule_type, start_date)
        VALUES ('h_med', ?, 'Daily Meditation', 'duration', 15, 10, 'daily', '2026-10-01')
      `).run(tenantId);

      // Log 3 consecutive days
      db.prepare(`
        INSERT INTO habit_logs (id, tenant_id, habit_id, log_date, value, status)
        VALUES 
          ('l1', ?, 'h_med', '2026-10-18', 15, 'completed'),
          ('l2', ?, 'h_med', '2026-10-19', 20, 'completed'),
          ('l3', ?, 'h_med', '2026-10-20', 15, 'completed')
      `).run(tenantId, tenantId, tenantId);

      const streak = calculateHabitStreak(db, tenantId, 'h_med', '2026-10-20');
      expect(streak?.currentStreak).toBe(3);
      expect(streak?.isCompletedToday).toBe(true);

      // If we query on a later date where yesterday was missing, streak drops to 0
      const brokenStreak = calculateHabitStreak(db, tenantId, 'h_med', '2026-10-25');
      expect(brokenStreak?.currentStreak).toBe(0);
      expect(brokenStreak?.isCompletedToday).toBe(false);
    });
  });

  describe('Daily Planning Generator', () => {
    it('prioritizes urgent tasks and produces realistic time block proposals', () => {
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, priority, estimated_duration, due_date)
        VALUES 
          ('tk_urg', ?, 'Fix Critical Database Lock', 'urgent', 60, '2026-10-29'),
          ('tk_hi', ?, 'Draft Quarterly Proposal', 'high', 45, '2026-10-29'),
          ('tk_norm', ?, 'Organize Notes', 'normal', 30, null)
      `).run(tenantId, tenantId, tenantId);

      const plan = generateDailyPlanProposal(db, tenantId, '2026-10-29');
      expect(plan.topPriorities.length).toBeGreaterThanOrEqual(2);
      expect(plan.topPriorities[0].title).toBe('Fix Critical Database Lock');
      expect(plan.proposedTimeBlocks.length).toBeGreaterThanOrEqual(2);
    });

    it('places blocks on a real minute axis instead of dropping minutes', () => {
      // A 45-minute task used to be emitted as 09:00–09:45 with the next block
      // starting at 10:00 only by accident of integer-hour rounding; the minute
      // slot was derived from the remainder, so 90-minute tasks came out wrong.
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, priority, estimated_duration)
        VALUES ('tk_45', ?, 'Forty Five', 'high', 45),
               ('tk_90', ?, 'Ninety', 'normal', 90)
      `).run(tenantId, tenantId);

      const plan = generateDailyPlanProposal(db, tenantId, '2026-10-29');
      const first = plan.proposedTimeBlocks[0];
      expect(first.startTime).toBe('2026-10-29T09:00:00');
      expect(first.endTime).toBe('2026-10-29T09:45:00');

      const second = plan.proposedTimeBlocks[1];
      // Contiguous: the next block starts exactly when the previous one ends.
      expect(second.startTime).toBe('2026-10-29T09:45:00');
      expect(second.endTime).toBe('2026-10-29T11:15:00');
    });

    it('never proposes a block past the configured end of day or focus ceiling', () => {
      db.prepare(`
        UPDATE users SET preferences = ? WHERE id = 'u_prod'
      `).run(JSON.stringify({ workStart: '09:00', workEnd: '10:00', maxDailyWorkloadHours: '1' }));
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, priority, estimated_duration)
        VALUES ('tk_big', ?, 'Two Hour Task', 'urgent', 120),
               ('tk_small', ?, 'Half Hour Task', 'normal', 30)
      `).run(tenantId, tenantId);

      const plan = generateDailyPlanProposal(db, tenantId, '2026-10-29');
      // A 2h task cannot fit a 1h day; the 30m one can.
      expect(plan.proposedTimeBlocks.map(block => block.title)).toEqual(['Half Hour Task']);
      expect(plan.proposedTimeBlocks[0].endTime).toBe('2026-10-29T09:30:00');
      for (const block of plan.proposedTimeBlocks) {
        expect(block.endTime.localeCompare('2026-10-29T10:00:00')).toBeLessThanOrEqual(0);
      }
      // Reported workload reflects what was actually placed.
      expect(plan.estimatedWorkloadHours).toBe('0.5');
    });
  });

  describe('Test Fixture Quarantine & Operational Audit Integrity', () => {
    it('quarantines test fixtures while preserving audit origin and excluding them from active views', () => {
      // Insert genuine operational task
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, status, priority, due_date)
        VALUES ('task_real_ops', ?, 'Deploy Production Edge Worker', 'next', 'urgent', '2026-11-08')
      `).run(tenantId);

      // Insert restored test fixture with origin metadata
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, title, status, priority, due_date, origin_plan_item_id)
        VALUES ('task_overdue_test_1794052214275', ?, 'Finish Operating Systems Lab', 'quarantined', 'urgent', '2026-11-08', 'restored_origin_task_overdue_test_1794052214275')
      `).run(tenantId);

      // Verify DB audit integrity: record exists with origin_plan_item_id intact
      const fixtureRecord = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_overdue_test_1794052214275') as any;
      expect(fixtureRecord).toBeDefined();
      expect(fixtureRecord.status).toBe('quarantined');
      expect(fixtureRecord.origin_plan_item_id).toBe('restored_origin_task_overdue_test_1794052214275');

      // Operational task query (filter out quarantined/test fixture items)
      const isFixture = (t: any) => t.status === 'quarantined' || t.id.includes('test') || t.id.includes('fixture');
      const allTasks = db.prepare('SELECT * FROM tasks WHERE tenant_id = ? AND is_deleted = 0').all(tenantId) as any[];
      const operationalTasks = allTasks.filter(t => !isFixture(t));

      expect(operationalTasks.length).toBe(1);
      expect(operationalTasks[0].id).toBe('task_real_ops');
      expect(operationalTasks.some(t => t.id === 'task_overdue_test_1794052214275')).toBe(false);
    });
  });
});

