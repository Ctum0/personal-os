'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  HelpCircle,
  Briefcase,
} from 'lucide-react';

export default function ProductivityInsightsPage() {
  const { setSelectedExplainer, activeSpaceId } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [today, setToday] = useState('2026-10-29');

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    Promise.all([
      fetch(`/api/tasks${spaceQuery}`).then(r => r.json()),
      fetch(`/api/habits${spaceQuery}`).then(r => r.json()),
      fetch(`/api/projects${spaceQuery}`).then(r => r.json()),
    ]).then(([tData, hData, pData]) => {
      setTasks(tData.tasks || []);
      setHabits(hData.habits || []);
      setProjects(pData.projects || []);
    });
  }, [activeSpaceId]);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const openTasks = tasks.filter(t => t.status !== 'completed');
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today);

  const totalEstimatedMins = tasks.reduce((sum, t) => sum + (t.estimated_duration || 0), 0);
  const totalActualMins = tasks.reduce((sum, t) => sum + (t.actual_duration || 0), 0);

  const avgHabitRate = habits.length > 0
    ? Math.round(habits.reduce((sum, h) => sum + (h.completionRate || 0), 0) / habits.length)
    : 0;

  const showExplainer = (metric: string) => {
    setSelectedExplainer({
      metricName: metric,
      definition: 'Deterministic aggregation of verified task, habit, and project occurrences.',
      formula: 'Throughput = Count(Completed Tasks in Period) / Eligible Recorded Work Items',
      dateRange: { label: 'All-time active records in workspace' },
      currency: 'N/A',
      includedEntities: ['Active Space Tasks', 'Verified Habit Logs', 'Project Milestones'],
      excludedEntities: ['Soft-deleted tasks', 'Paused habits without logs'],
      assumptions: ['Tasks marked completed have legitimate completion timestamps'],
      inputs: {
        totalCompleted: completedTasks.length,
        totalOpen: openTasks.length,
        overdueCount: overdueTasks.length,
        avgHabitConsistency: `${avgHabitRate}%`,
      },
      lastCalculatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <span>Productivity Insights & Metrics</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Authoritative progress, throughput, and consistency trends without speculative AI inferences.
          </p>
        </div>

        <button
          onClick={() => showExplainer('Productivity Metrics Aggregate')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
          <span>How Metrics Are Calculated</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Throughput Ratio</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
          </p>
          <p className="text-[11px] text-zinc-500">
            {completedTasks.length} completed / {tasks.length} created
          </p>
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Overdue Workload</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">{overdueTasks.length}</p>
          <p className="text-[11px] text-zinc-500">Tasks with past deadlines</p>
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Habit Consistency</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">{avgHabitRate}%</p>
          <p className="text-[11px] text-zinc-500">Average across {habits.length} habits</p>
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Estimated Workload</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-zinc-100">
            {(totalEstimatedMins / 60).toFixed(1)} hrs
          </p>
          <p className="text-[11px] text-zinc-500">Total planned task duration</p>
        </div>
      </div>

      {/* Detailed Analysis Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Health Analysis */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-400" />
            <span>Active Project Health & Milestones</span>
          </h2>
          <div className="space-y-3">
            {projects.map(p => (
              <div key={p.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span>{p.name}</span>
                  <span className="text-indigo-400">{p.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Calculation: {p.progress_method}</span>
                  <span>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Habit Streaks Analysis */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Habit Attainment & Streaks</span>
          </h2>
          <div className="space-y-3">
            {habits.map(h => (
              <div key={h.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-200">{h.title}</p>
                  <p className="text-[11px] text-zinc-500">{h.schedule_type} • target: {h.target_value} {h.unit}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-amber-400">🔥 {h.streak}d current</span>
                  <p className="text-[10px] text-zinc-500">Best: {h.bestStreak}d</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
