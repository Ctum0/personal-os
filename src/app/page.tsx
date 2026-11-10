'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO, addDaysISO } from "@/lib/time";
import {
  CheckCircle2,
  Circle,
  Flame,
  Clock,
  ArrowRight,
  Plus,
  Compass,
  Calendar,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CalendarClock,
  CalendarCheck,
  Check,
  ChevronRight,
  Play,
  ListFilter,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ProductivityExecutionDashboard() {
  const { activeSpaceId, setIsQuickAddOpen, setIsAiDrawerOpen } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [missedTasks, setMissedTasks] = useState<any[]>([]);
  const [planProposal, setPlanProposal] = useState<any | null>(null);
  const [inlineTaskTitle, setInlineTaskTitle] = useState('');
  const [inlinePriority, setInlinePriority] = useState('normal');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formattedDate, setFormattedDate] = useState<string>('Today');
  const [rescheduleMessage, setRescheduleMessage] = useState<string | null>(null);
  const [operatingRules, setOperatingRules] = useState({ workStart: '09:00', workEnd: '18:00', maxDailyWorkloadHours: 6.5 });

  const [today, setToday] = useState<string>('');
  const [nowHM, setNowHM] = useState<string>('');

  const loadData = (currentDate?: string) => {
    setIsLoading(true);
    const activeDate = currentDate || today || todayISO();
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';

    Promise.all([
      fetch(`/api/tasks${spaceQuery}`).then(r => r.json()),
      fetch(`/api/habits${spaceQuery}`).then(r => r.json()),
      fetch(`/api/calendar?startDate=${activeDate}&endDate=${activeDate}`).then(r => r.json()),
      fetch(`/api/planning?date=${activeDate}`).then(r => r.json()),
    ])
      .then(([tasksData, habitsData, eventsData, planningData]) => {
        setTasks(tasksData.tasks || []);
        setHabits(habitsData.habits || []);
        setEvents(eventsData.events || []);
        if (planningData) {
          if (planningData.context?.operatingRules) {
            setOperatingRules(planningData.context.operatingRules);
          }
          setMissedTasks(planningData.missedTasks || []);
          if (planningData.approvedPlan) {
            setPlanProposal(planningData.approvedPlan);
          } else if (planningData.proposal) {
            setPlanProposal(planningData.proposal);
          }
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const activeToday = todayISO();
    setToday(activeToday);
    const now = new Date();
    setNowHM(now.toTimeString().slice(0, 5));
    setFormattedDate(
      now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    );
    loadData(activeToday);
  }, [activeSpaceId]);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'in_progress' : 'completed';
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: newStatus }),
    });
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
  };

  const handleQuickAddPriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTaskTitle.trim() || isSubmittingTask) return;
    setIsSubmittingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: inlineTaskTitle.trim(),
          status: 'next',
          priority: inlinePriority,
          dueDate: today,
          spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
        }),
      });
      if (res.ok) {
        setInlineTaskTitle('');
        loadData();
      }
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleReschedule = async (taskId: string, actionType: 'rescheduled' | 'moved_to_backlog' | 'cancelled', newDate?: string) => {
    const targetDate = newDate || today;
    try {
      const res = await fetch('/api/planning/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          newDate: targetDate,
          actionType,
          reason: actionType === 'rescheduled' ? 'Rescheduled to today from missed backlog' : 'Postponed during daily execution review',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRescheduleMessage(`Task updated (${actionType.replace(/_/g, ' ')})`);
        setTimeout(() => setRescheduleMessage(null), 3500);
        loadData();
      }
    } catch {}
  };

  const logHabit = async (habitId: string, currentStatus: boolean) => {
    if (currentStatus) {
      await fetch(`/api/habits/log?habitId=${habitId}&date=${today}`, { method: 'DELETE' });
    } else {
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today, status: 'completed', value: 1 }),
      });
    }
    loadHabitLocal(habitId, !currentStatus);
  };

  const loadHabitLocal = (habitId: string, isCompleted: boolean) => {
    setHabits(prev =>
      prev.map(h => (h.id === habitId ? { ...h, isCompletedToday: isCompleted } : h))
    );
  };

  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const completedTodayTasks = tasks.filter(t => t.status === 'completed');
  const criticalTasks = activeTasks.filter(t => t.priority === 'urgent' || t.priority === 'critical');
  const highTasks = activeTasks.filter(t => t.priority === 'high');
  const normalTasks = activeTasks.filter(t => t.priority === 'normal');
  const optionalTasks = activeTasks.filter(t => t.priority === 'low' || t.priority === 'optional');

  const oneBigThing = criticalTasks[0] || highTasks[0] || activeTasks[0];
  const upcomingDeadlinesCount = tasks.filter(t => t.due_date && t.due_date >= today && t.status !== 'completed').length;

  // Executive Time & Progress Metrics
  const totalScheduledMinutes = events.reduce((acc, ev) => {
    const startHM = ev.start_time.includes('T') ? ev.start_time.split('T')[1].slice(0, 5) : ev.start_time.slice(0, 5);
    const endHM = ev.end_time.includes('T') ? ev.end_time.split('T')[1].slice(0, 5) : ev.end_time.slice(0, 5);
    const [sh, sm] = (startHM || '00:00').split(':').map(Number);
    const [eh, em] = (endHM || '00:00').split(':').map(Number);
    return acc + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
  const scheduledHours = parseFloat((totalScheduledMinutes / 60).toFixed(1));
  const maxCapacityHours = operatingRules.maxDailyWorkloadHours || 6.5;
  const availableHoursRemaining = Math.max(0, parseFloat((maxCapacityHours - scheduledHours).toFixed(1)));
  const totalPlannedCount = activeTasks.length + completedTodayTasks.length;
  const planProgressPct = totalPlannedCount > 0
    ? Math.round((completedTodayTasks.length / totalPlannedCount) * 100)
    : 100;

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. Daily Briefing Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span>{formattedDate}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Operational Dashboard
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 mt-1">
            Today&apos;s Execution Cockpit
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-zinc-400 font-mono">
            <span>{activeTasks.length} active commitments</span>
            <span>•</span>
            <span>{scheduledHours}h planned ({availableHoursRemaining}h open)</span>
            <span>•</span>
            <span className="text-emerald-400">{planProgressPct}% progress</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
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
            Capture
          </Button>
        </div>
      </div>

      {rescheduleMessage && (
        <div className="p-3 bg-zinc-950/80 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />
          <span>{rescheduleMessage}</span>
        </div>
      )}

      {/* 2. INCOMPLETE TASKS FROM PREVIOUS DAYS REVIEW (Section 5.1 D - Crucial Requirement) */}
      {missedTasks.length > 0 && (
        <div className="p-4 bg-zinc-950/60 border border-amber-500/25 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Incomplete Tasks from Previous Days ({missedTasks.length})</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Historical Tracking Preserved</span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {missedTasks.slice(0, 3).map(missed => (
              <div key={missed.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleReschedule(missed.id, 'rescheduled', today)}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded text-[10px] font-mono border border-white/[0.06] transition-colors"
                    title="Reschedule task for today"
                  >
                    Reschedule Today
                  </button>
                  <button
                    onClick={() => handleReschedule(missed.id, 'rescheduled', addDaysISO(today, 1))}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-[10px] font-mono border border-white/[0.06] transition-colors"
                    title="Move task to tomorrow"
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => handleReschedule(missed.id, 'moved_to_backlog')}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded text-[10px] font-mono border border-white/[0.06] transition-colors"
                    title="Send task to unallocated backlog"
                  >
                    Backlog
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Operational Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7/12 cols): Primary Execution & Today's Schedule Timeline */}
        <div className="lg:col-span-7 space-y-6">
          {/* A. The "One Big Thing" Priority Anchor */}
          <div className="p-4 rounded-lg border border-white/[0.08] bg-zinc-950/60 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Primary Commitment (One Big Thing)
              </span>
              {oneBigThing && (
                <Link
                  href="/productivity/focus"
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white font-medium transition-colors font-mono"
                >
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>Start Focus Session</span>
                </Link>
              )}
            </div>

            {oneBigThing ? (
              <div className="flex items-start gap-3 pt-1">
                <button
                  onClick={() => toggleTask(oneBigThing.id, oneBigThing.status)}
                  className="mt-0.5 text-zinc-500 hover:text-emerald-400 transition-colors shrink-0"
                  aria-label={`Toggle completion for ${oneBigThing.title}`}
                >
                  <Circle className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-zinc-100 leading-snug">
                    {oneBigThing.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500 font-mono">
                    {oneBigThing.due_date && <span>Due Today</span>}
                    {oneBigThing.estimated_duration > 0 && (
                      <span>{oneBigThing.estimated_duration}m duration</span>
                    )}
                    <span className="uppercase text-[9px] px-1.5 py-0.2 rounded bg-zinc-900 border border-white/[0.06] text-zinc-400">
                      {oneBigThing.priority}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-xs text-zinc-400 font-medium">All primary commitments completed.</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Capture or plan your next objective.</p>
              </div>
            )}
          </div>

          {/* B. Today's Chronological Schedule (Timeline View) */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Today&apos;s Schedule Timeline ({events.length} Blocks)
                </h2>
              </div>
              <Link
                href="/productivity/calendar"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>Full Calendar</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {events.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono space-y-2">
                <p>No calendar blocks scheduled for today yet.</p>
                <Link
                  href="/productivity/plan"
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Draft today&apos;s schedule with AI</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  let identifiedNext = false;

                  return events.map((ev, idx) => {
                    const startStr = ev.start_time.includes('T') ? ev.start_time.split('T')[1].slice(0, 5) : ev.start_time.slice(0, 5);
                    const endStr = ev.end_time.includes('T') ? ev.end_time.split('T')[1].slice(0, 5) : ev.end_time.slice(0, 5);
                    const isCurrent = nowHM >= startStr && nowHM <= endStr;
                    const isPast = endStr < nowHM;
                    let isNext = false;
                    if (!isPast && !isCurrent && !identifiedNext) {
                      isNext = true;
                      identifiedNext = true;
                    }

                    return (
                      <div
                        key={ev.id}
                        className={`p-2.5 rounded-md flex items-center justify-between text-xs transition-colors ${
                          isCurrent
                            ? 'bg-emerald-950/20 border border-emerald-500/30'
                            : isNext
                            ? 'bg-zinc-900/90 border border-white/[0.12]'
                            : isPast
                            ? 'bg-zinc-950/40 border border-white/[0.02] opacity-60'
                            : 'bg-zinc-900/60 border border-white/[0.04] hover:border-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[11px] text-zinc-400 w-24 shrink-0">
                            {startStr} - {endStr}
                          </span>
                          <span className="font-medium text-zinc-200 truncate">{ev.title}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Active Now
                            </span>
                          )}
                          {isNext && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-zinc-800 text-zinc-200 border border-white/[0.1]">
                              Next Action
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href="/productivity/focus"
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono border border-white/[0.06] transition-colors"
                            title="Launch deep focus session"
                          >
                            Focus
                          </Link>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* C. Priority Tasks by Hierarchy (Critical, High, Normal, Optional) */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Priority Tasks ({activeTasks.length})
                </h2>
              </div>
              <Link
                href="/productivity/tasks"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>Task Board</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Inline Quick Add Priority Task */}
            <form onSubmit={handleQuickAddPriority} className="flex items-center gap-2 pb-2">
              <input
                type="text"
                value={inlineTaskTitle}
                onChange={e => setInlineTaskTitle(e.target.value)}
                placeholder="+ Add priority task for today..."
                className="flex-1 bg-zinc-900/80 border border-white/[0.06] rounded-md px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
              />
              <select
                aria-label="Select task priority"
                value={inlinePriority}
                onChange={e => setInlinePriority(e.target.value)}
                className="bg-zinc-900/80 border border-white/[0.06] rounded-md px-2 py-1.5 text-[11px] text-zinc-400 font-mono focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Critical</option>
              </select>
              <button
                type="submit"
                disabled={!inlineTaskTitle.trim() || isSubmittingTask}
                className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium disabled:opacity-40"
              >
                Add
              </button>
            </form>

            <div className="divide-y divide-white/[0.04]">
              {activeTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500 font-mono">No active priority tasks.</p>
              ) : (
                activeTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        onClick={() => toggleTask(task.id, task.status)}
                        className="text-zinc-500 hover:text-emerald-400 transition-colors shrink-0 p-2 -m-2"
                        aria-label={`Mark "${task.title}" complete`}
                      >
                        <Circle className="w-4 h-4 text-zinc-500" />
                      </button>
                      <span className="font-medium text-zinc-200 truncate">{task.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                      <span className={`px-1.5 py-0.2 rounded border uppercase ${
                        task.priority === 'urgent'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-900 text-zinc-400 border-white/[0.04]'
                      }`}>
                        {task.priority}
                      </span>
                      {task.estimated_duration > 0 && (
                        <span className="text-zinc-500">{task.estimated_duration}m</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5/12 cols): Daily Rituals & Upcoming Commitments */}
        <div className="lg:col-span-5 space-y-6">
          {/* A. Integrated Habits & Daily Rituals */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Daily Rituals
                </h2>
              </div>
              <Link
                href="/productivity/habits"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>All Habits</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {habits.slice(0, 4).map(habit => (
                <div
                  key={habit.id}
                  onClick={() => logHabit(habit.id, habit.isCompletedToday)}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    habit.isCompletedToday
                      ? `${habit.title} — habit completed today`
                      : `${habit.title} — mark habit as done today`
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      logHabit(habit.id, habit.isCompletedToday);
                    }
                  }}
                  className="p-2.5 bg-zinc-900/60 border border-white/[0.04] rounded-md flex items-center justify-between text-xs cursor-pointer hover:border-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-300 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {habit.isCompletedToday ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
                    )}
                    <span className={`truncate font-medium ${habit.isCompletedToday ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                      {habit.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {habit.streak || 0}d streak
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* B. Upcoming Commitments (Next 3 Days) */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Upcoming Deadlines ({upcomingDeadlinesCount})
                </h2>
              </div>
              <Link
                href="/productivity/calendar"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>View</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {tasks
                .filter(t => t.due_date && t.due_date >= today && t.status !== 'completed')
                .slice(0, 4)
                .map(t => (
                  <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-300 truncate">{t.title}</span>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                      {t.due_date}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* C. Weekly Context & Objectives (Compact Overview) */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Weekly Trajectory
                </h2>
              </div>
              <Link
                href="/productivity/weekly-review"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition-colors"
              >
                <span>Review</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex items-center justify-between text-zinc-400 text-[11px] mb-1">
                  <span>Sprint Workload</span>
                  <span className="font-mono text-zinc-200">{scheduledHours}h planned • {availableHoursRemaining}h open</span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round((scheduledHours / maxCapacityHours) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center font-mono pt-1">
                <div className="p-2 rounded bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Weekly Pace</span>
                  <span className="text-xs font-semibold text-zinc-200">{planProgressPct}%</span>
                </div>
                <div className="p-2 rounded bg-zinc-900/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 block">Overdue Debt</span>
                  <span className={`text-xs font-semibold ${missedTasks.length > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {missedTasks.length} {missedTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                Today&apos;s workload aligns with high-impact goals. Focus capacity protected before evening wind-down.
              </p>
            </div>
          </div>

          {/* D. Quick AI Planning Launcher */}
          <div className="p-4 bg-zinc-950/80 border border-white/[0.08] rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Evening Planning / Replan</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Ready to wrap up today or set up tomorrow? Let the assistant audit your progress and draft tomorrow&apos;s schedule.
            </p>
            <div className="pt-1">
              <Link
                href="/productivity/plan"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded text-xs font-medium border border-white/[0.08] transition-colors"
              >
                <span>Launch Day Planner</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
