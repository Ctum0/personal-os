'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import {
  Target,
  Plus,
} from 'lucide-react';

interface GoalProgressLogRow {
  id: string;
  value: number;
  delta: number;
  note: string | null;
  logged_at: string;
}

interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  direction: string;
  current_value: number;
  target_value: number;
  unit: string;
  cadence: string;
  deadline: string | null;
  status: string;
  progress: number;
  recentLogs: GoalProgressLogRow[];
}

export default function GoalsPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<GoalRow | null>(null);
  const [newLogVal, setNewLogVal] = useState<string>('');
  const [newLogNote, setNewLogNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    try {
      const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${encodeURIComponent(activeSpaceId)}` : '';
      const data = await apiFetch<{ goals?: GoalRow[] }>(`/api/goals${spaceQuery}`);
      setGoals(data.goals ?? []);
      setError(null);
    } catch (err) {
      setError(errorText(err));
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    void (async () => {
      await loadGoals();
    })();
  }, [loadGoals]);

  const handleRecordMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !newLogVal) return;

    try {
      await apiSend('/api/goals', 'PUT', {
        id: selectedGoal.id,
        newLogValue: parseFloat(newLogVal),
        note: newLogNote || 'Progress update',
      });
      setNewLogVal('');
      setNewLogNote('');
      setSelectedGoal(null);
      await loadGoals();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const handleQuickIncrement = async (goal: GoalRow) => {
    const current = parseFloat(String(goal.current_value)) || 0;
    const nextVal = current + 1;
    const previous = goals;
    // Optimistic update
    setGoals(prev =>
      prev.map(g =>
        g.id === goal.id
          ? {
              ...g,
              current_value: nextVal,
              progress: Math.min(100, Math.round((nextVal / (parseFloat(String(goal.target_value)) || 1)) * 100)),
            }
          : g
      )
    );
    try {
      await apiSend('/api/goals', 'PUT', {
        id: goal.id,
        newLogValue: nextVal,
        note: '1-click increment check-in',
      });
      await loadGoals();
    } catch (err) {
      setGoals(previous);
      setError(errorText(err));
    }
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Target className="w-4 h-4 text-zinc-400" />
            <span>Strategic Goals & Outcomes</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Measure long-term outcomes with ascending and descending targets and verifiable historical logs.
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Goal</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Log Measurement Modal */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordMeasurement}
            className="bg-zinc-900 border border-white/[0.08] rounded-lg p-5 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <span className="font-medium text-sm text-zinc-100">Log Progress: {selectedGoal.title}</span>
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div>
              <label htmlFor="goal-log-value" className="block text-xs font-medium text-zinc-400 mb-1">
                New Measured Value ({selectedGoal.unit})
              </label>
              <input
                id="goal-log-value"
                type="number"
                step="any"
                required
                autoFocus
                value={newLogVal}
                onChange={e => setNewLogVal(e.target.value)}
                placeholder={`Current target: ${selectedGoal.target_value}`}
                className="w-full bg-zinc-950 border border-white/[0.08] rounded-md px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label htmlFor="goal-log-note" className="block text-xs font-medium text-zinc-400 mb-1">Measurement Note</label>
              <input
                id="goal-log-note"
                type="text"
                value={newLogNote}
                onChange={e => setNewLogNote(e.target.value)}
                placeholder="e.g. Completed weekly distance run"
                className="w-full bg-zinc-950 border border-white/[0.08] rounded-md px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium"
              >
                Save Measurement
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full p-12 text-center text-xs text-zinc-500 bg-zinc-950/40 border border-white/[0.06] rounded-lg">
            Loading goals...
          </div>
        ) : goals.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-zinc-500 bg-zinc-950/40 border border-white/[0.06] rounded-lg">
            No goals tracked in this space yet.
          </div>
        ) : (
          goals.map(goal => (
            <div
              key={goal.id}
              className="bg-zinc-950/60 border border-white/[0.06] rounded-lg p-5 space-y-4 hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    {goal.type} Goal • {goal.direction}
                  </span>
                  <h2 className="text-sm font-medium text-zinc-100 mt-0.5">{goal.title}</h2>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{goal.description}</p>
                </div>
                <span className="text-xs font-mono font-medium text-zinc-300 bg-zinc-900 border border-white/[0.06] px-2 py-0.5 rounded">
                  {goal.progress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-300 rounded-full transition-all duration-300"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>Current: {goal.current_value} {goal.unit}</span>
                  <span>Target: {goal.target_value} {goal.unit}</span>
                </div>
              </div>

              {/* Goal metadata */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-white/[0.04]">
                <span>Cadence: {goal.cadence}</span>
                {goal.deadline ? <span>Due {goal.deadline}</span> : <span>Open-ended</span>}
              </div>

              {/* 1-Click Fast Check-In + Measurement Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickIncrement(goal)}
                  className="px-3 py-1.5 rounded-md bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-600/30 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center justify-center gap-1 shrink-0"
                  title="1-click increment check-in"
                >
                  <Plus className="w-3 h-3" />
                  <span>+1 {goal.unit || ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGoal(goal)}
                  className="flex-1 py-1.5 px-3 rounded-md bg-zinc-900/60 hover:bg-zinc-800 border border-white/[0.06] text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Log Details</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
