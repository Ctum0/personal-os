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
  });
});
