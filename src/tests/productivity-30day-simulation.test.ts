import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import {
  calculateProjectProgress,
  calculateHabitStreak,
} from '../lib/productivity/engine';
import { commitApprovedDailyPlan, DailyPlanProposal } from '../lib/productivity/planner';
import type Database from 'better-sqlite3';

describe('30-Day Productivity Operational Simulation', () => {
  let db: Database.Database;
  const tenantId = 'tenant_30day_sim';
  const userId = 'user_30day_sim';

  beforeEach(() => {
    db = getInMemoryDb();

    // 1. Establish tenant, user, default spaces
    db.prepare(`
      INSERT INTO tenants (id, name, slug) VALUES (?, '30-Day Simulation Tenant', 'sim-tenant')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, name, preferences)
      VALUES (?, ?, 'sim@os.local', 'Sim Operator', ?)
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

  it('runs a continuous 30-day productivity lifecycle across month boundaries (Oct 15 - Nov 13)', () => {
    // =========================================================================
    // DAY 1 (2026-10-15): Planning session, schedule approval, execution
    // =========================================================================
    const day1Plan: DailyPlanProposal = {
      planId: 'plan_2026-10-15',
      targetDate: '2026-10-15',
      objective: 'Core Architecture Foundation',
      totalAvailableHours: 6.5,
      estimatedWorkloadHours: 2.5,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: [
        {
          id: 'item_day1_arch',
          title: 'Design Core Architecture Schema',
          itemType: 'scheduled_task',
          startTime: '09:30',
          endTime: '11:00',
          durationMinutes: 90,
          priority: 'urgent',
          isExistingTask: false,
        },
      ],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: ['Approved in morning planning session'],
      diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
    };

    const day1Commit = commitApprovedDailyPlan(db, tenantId, userId, day1Plan);
    expect(day1Commit.success).toBe(true);
    expect(day1Commit.createdTasksCount).toBe(1);

    // Verify task created with stable origin
    const day1Task = db.prepare(`
      SELECT id, title, status, due_date, origin_plan_item_id
      FROM tasks
      WHERE tenant_id = ? AND origin_plan_item_id = 'plan_2026-10-15:item_day1_arch'
    `).get(tenantId) as any;
    expect(day1Task).toBeDefined();
    expect(day1Task.title).toBe('Design Core Architecture Schema');
    expect(day1Task.due_date).toBe('2026-10-15');

    // Execute Day 1: complete task and record focus session
    db.prepare(`
      UPDATE tasks 
      SET status = 'completed', actual_duration = 90, completion_at = '2026-10-15 11:00:00'
      WHERE id = ?
    `).run(day1Task.id);

    db.prepare(`
      INSERT INTO focus_sessions (id, tenant_id, task_id, planned_duration, actual_duration, started_at, ended_at, status, notes)
      VALUES ('focus_day1', ?, ?, 90, 90, '2026-10-15 09:30:00', '2026-10-15 11:00:00', 'completed', 'Architecture deep work block')
    `).run(tenantId, day1Task.id);

    const day1Executed = db.prepare('SELECT status, actual_duration FROM tasks WHERE id = ?').get(day1Task.id) as any;
    expect(day1Executed.status).toBe('completed');
    expect(day1Executed.actual_duration).toBe(90);

    // =========================================================================
    // DAY 5 (2026-10-19): Urgent task interrupts schedule, adaptive rescheduling
    // =========================================================================
    // Planned task for Day 5
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, due_date, estimated_duration)
      VALUES ('task_day5_planned', ?, 'Write Monthly Newsletter Draft', 'normal', 'next', '2026-10-19', 60)
    `).run(tenantId);

    // Urgent interrupt arrives unexpectedly
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, due_date, estimated_duration)
      VALUES ('task_day5_urgent', ?, 'Hotfix Production SSL Handshake Failure', 'urgent', 'in_progress', '2026-10-19', 120)
    `).run(tenantId);

    // Adaptive rescheduling: planned task postponed to tomorrow with audit trail
    db.prepare(`
      UPDATE tasks SET due_date = '2026-10-20' WHERE id = 'task_day5_planned'
    `).run();

    db.prepare(`
      INSERT INTO task_rescheduling_history (id, tenant_id, task_id, original_date, new_date, action_type, reason, rescheduled_at)
      VALUES ('resched_day5', ?, 'task_day5_planned', '2026-10-19', '2026-10-20', 'rescheduled', 'Interrupted by urgent production hotfix', '2026-10-19 14:15:00')
    `).run(tenantId);

    // Urgent task completes on Day 5
    db.prepare(`
      UPDATE tasks 
      SET status = 'completed', actual_duration = 110, completion_at = '2026-10-19 16:30:00'
      WHERE id = 'task_day5_urgent'
    `).run();

    db.prepare(`
      INSERT INTO focus_sessions (id, tenant_id, task_id, planned_duration, actual_duration, started_at, ended_at, status, notes)
      VALUES ('focus_day5', ?, 'task_day5_urgent', 120, 110, '2026-10-19 14:30:00', '2026-10-19 16:20:00', 'completed', 'Hotfix triage')
    `).run(tenantId);

    const reschedHistoryDay5 = db.prepare('SELECT * FROM task_rescheduling_history WHERE id = ?').get('resched_day5') as any;
    expect(reschedHistoryDay5.original_date).toBe('2026-10-19');
    expect(reschedHistoryDay5.new_date).toBe('2026-10-20');
    expect(reschedHistoryDay5.reason).toContain('urgent production hotfix');

    // =========================================================================
    // DAY 10 (2026-10-24): Task missed, carried over to next day with audit trail
    // =========================================================================
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, due_date, estimated_duration)
      VALUES ('task_day10_missed', ?, 'Quarterly Tax Documentation Review', 'high', 'next', '2026-10-24', 90)
    `).run(tenantId);

    // Carried over to Day 11 (2026-10-25) during daily shutdown / review
    db.prepare(`
      UPDATE tasks SET due_date = '2026-10-25' WHERE id = 'task_day10_missed'
    `).run();

    db.prepare(`
      INSERT INTO task_rescheduling_history (id, tenant_id, task_id, original_date, new_date, action_type, reason, rescheduled_at)
      VALUES ('resched_day10', ?, 'task_day10_missed', '2026-10-24', '2026-10-25', 'rescheduled', 'Task missed, carried over to next day', '2026-10-24 18:30:00')
    `).run(tenantId);

    const reschedDay10 = db.prepare('SELECT * FROM task_rescheduling_history WHERE id = ?').get('resched_day10') as any;
    expect(reschedDay10.original_date).toBe('2026-10-24');
    expect(reschedDay10.new_date).toBe('2026-10-25');
    expect(reschedDay10.action_type).toBe('rescheduled');

    // =========================================================================
    // DAY 15 (2026-10-29): Recurring habits and routines logged
    // =========================================================================
    db.prepare(`
      INSERT INTO habits (id, tenant_id, title, tracking_type, target_value, minimum_threshold, schedule_type, start_date)
      VALUES ('h_sim_meditation', ?, 'Daily Mindfulness & Meditation', 'duration', 15, 10, 'daily', '2026-10-15')
    `).run(tenantId);

    // Log 15 consecutive days from Day 1 (Oct 15) to Day 15 (Oct 29)
    for (let day = 15; day <= 29; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
      db.prepare(`
        INSERT INTO habit_logs (id, tenant_id, habit_id, log_date, value, status)
        VALUES (?, ?, 'h_sim_meditation', ?, 15, 'completed')
      `).run(`log_med_${dateStr}`, tenantId, dateStr);
    }

    const streakResult = calculateHabitStreak(db, tenantId, 'h_sim_meditation', '2026-10-29');
    expect(streakResult).not.toBeNull();
    expect(streakResult?.currentStreak).toBe(15);
    expect(streakResult?.isCompletedToday).toBe(true);
    expect(streakResult?.completionRatePercent).toBe(100);

    // =========================================================================
    // DAY 20 (2026-11-03): Project milestone tasks completed (crossing month boundary)
    // =========================================================================
    db.prepare(`
      INSERT INTO projects (id, tenant_id, name, progress_method, status)
      VALUES ('proj_sim_launch', ?, 'Personal OS Alpha Public Launch', 'milestone', 'active')
    `).run(tenantId);

    db.prepare(`
      INSERT INTO project_milestones (id, tenant_id, project_id, title, is_completed)
      VALUES 
        ('m_sim_1', ?, 'proj_sim_launch', 'Architecture Design & Security Signoff', 1),
        ('m_sim_2', ?, 'proj_sim_launch', 'Hardening & Multi-Platform PWA Support', 1),
        ('m_sim_3', ?, 'proj_sim_launch', 'Public Launch Deployment & Release Notes', 0)
    `).run(tenantId, tenantId, tenantId);

    // Tasks under project
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, project_id, title, status, due_date, completion_at)
      VALUES 
        ('t_proj_1', ?, 'proj_sim_launch', 'Sign off schema', 'completed', '2026-11-01', '2026-11-01 10:00:00'),
        ('t_proj_2', ?, 'proj_sim_launch', 'Implement icon pwa', 'completed', '2026-11-03', '2026-11-03 14:00:00'),
        ('t_proj_3', ?, 'proj_sim_launch', 'Deploy to edge', 'inbox', '2026-11-14', NULL)
    `).run(tenantId, tenantId, tenantId);

    const projProgress = calculateProjectProgress(db, tenantId, 'proj_sim_launch');
    expect(projProgress).not.toBeNull();
    // 2 completed out of 3 milestones = 67%
    expect(projProgress?.completedMilestones).toBe(2);
    expect(projProgress?.totalMilestones).toBe(3);
    expect(projProgress?.progressPercentage).toBe(67);

    // =========================================================================
    // DAY 28 (2026-11-11): Weekly review generated with genuine completed vs missed statistics
    // =========================================================================
    // Completed tasks in rolling 7 days (2026-11-04 to 2026-11-11)
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, due_date, completion_at)
      VALUES 
        ('t_rev_w4_1', ?, 'Database snapshot backup verified', 'high', 'completed', '2026-11-06', '2026-11-06 12:00:00'),
        ('t_rev_w4_2', ?, 'Client integration contract test', 'normal', 'completed', '2026-11-08', '2026-11-08 17:00:00'),
        ('t_rev_w4_3', ?, 'Refactor productivity page layouts', 'high', 'completed', '2026-11-10', '2026-11-10 15:30:00')
    `).run(tenantId, tenantId, tenantId);

    // Incomplete/missed task in the review window
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, priority, status, due_date)
      VALUES ('t_rev_w4_missed', ?, 'Update developer API reference guides', 'normal', 'next', '2026-11-07')
    `).run(tenantId);

    const reviewStartDate = '2026-11-04';
    const reviewEndDate = '2026-11-11';

    const completedInReviewWindow = db.prepare(`
      SELECT count(*) as count 
      FROM tasks 
      WHERE tenant_id = ? AND status = 'completed' AND is_deleted = 0
      AND date(completion_at) >= ? AND date(completion_at) <= ?
    `).get(tenantId, reviewStartDate, reviewEndDate) as { count: number };

    const missedInReviewWindow = db.prepare(`
      SELECT count(*) as count 
      FROM tasks 
      WHERE tenant_id = ? AND status != 'completed' AND is_deleted = 0
      AND due_date IS NOT NULL AND due_date < ?
    `).get(tenantId, '2026-11-11') as { count: number };

    expect(completedInReviewWindow.count).toBe(3);
    expect(missedInReviewWindow.count).toBeGreaterThanOrEqual(1);

    // Save weekly review note into users.preferences
    const reviewNoteEntry = {
      weekEnding: '2026-11-11',
      completedCount: completedInReviewWindow.count,
      missedCount: missedInReviewWindow.count,
      reflection: 'Consistent execution throughout Week 4 with 3 core engineering objectives delivered on-time.',
      nextWeekCommitments: 'Ship production launch on Day 30',
      savedAt: '2026-11-11 18:00:00',
    };

    const userRecord = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const currentPrefs = JSON.parse(userRecord.preferences || '{}');
    currentPrefs.weeklyReviews = [reviewNoteEntry];
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(currentPrefs), userId);

    const updatedUser = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const storedReviews = JSON.parse(updatedUser.preferences).weeklyReviews;
    expect(storedReviews.length).toBe(1);
    expect(storedReviews[0].completedCount).toBe(3);
    expect(storedReviews[0].reflection).toContain('Consistent execution');

    // =========================================================================
    // DAY 30 (2026-11-13): Range filtering across 7d, 30d, 90d analytics & quarantine
    // =========================================================================
    // Insert additional focus session on Day 29
    db.prepare(`
      INSERT INTO focus_sessions (id, tenant_id, task_id, planned_duration, actual_duration, started_at, ended_at, status, notes)
      VALUES ('focus_day29', ?, 't_rev_w4_3', 60, 60, '2026-11-12 10:00:00', '2026-11-12 11:00:00', 'completed', 'Final polish')
    `).run(tenantId);

    // Ensure quarantined test fixture does NOT pollute analytics
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, status, priority, due_date, origin_plan_item_id)
      VALUES ('task_overdue_test_1794052214275', ?, 'Finish Operating Systems Lab', 'quarantined', 'urgent', '2026-11-08', 'restored_origin_task_overdue_test_1794052214275')
    `).run(tenantId);

    const calculateAnalyticsForWindow = (days: number) => {
      const today = '2026-11-13';
      const startDate = days === 7 ? '2026-11-06' : (days === 30 ? '2026-10-14' : '2026-08-15');

      // 1. Completed tasks excluding test/quarantined fixtures
      const completed = db.prepare(`
        SELECT id, due_date, completion_at, actual_duration
        FROM tasks
        WHERE tenant_id = ? AND is_deleted = 0 AND status = 'completed'
        AND status != 'quarantined' AND id NOT LIKE '%test%'
        AND date(completion_at) >= ? AND date(completion_at) <= ?
      `).all(tenantId, startDate, today) as any[];

      // 2. On-time delivery rate
      let onTimeCount = 0;
      let withDueDateCount = 0;
      completed.forEach(t => {
        if (t.due_date && t.completion_at) {
          withDueDateCount++;
          if (t.completion_at.slice(0, 10) <= t.due_date) {
            onTimeCount++;
          }
        }
      });
      const onTimeRate = withDueDateCount > 0 ? Math.round((onTimeCount / withDueDateCount) * 100) : null;

      // 3. Reschedule frequency
      const rescheduleCount = (db.prepare(`
        SELECT count(*) as count
        FROM task_rescheduling_history
        WHERE tenant_id = ? AND date(rescheduled_at) >= ? AND date(rescheduled_at) <= ?
      `).get(tenantId, startDate, today) as any).count;

      // 4. Focus minutes
      const focusMinutes = (db.prepare(`
        SELECT coalesce(sum(actual_duration), 0) as total
        FROM focus_sessions
        WHERE tenant_id = ? AND date(started_at) >= ? AND date(started_at) <= ?
      `).get(tenantId, startDate, today) as any).total;

      return {
        completedCount: completed.length,
        onTimeRate,
        rescheduleCount,
        focusMinutes,
      };
    };

    const stats7d = calculateAnalyticsForWindow(7);
    const stats30d = calculateAnalyticsForWindow(30);

    // 7-day window contains: t_rev_w4_1, t_rev_w4_2, t_rev_w4_3
    expect(stats7d.completedCount).toBe(3);
    expect(stats7d.onTimeRate).toBe(100); // All 3 completed on or before due date
    expect(stats7d.rescheduleCount).toBe(0); // Day 5 & 10 reschedules happened earlier than 7 days ago
    expect(stats7d.focusMinutes).toBe(60); // Only focus_day29 (60m) in 7d

    // 30-day window encompasses Day 1 to Day 30
    expect(stats30d.completedCount).toBeGreaterThanOrEqual(5);
    expect(stats30d.rescheduleCount).toBe(2); // Day 5 (interrupt) + Day 10 (missed rollover)
    expect(stats30d.focusMinutes).toBe(90 + 110 + 60); // 260 total focus minutes
    expect(stats30d.onTimeRate).toBe(100);

    // Verify test fixture quarantine: ensure quarantined task is absent from operational tasks
    const activeTasks = db.prepare(`
      SELECT id FROM tasks 
      WHERE tenant_id = ? AND is_deleted = 0 AND status != 'quarantined' AND id NOT LIKE '%test%'
    `).all(tenantId) as any[];
    expect(activeTasks.some(t => t.id === 'task_overdue_test_1794052214275')).toBe(false);
  });
});
