'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  PieChart,
  Plus,
  HelpCircle,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export default function BudgetsPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [budget, setBudget] = useState<any | null>(null);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [newAllocated, setNewAllocated] = useState('');
  const [newRollover, setNewRollover] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadBudget = () => {
    setIsLoading(true);
    fetch('/api/finance/budgets')
      .then(r => r.json())
      .then(data => setBudget(data.budget))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadBudget();
  }, []);

  const handleUpdateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !budget) return;

    await fetch('/api/finance/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        budgetId: budget.budgetId,
        categoryId: editingCategory.categoryId,
        allocatedAmount: newAllocated,
        rolloverAmount: newRollover,
      }),
    });

    setEditingCategory(null);
    loadBudget();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-purple-400" />
            <span>Budgets & Spending Targets</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Category expense limits, rollover policies, and envelope fund allocations.
          </p>
        </div>

        {budget && (
          <button
            onClick={() => setSelectedExplainer(budget.explainer)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
            <span>How Budget Is Calculated</span>
          </button>
        )}
      </div>

      {/* Edit Allocation Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateAllocation}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-sm text-zinc-100">
                Adjust Budget: {editingCategory.categoryName}
              </span>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Allocated Spending Target ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                required
                autoFocus
                value={newAllocated}
                onChange={e => setNewAllocated(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Carried-Over Amount ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={newRollover}
                onChange={e => setNewRollover(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold"
              >
                Save Allocation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Budget Summary Card */}
      {budget && (
        <div className="p-5 bg-gradient-to-r from-zinc-900 to-purple-950/30 border border-zinc-800 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
              {budget.budgetName} • Rollover: {budget.rolloverMode}
            </span>
            <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">
              ${budget.totalRemaining} Remaining
            </p>
            <p className="text-xs text-zinc-400">
              ${budget.totalSpent} spent of ${budget.totalAllocated} total allocated ({budget.periodStart} to {budget.periodEnd})
            </p>
          </div>

          <div className="w-full md:w-64 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
              <span>Overall Utilization</span>
              <span>{budget.overallPercentUsed}%</span>
            </div>
            <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  parseFloat(budget.overallPercentUsed) > 90 ? 'bg-red-500' : 'bg-purple-500'
                }`}
                style={{ width: `${Math.min(100, parseFloat(budget.overallPercentUsed))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Category Budget Lines Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Category Budget Envelopes
          </span>
          <span className="text-[11px] text-zinc-500">Click any row to adjust monthly allocation</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider select-none">
              <tr>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Allocated</th>
                <th className="py-3 px-4 text-right">Rollover</th>
                <th className="py-3 px-4 text-right">Total Budgeted</th>
                <th className="py-3 px-4 text-right">Actual Spent</th>
                <th className="py-3 px-4 text-right">Remaining</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {budget?.items?.map((item: any) => (
                <tr
                  key={item.categoryId}
                  onClick={() => {
                    setEditingCategory(item);
                    setNewAllocated(item.allocatedAmount);
                    setNewRollover(item.rolloverAmount);
                  }}
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.categoryColor || '#6366f1' }}
                      />
                      <span className="font-semibold text-zinc-200">{item.categoryName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-300">${item.allocatedAmount}</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-400">${item.rolloverAmount}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">${item.totalBudgeted}</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">${item.spentAmount}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    <span className={item.status === 'over' ? 'text-red-400' : 'text-emerald-400'}>
                      ${item.remainingAmount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`text-[9px] uppercase px-2 py-0.5 rounded font-mono font-semibold ${
                        item.status === 'over'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : item.status === 'warning'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {item.percentUsed}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
