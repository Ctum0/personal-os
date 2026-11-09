'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../layout/WorkspaceContext';
import { todayISO } from "@/lib/time";
import {
  X,
  CheckSquare,
  Lightbulb,
  Flame,
  Briefcase,
  Target,
  DollarSign,
  Clock,
  Calendar,
} from 'lucide-react';

export function QuickAddModal() {
  const { isQuickAddOpen, setIsQuickAddOpen, workspace, activeSpaceId } = useWorkspace();
  const router = useRouter();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Type default based on workspace
  const [activeType, setActiveType] = useState<string>(
    workspace === 'finance' ? 'transaction' : 'task'
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [duration, setDuration] = useState('30');
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState('expense');
  const [accountId, setAccountId] = useState('acc_checking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Escape key handler
  React.useEffect(() => {
    if (!isQuickAddOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsQuickAddOpen(false);
      }
      // Basic focus trap: cycle Tab within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isQuickAddOpen, setIsQuickAddOpen]);

  if (!isQuickAddOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && activeType !== 'transaction') return;
    if (activeType === 'transaction' && (!amount || !title.trim())) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      if (activeType === 'task' || activeType === 'idea') {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description,
            priority,
            dueDate: dueDate || null,
            estimatedDuration: parseInt(duration, 10) || 0,
            status: activeType === 'idea' ? 'inbox' : 'next',
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          }),
        });
        if (!res.ok) throw new Error('Failed to create task');
      } else if (activeType === 'transaction') {
        const res = await fetch('/api/finance/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionType: txType,
            accountId,
            amount,
            description: title.trim(),
            notes: description,
            date: dueDate || todayISO(),
          }),
        });
        if (!res.ok) throw new Error('Failed to record transaction');
      } else if (activeType === 'project') {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: title.trim(),
            description,
            targetDate: dueDate || null,
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          }),
        });
        if (!res.ok) throw new Error('Failed to create project');
      } else if (activeType === 'goal') {
        const res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description,
            targetValue: parseFloat(amount) || 100,
            unit: '%',
            deadline: dueDate || null,
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          }),
        });
        if (!res.ok) throw new Error('Failed to create goal');
      } else if (activeType === 'habit') {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description,
            targetValue: parseFloat(amount) || 1,
            trackingType: 'boolean',
            spaceId: activeSpaceId !== 'all' ? activeSpaceId : 'space_personal',
          }),
        });
        if (!res.ok) throw new Error('Failed to create habit');
      }

      // Refresh active view's data without a hard reload (preserves client state)
      router.refresh();
      setIsQuickAddOpen(false);
    } catch (err: any) {
      setMessage(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const types = [
    { id: 'task', label: 'Task', icon: CheckSquare },
    { id: 'idea', label: 'Idea / Inbox', icon: Lightbulb },
    { id: 'transaction', label: 'Transaction', icon: DollarSign },
    { id: 'habit', label: 'Habit', icon: Flame },
    { id: 'project', label: 'Project', icon: Briefcase },
    { id: 'goal', label: 'Goal', icon: Target },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Universal Quick Add"
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-zinc-100">Universal Quick Add</span>
          </div>
          <button
            onClick={() => setIsQuickAddOpen(false)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type selector tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-zinc-800/60 pb-2 overflow-x-auto">
          {types.map(t => {
            const Icon = t.icon;
            const isSelected = activeType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveType(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {message && (
            <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {message}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              {activeType === 'transaction' ? 'Payee / Merchant Description' : 'Title / Summary'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={activeType === 'transaction' ? 'e.g. Whole Foods Market' : 'e.g. Complete quarterly roadmap draft'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {activeType === 'transaction' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Type</label>
                <select
                  value={txType}
                  onChange={e => setTxType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="refund">Refund</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Amount ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                {activeType === 'transaction' ? 'Date' : 'Due / Target Date'}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {activeType === 'task' && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Notes / Context</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional details, definition of done, or memo..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
