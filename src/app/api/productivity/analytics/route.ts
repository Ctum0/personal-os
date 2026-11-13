import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO, addDaysISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { ok, routeError } from '@/lib/api/http';

/** Bounded trend window so the daily bucket loop cannot run unbounded. */
const MAX_TREND_DAYS = 90;

interface CompletedTaskRow {
  id: string;
  due_date: string | null;
  completion_at: string | null;
  estimated_duration: number | null;
  actual_duration: number | null;
  created_at: string;
}

interface DueTaskRow {
  id: string;
  due_date: string | null;
  completion_at: string | null;
  created_at: string | null;
}

interface ProjectTimeRow {
  id: string;
  name: string;
  color: string | null;
  total_minutes: number;
  task_count: number;
}

interface HabitRow {
  id: string;
  title: string;
  frequency_target: number;
  color: string | null;
  completed_count: number;
}

interface CountRow {
  count: number;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || '30';
    const spaceId = searchParams.get('spaceId');

    const today = todayISO();
    let startDate = '';
    const endDate = today;

    if (daysParam === 'all') {
      startDate = '2000-01-01';
    } else {
      const days = parseInt(daysParam, 10) || 30;
      startDate = addDaysISO(today, -days);
    }

    // One space predicate shared by every task/habit/project sub-query, so the
    // dashboard can never mix scopes: either every panel is space-scoped or none is.
    const scopedSpaceId = spaceId && spaceId !== 'all' ? spaceId : undefined;

    // 1. Task Performance Metrics
    // Completed in window
    const completedTasksQuery = `
      SELECT id, title, priority, due_date, completion_at, estimated_duration, actual_duration, project_id, space_id, created_at
      FROM tasks
      WHERE tenant_id = ? AND is_deleted = 0 AND status = 'completed'
      AND (
        (completion_at IS NOT NULL AND date(completion_at) >= ? AND date(completion_at) <= ?)
        OR (completion_at IS NULL AND updated_at >= ? AND updated_at <= ?)
      )
      ${scopedSpaceId ? 'AND space_id = ?' : ''}
    `;
    const completedTasksParams = scopedSpaceId
      ? [session.tenantId, startDate, endDate, startDate, endDate, scopedSpaceId]
      : [session.tenantId, startDate, endDate, startDate, endDate];

    const completedTasks = db.prepare(completedTasksQuery).all(...completedTasksParams) as CompletedTaskRow[];

    // All active or due tasks in window
    const dueTasksQuery = `
      SELECT id, title, status, priority, due_date, completion_at, estimated_duration, actual_duration, project_id, space_id
      FROM tasks
      WHERE tenant_id = ? AND is_deleted = 0
      AND due_date >= ? AND due_date <= ?
      ${scopedSpaceId ? 'AND space_id = ?' : ''}
    `;
    const dueTasksParams = scopedSpaceId
      ? [session.tenantId, startDate, endDate, scopedSpaceId]
      : [session.tenantId, startDate, endDate];
    const dueTasks = db.prepare(dueTasksQuery).all(...dueTasksParams) as DueTaskRow[];

    // Overdue tasks currently (quarantined records are excluded).
    // Params bind in SQL order: tenant_id, due_date, then space_id.
    const overdueQuery = `
      SELECT COUNT(*) as count
      FROM tasks
      WHERE tenant_id = ? AND is_deleted = 0 AND status != 'completed' AND status != 'cancelled'
        AND status != 'quarantined'
      AND due_date IS NOT NULL AND due_date < ?
      ${scopedSpaceId ? 'AND space_id = ?' : ''}
    `;
    const overdueParams = scopedSpaceId
      ? [session.tenantId, today, scopedSpaceId]
      : [session.tenantId, today];
    const overdueRes = db.prepare(overdueQuery).get(...overdueParams) as CountRow | undefined;
    const currentOverdueCount = overdueRes?.count || 0;

    // Calculate on-time completion & estimation accuracy
    let onTimeCount = 0;
    let lateCount = 0;
    let completedWithDueDateCount = 0;
    let completedWithoutDueDateCount = 0;
    let totalActualMinutes = 0;
    let totalEstimatedMinutes = 0;
    let trackedTasksCount = 0;
    let totalEstimationAccuracySum = 0;

