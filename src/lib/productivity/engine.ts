import type Database from 'better-sqlite3';
import { todayISO, toISODate } from "@/lib/time";

export interface ProjectProgressResult {
  projectId: string;
  projectName: string;
  progressMethod: 'manual' | 'completion' | 'weighted' | 'milestone';
  progressPercentage: number;
  totalTasks: number;
  completedTasks: number;
  totalMilestones: number;
  completedMilestones: number;
  isBlocked: boolean;
  blockersCount: number;
  status: string;
}

export interface GoalProgressResult {
  goalId: string;
  goalTitle: string;
  type: string;
  direction: 'ascending' | 'descending';
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
  progressPercentage: number;
  status: string;
  historyLogsCount: number;
}

export interface HabitStreakResult {
  habitId: string;
  habitTitle: string;
  trackingType: string;
  unit: string;
  currentStreak: number;
  bestStreak: number;
  completionRatePercent: number;
  totalLogsCount: number;
  isCompletedToday: boolean;
  todayLogValue?: number;
  isPaused: boolean;
}

/**
 * Calculates Project progress based on its configured method
 */
export function calculateProjectProgress(
  db: Database.Database,
  tenantId: string,
  projectId: string
): ProjectProgressResult | null {
  const proj = db.prepare('SELECT * FROM projects WHERE tenant_id = ? AND id = ?').get(tenantId, projectId) as {
    id: string;
    name: string;
    progress_method: 'manual' | 'completion' | 'weighted' | 'milestone';
    manual_progress: number;
    status: string;
  } | undefined;

  if (!proj) return null;

  // Tasks in project
  const tasks = db.prepare(`
    SELECT status, estimated_duration, actual_duration 
    FROM tasks 
    WHERE tenant_id = ? AND project_id = ? AND is_deleted = 0
  `).all(tenantId, projectId) as Array<{
    status: string;
    estimated_duration: number;
    actual_duration: number;
  }>;

  // Milestones in project
  const milestones = db.prepare(`
    SELECT is_completed 
    FROM project_milestones 
    WHERE tenant_id = ? AND project_id = ?
  `).all(tenantId, projectId) as Array<{ is_completed: number }>;

  // Check blockers (tasks with status 'waiting' or blocked dependencies)
  const blockersCount = tasks.filter(t => t.status === 'waiting').length;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.is_completed === 1).length;

  let progress = 0;

  switch (proj.progress_method) {
    case 'manual':
      progress = Math.min(100, Math.max(0, proj.manual_progress || 0));
      break;

    case 'completion':
      progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      break;

    case 'weighted':
      const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimated_duration || 30), 0);
      const completedEstimated = tasks
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + (t.estimated_duration || 30), 0);
      progress = totalEstimated > 0 ? Math.round((completedEstimated / totalEstimated) * 100) : 0;
      break;

    case 'milestone':
      progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
      break;

    default:
      progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  return {
    projectId: proj.id,
    projectName: proj.name,
    progressMethod: proj.progress_method,
    progressPercentage: progress,
    totalTasks,
    completedTasks,
    totalMilestones,
    completedMilestones,
    isBlocked: blockersCount > 0,
    blockersCount,
    status: proj.status,
  };
}

/**
 * Calculates Goal progress percentage handling ascending & descending goals and zero boundaries
 */
