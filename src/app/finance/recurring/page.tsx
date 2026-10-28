'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  ArrowRightLeft,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Landmark,
} from 'lucide-react';

export default function RecurringBillsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [accountId, setAccountId] = useState('');

  const loadRules = () => {
    fetch('/api/finance/recurring')
      .then(r => r.json())
      .then(data => setRules(data.recurringRules || []));
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0) setAccountId(data.accounts[0].accountId);
      });

    loadRules();
  }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || !accountId || !nextDate) return;

    await fetch('/api/finance/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        expectedAmount: amount,
        accountId,
        nextDueDate: nextDate,
        frequency,
        ruleType: 'bill',
      }),
    });

    setName('');
    setAmount('');
    setNextDate('');
    setIsAddOpen(false);
    loadRules();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            <span>Recurring Bills & Subscriptions</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Track future cash-flow obligations and recurring liabilities to guarantee uncommitted safe-to-spend numbers.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Recurring Obligation</span>
        </button>
      </div>

      {isAddOpen && (
        <form onSubmit={handleAddRule} className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">Add Recurring Bill</span>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Name / Service</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. AWS Cloud Services"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Next Due Date</label>
              <input
                type="date"
                required
                value={nextDate}
                onChange={e => setNextDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
            >
              {accounts.map(a => (
                <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold">
            Save Obligation
          </button>
        </form>
      )}

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {rules.map(rule => (
          <div key={rule.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                  {rule.frequency} {rule.rule_type}
                </span>
                <h2 className="text-sm font-bold text-zinc-100 mt-0.5">{rule.name}</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Account: {rule.account_name}</p>
              </div>
              <span className="font-mono text-base font-extrabold text-amber-400">
                ${rule.expected_amount}
              </span>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                Next: {rule.next_due_date}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono uppercase">{rule.auto_action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