    // Day of week distribution: 0 = Sunday, 1 = Monday, ...
    const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    completedTasks.forEach(task => {
      totalActualMinutes += task.actual_duration || 0;
      totalEstimatedMinutes += task.estimated_duration || 0;

      const completionDate = task.completion_at ? task.completion_at.slice(0, 10) : (task.created_at ? task.created_at.slice(0, 10) : today);

      if (task.due_date) {
        completedWithDueDateCount++;
        if (completionDate <= task.due_date) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      } else {
        completedWithoutDueDateCount++;
      }

      // Estimation accuracy evaluated only on tasks where time was genuinely tracked and estimate > 0
      if ((task.estimated_duration || 0) > 0 && (task.actual_duration || 0) > 0) {
        trackedTasksCount++;
        const errorRatio = Math.abs((task.actual_duration || 0) - (task.estimated_duration || 0)) / (task.estimated_duration || 1);
        const accuracy = Math.max(0, 1 - errorRatio) * 100;
        totalEstimationAccuracySum += accuracy;
      }

      const d = new Date(completionDate);
      if (!isNaN(d.getTime())) {
        const dow = d.getDay();
        dayOfWeekCounts[dow as keyof typeof dayOfWeekCounts] = (dayOfWeekCounts[dow as keyof typeof dayOfWeekCounts] || 0) + 1;
      }
    });

    const totalCompleted = completedTasks.length;
    // On-Time Delivery Rate: require at least 3 completed tasks with explicit due dates for statistical validity
    const onTimeRate = completedWithDueDateCount >= 3
      ? Math.round((onTimeCount / completedWithDueDateCount) * 100)
      : null;

    // Estimation Accuracy: require at least 3 genuinely tracked tasks
    const avgEstimationAccuracy = trackedTasksCount >= 3
      ? Math.round(totalEstimationAccuracySum / trackedTasksCount)
      : null;

    const totalDueInPeriod = dueTasks.length;
    const completionRate = totalDueInPeriod > 0
      ? Math.round((completedTasks.filter(t => t.due_date && t.due_date >= startDate && t.due_date <= endDate).length / totalDueInPeriod) * 100)
      : (totalCompleted > 0 ? 100 : 0);

    // 2. Daily Execution Trend (generate daily buckets)
    const trendBuckets: { [date: string]: { date: string; completed: number; planned: number } } = {};
    const daysCount = daysParam === 'all' ? 30 : Math.min(parseInt(daysParam, 10) || 30, MAX_TREND_DAYS);
    for (let i = daysCount - 1; i >= 0; i--) {
      const dStr = addDaysISO(today, -i);
      trendBuckets[dStr] = { date: dStr, completed: 0, planned: 0 };
    }

    completedTasks.forEach(t => {
      const dStr = (t.completion_at || t.created_at).slice(0, 10);
      if (trendBuckets[dStr]) {
        trendBuckets[dStr].completed++;
      }
    });

    dueTasks.forEach(t => {
      if (t.due_date && trendBuckets[t.due_date]) {
        trendBuckets[t.due_date].planned++;
      }
    });

    const dailyTrend = Object.values(trendBuckets);

    // 3. Time Allocation by Project (same space scope as the task metrics)
    const projectTimeQuery = `
      SELECT p.id, p.name, p.color,
             COALESCE(SUM(t.actual_duration), 0) as total_minutes,
             COUNT(t.id) as task_count
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.tenant_id = p.tenant_id AND t.is_deleted = 0 AND t.status = 'completed'
      WHERE p.tenant_id = ?
      ${scopedSpaceId ? 'AND p.space_id = ?' : ''}
      GROUP BY p.id, p.name, p.color
      ORDER BY total_minutes DESC
    `;
    const projectsTime = (
      scopedSpaceId
        ? db.prepare(projectTimeQuery).all(session.tenantId, scopedSpaceId)
        : db.prepare(projectTimeQuery).all(session.tenantId)
    ) as ProjectTimeRow[];

    // 4. Focus Sessions Analytics (focus_sessions has no space column; scope via
    // its optional project, which is the only space-bearing relationship it has)
    // A session belongs to a space through either of its links; a session with
    // no task and no project has no space attribution and is excluded when a
    // space filter is active (consistent with the other panels).
    const focusQuery = `
      SELECT COUNT(*) as session_count,
             COALESCE(SUM(f.actual_duration), 0) as total_focus_minutes,
             COALESCE(AVG(f.actual_duration), 0) as avg_session_duration
      FROM focus_sessions f
      WHERE f.tenant_id = ? AND date(f.started_at) >= ? AND date(f.started_at) <= ?
      ${scopedSpaceId ? `AND (
        EXISTS (SELECT 1 FROM tasks ft WHERE ft.id = f.task_id AND ft.tenant_id = f.tenant_id AND ft.space_id = ?)
        OR EXISTS (SELECT 1 FROM projects fp WHERE fp.id = f.project_id AND fp.tenant_id = f.tenant_id AND fp.space_id = ?)
      )` : ''}
    `;
    const focusRes = (
      scopedSpaceId
        ? db.prepare(focusQuery).get(session.tenantId, startDate, endDate, scopedSpaceId, scopedSpaceId)
        : db.prepare(focusQuery).get(session.tenantId, startDate, endDate)
    ) as { session_count: number; total_focus_minutes: number; avg_session_duration: number } | undefined;
    const focusStats = {
      sessionCount: focusRes?.session_count || 0,
      totalFocusMinutes: focusRes?.total_focus_minutes || 0,
      avgSessionDuration: Math.round(focusRes?.avg_session_duration || 0),
    };