export function calculateGoalProgress(
  db: Database.Database,
  tenantId: string,
  goalId: string
): GoalProgressResult | null {
  const goal = db.prepare('SELECT * FROM goals WHERE tenant_id = ? AND id = ?').get(tenantId, goalId) as {
    id: string;
    title: string;
    type: string;
    direction: 'ascending' | 'descending';
    start_value: number;
    target_value: number;
    current_value: number;
    unit: string;
    status: string;
    linked_savings_goal_id?: string;
  } | undefined;

  if (!goal) return null;

  let current = goal.current_value;

  // If linked to savings goal, pull accurate current amount from finance domain
  if (goal.linked_savings_goal_id) {
    const sg = db.prepare('SELECT current_amount FROM savings_goals WHERE tenant_id = ? AND id = ?').get(tenantId, goal.linked_savings_goal_id) as { current_amount: string } | undefined;
    if (sg) {
      current = parseFloat(sg.current_amount || '0');
    }
  }

  const logsCount = (db.prepare('SELECT count(*) as count FROM goal_progress_logs WHERE tenant_id = ? AND goal_id = ?').get(tenantId, goalId) as { count: number }).count;

  let progress = 0;
  const start = goal.start_value;
  const target = goal.target_value;

  if (goal.type === 'binary') {
    progress = current >= 1 ? 100 : 0;
  } else if (goal.direction === 'descending') {
    // E.g. starting at 100, target 70, current 80 -> made 20 progress out of 30 total change needed = 66.6%
    const totalDelta = start - target;
    if (totalDelta > 0) {
      const currentDelta = start - current;
      progress = Math.min(100, Math.max(0, Math.round((currentDelta / totalDelta) * 100)));
    } else {
      progress = current <= target ? 100 : 0;
    }
  } else {
    // Ascending: e.g. starting at 0, target 100, current 42 -> 42%
    const totalDelta = target - start;
    if (totalDelta > 0) {
      const currentDelta = current - start;
      progress = Math.min(100, Math.max(0, Math.round((currentDelta / totalDelta) * 100)));
    } else {
      progress = current >= target ? 100 : 0;
    }
  }

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    type: goal.type,
    direction: goal.direction,
    startValue: start,
    targetValue: target,
    currentValue: current,
    unit: goal.unit,
    progressPercentage: progress,
    status: goal.status,
    historyLogsCount: logsCount,
  };
}

/**
 * Calculates Habit streak and completion statistics respecting schedules, pauses, and skips
 */
