'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  Target,
  Plus,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export default function GoalsPage() {
  const { activeSpaceId, setIsQuickAddOpen } = useWorkspace();
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
  const [newLogVal, setNewLogVal] = useState<string>('');
  const [newLogNote, setNewLogNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const loadGoals = () => {
    setIsLoading(true);
    const spaceQuery = activeSpaceId !== 'all' ? `?spaceId=${activeSpaceId}` : '';
    fetch(`/api/goals${spaceQuery}`)
      .then(r => r.json())
      .then(data => setGoals(data.goals || []))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadGoals();
  }, [activeSpaceId]);

  const handleRecordMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !newLogVal) return;

    await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedGoal.id,
        newLogValue: parseFloat(newLogVal),
        note: newLogNote || 'Progress update',
      }),
    });

    setNewLogVal('');
    setNewLogNote('');
    setSelectedGoal(null);
    loadGoals();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            <span>Strategic Goals & Outcomes</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Measure long-term outcomes with ascending and descending targets and verifiable historical logs.
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Goal</span>
        </button>
      </div>

      {/* Log Measurement Modal */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordMeasurement}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-sm text-zinc-100">Log Progress: {selectedGoal.title}</span>
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                New Measured Value ({selectedGoal.unit})
              </label>
              <input
                type="number"
                step="any"
                required
                autoFocus
                value={newLogVal}
                onChange={e => setNewLogVal(e.target.value)}
                placeholder={`Current target: ${selectedGoal.target_value}`}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Measurement Note</label>
              <input
                type="text"
                value={newLogNote}
                onChange={e => setNewLogNote(e.target.value)}
                placeholder="e.g. Completed weekly distance run"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                Save Measurement
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            No goals tracked in this space yet.
          </div>
        ) : (
          goals.map(goal => (
            <div
              key={goal.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-zinc-700 transition-colors shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                    {goal.type} Goal • {goal.direction}
                  </span>
                  <h2 className="text-sm font-bold text-zinc-100 mt-0.5">{goal.title}</h2>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{goal.description}</p>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {goal.progress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>Current: {goal.current_value} {goal.unit}</span>
                  <span>Target: {goal.target_value} {goal.unit}</span>
                </div>
              </div>

              {/* Goal metadata */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800">
                <span>Cadence: {goal.cadence}</span>
                {goal.deadline ? <span>Due {goal.deadline}</span> : <span>Open-ended</span>}
              </div>

              {/* Record Measurement Action */}
              <button
                onClick={() => setSelectedGoal(goal)}
                className="w-full py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Measurement</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
