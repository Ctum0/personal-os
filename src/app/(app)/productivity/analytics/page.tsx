'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWorkspace, type ExplainerPayload } from '@/components/layout/WorkspaceContext';
import { apiFetch, errorText } from '@/lib/api/client';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calendar,
  Briefcase,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DailyTrendPoint {
  date: string;
  planned: number;
  completed: number;
}

interface ProjectTimeRow {
  id: string;
  name: string;
  color: string | null;
  task_count: number;
  total_minutes: number;
}

interface RescheduleReasonRow {
  rescheduled_reason: string;
  count: number;
}

interface AnalyticsPayload {
  period: { days: string; startDate: string; endDate: string };
  taskPerformance: {
    totalCompleted: number;
    completedWithDueDateCount: number;
    onTimeCount: number;
    lateCount: number;
    onTimeRate: number | null;
    currentOverdueCount: number;
    dayOfWeekDistribution: Record<string, number>;
    dailyTrend: DailyTrendPoint[];
  };
  timeAllocation: {
    byProject: ProjectTimeRow[];
    focus: { sessionCount: number; totalFocusMinutes: number; avgSessionDuration: number };
  };
  planningQuality: {
    totalDailyPlans: number;
    committedPlans: number;
    avgConfidence: number | null;
    rescheduling: {
      totalEvents: number;
      reasons: RescheduleReasonRow[];
    };
  };
  explainer: ExplainerPayload;
}

