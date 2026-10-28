'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  PiggyBank,
  Plus,
  Target,
  Landmark,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

export default function SavingsGoalsPage() {
  const [savingsGoals, setSavingsGoals] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0.00');
  const [targetDate, setTargetDate] = useState('');

  const loadGoals = () => {
    fetch('/api/finance/savings-goals')
      .then(r => r.json())
      .then(data => setSavingsGoals(data.savingsGoals || []));
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount) return;

    await fetch('/api/finance/savings-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        targetAmount,
        currentAmount,
        targetDate: targetDate || null,
      }),
    });

    setName('');
    setTargetAmount('');
    setCurrentAmount('0.00');
    setTargetDate('');
    setIsAddOpen(false);
    loadGoals();
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-emerald-400" />
            <span>Savings Goals & Earmarks</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Earmark accumulated capital towards dedicated financial milestones without double counting.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Savings Goal</span>
        </button>
      </div>

      {isAddOpen && (
        <form onSubmit={handleAddGoal} className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">New Savings Milestone</span>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Goal Name</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 6-Month Emergency Fund"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Target Amount ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={targetAmount}
                onChange={e => setTargetAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Current Saved ($)</label>
              <input
                type="number"
                step="0.01"
                value={currentAmount}
                onChange={e => setCurrentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold">
            Create Savings Goal
          </button>
        </form>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {savingsGoals.map(sg => (
          <div key={sg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  Target: {sg.currency}
                </span>
                <h2 className="text-sm font-bold text-zinc-100 mt-0.5">{sg.name}</h2>
                {sg.notes && <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{sg.notes}</p>}
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                {sg.progressPercent}%
              </span>
            </div>

            <div className="space-y-1">
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, sg.progressPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Saved: ${sg.current_amount}</span>
                <span>Target: ${sg.target_amount}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
              {sg.linked_account_name ? <span>Account: {sg.linked_account_name}</span> : <span>General Reserve</span>}
              {sg.target_date ? <span>Target: {sg.target_date}</span> : <span>Open</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
