'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  Layers,
  CheckCircle2,
  DollarSign,
  Flame,
  Target,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Briefcase,
  Calendar,
} from 'lucide-react';

export default function OverviewPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<any | null>(null);
  const [habits, setHabits] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/tasks?limit=4').then(r => r.json()),
      fetch('/api/finance/safe-to-spend').then(r => r.json()),
      fetch('/api/habits').then(r => r.json()),
      fetch('/api/finance/recurring').then(r => r.json()),
      fetch('/api/goals').then(r => r.json()),
    ])
      .then(([tData, stsData, hData, bData, gData]) => {
        setTasks((tData.tasks || []).slice(0, 4));
        setSafeToSpend(stsData.safeToSpend);
        setHabits(hData.habits || []);
        setBills((bData.recurringRules || []).slice(0, 3));
        setGoals((gData.goals || []).slice(0, 3));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const completedHabits = habits.filter(h => h.isCompletedToday).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="p-5 bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/40 border border-zinc-800 rounded-xl space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Overview Domain</span>
          <span className="text-zinc-600">•</span>
          <span className="text-xs text-zinc-400">Selective Cross-Module Synthesis</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-100">Executive Summary Pulse</h1>
        <p className="text-xs text-zinc-400">
          A high-level cross-module overview connecting your priorities, daily habits, and financial capacity without cluttering individual workspaces.
        </p>
      </div>

      {/* Top Cross-Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Productivity Focus */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider">
            <span>Productivity Focus</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">{tasks.length} Priority Tasks</p>
            <p className="text-xs text-zinc-400 mt-1">Ready for immediate execution</p>
          </div>
          <Link
            href="/productivity/today"
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 pt-1"
          >
            <span>Open Today's Plan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Habit Consistency */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider">
            <span>Habit Attainment</span>
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">
              {completedHabits} / {habits.length} Done Today
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Active consistency rate across rituals
            </p>
          </div>
          <Link
            href="/productivity/habits"
            className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 pt-1"
          >
            <span>View Habit Tracker</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Financial Capacity */}
        {safeToSpend && (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <span>Safe-To-Spend</span>
              <button
                onClick={() => setSelectedExplainer(safeToSpend.explainer)}
                className="text-zinc-500 hover:text-emerald-400"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-100 font-mono">
                ${safeToSpend.safeToSpendAmount}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Uncommitted funds after obligations & buffer
              </p>
            </div>
            <Link
              href="/finance"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 pt-1"
            >
              <span>Finance Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
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
              <Target className="w-4 h-4 text-emerald-400" />
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
              <Calendar className="w-4 h-4 text-amber-400" />
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
    </div>
  );
}