export default function ProductivityAnalyticsPage() {
  const { setSelectedExplainer, activeSpaceId } = useWorkspace();
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'all'>('30');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const spaceQuery = activeSpaceId !== 'all' ? `&spaceId=${encodeURIComponent(activeSpaceId)}` : '';
      const json = await apiFetch<AnalyticsPayload>(`/api/productivity/analytics?days=${period}${spaceQuery}`);
      setData(json);
      setError(null);
    } catch (err) {
      setError(errorText(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [period, activeSpaceId]);

  useEffect(() => {
    void (async () => {
      await fetchAnalytics();
    })();
  }, [fetchAnalytics]);

  const exportCSV = () => {
    if (!data || !data.taskPerformance?.dailyTrend) return;
    const rows = [
      ['Date', 'Planned Tasks', 'Completed Tasks'],
      ...data.taskPerformance.dailyTrend.map(d => [d.date, d.planned, d.completed]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const a = document.createElement('a');
    a.href = encodedUri;
    a.download = `productivity-daily-trend-${period}d.csv`;
    a.click();
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayDistribution: Record<string, number> =
    data?.taskPerformance?.dayOfWeekDistribution ?? { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const maxDowCount = Math.max(1, ...Object.values(dayDistribution).map(v => Number(v) || 0));

  const dailyTrend = data?.taskPerformance?.dailyTrend || [];
  const maxTrendVal = Math.max(1, ...dailyTrend.map(d => Math.max(d.completed || 0, d.planned || 0)));

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span>Productivity OS</span>
            <span>•</span>
            <span className="text-zinc-400 font-mono">Verified Execution Analytics</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-1 flex items-center gap-2">
            Execution Performance & Rhythm
          </h1>
          <p className="text-xs text-zinc-400 max-w-xl">
            Mathematical audit of task completion, time allocation, habit consistency, and scheduling accuracy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Period Selector Tabs */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-white/[0.06] text-xs">
            {(['7', '30', '90', 'all'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  period === p
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p === 'all' ? 'All' : `${p}D`}
              </button>
            ))}
          </div>

          {/* Explainer Button */}
          {data?.explainer && (
            <button
              onClick={() => setSelectedExplainer(data.explainer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium border border-white/[0.06] transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span>How Calculated</span>
            </button>
          )}

          {/* Export Actions */}
          <button
            onClick={exportCSV}
            title="Export CSV"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium border border-white/[0.06] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* 2. Key Execution Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* On-Time Completion */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>On-Time Delivery</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
              {isLoading ? (
                '...'
              ) : data?.taskPerformance?.onTimeRate !== null && data?.taskPerformance?.onTimeRate !== undefined ? (
                `${data.taskPerformance.onTimeRate}%`
              ) : (
                <span className="text-base font-semibold text-zinc-400">Insufficient Data</span>
              )}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              {data?.taskPerformance?.completedWithDueDateCount !== undefined && data.taskPerformance.completedWithDueDateCount < 3 ? (
                <span>Min 3 tasks with due date needed</span>
              ) : (
                <span>{data?.taskPerformance?.onTimeCount ?? 0} on-time · {data?.taskPerformance?.lateCount ?? 0} late</span>
              )}
            </div>
          </div>
        </div>

        {/* Completion vs Planned */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Throughput</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
              {isLoading ? '...' : data?.taskPerformance?.totalCompleted ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              tasks completed in window
            </div>
          </div>
        </div>

        {/* Deep Work & Focus */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Focus Deep Work</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
              {isLoading
                ? '...'
                : `${Math.floor((data?.timeAllocation?.focus?.totalFocusMinutes || 0) / 60)}h ${
                    (data?.timeAllocation?.focus?.totalFocusMinutes || 0) % 60
                  }m`}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              {data?.timeAllocation?.focus?.sessionCount ?? 0} logged focus blocks
            </div>
          </div>
        </div>

        {/* Overdue Friction */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Current Overdue</span>
            <AlertCircle className={`w-4 h-4 ${(data?.taskPerformance?.currentOverdueCount || 0) > 0 ? 'text-rose-400' : 'text-zinc-400'}`} />
          </div>
          <div>
            <div className={`text-2xl font-bold font-mono tracking-tight ${(data?.taskPerformance?.currentOverdueCount || 0) > 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
              {isLoading ? '...' : data?.taskPerformance?.currentOverdueCount ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              unresolved tasks past deadline
            </div>
          </div>
        </div>
      </div>

      {/* 3. Daily Execution Trend Chart */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-white/[0.06] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-zinc-400" />
              <span>Daily Execution Cadence (Planned vs Completed)</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Comparing tasks committed for the date against tasks finalized on that date.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-zinc-700 inline-block" /> Planned
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Completed
            </span>
          </div>
        </div>

        {dailyTrend.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">No execution data for this period</div>
        ) : (
          <div className="h-44 flex items-end gap-1.5 pt-6 pb-2 border-b border-white/[0.06]">
            {dailyTrend.map(d => {
              const completedHeight = Math.max(4, Math.round(((d.completed || 0) / maxTrendVal) * 120));
              const plannedHeight = Math.max(4, Math.round(((d.planned || 0) / maxTrendVal) * 120));
              const dateLabel = d.date.slice(5);

              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                  {/* Tooltip */}
                  <div className="absolute -top-10 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                    <div className="bg-zinc-800 text-[10px] font-mono text-zinc-200 px-2 py-1 rounded shadow-lg border border-white/[0.08] whitespace-nowrap">
                      {d.date}: {d.completed} done / {d.planned} planned
                    </div>
                  </div>

                  <div className="w-full flex items-end justify-center gap-0.5 h-[120px]">
                    <div
                      style={{ height: `${plannedHeight}px` }}
                      className="w-1/2 max-w-[12px] bg-zinc-700/60 rounded-t-sm transition-all duration-300 group-hover:bg-zinc-600"
                    />
                    <div
                      style={{ height: `${completedHeight}px` }}
                      className="w-1/2 max-w-[12px] bg-emerald-500/80 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400"
                    />
                  </div>
                  <span className="text-[9px] font-mono text-zinc-600 truncate max-w-full">
                    {dateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Two-Column Analytics: Day-of-Week Patterns & Project Time Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Day-of-Week Execution Patterns */}
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-white/[0.06] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-400" />
              <span>Day-of-Week Rhythm</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Historical completion volume across weekdays to identify peak output days.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5, 6, 0].map(dow => {
              const count = dayDistribution[String(dow)] || 0;
              const pct = Math.round((count / maxDowCount) * 100);
              const isWeekend = dow === 0 || dow === 6;

              return (
                <div key={dow} className="flex items-center gap-3 text-xs">
                  <span className={`w-9 font-mono font-medium ${isWeekend ? 'text-zinc-500' : 'text-zinc-300'}`}>
                    {dayNames[dow]}
                  </span>
                  <div className="flex-1 h-3 bg-zinc-800/60 rounded overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded transition-all duration-500 ${
                        isWeekend ? 'bg-zinc-600' : 'bg-cyan-500/80'
                      }`}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-zinc-400 text-[11px] tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Time Allocation by Project */}
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-white/[0.06] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-zinc-400" />
              <span>Investment by Project</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Duration allocated to projects based on tracked task time and deep work.
            </p>
          </div>

          {(!data?.timeAllocation?.byProject || data.timeAllocation.byProject.length === 0) ? (
            <div className="py-8 text-center text-xs text-zinc-500">No project time logged</div>
          ) : (
            <div className="space-y-3 pt-2">
              {data.timeAllocation.byProject.map(p => {
                const totalMins = p.total_minutes || 0;
                const hours = (totalMins / 60).toFixed(1);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color || '#8b5cf6' }}
                      />
                      <span className="font-medium text-zinc-200 truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-zinc-400 text-[11px]">
                      <span>{p.task_count} tasks</span>
                      <span className="text-zinc-200 font-semibold">{hours} hrs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Planning Quality & Rescheduling Audit */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-white/[0.06] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-zinc-400" />
              <span>Planning Fidelity & Rescheduling Ledger</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Detects cognitive friction, schedule optimism, and reasons why planned tasks were postponed.
            </p>
          </div>
          <Link href="/productivity/plan">
            <Button variant="outline" size="sm" icon={<Sparkles className="w-3.5 h-3.5 text-zinc-400" />}>
              Open AI Daily Planner
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Committed Daily Plans</span>
            <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
              {data?.planningQuality?.committedPlans ?? 0} / {data?.planningQuality?.totalDailyPlans ?? 0}
            </div>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Approved & scheduled via AI</span>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Postponements</span>
            <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
              {data?.planningQuality?.rescheduling?.totalEvents ?? 0} events
            </div>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Recorded in rescheduling history</span>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-white/[0.04]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Planning Confidence</span>
            <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
              {data?.planningQuality?.avgConfidence !== null && data?.planningQuality?.avgConfidence !== undefined ? (
                <span className="text-emerald-400">{data.planningQuality.avgConfidence}%</span>
              ) : (
                <span className="text-xs font-normal text-zinc-500 italic">Insufficient Data (min 3 plans)</span>
              )}
            </div>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Schedule adherence & commitment fit</span>
          </div>
        </div>

        {/* Reschedule Reasons Breakdown */}
        {data && data.planningQuality.rescheduling.reasons.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-2">
            <span className="text-xs font-medium text-zinc-400">Rescheduling Root Causes:</span>
            <div className="flex flex-wrap gap-2">
              {data.planningQuality.rescheduling.reasons.map(r => (
                <div
                  key={r.rescheduled_reason}
                  className="px-2.5 py-1 rounded bg-zinc-800/80 border border-white/[0.04] text-xs font-mono flex items-center gap-2"
                >
                  <span className="text-zinc-300 capitalize">{r.rescheduled_reason.replace('_', ' ')}</span>
                  <span className="text-zinc-500 font-bold">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
