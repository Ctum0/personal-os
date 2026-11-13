'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Decimal } from 'decimal.js';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import { fmtMoney, sumDecimalParts, toDecimal } from '../_shared/format';
import {
  PiggyBank,
  Plus,
  Target,
} from 'lucide-react';

interface SavingsGoalRow {
  id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  linked_account_name: string | null;
  notes: string | null;
  status: string;
  progressPercent: number;
}

interface SavingsAccountRow {
  accountId: string;
  accountName: string;
  accountType: string;
}

export default function SavingsGoalsPage() {
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoalRow[]>([]);
  const [accounts, setAccounts] = useState<SavingsAccountRow[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0.00');
  const [targetDate, setTargetDate] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    try {
      const data = await apiFetch<{ savingsGoals: SavingsGoalRow[] }>('/api/finance/savings-goals');
      setSavingsGoals(data.savingsGoals ?? []);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiFetch<{ accounts: SavingsAccountRow[] }>('/api/finance/accounts');
      setAccounts(data.accounts ?? []);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadGoals();
    })();
  }, [loadGoals]);

  useEffect(() => {
    void (async () => {
      await loadAccounts();
    })();
  }, [loadAccounts]);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !targetAmount) {
      setFormError('Goal name and target amount are required.');
      return;
    }

    try {
      await apiSend<{ savingsGoal: { id: string } }>('/api/finance/savings-goals', 'POST', {
        name: name.trim(),
        targetAmount,
        currentAmount: currentAmount || '0.00',
        targetDate: targetDate || null,
        linkedAccountId: linkedAccountId || null,
        notes: notes.trim() || null,
      });

      setName('');
      setTargetAmount('');
      setCurrentAmount('0.00');
      setTargetDate('');
      setLinkedAccountId('');
      setNotes('');
      setIsAddOpen(false);
      await loadGoals();
    } catch (err) {
      setFormError(errorText(err));
    }
  };

  const totalTarget = sumDecimalParts(savingsGoals.map(sg => sg.target_amount));
  const totalSaved = sumDecimalParts(savingsGoals.map(sg => sg.current_amount));
  const overallPercent = totalTarget.greaterThan(0) ? totalSaved.dividedBy(totalTarget).times(100).toDecimalPlaces(1).toFixed(1) : '0.0';

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Savings Goal</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      {savingsGoals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="text-xs text-zinc-400">Total Earmarked Capital</span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
              {fmtMoney(totalSaved)}
            </div>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="text-xs text-zinc-400">Total Milestones Target</span>
            <div className="text-xl font-bold font-mono text-zinc-100 mt-1 tabular-nums">
              {fmtMoney(totalTarget)}
            </div>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="text-xs text-zinc-400">Milestone Completion</span>
            <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
              {overallPercent}%
            </div>
          </div>
        </div>
      )}

      {/* Safe-to-Spend Reservation Protection Note */}
      <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start gap-3">
        <Target className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300">
          <span className="font-semibold text-zinc-200">Safe-to-Spend Earmark Protection: </span>
          All capital allocated to savings goals is quarantined from discretionary spending. The engine deducts earmarked funds from liquid balances so that your Safe-to-Spend figure accurately reflects uncommitted cash.
        </div>
      </div>

      {isAddOpen && (
        <form onSubmit={handleAddGoal} className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">New Savings Milestone</span>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>

          {formError && (
            <div role="alert" className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="goal-name" className="block text-xs font-medium text-zinc-400 mb-1">Goal Name</label>
            <input
              id="goal-name"
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
              <label htmlFor="goal-target-amount" className="block text-xs font-medium text-zinc-400 mb-1">Target Amount ($)</label>
              <input
                id="goal-target-amount"
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
              <label htmlFor="goal-current-amount" className="block text-xs font-medium text-zinc-400 mb-1">Current Saved ($)</label>
              <input
                id="goal-current-amount"
                type="number"
                step="0.01"
                value={currentAmount}
                onChange={e => setCurrentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-target-date" className="block text-xs font-medium text-zinc-400 mb-1">Target Date (Optional)</label>
              <input
                id="goal-target-date"
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="goal-linked-account" className="block text-xs font-medium text-zinc-400 mb-1">Linked Account (Optional)</label>
              <select
                id="goal-linked-account"
                value={linkedAccountId}
                onChange={e => setLinkedAccountId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
              >
                <option value="">General Liquid Cash</option>
                {accounts.filter(a => a.accountType === 'savings' || a.accountType === 'checking').map(a => (
                  <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="goal-notes" className="block text-xs font-medium text-zinc-400 mb-1">Notes / Description (Optional)</label>
            <input
              id="goal-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Parked in High-Yield Savings Account"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
            />
          </div>
          <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded-lg text-xs font-semibold">
            Create Savings Goal
          </button>
        </form>
      )}

      {/* Grid */}
      {savingsGoals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center mx-auto text-emerald-400">
            <PiggyBank className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200">No Savings Goals Configured</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
              Establish financial targets such as emergency reserves, down payments, or tax funds. Capital saved towards goals is quarantined from your daily Safe-to-Spend allowance.
            </p>
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Savings Goal</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {savingsGoals.map(sg => {
            const remaining = Decimal.max(toDecimal(sg.target_amount).minus(toDecimal(sg.current_amount)), 0);
            return (
              <div key={sg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      {sg.status || 'Active'} Milestone
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
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400 tabular-nums">
                    <span>Saved: {fmtMoney(sg.current_amount)}</span>
                    <span>Target: {fmtMoney(sg.target_amount)}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                  {sg.linked_account_name ? (
                    <span className="text-zinc-400">Account: {sg.linked_account_name}</span>
                  ) : (
                    <span>General Liquid Reserve</span>
                  )}
                  {remaining.greaterThan(0) ? (
                    <span className="font-mono text-zinc-400 tabular-nums">{fmtMoney(remaining)} to go</span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">Goal Achieved!</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