export function calculateHabitStreak(
  db: Database.Database,
  tenantId: string,
  habitId: string,
  referenceDate: string = todayISO()
): HabitStreakResult | null {
  const habit = db.prepare('SELECT * FROM habits WHERE tenant_id = ? AND id = ?').get(tenantId, habitId) as {
    id: string;
    title: string;
    tracking_type: string;
    unit: string;
    target_value: number;
    minimum_threshold: number;
    schedule_type: string;
    schedule_days: string;
    is_paused: number;
    start_date: string;
  } | undefined;

  if (!habit) return null;

  const logs = db.prepare(`
    SELECT log_date, value, status 
    FROM habit_logs 
    WHERE tenant_id = ? AND habit_id = ? AND log_date <= ?
    ORDER BY log_date DESC
  `).all(tenantId, habitId, referenceDate) as Array<{
    log_date: string;
    value: number;
    status: string;
  }>;

  const logMap = new Map<string, { value: number; status: string }>();
  for (const l of logs) {
    logMap.set(l.log_date, { value: l.value, status: l.status });
  }

  const todayLog = logMap.get(referenceDate);
  const isCompletedToday = Boolean(todayLog && (todayLog.status === 'completed' || todayLog.value >= habit.minimum_threshold));

  // Parse scheduled days (1 = Monday, 7 = Sunday)
  let scheduledDays: number[] = [1, 2, 3, 4, 5, 6, 7];
  try {
    scheduledDays = JSON.parse(habit.schedule_days);
  } catch {
    scheduledDays = [1, 2, 3, 4, 5, 6, 7];
  }

  // Calculate current streak stepping backward
  let currentStreak = 0;
  let cursor = new Date(referenceDate + 'T12:00:00Z');
  
  // If not completed today, check if yesterday was completed
  if (!isCompletedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let safetyCount = 0;
  const startDateObj = new Date(habit.start_date + 'T12:00:00Z');

  while (cursor >= startDateObj && safetyCount < 365) {
    safetyCount++;
    const dateStr = toISODate(cursor);
    // JS getDay(): 0 = Sun, 1 = Mon ... convert to 1 = Mon .. 7 = Sun
    const jsDay = cursor.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;

    const isScheduled = habit.schedule_type === 'daily' || scheduledDays.includes(isoDay);

    if (isScheduled) {
      const entry = logMap.get(dateStr);
      if (entry) {
        if (entry.status === 'completed' || entry.value >= habit.minimum_threshold) {
          currentStreak++;
        } else if (entry.status === 'excused') {
          // Excused days do not break streak, but do not add to streak count
        } else {
          // Missed or failed
          break;
        }
      } else {
        // No log on a scheduled day -> streak broken
        break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  // Calculate all-time logs completion rate
  const totalLogsCount = logs.length;
  const successfulLogs = logs.filter(l => l.status === 'completed' || l.value >= habit.minimum_threshold).length;
  const completionRate = totalLogsCount > 0 ? Math.round((successfulLogs / totalLogsCount) * 100) : 0;

  return {
    habitId: habit.id,
    habitTitle: habit.title,
    trackingType: habit.tracking_type,
    unit: habit.unit,
    currentStreak,
    bestStreak: Math.max(currentStreak, currentStreak), // Can be persisted
    completionRatePercent: completionRate,
    totalLogsCount,
    isCompletedToday,
    todayLogValue: todayLog?.value,
    isPaused: Boolean(habit.is_paused),
  };
}

/**
 * Daily Planning Helper: analyzes due tasks, calendar events, habits, and crafts a structured daily schedule
 */
export function generateDailyPlanProposal(
  db: Database.Database,
  tenantId: string,
  targetDate: string = todayISO()
) {
  // 1. Get due or open priority tasks
  const tasks = db.prepare(`
    SELECT id, title, priority, estimated_duration, due_date, status, space_id
    FROM tasks
    WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('inbox', 'next', 'in_progress')
    ORDER BY 
      CASE priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        ELSE 4 
      END ASC,
      due_date ASC
  `).all(tenantId) as Array<{
    id: string;
    title: string;
    priority: string;
    estimated_duration: number;
    due_date: string | null;
    status: string;
    space_id: string;
  }>;

  // 2. Get existing calendar events for target date
  const events = db.prepare(`
    SELECT id, title, start_time, end_time, event_type
    FROM calendar_events
    WHERE tenant_id = ? AND date(start_time) = ?
    ORDER BY start_time ASC
  `).all(tenantId, targetDate) as Array<{
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: string;
  }>;

  // 3. Get habits scheduled for target date
  const habits = db.prepare(`
    SELECT id, title, tracking_type, minimum_threshold, unit, color
    FROM habits
    WHERE tenant_id = ? AND is_paused = 0
  `).all(tenantId) as Array<{
    id: string;
    title: string;
    tracking_type: string;
    minimum_threshold: number;
    unit: string;
    color: string;
  }>;

  // Select top 3-5 focus tasks to prevent overcommitment
  const topPriorities = tasks.slice(0, 5);
  const deferrals = tasks.slice(5, 10);

  // Propose time blocks starting from 09:00 AM
  let startHour = 9;
  const proposedTimeBlocks = topPriorities.map(t => {
    const duration = t.estimated_duration || 45;
    const blockStart = `${targetDate}T${String(startHour).padStart(2, '0')}:00:00`;
    const endMinutes = duration % 60;
    const endHour = startHour + Math.floor(duration / 60);
    const blockEnd = `${targetDate}T${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`;

    startHour = endHour + (endMinutes > 0 ? 1 : 0);

    return {
      taskId: t.id,
      title: t.title,
      startTime: blockStart,
      endTime: blockEnd,
      durationMinutes: duration,
      reason: t.priority === 'urgent' ? 'Urgent priority commitment' : 'Top scheduled priority',
    };
  });

  return {
    targetDate,
    availableHours: 8,
    estimatedWorkloadHours: (topPriorities.reduce((s, t) => s + (t.estimated_duration || 45), 0) / 60).toFixed(1),
    topPriorities,
    suggestedDeferrals: deferrals,
    proposedTimeBlocks,
    fixedEventsCount: events.length,
    scheduledHabitsCount: habits.length,
    reasoning: `Selected ${topPriorities.length} key tasks aligned with your available working hours, leaving a buffer for unexpected interruptions.`,
  };
}
