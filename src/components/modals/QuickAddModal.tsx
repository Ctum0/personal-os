'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../layout/WorkspaceContext';
import { guardOffline } from '@/lib/offline/queue';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import { todayISO } from '@/lib/time';
import {
  X,
  CheckSquare,
  Lightbulb,
  Flame,
  Briefcase,
  Target,
  DollarSign,
} from 'lucide-react';

interface AccountOption {
  accountId: string;
  accountName: string;
  accountType: string;
  currentBalance: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: string;
}

const TYPES = [
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'idea', label: 'Idea / Inbox', icon: Lightbulb },
  { id: 'transaction', label: 'Transaction', icon: DollarSign },
  { id: 'habit', label: 'Habit', icon: Flame },
  { id: 'project', label: 'Project', icon: Briefcase },
  { id: 'goal', label: 'Goal', icon: Target },
] as const;

type QuickAddType = (typeof TYPES)[number]['id'];

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
  duration: '30',
  amount: '',
  txType: 'expense',
  accountId: '',
  categoryId: '',
};

/**
 * Universal create modal.
 *
 * Two invariants that the previous version broke:
 *  - the transaction target account comes from the operator's real accounts, not
 *    a hardcoded `acc_checking` id that may not exist;
 *  - the form is cleared when the modal closes, so a previous record's text never
 *    leaks into the next one.
 */
export function QuickAddModal() {
  const { isQuickAddOpen } = useWorkspace();
  // Mounted only while open, so the form starts empty on every open without a
  // reset effect (a previous record's text must never leak into the next one).
  if (!isQuickAddOpen) return null;
  return <QuickAddBody />;
}