    // 5. Habit Consistency & Streaks (space-scoped like the rest of the dashboard)
    const habitsQuery = `
      SELECT h.id, h.title, h.frequency_target, h.color,
             (SELECT COUNT(*) FROM habit_logs hl WHERE hl.tenant_id = h.tenant_id AND hl.habit_id = h.id AND hl.status = 'completed' AND hl.log_date >= ? AND hl.log_date <= ?) as completed_count
      FROM habits h
      WHERE h.tenant_id = ? AND h.is_paused = 0
      ${scopedSpaceId ? 'AND h.space_id = ?' : ''}
    `;
    const habitsList = (
      scopedSpaceId
        ? db.prepare(habitsQuery).all(startDate, endDate, session.tenantId, scopedSpaceId)
        : db.prepare(habitsQuery).all(startDate, endDate, session.tenantId)
    ) as HabitRow[];
    const totalHabitLogs = habitsList.reduce((acc, h) => acc + (h.completed_count || 0), 0);
    const avgHabitAdherence = habitsList.length > 0
      ? Math.round((totalHabitLogs / (habitsList.length * Math.max(1, daysCount))) * 100)
      : 0;

    // 6. Planning Quality & Rescheduling Analytics
    const dailyPlansQuery = `
      SELECT COUNT(*) as total_plans,
             SUM(CASE WHEN status = 'committed' OR status = 'completed' THEN 1 ELSE 0 END) as committed_plans,
             COALESCE(AVG(estimated_workload_hours * 60), 0) as avg_planned_minutes
      FROM daily_plans
      WHERE tenant_id = ? AND plan_date >= ? AND plan_date <= ?
    `;
    const dailyPlansRes = db.prepare(dailyPlansQuery).get(session.tenantId, startDate, endDate) as
      | { total_plans: number; committed_plans: number; avg_planned_minutes: number }
      | undefined;
    const totalPlans = dailyPlansRes?.total_plans || 0;
    const committedPlans = dailyPlansRes?.committed_plans || 0;
    // Require a minimum sample of 3 plans for statistical validity; return null if sample is insufficient
    const avgConfidence = totalPlans >= 3 ? Math.round((committedPlans / totalPlans) * 100) : null;

