'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { todayISO } from '@/lib/time';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';
import { fmtMoney, toDecimal } from '../_shared/format';
import {
  Receipt,
  Plus,
  Search,
  ArrowRightLeft,
  Trash2,
  Tag,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  Repeat,
} from 'lucide-react';

interface TransactionRow {
  id: string;
  date: string;
  description: string;
  payee_name: string | null;
  notes: string | null;
  amount: string;
  transaction_type: 'income' | 'expense' | 'transfer' | 'refund';
  status: string;
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
  category_color: string | null;
}

interface AccountRow {
  accountId: string;
  accountName: string;
  accountType: string;
  currentBalance: string;
  currency: string;
}

interface CategoryRow {
  id: string;
  name: string;
  type: string;
  color: string | null;
}

interface TransactionPayload {
  transactionType: 'expense' | 'income' | 'transfer' | 'refund';
  date: string;
  accountId: string;
  amount: string;
  description: string;
  status: 'posted' | 'pending';
  notes?: string;
  tags?: string[];
  toAccountId?: string;
  categoryId?: string;
  recurringConfig?: {
    isRecurring: boolean;
    frequency: string;
    nextDueDate: string;
    ruleType: string;
  };
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Progressive Disclosure Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form Fields - Essential
  const [formType, setFormType] = useState<'expense' | 'income' | 'transfer' | 'refund'>('expense');
  const [formDate, setFormDate] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formAccountId, setFormAccountId] = useState<string>('');
  const [formToAccountId, setFormToAccountId] = useState<string>('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');

  // Form Fields - Advanced (Progressive Disclosure)
  const [formTags, setFormTags] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'posted' | 'pending'>('posted');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string>('monthly');
  const [recurringNextDate, setRecurringNextDate] = useState<string>('');
  const [recurringRuleType, setRecurringRuleType] = useState<string>('bill');

  // Request sequencing: this loader runs from the search effect, the
  // data-changed listener and after every write. Without a generation check a
  // slow pre-write GET can resolve last and overwrite the list with a snapshot
  // that predates the row the operator just created.
  const listRequestRef = useRef(0);

  const loadTransactions = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search });
      if (selectedAccount !== 'all') params.set('accountId', selectedAccount);
      if (selectedType !== 'all') params.set('type', selectedType);
      const data = await apiFetch<{ transactions: TransactionRow[] }>(
        `/api/finance/transactions?${params.toString()}`
      );
      if (requestId !== listRequestRef.current) return;
      setTransactions(data.transactions ?? []);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(errorText(err));
    } finally {
      if (requestId === listRequestRef.current) setIsLoading(false);
    }
  }, [search, selectedAccount, selectedType]);

  // Selection defaults are applied through functional updates so the loader never
  // depends on the form state it seeds (that would refetch on every selection).
  const loadDependencies = useCallback(async () => {
    try {
      const [accData, catData] = await Promise.all([
        apiFetch<{ accounts: AccountRow[] }>('/api/finance/accounts'),
        apiFetch<{ categories: CategoryRow[] }>('/api/finance/categories'),
      ]);
      const accs = accData.accounts ?? [];
      setAccounts(accs);
      setFormAccountId(current => (current ? current : accs[0]?.accountId ?? current));
      setFormToAccountId(current => (current ? current : accs[1]?.accountId ?? current));

      const cats = catData.categories ?? [];
      setCategories(cats);
      setFormCategoryId(current => (current ? current : cats[0]?.id ?? current));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadDependencies();
    })();
  }, [loadDependencies]);

  useEffect(() => {
    void (async () => {
      await loadTransactions();
    })();
  }, [loadTransactions]);

  // QuickAddModal (shared) now only calls router.refresh() after a write, which does not
  // re-run client-side effects — listen for the cross-page data-change signal so the
  // ledger view is never stale after a Quick Add. Contract: QuickAddModal dispatches
  // `window.dispatchEvent(new Event('personal-os:data-changed'))`; no-op until then.
  useEffect(() => {
    const h = () => {
      void loadTransactions();
      void loadDependencies();
    };
    window.addEventListener('personal-os:data-changed', h);
    return () => window.removeEventListener('personal-os:data-changed', h);
  }, [loadTransactions, loadDependencies]);

  const resetForm = () => {
    setFormType('expense');
    setFormDate(todayISO());
    setFormAmount('');
    setFormDescription('');
    setFormTags('');
    setFormNotes('');
    setFormStatus('posted');
    setIsRecurring(false);
    setRecurringNextDate('');
    setShowAdvanced(false);
    setSubmitError(null);
  };

  const openModal = () => {
    resetForm();
    setFormDate(todayISO());
    setFormAccountId(current => current || accounts[0]?.accountId || '');
    setFormToAccountId(current => current || accounts[1]?.accountId || accounts[0]?.accountId || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSubmitError(null);
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formAccountId) {
      setSubmitError('Choose an account first — the ledger has no accounts loaded yet.');
      return;
    }
    if (formType === 'transfer' && !formToAccountId) {
      setSubmitError('Destination account is required for transfers');
      return;
    }
    if (formType === 'transfer' && formAccountId === formToAccountId) {
      setSubmitError('Source and destination accounts must be distinct');
      return;
    }
    const parsedAmount = parseFloat(formAmount);
    if (!formAmount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      setSubmitError('Please enter a valid positive monetary amount (max 2 decimals, e.g. 12.34)');
      return;
    }
    // Sub-cent rounding is half-up via exact decimal parsing, never silent truncation ("1.005" -> "1.01").
    const roundedAmount = toDecimal(formAmount).toDecimalPlaces(2).toNumber();
    if (roundedAmount <= 0) {
      setSubmitError('Please enter a valid positive monetary amount');
      return;
    }
    if (!formDescription.trim()) {
      setSubmitError('Description is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const tagsArray = formTags
        ? formTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const payload: TransactionPayload = {
        transactionType: formType,
        date: formDate,
        accountId: formAccountId,
        amount: roundedAmount.toFixed(2),
        description: formDescription.trim(),
        status: formStatus,
        notes: formNotes.trim() || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      };

      if (formType === 'transfer') {
        payload.toAccountId = formToAccountId;
      } else {
        payload.categoryId = formCategoryId || undefined;
      }

      if (isRecurring) {
        payload.recurringConfig = {
          isRecurring: true,
          frequency: recurringFrequency,
          nextDueDate: recurringNextDate || formDate,
          ruleType: formType === 'income' ? 'income' : recurringRuleType,
        };
      }

      await apiSend<{ transaction: { id: string } }>('/api/finance/transactions', 'POST', payload);

      closeModal();
      await loadTransactions();
      await loadDependencies();
    } catch (err) {
      setSubmitError(errorText(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const voidTransaction = async (txId: string) => {
    if (!confirm('Void this transaction? A reversal ledger entry will be recorded.')) return;
    try {
      await apiSend<{ success: boolean; reversalId: string }>(
        `/api/finance/transactions?id=${encodeURIComponent(txId)}`,
        'DELETE'
      );
    } catch (err) {
      setError(errorText(err));
      return;
    }
    await loadTransactions();
    await loadDependencies();
  };

  const selectedSourceAccount = accounts.find(a => a.accountId === formAccountId);
  const selectedDestAccount = accounts.find(a => a.accountId === formToAccountId);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Receipt className="w-4 h-4 text-zinc-400" />
            <span>Transactions & Journal Ledger</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Authoritative, double-entry balanced transaction ledger with exact monetary calculations.
          </p>
        </div>

        <button
          type="button"
          onClick={openModal}
          disabled={accounts.length === 0}
          title={accounts.length === 0 ? 'Loading ledger accounts…' : undefined}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Transaction</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Strip */}
      <div className="p-3 bg-zinc-950/60 border border-white/[0.06] rounded-lg flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            aria-label="Search payee or memo"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search payee or memo..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/60 border border-white/[0.08] rounded-md text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
          />
        </div>

        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          aria-label="Filter transactions by account"
          className="bg-zinc-900/60 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-400 transition-colors"
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => (
            <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
          ))}
        </select>

        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          aria-label="Filter transactions by type"
          className="bg-zinc-900/60 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-400 transition-colors"
        >
          <option value="all">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
          <option value="refund">Refund</option>
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-zinc-950/60 border border-white/[0.06] rounded-lg overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-zinc-900/60 text-zinc-400 border-b border-white/[0.06] uppercase text-[10px] tracking-wider select-none">
              <tr>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Payee & Description</th>
                <th className="py-2.5 px-4 font-medium">Account Movement</th>
                <th className="py-2.5 px-4 font-medium">Category</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 text-right font-medium">Amount</th>
                <th className="py-2.5 px-4 text-center font-medium">Status</th>
                <th className="py-2.5 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-zinc-500">
                    Loading ledger entries…
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="max-w-xs mx-auto space-y-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/[0.08] flex items-center justify-center mx-auto text-zinc-400">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">
                          {search || selectedAccount !== 'all' || selectedType !== 'all'
                            ? 'No matching transactions'
                            : 'No ledger transactions yet'}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {search || selectedAccount !== 'all' || selectedType !== 'all'
                            ? 'Try clearing your search term or adjusting filters.'
                            : 'Record your first transaction or import a statement to start your verified ledger.'}
                        </p>
                      </div>
                      {search || selectedAccount !== 'all' || selectedType !== 'all' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setSelectedAccount('all');
                            setSelectedType('all');
                          }}
                          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openModal}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add First Transaction</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map(tx => {
                  const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'refund';
                  const isTransfer = tx.transaction_type === 'transfer';
                  const isVoided = tx.status === 'voided';
                  const isPending = tx.status === 'pending';

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        isVoided ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-zinc-400 whitespace-nowrap text-[11px]">
                        {tx.date}
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-zinc-200">{tx.description}</p>
                        {tx.payee_name && tx.payee_name !== tx.description && (
                          <p className="text-[11px] text-zinc-500">{tx.payee_name}</p>
                        )}
                        {tx.notes && (
                          <p className="text-[10px] text-zinc-500 italic mt-0.5 line-clamp-1">{tx.notes}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-300">
                        {isTransfer ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-zinc-300">{tx.account_name}</span>
                            <ArrowRightLeft className="w-3 h-3 text-sky-400 shrink-0" />
                            <span className="text-sky-300">{tx.to_account_name || 'Destination'}</span>
                          </span>
                        ) : (
                          <span>{tx.account_name}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {tx.category_name ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-zinc-300 bg-zinc-900 border border-white/[0.06]">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: tx.category_color || '#a1a1aa' }}
                            />
                            {tx.category_name}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 uppercase text-[10px] tracking-wide text-zinc-400 font-mono">
                        {tx.transaction_type}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium whitespace-nowrap">
                        <span className={
                          isTransfer
                            ? 'text-sky-400'
                            : isIncome
                            ? 'text-emerald-400'
                            : 'text-zinc-100'
                        }>
                          {isTransfer ? `↔ ${fmtMoney(tx.amount)}` : `${isIncome ? '+' : '-'}${fmtMoney(tx.amount)}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-mono border ${
                          isPending
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : isVoided
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-zinc-900 text-zinc-400 border-white/[0.04]'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {!isVoided && (
                          <button
                            onClick={() => voidTransaction(tx.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                            title="Void transaction"
                            aria-label={`Void transaction ${tx.description || tx.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Progressive Disclosure Transaction Entry Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="New Ledger Transaction"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-xl bg-zinc-950 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08] bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-200 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Record Ledger Transaction</h2>
                  <p className="text-[11px] text-zinc-400">Essential fields upfront, advanced parameters expandable</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="p-5 space-y-4">
              {submitError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* 1. Transaction Type Toggle */}
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
                  Transaction Type
                </label>
                <div className="grid grid-cols-4 gap-1.5 bg-zinc-900 p-1 rounded-lg border border-white/[0.06]">
                  {(['expense', 'income', 'transfer', 'refund'] as const).map(type => {
                    const isActive = formType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormType(type)}
                        className={`py-1.5 text-xs font-medium rounded-md capitalize transition-all ${
                          isActive
                            ? type === 'expense'
                              ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-white/[0.1]'
                              : type === 'income'
                              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                              : type === 'transfer'
                              ? 'bg-sky-600/30 text-sky-300 border border-sky-500/30'
                              : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Amount and Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tx-amount" className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                    Amount ($) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-zinc-400 text-sm font-mono">$</span>
                    <input
                      id="tx-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 bg-zinc-900 border border-white/[0.08] rounded-md text-sm font-mono font-medium text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="tx-date" className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                    Transaction Date *
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-900 border border-white/[0.08] rounded-md text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-400"
                  />
                </div>
              </div>

              {/* 3. Account Selection: Dedicated Dual-Account Card for Transfers */}
              {formType === 'transfer' ? (
                <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-sky-500/20 space-y-3">
                  <div className="flex items-center justify-between text-xs text-sky-300 font-medium">
                    <span className="flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Inter-Account Transfer Route</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">100% P&L Neutral</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label htmlFor="tx-source-account" className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                        Source Account (From / Outflow) *
                      </label>
                      <select
                        id="tx-source-account"
                        value={formAccountId}
                        onChange={e => setFormAccountId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.1] rounded-md text-xs text-zinc-200 focus:outline-none focus:border-sky-400"
                      >
                        {accounts.map(a => (
                          <option key={a.accountId} value={a.accountId}>
                            {a.accountName} ({fmtMoney(a.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="tx-destination-account" className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                        Destination Account (To / Inflow) *
                      </label>
                      <select
                        id="tx-destination-account"
                        value={formToAccountId}
                        onChange={e => setFormToAccountId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.1] rounded-md text-xs text-zinc-200 focus:outline-none focus:border-sky-400"
                      >
                        {accounts.map(a => (
                          <option key={a.accountId} value={a.accountId}>
                            {a.accountName} ({fmtMoney(a.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tx-account" className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                      Account *
                    </label>
                    <select
                      id="tx-account"
                      value={formAccountId}
                      onChange={e => setFormAccountId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-white/[0.08] rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-400"
                    >
                      {accounts.map(a => (
                        <option key={a.accountId} value={a.accountId}>
                          {a.accountName} ({a.accountType.replace('_', ' ')}) • {fmtMoney(a.currentBalance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="tx-category" className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                      Category
                    </label>
                    <select
                      id="tx-category"
                      value={formCategoryId}
                      onChange={e => setFormCategoryId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-white/[0.08] rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-400"
                    >
                      <option value="">No Category / General</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 4. Description / Payee */}
              <div>
                <label htmlFor="tx-description" className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                  Payee &amp; Description *
                </label>
                <input
                  id="tx-description"
                  type="text"
                  required
                  placeholder={
                    formType === 'transfer'
                      ? 'e.g. Monthly transfer to emergency savings'
                      : formType === 'income'
                      ? 'e.g. Tech Corp Monthly Salary'
                      : 'e.g. Trader Joe\'s, Apartment Rent, Broadband'
                  }
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-white/[0.08] rounded-md text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                />
              </div>

              {/* 5. Progressive Disclosure Toggle */}
              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <Tag className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Advanced Fields (Tags, Memo, Uncleared Status, Recurring Rule)</span>
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-3.5 rounded-lg bg-zinc-900/40 border border-white/[0.04] space-y-3.5 animate-in fade-in duration-150">
                    {/* Tags & Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="tx-tags" className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                          Tags (comma-separated)
                        </label>
                        <input
                          id="tx-tags"
                          type="text"
                          placeholder="e.g. tax, personal, reimburse"
                          value={formTags}
                          onChange={e => setFormTags(e.target.value)}
                          className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.08] rounded-md text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
                        />
                      </div>

                      <div>
                        <label htmlFor="tx-status" className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                          Settlement Status
                        </label>
                        <select
                          id="tx-status"
                          value={formStatus}
                          onChange={e => setFormStatus(e.target.value === 'pending' ? 'pending' : 'posted')}
                          className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.08] rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-400"
                        >
                          <option value="posted">Posted (Settled on Ledger)</option>
                          <option value="pending">Pending (Uncleared Authorization)</option>
                        </select>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Pending items deduct from Safe-to-Spend without altering posted balances.
                        </p>
                      </div>
                    </div>

                    {/* Notes / Memo */}
                    <div>
                      <label htmlFor="tx-notes" className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                        Notes &amp; Invoice Memo
                      </label>
                      <textarea
                        id="tx-notes"
                        rows={2}
                        placeholder="Internal notes, invoice numbers, check references..."
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-white/[0.08] rounded-md text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-400 resize-none"
                      />
                    </div>

                    {/* Recurring Configuration */}
                    <div className="pt-2 border-t border-white/[0.04] space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isRecurring}
                          onChange={e => setIsRecurring(e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-zinc-100 focus:ring-0"
                        />
                        <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                          <Repeat className="w-3 h-3 text-zinc-400" />
                          <span>Establish as an active Recurring Rule</span>
                        </span>
                      </label>

                      {isRecurring && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pl-6 pt-1">
                          <div>
                            <label htmlFor="tx-recurring-frequency" className="block text-[10px] uppercase text-zinc-500 mb-1">Frequency</label>
                            <select
                              id="tx-recurring-frequency"
                              value={recurringFrequency}
                              onChange={e => setRecurringFrequency(e.target.value)}
                              className="w-full px-2.5 py-1 bg-zinc-950 border border-white/[0.08] rounded text-xs text-zinc-200"
                            >
                              <option value="monthly">Monthly</option>
                              <option value="weekly">Weekly</option>
                              <option value="biweekly">Bi-weekly</option>
                              <option value="yearly">Yearly</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor="tx-recurring-next-date" className="block text-[10px] uppercase text-zinc-500 mb-1">Next Due Date</label>
                            <input
                              id="tx-recurring-next-date"
                              type="date"
                              value={recurringNextDate || formDate}
                              onChange={e => setRecurringNextDate(e.target.value)}
                              className="w-full px-2.5 py-1 bg-zinc-950 border border-white/[0.08] rounded text-xs font-mono text-zinc-200"
                            />
                          </div>

                          <div>
                            <label htmlFor="tx-recurring-rule-type" className="block text-[10px] uppercase text-zinc-500 mb-1">Rule Category</label>
                            <select
                              id="tx-recurring-rule-type"
                              value={recurringRuleType}
                              onChange={e => setRecurringRuleType(e.target.value)}
                              className="w-full px-2.5 py-1 bg-zinc-950 border border-white/[0.08] rounded text-xs text-zinc-200"
                            >
                              <option value="bill">Fixed Bill</option>
                              <option value="subscription">Subscription</option>
                              <option value="loan_payment">Debt Repayment</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Double-Entry Integrity Preview */}
              {formAmount && parseFloat(formAmount) > 0 && (
                <div className="p-3 rounded-lg bg-zinc-900/30 border border-white/[0.04] text-[11px] font-mono text-zinc-400 space-y-1">
                  <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase font-sans">
                    <span>Double-Entry Balance Contract</span>
                    <span className="text-emerald-400">Sum = $0.00 (Balanced)</span>
                  </div>
                  {formType === 'transfer' ? (
                    <>
                      <div className="flex justify-between">
                        <span>Debit (Inflow): {selectedDestAccount?.accountName || 'To Account'}</span>
                        <span className="text-emerald-400">+${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Credit (Outflow): {selectedSourceAccount?.accountName || 'From Account'}</span>
                        <span className="text-zinc-300">-${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                    </>
                  ) : formType === 'income' ? (
                    <>
                      <div className="flex justify-between">
                        <span>Debit: {selectedSourceAccount?.accountName || 'Account'}</span>
                        <span className="text-emerald-400">+${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Credit: Revenue / Income</span>
                        <span className="text-zinc-300">-${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                    </>
                  ) : formType === 'refund' ? (
                    <>
                      <div className="flex justify-between">
                        <span>Debit: {selectedSourceAccount?.accountName || 'Account'}</span>
                        <span className="text-emerald-400">+${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Credit: Category Refund Offset</span>
                        <span className="text-zinc-300">-${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Debit: Operating Expense</span>
                        <span className="text-zinc-300">+${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Credit: {selectedSourceAccount?.accountName || 'Account'}</span>
                        <span className="text-rose-400">-${parseFloat(formAmount).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Recording...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{formStatus === 'pending' ? 'Record Pending Entry' : 'Post Transaction'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
