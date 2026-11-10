'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { todayISO } from '@/lib/time';
import { useTodayISO } from '@/lib/time/useTodayISO';
import { fmtMoney } from '../_shared/format';
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
  const [categories, setCategories] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // [defer] today's date via hook — synchronous todayISO() at render aborts prerender
  const currentDate = useTodayISO();

  const loadRules = () => {
    fetch('/api/finance/recurring')
      .then(r => r.json())
      .then(data => setRules(data.recurringRules || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0) setAccountId(data.accounts[0].accountId);
      })
      .catch(() => {});

    fetch('/api/finance/budgets')
      .then(r => r.json())
      .then(data => {
        if (data.budget?.items) {
          setCategories(data.budget.items);
        }
      })
      .catch(() => {});

    loadRules();
  }, []);

  const isDuplicate = name.trim().length > 0 && rules.some(
    r => r.name?.toLowerCase().trim() === name.trim().toLowerCase()
  );

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !amount || !accountId || !nextDate) {
      setFormError('Please fill in all required fields.');
      return;
    }

    try {
      const res = await fetch('/api/finance/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          expectedAmount: amount,
          accountId,
          categoryId: categoryId || null,
          nextDueDate: nextDate,
          frequency,
          ruleType: 'bill',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || 'Failed to save recurring obligation');
        return;
      }

      setName('');
      setAmount('');
      setNextDate('');
      setCategoryId('');
      setIsAddOpen(false);
      loadRules();
    } catch (err: any) {
      setFormError(err.message || 'Network error saving obligation');
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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

      {/* Safe-to-Spend Guarantee Explainer */}
      <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300">
          <span className="font-semibold text-zinc-200">Safe-to-Spend Cash Reservation: </span>
          Active recurring obligations reserve funds from your liquid accounts prior to their due dates, ensuring you never inadvertently spend money earmarked for rent, subscriptions, or debt payments.
        </div>
      </div>

      {isAddOpen && (
        <form onSubmit={handleAddRule} className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">Add Recurring Bill</span>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>

          {formError && (
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
              {formError}
            </div>
          )}

          {isDuplicate && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Duplicate Warning:</strong> A rule named &ldquo;{name.trim()}&rdquo; already exists. Adding a duplicate rule will cause multiple deductions against your Safe-to-Spend limit.
              </div>
            </div>
          )}

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
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Budget Envelope (Optional)</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
              >
                <option value="">None (Uncategorized)</option>
                {categories.map(c => (
                  <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold">
            Save Obligation
          </button>
        </form>
      )}

      {/* Rules Grid */}
      {rules.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-950/40 border border-amber-800/40 flex items-center justify-center mx-auto text-amber-400">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200">No Recurring Bills or Subscriptions</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
              Track predictable monthly outflows (rent, software subscriptions, insurance, utilities). Personal OS reserves cash for these obligations so your Safe-to-Spend calculation remains reliable.
            </p>
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Recurring Obligation</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rules.map(rule => (
            <div key={rule.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                      {rule.frequency} {rule.rule_type}
                    </span>
                    {rule.category_name && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: `${rule.category_color || '#6366f1'}20`,
                          color: rule.category_color || '#818cf8',
                          border: `1px solid ${rule.category_color || '#6366f1'}40`
                        }}
                      >
                        {rule.category_name}
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-bold text-zinc-100 mt-1">{rule.name}</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Account: {rule.account_name}</p>
                </div>
                <span className="font-mono text-base font-extrabold text-amber-400 tabular-nums">
                  {fmtMoney(rule.expected_amount)}
                </span>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="tabular-nums">Next: {rule.next_due_date}</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono uppercase">{rule.auto_action || 'reminder_only'}</span>
              </div>

              {/* Overdue obligations are reserved immediately by the Safe-to-Spend projection
                  (schedule-aware read-time projection; persisted next_due_date is untouched).
                  Surface this so a user knows the amount is still being set aside. */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">
                  {rule.is_active === 1 || rule.is_active ? 'Active on ledger' : 'Inactive'}
                </span>
                {currentDate && String(rule.next_due_date) < currentDate ? (
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1" title="This occurrence's projected due date is in the past. Safe-to-Spend reserves its amount immediately (schedule-aware projection) until it is posted; the persisted schedule is not modified.">
                    <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                    Overdue — reserved immediately by Safe-to-Spend
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
