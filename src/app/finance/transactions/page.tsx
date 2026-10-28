'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  ArrowRightLeft,
  Trash2,
  Calendar,
  Tag,
  Landmark,
} from 'lucide-react';

export default function TransactionsPage() {
  const { setIsQuickAddOpen } = useWorkspace();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const loadTransactions = () => {
    setIsLoading(true);
    let url = `/api/finance/transactions?search=${encodeURIComponent(search)}`;
    if (selectedAccount !== 'all') url += `&accountId=${selectedAccount}`;
    if (selectedType !== 'all') url += `&type=${selectedType}`;

    fetch(url)
      .then(r => r.json())
      .then(data => setTransactions(data.transactions || []))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => setAccounts(data.accounts || []));

    loadTransactions();
  }, [selectedAccount, selectedType, search]);

  const voidTransaction = async (txId: string) => {
    if (!confirm('Void this transaction? A reversal ledger entry will be recorded.')) return;
    await fetch(`/api/finance/transactions?id=${txId}`, { method: 'DELETE' });
    loadTransactions();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>Transactions & Journal Ledger</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Authoritative, double-entry balanced transaction ledger with exact monetary calculations.
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Transaction</span>
        </button>
      </div>

      {/* Filter Strip */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search payee or memo..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => (
            <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
          ))}
        </select>

        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
          <option value="refund">Refund</option>
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider select-none">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Payee & Description</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-zinc-500">
                    No transactions match your query.
                  </td>
                </tr>
              ) : (
                transactions.map(tx => {
                  const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'refund';
                  const isVoided = tx.status === 'voided';
                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        isVoided ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-zinc-200">{tx.description}</p>
                        {tx.payee_name && tx.payee_name !== tx.description && (
                          <p className="text-[11px] text-zinc-500">{tx.payee_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {tx.account_name}
                        {tx.to_account_name && ` → ${tx.to_account_name}`}
                      </td>
                      <td className="py-3 px-4">
                        {tx.category_name ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: `${tx.category_color || '#64748b'}20`,
                              color: tx.category_color || '#94a3b8',
                            }}
                          >
                            {tx.category_name}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px] font-semibold text-zinc-400">
                        {tx.transaction_type}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isIncome ? 'text-emerald-400' : 'text-zinc-100'}>
                          {isIncome ? '+' : '-'}${tx.amount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!isVoided && (
                          <button
                            onClick={() => voidTransaction(tx.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                            title="Void transaction"
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
    </div>
  );
}
