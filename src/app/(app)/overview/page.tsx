'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import type { ExplainerPayload } from '@/components/layout/WorkspaceContext';
import { apiFetch, errorText } from '@/lib/api/client';
import {
  CheckCircle2,
  Flame,
  Target,
  ArrowRight,
  HelpCircle,
  Calendar,
} from 'lucide-react';

interface OverviewTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface OverviewSafeToSpend {
  safeToSpendAmount: string;
  explainer: ExplainerPayload;
}

interface OverviewHabitRow {
  id: string;
  title: string;
  isCompletedToday: boolean;
}

interface OverviewRecurringRule {
  id: string;
  name: string;
  next_due_date: string;
  expected_amount: string;
}

interface OverviewGoalRow {
  id: string;
  title: string;
  progress: number;
}

export default function OverviewPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [tasks, setTasks] = useState<OverviewTaskRow[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<OverviewSafeToSpend | null>(null);
  const [habits, setHabits] = useState<OverviewHabitRow[]>([]);
  const [bills, setBills] = useState<OverviewRecurringRule[]>([]);
  const [goals, setGoals] = useState<OverviewGoalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [tData, stsData, hData, bData, gData] = await Promise.all([
        apiFetch<{ tasks: OverviewTaskRow[] }>('/api/tasks?limit=4'),
        apiFetch<{ safeToSpend: OverviewSafeToSpend | null }>('/api/finance/safe-to-spend'),
        apiFetch<{ habits: OverviewHabitRow[] }>('/api/habits'),
        apiFetch<{ recurringRules: OverviewRecurringRule[] }>('/api/finance/recurring'),
        apiFetch<{ goals: OverviewGoalRow[] }>('/api/goals'),
      ]);
      setTasks((tData.tasks ?? []).slice(0, 4));
      setSafeToSpend(stsData.safeToSpend ?? null);
      setHabits(hData.habits ?? []);
      setBills((bData.recurringRules ?? []).slice(0, 3));
      setGoals((gData.goals ?? []).slice(0, 3));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadOverview();
    })();
  }, [loadOverview]);

  const completedHabits = habits.filter(h => h.isCompletedToday).length;

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Overview Domain</span>
          <span className="text-zinc-600">•</span>
          <span className="text-xs text-zinc-400">Cross-Module Synthesis</span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Executive Summary Pulse</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          A high-level cross-module overview connecting your priorities, daily habits, and financial capacity without cluttering individual workspaces.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          Overview could not be loaded: {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg text-xs text-zinc-500">
          Loading cross-module signals…
        </div>
      ) : (
        <>
          {/* Top Cross-Module Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Productivity Focus */}
            <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-3">
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-zinc-400">
                <span>Productivity Focus</span>
                <CheckCircle2 className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-light text-zinc-100 tracking-tight">{tasks.length} Priority Tasks</p>
                <p className="text-xs text-zinc-400 mt-1">Ready for immediate execution</p>
              </div>
              <Link
                href="/productivity/today"
                className="text-xs text-zinc-300 hover:text-white font-medium flex items-center gap-1 pt-1 transition-colors"
              >
                <span>Open Today&apos;s Plan</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/* Habit Consistency */}
            <div className="p-4 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-3">
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-zinc-400">
                <span>Habit Attainment</span>
                <Flame className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-light text-zinc-100 tracking-tight">
                  {completedHabits} / {habits.length} Done Today
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Active consistency rate across rituals
                </p>
              </div>
              <Link
                href="/productivity/habits"
                className="text-xs text-zinc-300 hover:text-white font-medium flex items-center gap-1 pt-1 transition-colors"
              >
                <span>View Habit Tracker</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/* Financial Capacity */}
            {safeToSpend && (
              <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <span>Safe-To-Spend</span>
                  <button
                    type="button"
                    onClick={() => setSelectedExplainer(safeToSpend.explainer)}
                    aria-label="How safe-to-spend is calculated"
                    className="text-zinc-500 hover:text-emerald-400"
                  >
                    <HelpCircle className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-100 font-mono">
                    ${safeToSpend.safeToSpendAmount}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Uncommitted funds after obligations &amp; buffer
                  </p>
                </div>
                <Link
                  href="/finance"
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 pt-1"
                >
                  <span>Finance Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>

          {/* Cross-Module Synthesis Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Goals & Outcomes */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>Connected Goals</span>
                </h2>
                <Link href="/productivity/goals" className="text-xs text-zinc-400 hover:text-zinc-200">
                  All Goals →
                </Link>
              </div>

              <div className="space-y-3">
                {goals.map(g => (
                  <div key={g.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                      <span>{g.title}</span>
                      <span className="text-emerald-400 font-bold">{g.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Obligations */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>Upcoming Bills Pulse</span>
                </h2>
                <Link href="/finance/recurring" className="text-xs text-zinc-400 hover:text-zinc-200">
                  Manage →
                </Link>
              </div>

              <div className="space-y-3">
                {bills.map(b => (
                  <div key={b.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-zinc-200">{b.name}</p>
                      <p className="text-[11px] text-zinc-500">Due {b.next_due_date}</p>
                    </div>
                    <span className="font-mono font-bold text-amber-400">${b.expected_amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
