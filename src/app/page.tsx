'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Flame,
  Briefcase,
  Target,
  Sparkles,
  ArrowRight,
  Clock,
  Plus,
  Sliders,
  HelpCircle,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

export default function ProductivityDashboard() {
  const { activeSpaceId, setSelectedExplainer, setIsAiDrawerOpen, setIsQuickAddOpen } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [formattedDate, setFormattedDate] = useState<string>('Today');

  const loadData = () => {
    setIsLoading(true);
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    const today = new Date().toISOString().slice(0, 10);

    Promise.all([
      fetch(`/api/tasks${spaceQuery}`).then(r => r.json()),
      fetch(`/api/habits${spaceQuery}`).then(r => r.json()),
      fetch(`/api/projects${spaceQuery}`).then(r => r.json()),
      fetch(`/api/goals${spaceQuery}`).then(r => r.json()),
      fetch(`/api/calendar?startDate=${today}&endDate=${today}`).then(r => r.json()),
    ])
      .then(([tasksData, habitsData, projectsData, goalsData, eventsData]) => {
        setTasks(tasksData.tasks || []);
        setHabits(habitsData.habits || []);
        setProjects(projectsData.projects || []);
        setGoals(goalsData.goals || []);
        setEvents(eventsData.events || []);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    setFormattedDate(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }));
    loadData();
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

  const logHabit = async (habitId: string, currentStatus: boolean) => {
    const today = new Date().toISOString().slice(0, 10);
    const method = currentStatus ? 'DELETE' : 'POST';
    if (currentStatus) {
      await fetch(`/api/habits/log?habitId=${habitId}&date=${today}`, { method: 'DELETE' });
    } else {
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today, status: 'completed', value: 1 }),
      });
    }
    loadData();
  };

  const highPriorityTasks = tasks.filter(t => t.status !== 'completed').slice(0, 5);
  const completedTodayCount = tasks.filter(t => t.status === 'completed').length;
  const activeHabitsCount = habits.filter(h => !h.is_paused).length;
  const completedHabitsCount = habits.filter(h => h.isCompletedToday).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Welcome & Quick Daily Planning */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border border-zinc-800 rounded-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Productivity Workspace</span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs text-zinc-400">
              {formattedDate}
            </span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Welcome back, Alex</h1>
          <p className="text-xs text-zinc-400">
            You have {highPriorityTasks.length} open priorities and {events.length} scheduled time blocks today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAiDrawerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all shadow-purple-600/20 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Plan My Day</span>
          </button>
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Capture Task</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Pulse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Completed Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">{completedTodayCount}</p>
          <p className="text-[11px] text-zinc-500">{tasks.length} total tasks in current space</p>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Habit Attainment</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {activeHabitsCount > 0 ? Math.round((completedHabitsCount / activeHabitsCount) * 100) : 0}%
          </p>
          <p className="text-[11px] text-zinc-500">{completedHabitsCount} of {activeHabitsCount} completed today</p>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Projects</span>
            <Briefcase className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {projects.filter(p => p.status === 'active').length}
          </p>
          <p className="text-[11px] text-zinc-500">
            {projects.filter(p => p.progressDetails?.isBlocked).length} blocked milestones
          </p>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Goals</span>
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {goals.filter(g => g.status === 'in_progress' || g.status === 'on_track').length}
          </p>
          <p className="text-[11px] text-zinc-500">All targets progress verified</p>
        </div>
      </div>

      {/* Main Grid: Schedule & Tasks & Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): High Priority Tasks & Schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* Priority Next Actions */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                <h2 className="font-semibold text-sm text-zinc-100">High-Priority Next Actions</h2>
              </div>
              <Link href="/productivity/tasks" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                <span>View all tasks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {highPriorityTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No high-priority tasks pending in this space. Take a moment to capture new ideas!
                </div>
              ) : (
                highPriorityTasks.map(task => (
                  <div
                    key={task.id}
                    className="p-3.5 flex items-center justify-between hover:bg-zinc-800/40 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTask(task.id, task.status)}
                        className="text-zinc-500 hover:text-indigo-400 transition-colors"
                        aria-label={`Mark task ${task.title} as completed`}
                      >
                        <Circle className="w-4 h-4" />
                      </button>
                      <div>
                        <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                          {task.project_name && (
                            <span className="text-indigo-400 font-medium">
                              📁 {task.project_name}
                            </span>
                          )}
                          {task.due_date && <span>Due {task.due_date}</span>}
                          {task.estimated_duration > 0 && <span>• {task.estimated_duration}m</span>}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                        task.priority === 'urgent'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : task.priority === 'high'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Today's Schedule & Focus Blocks */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Today's Calendar & Time Blocks</h2>
              </div>
              <Link href="/productivity/calendar" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                <span>Open Calendar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 space-y-2">
              {events.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                  No scheduled time blocks for today. Click "AI Plan My Day" to generate optimal blocks.
                </div>
              ) : (
                events.map(ev => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 rounded-full bg-indigo-500 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">{ev.title}</p>
                        <p className="text-[11px] text-zinc-500">
                          {new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {new Date(ev.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/productivity/focus"
                      className="px-2.5 py-1 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1.5 transition-colors"
                    >
                      <Clock className="w-3 h-3 text-indigo-400" />
                      <span>Start Focus</span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Habits & Active Projects & Goals */}
        <div className="space-y-6">
          {/* Daily Habit Pulse */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Daily Habit Pulse</h2>
              </div>
              <Link href="/productivity/habits" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                <span>All habits</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-3 divide-y divide-zinc-800/40">
              {habits.slice(0, 5).map(h => (
                <div key={h.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => logHabit(h.id, h.isCompletedToday)}
                      className="text-zinc-500 hover:text-amber-400 transition-colors"
                      aria-label={`Toggle habit ${h.title}`}
                    >
                      {h.isCompletedToday ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600" />
                      )}
                    </button>
                    <div>
                      <p className={`text-xs font-medium ${h.isCompletedToday ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                        {h.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                          🔥 {h.streak}d streak
                        </span>
                        <span>•</span>
                        <span>{h.completionRate}% rate</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] text-zinc-500 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    {h.target_value} {h.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Projects Progress */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Project Progress</h2>
              </div>
              <Link href="/productivity/projects" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                <span>Projects</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 space-y-4">
              {projects.slice(0, 3).map(p => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">{p.name}</span>
                    <span className="font-semibold text-zinc-400">{p.progress}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>Method: {p.progress_method}</span>
                    {p.milestones && <span>{p.milestones.filter((m: any) => m.is_completed).length}/{p.milestones.length} milestones</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Goals Tracker */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Active Goals</h2>
              </div>
              <Link href="/productivity/goals" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                <span>Goals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 space-y-4">
              {goals.slice(0, 2).map(g => (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">{g.title}</span>
                    <span className="font-semibold text-emerald-400">{g.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>{g.current_value} / {g.target_value} {g.unit}</span>
                    <span>{g.cadence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
