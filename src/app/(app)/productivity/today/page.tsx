'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO, addDaysISO } from '@/lib/time';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import type { PlanningContext } from '@/lib/productivity/planner';
import {
  CheckCircle2,
  Circle,
  Flame,
  ArrowRight,
  Plus,
  Sparkles,
  AlertTriangle,
  CalendarClock,
  Play,
  Check,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  completion_at: string | null;
  estimated_duration: number;
  project_name?: string | null;
}

interface HabitRow {
  id: string;
  title: string;
  streak: number;
  currentStreak?: number;
  isCompletedToday: boolean;
}

interface CalendarEventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  event_type: string | null;
}

interface PlanningResponse {
  missedTasks?: PlanningContext['missedTasks'];
}

export default function ProductivityTodayPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [missedTasks, setMissedTasks] = useState<NonNullable<PlanningContext['missedTasks']>>([]);
  const [inlineTaskTitle, setInlineTaskTitle] = useState('');
  const [inlinePriority, setInlinePriority] = useState('normal');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formattedDate, setFormattedDate] = useState<string>('Today');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [today, setToday] = useState<string>('');
  const [currentHM, setCurrentHM] = useState<string>('');

  const loadData = useCallback(async (currentDate?: string) => {
    setIsLoading(true);
    const activeDate = currentDate || todayISO();
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${encodeURIComponent(activeSpaceId)}` : '';

    try {
      const [tasksData, habitsData, eventsData, planningData] = await Promise.all([
        apiFetch<{ tasks?: TaskRow[] }>(`/api/tasks${spaceQuery}`),
        apiFetch<{ habits?: HabitRow[] }>(`/api/habits${spaceQuery}`),
        apiFetch<{ events?: CalendarEventRow[] }>(`/api/calendar?startDate=${activeDate}&endDate=${activeDate}`),
        apiFetch<PlanningResponse>(`/api/planning?date=${activeDate}`),
      ]);
      // The API already excludes quarantined records; re-filtering client side
      // would hide nothing new and drift from that single policy.
      setTasks(tasksData.tasks ?? []);
      setHabits(habitsData.habits ?? []);
      setEvents(eventsData.events ?? []);
      setMissedTasks(planningData.missedTasks ?? []);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    void (async () => {
      const activeToday = todayISO();
      setToday(activeToday);
      const now = new Date();
      setCurrentHM(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      setFormattedDate(
        now.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
      );
      await loadData(activeToday);
    })();
  }, [activeSpaceId, loadData]);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    const previous = tasks;
    // Optimistic update
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      await apiSend('/api/tasks', 'PUT', { id: taskId, status: newStatus });
    } catch (err) {
      setTasks(previous);
      setError(errorText(err));
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTaskTitle.trim() || isSubmittingTask) return;
    setIsSubmittingTask(true);
    try {
      await apiSend('/api/tasks', 'POST', {
        title: inlineTaskTitle.trim(),
        status: 'next',
        priority: inlinePriority,
        dueDate: today,
        spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
      });
      setInlineTaskTitle('');
      setActionNotice('Commitment captured for today.');
      setTimeout(() => setActionNotice(null), 3000);
      await loadData();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleReschedule = async (taskId: string, actionType: 'rescheduled' | 'moved_to_backlog' | 'cancelled', newDate?: string) => {
    const targetDate = newDate || today;
    try {
      await apiSend('/api/planning/reschedule', 'POST', {
        taskId,
        newDate: targetDate,
        actionType,
        reason: actionType === 'rescheduled' ? 'Rescheduled to today from missed backlog' : 'Postponed during daily review',
      });
      setActionNotice(`Task ${actionType.replace(/_/g, ' ')}`);
      setTimeout(() => setActionNotice(null), 3500);
      await loadData();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const toggleHabit = async (habitId: string, currentStatus: boolean) => {
    const previous = habits;
    // Optimistic update
    setHabits(prev =>
      prev.map(h => (h.id === habitId ? { ...h, isCompletedToday: !currentStatus } : h))
    );
    try {
      if (currentStatus) {
        await apiSend(`/api/habits/log?habitId=${encodeURIComponent(habitId)}&date=${today}`, 'DELETE');
      } else {
        await apiSend('/api/habits/log', 'POST', { habitId, date: today, status: 'completed', value: 1 });
      }
    } catch (err) {
      setHabits(previous);
      setError(errorText(err));
    }
  };

  // Calculations: isolate tasks scheduled or completed for today vs global backlog
  const todayTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'completed') {
        return t.due_date === today || (t.completion_at && t.completion_at.slice(0, 10) === today);
      }
      return t.due_date === today || t.status === 'in_progress' || (t.status === 'next' && !t.due_date);
    });
  }, [tasks, today]);

  const activeTasks = useMemo(() => todayTasks.filter(t => t.status !== 'completed'), [todayTasks]);
  const completedTodayTasks = useMemo(() => todayTasks.filter(t => t.status === 'completed'), [todayTasks]);

  const totalPlannedCount = activeTasks.length + completedTodayTasks.length;
  const progressPct = totalPlannedCount > 0
    ? Math.round((completedTodayTasks.length / totalPlannedCount) * 100)
    : 0;

  // Immediate Next Commitment (Highest priority active task for today)
  const urgentTasks = activeTasks.filter(t => t.priority === 'urgent' || t.priority === 'critical');
  const highTasks = activeTasks.filter(t => t.priority === 'high');
  const normalTasks = activeTasks.filter(t => t.priority === 'normal');
  const immediateNextTask = urgentTasks[0] || highTasks[0] || normalTasks[0] || activeTasks[0];

  // Active Block Check (is current time within any event)
  const activeEvent = useMemo(() => {
    if (!currentHM) return undefined;
    return events.find(ev => {
      const start = ev.start_time?.includes('T') ? ev.start_time.split('T')[1].slice(0, 5) : ev.start_time?.slice(0, 5);
      const end = ev.end_time?.includes('T') ? ev.end_time.split('T')[1].slice(0, 5) : ev.end_time?.slice(0, 5);
      return start && end && currentHM >= start && currentHM <= end;
    });
  }, [events, currentHM]);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. Header & Today's Progress Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span>{formattedDate}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Execution Cockpit
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 mt-1">
            Today&apos;s Focus & Action
          </h1>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400 font-mono">
            <span>{activeTasks.length} pending</span>
            <span>•</span>
            <span>{completedTodayTasks.length} completed</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">{progressPct}% complete</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href="/productivity/plan"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Plan My Day</span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsQuickAddOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Quick Capture
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}

      {actionNotice && (
        <div role="status" className="p-3 bg-zinc-950/80 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />
          <span>{actionNotice}</span>
        </div>
      )}

      {isLoading && tasks.length === 0 && habits.length === 0 && events.length === 0 && (
        <div className="p-3 bg-zinc-950/60 border border-white/[0.06] rounded-xl text-xs text-zinc-400 font-mono">
          Loading today&apos;s cockpit...
        </div>
      )}

      {/* 2. Today's Completion Progress Bar */}
      <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-zinc-400 uppercase text-[10px] tracking-wider">
            Daily Execution Progress
          </span>
          <span className="font-mono text-xs font-semibold text-zinc-200">
            {totalPlannedCount === 0
              ? 'No tasks scheduled for today (0%)'
              : `${completedTodayTasks.length} of ${totalPlannedCount} tasks completed (${progressPct}%)`}
          </span>
        </div>
        <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-white/[0.04]">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              totalPlannedCount === 0 ? 'bg-zinc-700' : 'bg-emerald-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 3. "WHAT SHOULD I DO NEXT?" HERO UNIT (Above the Fold) */}
      <div className="p-5 bg-gradient-to-r from-zinc-900/90 to-zinc-950 border border-emerald-500/30 rounded-xl relative overflow-hidden shadow-lg shadow-black/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Zap className="w-3 h-3 fill-emerald-400" />
                What Should I Do Next?
              </span>
              {activeEvent && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  Active Calendar Block
                </span>
              )}
            </div>

            {activeEvent ? (
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  {activeEvent.title}
                </h2>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Scheduled block: {activeEvent.start_time?.slice(11, 16) || 'Now'} – {activeEvent.end_time?.slice(11, 16)}
                </p>
              </div>
            ) : immediateNextTask ? (
              <div>
                <h2 className="text-base font-semibold text-zinc-100 truncate">
                  {immediateNextTask.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono mt-0.5">
                  <span className="capitalize px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-white/[0.06] text-[10px]">
                    {immediateNextTask.priority} priority
                  </span>
                  {immediateNextTask.estimated_duration > 0 && (
                    <span>{immediateNextTask.estimated_duration}m duration</span>
                  )}
                  {immediateNextTask.project_name && (
                    <span>• {immediateNextTask.project_name}</span>
                  )}
                </div>
              </div>
            ) : completedTodayTasks.length > 0 ? (
              <div>
                <h2 className="text-base font-semibold text-zinc-200">
                  All active commitments complete!
                </h2>
                <p className="text-xs text-zinc-400">
                  Great work. All {completedTodayTasks.length} planned commitments for today have been finalized.
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-semibold text-zinc-200">
                  No commitments scheduled for today
                </h2>
                <p className="text-xs text-zinc-400">
                  Draft a balanced schedule with AI or capture immediate priorities to get started.
                </p>
              </div>
            )}
          </div>

          {/* 1-Click Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 justify-start md:justify-end md:shrink-0">
            {immediateNextTask ? (
              <>
                <Link
                  href="/productivity/focus"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded-lg text-xs font-semibold shadow transition-all active:scale-[0.98]"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start 25m Focus Block</span>
                </Link>

                <button
                  onClick={() => toggleTask(immediateNextTask.id, immediateNextTask.status)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-white/[0.08] transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark Done</span>
                </button>
              </>
            ) : completedTodayTasks.length > 0 ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/productivity/weekly-review"
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-white/[0.08] transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Review Accomplishments</span>
                </Link>
                <Link
                  href="/productivity/plan"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-semibold shadow transition-all active:scale-[0.98]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Plan Tomorrow</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsQuickAddOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-white/[0.08] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Quick Capture</span>
                </button>
                <Link
                  href="/productivity/plan"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded-lg text-xs font-semibold shadow transition-all active:scale-[0.98]"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span>Plan My Day</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. OVERDUE ITEMS TRAY (Warning banner with 1-click rescue actions) */}
      {missedTasks.length > 0 && (
        <div className="p-4 bg-zinc-950/80 border border-amber-500/30 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Overdue Items Requiring Attention ({missedTasks.length})</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Zero Loss Audit Preserved</span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {missedTasks.slice(0, 4).map(missed => (
              <div key={missed.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{missed.title}</span>
                    <span className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                      {missed.daysOverdue}d overdue
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Originally due: {missed.originalDueDate} • Priority: {missed.priority}
                  </span>
                </div>

                {/* 1-Click Action Tray */}
                <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end sm:shrink-0">
                  <button
                    onClick={() => handleReschedule(missed.id, 'rescheduled', today)}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded text-[11px] font-mono border border-white/[0.06] transition-colors"
                    title="Reschedule task for today"
                  >
                    Reschedule Today
                  </button>
                  <button
                    onClick={() => handleReschedule(missed.id, 'rescheduled', addDaysISO(today, 1))}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-[11px] font-mono border border-white/[0.06] transition-colors"
                    title="Move task to tomorrow"
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => handleReschedule(missed.id, 'moved_to_backlog')}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded text-[11px] font-mono border border-white/[0.06] transition-colors"
                    title="Move task to unallocated backlog"
                  >
                    Backlog
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Main Two-Column Execution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Today's Chronological Schedule Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Today&apos;s Chronological Schedule ({events.length} Blocks)
                </h2>
              </div>
              <Link
                href="/productivity/plan"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>Re-Plan Day</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {events.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono space-y-2">
                <p>No calendar blocks scheduled for today yet.</p>
                <Link
                  href="/productivity/plan"
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Draft today&apos;s schedule with AI</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-white/[0.03]">
                {events.map((ev, idx) => {
                  const startStr = ev.start_time?.includes('T') ? ev.start_time.split('T')[1].slice(0, 5) : ev.start_time?.slice(0, 5);
                  const endStr = ev.end_time?.includes('T') ? ev.end_time.split('T')[1].slice(0, 5) : ev.end_time?.slice(0, 5);
                  return (
                    <div key={ev.id || idx} className="pt-2.5 flex items-start gap-3 text-xs">
                      <div className="w-20 shrink-0 font-mono text-[11px] text-zinc-400 pt-0.5">
                        {startStr} – {endStr}
                      </div>
                      <div className="flex-1 min-w-0 bg-zinc-900/40 p-2.5 rounded-lg border border-white/[0.04]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-200 truncate">{ev.title}</span>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase px-1.5 py-0.2 rounded bg-zinc-950">
                            {ev.event_type || 'block'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Today's Tasks & Habits Tracker */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Capture Input */}
          <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Quick Capture for Today
            </h2>
            <form onSubmit={handleQuickAdd} className="space-y-2">
              <label htmlFor="today-quick-capture" className="sr-only">
                Quick capture a commitment for today
              </label>
              <input
                id="today-quick-capture"
                type="text"
                value={inlineTaskTitle}
                onChange={e => setInlineTaskTitle(e.target.value)}
                placeholder="+ Add priority commitment for today, Enter..."
                className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
              />
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {(['urgent', 'high', 'normal'] as const).map(p => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setInlinePriority(p)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                        inlinePriority === p
                          ? 'bg-zinc-800 text-zinc-100 border border-white/[0.12]'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={!inlineTaskTitle.trim() || isSubmittingTask}>
                  Capture
                </Button>
              </div>
            </form>
          </div>

          {/* Today's Priority Tasks List */}
          <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                Today&apos;s Tasks ({activeTasks.length} Pending)
              </h2>
              <Link href="/productivity/tasks" className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono">
                View All
              </Link>
            </div>

            <div className="space-y-1.5 divide-y divide-white/[0.03]">
              {todayTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500 font-mono">No tasks scheduled for today.</p>
              ) : (
                todayTasks.map(t => {
                  const isDone = t.status === 'completed';
                  return (
                    <div key={t.id} className="pt-2 flex items-center justify-between text-xs group">
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <button
                          onClick={() => toggleTask(t.id, t.status)}
                          className="shrink-0 p-2 -m-2 text-zinc-600 hover:text-emerald-400 transition-colors"
                          aria-label={isDone ? `Mark task ${t.title} as not done` : `Mark task ${t.title} as done`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                          )}
                        </button>
                        <span className={`truncate ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                          {t.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 shrink-0">
                        {t.priority}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 1-Click Habits Check-In */}
          <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Habits Check-In
                </h2>
              </div>
              <Link href="/productivity/habits" className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono">
                Streaks
              </Link>
            </div>

            <div className="space-y-2">
              {habits.length === 0 ? (
                <p className="py-3 text-center text-xs text-zinc-500 font-mono">No active habits configured.</p>
              ) : (
                habits.map(h => (
                  <div
                    key={h.id}
                    className="p-2.5 bg-zinc-900/40 rounded-lg border border-white/[0.04] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleHabit(h.id, h.isCompletedToday)}
                        className="shrink-0 p-2 -m-2 text-zinc-500 hover:text-emerald-400 transition-colors"
                        aria-label={h.isCompletedToday ? `Mark habit ${h.title} as not done today` : `Mark habit ${h.title} as done today`}
                      >
                        {h.isCompletedToday ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                        )}
                      </button>
                      <span className={h.isCompletedToday ? 'text-zinc-400 line-through' : 'text-zinc-200 font-medium'}>
                        {h.title}
                      </span>
                    </div>
                    {(h.streak ?? h.currentStreak ?? 0) > 0 && (
                      <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                        <Flame className="w-3 h-3 fill-amber-400" />
                        {h.streak ?? h.currentStreak ?? 0}d
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
