'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  Landmark,
  Plus,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  CreditCard,
  Wallet,
} from 'lucide-react';

export default function AccountsPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedReconcileAccount, setSelectedReconcileAccount] = useState<any | null>(null);
  const [statementBalance, setStatementBalance] = useState('');
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('checking');
  const [newAccOpening, setNewAccOpening] = useState('0.00');

  const loadAccounts = () => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => setAccounts(data.accounts || []));
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;

    await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAccName.trim(),
        type: newAccType,
        openingBalance: newAccOpening,
        currency: 'USD',
      }),
    });

    setNewAccName('');
    setIsAddAccountOpen(false);
    loadAccounts();
  };

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReconcileAccount || !statementBalance) return;

    const diff = (parseFloat(statementBalance) - parseFloat(selectedReconcileAccount.currentBalance)).toFixed(2);

    if (parseFloat(diff) === 0) {
      alert(`Account ${selectedReconcileAccount.accountName} is fully reconciled and balanced!`);
    } else {
      const confirmAdjustment = confirm(
        `Discrepancy of $${diff} detected against statement balance.\nWould you like to record an audit adjustment transaction?`
      );
      if (confirmAdjustment) {
        await fetch('/api/finance/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionType: parseFloat(diff) > 0 ? 'income' : 'expense',
            accountId: selectedReconcileAccount.accountId,
            amount: Math.abs(parseFloat(diff)).toFixed(2),
            description: `Reconciliation Balance Adjustment: ${selectedReconcileAccount.accountName}`,
            notes: `Statement balance: $${statementBalance}`,
          }),
        });
        loadAccounts();
      }
    }

    setSelectedReconcileAccount(null);
    setStatementBalance('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-400" />
            <span>Accounts & Balances</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Authoritative balances calculated from opening state plus posted journal entries.
          </p>
        </div>

        <button
          onClick={() => setIsAddAccountOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Account</span>
        </button>
      </div>

      {/* New Account Modal */}
      {isAddAccountOpen && (
        <form onSubmit={handleAddAccount} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">Create New Account</span>
            <button
              type="button"
              onClick={() => setIsAddAccountOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Account Name</label>
              <input
                type="text"
                required
                autoFocus
                value={newAccName}
                onChange={e => setNewAccName(e.target.value)}
                placeholder="e.g. Primary Savings"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Type</label>
                <select
                  value={newAccType}
                  onChange={e => setNewAccType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash / Wallet</option>
                  <option value="loan">Loan / Liability</option>
                  <option value="investment">Investment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Opening Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newAccOpening}
                  onChange={e => setNewAccOpening(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
            >
              Create Account
            </button>
          </div>
        </form>
      )}

      {/* Reconciliation Modal */}
      {selectedReconcileAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReconcileSubmit}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-sm text-zinc-100">
                Reconcile {selectedReconcileAccount.accountName}
              </span>
              <button
                type="button"
                onClick={() => setSelectedReconcileAccount(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div className="p-3 bg-zinc-950 rounded-lg text-xs space-y-1">
              <span className="text-zinc-500">Current Calculated Ledger Balance:</span>
              <p className="font-mono text-lg font-bold text-zinc-100">
                ${selectedReconcileAccount.currentBalance} {selectedReconcileAccount.currency}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Statement Ending Balance ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                required
                autoFocus
                value={statementBalance}
                onChange={e => setStatementBalance(e.target.value)}
                placeholder="Enter bank statement balance..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {statementBalance && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex items-center justify-between">
                <span className="text-zinc-400">Calculated Difference:</span>
                <span
                  className={`font-mono font-bold ${
                    parseFloat(statementBalance) === parseFloat(selectedReconcileAccount.currentBalance)
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  ${(parseFloat(statementBalance) - parseFloat(selectedReconcileAccount.currentBalance)).toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedReconcileAccount(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
              >
                Verify & Reconcile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map(acc => {
          const isDebt = acc.accountType === 'credit_card' || acc.accountType === 'loan';
          return (
            <div
              key={acc.accountId}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-zinc-700 transition-colors shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: acc.displayColor || '#10b981' }}
                  >
                    {isDebt ? <CreditCard className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">{acc.accountName}</h2>
                    <p className="text-[10px] text-zinc-500 uppercase font-mono mt-0.5">
                      {acc.accountType} • {acc.currency}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedExplainer(acc.explainer)}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors p-1"
                  title="Inspect balance calculation inputs"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Balance */}
              <div className="p-3 bg-zinc-950 rounded-lg">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">
                  Authoritative Balance
                </span>
                <p className="font-mono text-2xl font-extrabold text-zinc-100 mt-0.5">
                  ${acc.currentBalance}
                </p>
                <span className="text-[10px] text-zinc-500">
                  Opening: ${acc.openingBalance}
                </span>
              </div>

              {/* Reconciliation Action */}
              <button
                onClick={() => {
                  setSelectedReconcileAccount(acc);
                  setStatementBalance(acc.currentBalance);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Reconcile Statement</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