    // Rescheduling metrics: separate total events from unique tasks rescheduled
    const rescheduleSpaceClause = scopedSpaceId
      ? 'AND EXISTS (SELECT 1 FROM tasks rt WHERE rt.id = task_rescheduling_history.task_id AND rt.tenant_id = task_rescheduling_history.tenant_id AND rt.space_id = ?)'
      : '';
    const rescheduleMetricsQuery = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT task_id) as unique_tasks_rescheduled
      FROM task_rescheduling_history
      WHERE tenant_id = ? AND date(rescheduled_at) >= ? AND date(rescheduled_at) <= ?
      ${rescheduleSpaceClause}
    `;
    const reschedRes = (
      scopedSpaceId
        ? db.prepare(rescheduleMetricsQuery).get(session.tenantId, startDate, endDate, scopedSpaceId)
        : db.prepare(rescheduleMetricsQuery).get(session.tenantId, startDate, endDate)
    ) as { total_events: number; unique_tasks_rescheduled: number } | undefined;
    const totalRescheduledEvents = reschedRes?.total_events || 0;
    const uniqueTasksRescheduled = reschedRes?.unique_tasks_rescheduled || 0;
    const avgReschedulesPerTask = uniqueTasksRescheduled > 0
      ? parseFloat((totalRescheduledEvents / uniqueTasksRescheduled).toFixed(1))
      : 0;

    // Previous period historical comparison
    const periodDays = daysParam === 'all' ? 30 : Math.max(1, parseInt(daysParam, 10) || 30);
    const prevStartDate = addDaysISO(startDate, -periodDays);
    const prevEndDate = addDaysISO(startDate, -1);
    const prevReschedRes = (
      scopedSpaceId
        ? db.prepare(rescheduleMetricsQuery).get(session.tenantId, prevStartDate, prevEndDate, scopedSpaceId)
        : db.prepare(rescheduleMetricsQuery).get(session.tenantId, prevStartDate, prevEndDate)
    ) as { total_events: number; unique_tasks_rescheduled: number } | undefined;
    const prevTotalEvents = prevReschedRes?.total_events || 0;
    const prevUniqueTasks = prevReschedRes?.unique_tasks_rescheduled || 0;

    const reschedulingQuery = `
      SELECT coalesce(reason, 'unspecified') as rescheduled_reason, COUNT(*) as count
      FROM task_rescheduling_history
      WHERE tenant_id = ? AND date(rescheduled_at) >= ? AND date(rescheduled_at) <= ?
      ${rescheduleSpaceClause}
      GROUP BY reason
      ORDER BY count DESC
    `;
    const reschedulingReasons = scopedSpaceId
      ? db.prepare(reschedulingQuery).all(session.tenantId, startDate, endDate, scopedSpaceId)
      : db.prepare(reschedulingQuery).all(session.tenantId, startDate, endDate);

    // 7. Explainer metadata for mathematical verification
    const explainer = {
      metricName: 'Productivity Execution & Schedule Adherence',
      definition: 'Multi-variable mathematical measurement of task execution fidelity, on-time delivery, focus depth, and schedule adherence.',
      formula: 'OnTimeRate = Count(Completed <= DueDate) / Count(CompletedTasksWithDueDate) * 100 (Sample min 3); EstimationAccuracy = Avg(1 - |Actual - Estimated| / Estimated) * 100 for tracked tasks',
      dateRange: {
        label: `${startDate} to ${endDate} (${daysParam} days)`,
        startDate,
        endDate,
      },
      currency: 'N/A',
      includedEntities: [
        'Verified Completed Tasks',
        'Committed Daily Plans',
        'Historical Rescheduling Ledger',
        'Logged Focus Sessions',
        'Active Habit Check-ins',
      ],
      excludedEntities: [
        'Tasks completed without due dates from On-Time Rate denominator',
        'Untracked tasks (0 actual duration) from Estimation Accuracy',
        'Soft-deleted tasks',
        'Cancelled tasks',
        'Draft uncommitted daily plans',
      ],
      assumptions: [
        'Only tasks with explicit due dates can be objectively evaluated for on-time delivery.',
        'Estimation accuracy requires at least 3 genuinely tracked tasks to avoid misleading precision.',
        'Rescheduling distinguishes total audit events from unique affected tasks.',
      ],
      inputs: {
        totalCompletedTasks: totalCompleted,
        completedWithDueDateCount,
        completedWithoutDueDateCount,
        onTimeCompleted: onTimeCount,
        lateCompleted: lateCount,
        trackedTasksCount,
        activeOverdue: currentOverdueCount,
        totalRescheduledEvents,
        uniqueTasksRescheduled,
        totalFocusMinutes: focusStats.totalFocusMinutes,
        committedDailyPlans: committedPlans,
      },
      lastCalculatedAt: new Date().toISOString(),
    };

    return ok({
      period: {
        days: daysParam,
        startDate,
        endDate,
      },
      taskPerformance: {
        totalCompleted,
        completedWithDueDateCount,
        completedWithoutDueDateCount,
        onTimeCount,
        lateCount,
        onTimeRate,
        completionRate,
        currentOverdueCount,
        totalActualMinutes,
        totalEstimatedMinutes,
        dayOfWeekDistribution: dayOfWeekCounts,
        dailyTrend,
        estimationAccuracy: {
          trackedTasksCount,
          avgAccuracy: avgEstimationAccuracy,
        },
      },
      timeAllocation: {
        byProject: projectsTime,
        focus: focusStats,
      },
      consistency: {
        habits: habitsList,
        totalHabitLogs,
        avgHabitAdherence: Math.min(100, avgHabitAdherence),
      },
      planningQuality: {
        totalDailyPlans: totalPlans,
        committedPlans,
        avgPlannedMinutes: Math.round(dailyPlansRes?.avg_planned_minutes || 0),
        avgConfidence,
        rescheduling: {
          totalEvents: totalRescheduledEvents,
          uniqueTasksRescheduled,
          avgReschedulesPerTask,
          reasons: reschedulingReasons,
          previousPeriod: {
            startDate: prevStartDate,
            endDate: prevEndDate,
            totalEvents: prevTotalEvents,
            uniqueTasks: prevUniqueTasks,
          },
        },
      },
      explainer,
    });
  } catch (err) {
    return routeError(err);
  }
});