function QuickAddBody() {
  const { setIsQuickAddOpen, workspace, activeSpaceId } = useWorkspace();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [activeType, setActiveType] = useState<QuickAddType>(workspace === 'finance' ? 'transaction' : 'task');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const close = useCallback(() => setIsQuickAddOpen(false), [setIsQuickAddOpen]);

  const loadFinanceOptions = useCallback(async () => {
    try {
      const [accountData, categoryData] = await Promise.all([
        apiFetch<{ accounts: AccountOption[] }>('/api/finance/accounts'),
        apiFetch<{ categories: CategoryOption[] }>('/api/finance/categories'),
      ]);
      const usable = accountData.accounts.filter(account => account.accountType !== 'credit_card');
      setAccounts(accountData.accounts);
      setCategories(categoryData.categories.filter(category => category.type === 'expense'));
      setForm(current => ({
        ...current,
        accountId: current.accountId || usable[0]?.accountId || accountData.accounts[0]?.accountId || '',
      }));
    } catch {
      // Non-fatal: the transaction tab explains the empty select rather than
      // posting to a guessed account id.
      setAccounts([]);
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    if (activeType !== 'transaction') return;
    void (async () => {
      await loadFinanceOptions();
    })();
  }, [activeType, loadFinanceOptions]);

  // Escape + focus trap + focus restore.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        document.querySelector<HTMLElement>('[aria-label="Quick Add (⌘N)"]')?.focus();
      }
    };
  }, [close]);

  const finish = (offlineNote?: string | null) => {
    window.dispatchEvent(new Event('personal-os:data-changed'));
    if (offlineNote) {
      setMessage(offlineNote);
      window.setTimeout(() => close(), 1500);
      return;
    }
    router.refresh();
    close();
  };

  const submitTaskLike = async (kind: 'task' | 'idea') => {
    const payload = {
      title: form.title.trim(),
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate || null,
      estimatedDuration: Number.parseInt(form.duration, 10) || 0,
      status: kind === 'idea' ? 'inbox' : 'next',
      spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
    };
    const { queuedOffline, response } = await guardOffline(kind === 'idea' ? 'quick_capture' : 'create_task', payload);
    if (queuedOffline) {
      finish('Saved to the offline queue — it will post when you are back online.');
      return;
    }
    if (response && !response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail =
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Request failed (${response.status})`;
      throw new Error(detail);
    }
    finish();
  };

  const submitTransaction = async () => {
    if (!form.accountId) {
      throw new Error('Select an account — no accounts exist in this ledger yet.');
    }
    const payload = {
      transactionType: form.txType,
      accountId: form.accountId,
      amount: form.amount,
      description: form.title.trim(),
      notes: form.description || undefined,
      date: form.dueDate || todayISO(),
      categoryId: form.categoryId || undefined,
    };
    const { queuedOffline, response } = await guardOffline('create_transaction', payload);
    if (queuedOffline) {
      finish('Saved to the offline queue — it will post when you are back online.');
      return;
    }
    if (response && !response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail =
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Request failed (${response.status})`;
      throw new Error(detail);
    }
    finish();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('A title is required.');
      return;
    }
    if (activeType === 'transaction' && !form.amount) {
      setError('An amount is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      switch (activeType) {
        case 'task':
        case 'idea':
          await submitTaskLike(activeType);
          break;
        case 'transaction':
          await submitTransaction();
          break;
        case 'project':
          await apiSend('/api/projects', 'POST', {
            name: form.title.trim(),
            description: form.description,
            targetDate: form.dueDate || undefined,
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          });
          finish();
          break;
        case 'goal':
          await apiSend('/api/goals', 'POST', {
            title: form.title.trim(),
            description: form.description,
            targetValue: Number.parseFloat(form.amount) || 100,
            unit: '%',
            deadline: form.dueDate || undefined,
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          });
          finish();
          break;
        case 'habit':
          await apiSend('/api/habits', 'POST', {
            title: form.title.trim(),
            description: form.description,
            targetValue: Number.parseFloat(form.amount) || 1,
            trackingType: 'boolean',
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          });
          finish();
          break;
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <h2 id="quick-add-title" className="font-semibold text-sm text-zinc-100">
            Universal Quick Add
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close quick add"
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div role="tablist" aria-label="Record type" className="flex items-center gap-1 px-4 pt-3 border-b border-zinc-800/60 pb-2 overflow-x-auto">
          {TYPES.map(type => {
            const Icon = type.icon;
            const selected = activeType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveType(type.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  selected ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${selected ? 'text-indigo-400' : 'text-zinc-500'}`} />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div role="alert" className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              {message}
            </div>
          )}

          <div>
            <label htmlFor="qa-title" className="block text-xs font-medium text-zinc-400 mb-1">
              {activeType === 'transaction' ? 'Payee / Merchant Description' : 'Title / Summary'}
            </label>
            <input
              id="qa-title"
              type="text"
              required
              autoFocus
              value={form.title}
              onChange={event => update('title', event.target.value)}
              placeholder={activeType === 'transaction' ? 'e.g. Whole Foods Market' : 'e.g. Complete quarterly roadmap draft'}
              className={fieldClass}
            />
          </div>

          {activeType === 'transaction' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="qa-tx-type" className="block text-xs font-medium text-zinc-400 mb-1">
                    Type
                  </label>
                  <select
                    id="qa-tx-type"
                    value={form.txType}
                    onChange={event => update('txType', event.target.value)}
                    className={fieldClass}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="refund">Refund</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="qa-amount" className="block text-xs font-medium text-zinc-400 mb-1">
                    Amount
                  </label>
                  <input
                    id="qa-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.amount}
                    onChange={event => update('amount', event.target.value)}
                    placeholder="0.00"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="qa-account" className="block text-xs font-medium text-zinc-400 mb-1">
                    Account
                  </label>
                  <select
                    id="qa-account"
                    value={form.accountId}
                    onChange={event => update('accountId', event.target.value)}
                    className={fieldClass}
                    disabled={accounts.length === 0}
                  >
                    {accounts.length === 0 ? (
                      <option value="">No accounts available</option>
                    ) : (
                      accounts.map(account => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.accountName} ({account.accountType}) • {account.currentBalance}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="qa-category" className="block text-xs font-medium text-zinc-400 mb-1">
                    Category
                  </label>
                  <select
                    id="qa-category"
                    value={form.categoryId}
                    onChange={event => update('categoryId', event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">No category</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qa-date" className="block text-xs font-medium text-zinc-400 mb-1">
                {activeType === 'transaction' ? 'Date' : 'Due / Target Date'}
              </label>
              <input
                id="qa-date"
                type="date"
                value={form.dueDate}
                onChange={event => update('dueDate', event.target.value)}
                className={fieldClass}
              />
            </div>
            {activeType === 'task' && (
              <div>
                <label htmlFor="qa-priority" className="block text-xs font-medium text-zinc-400 mb-1">
                  Priority
                </label>
                <select
                  id="qa-priority"
                  value={form.priority}
                  onChange={event => update('priority', event.target.value)}
                  className={fieldClass}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            )}
            {(activeType === 'goal' || activeType === 'habit') && (
              <div>
                <label htmlFor="qa-target" className="block text-xs font-medium text-zinc-400 mb-1">
                  {activeType === 'goal' ? 'Target Value' : 'Daily Target'}
                </label>
                <input
                  id="qa-target"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.amount}
                  onChange={event => update('amount', event.target.value)}
                  className={fieldClass}
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="qa-notes" className="block text-xs font-medium text-zinc-400 mb-1">
              Notes / Context
            </label>
            <textarea
              id="qa-notes"
              rows={2}
              value={form.description}
              onChange={event => update('description', event.target.value)}
              placeholder="Additional details, definition of done, or memo..."
              className={fieldClass}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
