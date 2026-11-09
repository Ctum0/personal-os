'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO, toISODate } from "@/lib/time";
import {
  Flame,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
} from 'lucide-react';

export default function HabitsPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [habits, setHabits] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'habits' | 'routines'>('habits');
  const [isLoading, setIsLoading] = useState(true);

  // Routines state
  const [routines, setRoutines] = useState<any[]>([
    {
      id: 'rt_morning',
      title: 'Morning Startup Routine',
      scheduleTime: '07:00 AM',
      steps: [
        { id: 's1', title: 'Hydration (500ml water)', done: false, duration: 2 },
        { id: 's2', title: '15-min Mindfulness / Meditation', done: false, duration: 15 },
        { id: 's3', title: 'Review Today Daily Plan & Top 3 Priorities', done: false, duration: 10 },
      ],
    },
    {
      id: 'rt_evening',
      title: 'Evening Shutdown & Review',
      scheduleTime: '06:00 PM',
      steps: [
        { id: 's4', title: 'Clear Inbox & Triage Captured Items', done: false, duration: 10 },
        { id: 's5', title: 'Record Daily Habit Logs & Close Open Tabs', done: false, duration: 5 },
        { id: 's6', title: 'Rough Plan for Tomorrow', done: false, duration: 10 },
      ],
    },
  ]);
  const [pastDays, setPastDays] = useState<string[]>([]);

  useEffect(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return toISODate(d);
    });
    setPastDays(days);
  }, []);

  const loadHabits = () => {
    setIsLoading(true);
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    fetch(`/api/habits${spaceQuery}`)
      .then(r => r.json())
      .then(data => setHabits(data.habits || []))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadHabits();
  }, [activeSpaceId]);

  const toggleHabit = async (habitId: string, currentStatus: boolean) => {
    const today = todayISO();
    if (currentStatus) {
      await fetch(`/api/habits/log?habitId=${habitId}&date=${today}`, { method: 'DELETE' });
    } else {
      await fetch('/api/habits/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today, status: 'completed', value: 1 }),
      });
    }
    loadHabits();
  };

  const toggleRoutineStep = (routineId: string, stepId: string) => {
    setRoutines(prev =>
      prev.map(r => {
        if (r.id === routineId) {
          return {
            ...r,
            steps: r.steps.map((s: any) => (s.id === stepId ? { ...s, done: !s.done } : s)),
          };
        }
        return r;
      })
    );
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Flame className="w-4 h-4 text-zinc-400" />
            <span>Habits & Routines</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Build consistency through reliable daily tracking, streak analytics, and structured rituals.
          </p>
        </div>

        {/* Tab switcher & Action */}
        <div className="flex items-center gap-2">
          <div className="bg-zinc-950/80 border border-white/[0.08] rounded-md p-0.5 flex items-center text-xs">
            <button
              onClick={() => setActiveTab('habits')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'habits' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Habits Tracker
            </button>
            <button
              onClick={() => setActiveTab('routines')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'routines' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Routines & Rituals
            </button>
          </div>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Habit</span>
          </button>
        </div>
      </div>

      {activeTab === 'habits' ? (
        /* Habits Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.length === 0 ? (
            <div className="col-span-full p-12 text-center text-xs text-zinc-500 bg-zinc-950/40 border border-white/[0.06] rounded-lg">
              No habits configured in this space. Click "New Habit" to start building consistency!
            </div>
          ) : (
            habits.map(h => (
              <div
                key={h.id}
                className="bg-zinc-950/60 border border-white/[0.06] rounded-lg p-4 space-y-4 hover:border-white/[0.12] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => toggleHabit(h.id, h.isCompletedToday)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                      aria-label={`Toggle habit ${h.title}`}
                    >
                      {h.isCompletedToday ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-zinc-600" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium text-zinc-200 truncate">{h.title}</h2>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Target: {h.target_value} {h.unit} • {h.schedule_type}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-zinc-300 bg-zinc-900 border border-white/[0.06] px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {h.streak}d streak
                  </span>
                </div>

                {/* Consistency Stats */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.04] text-xs">
                  <div className="p-2 bg-zinc-900/40 rounded border border-white/[0.04]">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Consistency</span>
                    <span className="font-mono text-xs font-medium text-zinc-200">{h.completionRate}%</span>
                  </div>
                  <div className="p-2 bg-zinc-900/40 rounded border border-white/[0.04]">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Best Streak</span>
                    <span className="font-mono text-xs font-medium text-zinc-200">{h.bestStreak} days</span>
                  </div>
                </div>

                {/* Past 7 days checkmark dots */}
                <div>
                  <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">Past 7 Days</span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {pastDays.map((dateStr, i) => {
                      const isLogged = h.recentLogs?.some((l: any) => l.log_date === dateStr && l.status === 'completed');
                      return (
                        <div
                          key={i}
                          title={dateStr}
                          className={`flex-1 h-2 rounded-sm transition-colors ${
                            isLogged ? 'bg-zinc-300' : 'bg-zinc-800/80'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Routines View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routines.map(routine => {
            const completedSteps = routine.steps.filter((s: any) => s.done).length;
            const progress = Math.round((completedSteps / routine.steps.length) * 100);

            return (
              <div key={routine.id} className="bg-zinc-950/60 border border-white/[0.06] rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <h2 className="text-sm font-medium text-zinc-100">{routine.title}</h2>
                    <span className="text-[11px] text-zinc-500 font-mono">Scheduled: {routine.scheduleTime}</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">{progress}% Done</span>
                </div>

                {/* Progress line */}
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-300 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Steps */}
                <div className="divide-y divide-white/[0.04]">
                  {routine.steps.map((step: any) => (
                    <div
                      key={step.id}
                      onClick={() => toggleRoutineStep(routine.id, step.id)}
                      className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] px-2 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {step.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600" />
                        )}
                        <span className={`text-xs font-normal ${step.done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                          {step.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{step.duration}m</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
