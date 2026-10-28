'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  TrendingDown,
  Plus,
  Zap,
  Snowflake,
  ShieldAlert,
  Calendar,
  Percent,
} from 'lucide-react';

export default function DebtsPage() {
  const [debts, setDebts] = useState<any[]>([]);
  const [payoffScenarios, setPayoffScenarios] = useState<any | null>(null);
  const [extraPayment, setExtraPayment] = useState('100.00');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [interestRate, setInterestRate] = useState('18.00');
  const [minimumPayment, setMinimumPayment] = useState('50.00');

  const loadDebts = () => {
    fetch(`/api/finance/debts?extra=${extraPayment}`)
      .then(r => r.json())
      .then(data => {
        setDebts(data.debts || []);
        setPayoffScenarios(data.payoffScenarios);
      });
  };

  useEffect(() => {
    loadDebts();
  }, [extraPayment]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !balance) return;

    await fetch('/api/finance/debts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        principalBalance: balance,
        interestRate,
        minimumPayment,
      }),
    });

    setName('');
    setBalance('');
    setIsAddOpen(false);
    loadDebts();
  };

  const totalDebt = debts.reduce((sum, d) => sum + parseFloat(d.principal_balance || '0'), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <span>Debts & Payoff Scenarios</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Compare debt elimination timelines using mathematical Avalanche (Highest APR) vs Snowball (Lowest Principal) models.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Debt Entry</span>
        </button>
      </div>

      {isAddOpen && (
        <form onSubmit={handleAddDebt} className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 max-w-lg">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-xs text-zinc-200">Track Liability / Loan</span>
            <button type="button" onClick={() => setIsAddOpen(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Name / Creditor</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Visa Credit Card"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Principal ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">APR (%)</label>
              <input
                type="number"
                step="0.01"
                required
                value={interestRate}
                onChange={e => setInterestRate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Min Pay ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={minimumPayment}
                onChange={e => setMinimumPayment(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold">
            Save Liability
          </button>
        </form>
      )}

      {/* Avalanche vs Snowball Scenario Comparison */}
      {payoffScenarios && (
        <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Payoff Strategy Comparison</h2>
              <p className="text-xs text-zinc-400">Total Outstanding Liabilities: ${totalDebt.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Extra Monthly Payment:</span>
              <input
                type="number"
                step="10"
                value={extraPayment}
                onChange={e => setExtraPayment(e.target.value)}
                className="w-24 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-100 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Avalanche */}
            <div className="p-4 bg-zinc-950/60 border border-indigo-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>Avalanche Strategy (Highest APR First)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500 block">Debt-Free In</span>
                  <span className="font-mono text-lg font-bold text-zinc-100">
                    {payoffScenarios.avalanche?.monthsToDebtFree} Months
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Interest Paid</span>
                  <span className="font-mono text-lg font-bold text-emerald-400">
                    ${payoffScenarios.avalanche?.totalInterestPaid}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">
                Mathematically optimal: minimizes total interest paid over the repayment lifecycle.
              </p>
            </div>

            {/* Snowball */}
            <div className="p-4 bg-zinc-950/60 border border-blue-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                <Snowflake className="w-4 h-4" />
                <span>Snowball Strategy (Lowest Balance First)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500 block">Debt-Free In</span>
                  <span className="font-mono text-lg font-bold text-zinc-100">
                    {payoffScenarios.snowball?.monthsToDebtFree} Months
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Interest Paid</span>
                  <span className="font-mono text-lg font-bold text-amber-400">
                    ${payoffScenarios.snowball?.totalInterestPaid}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">
                Psychological wins: eliminates smaller balances first to build momentum.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Debts Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Current Liabilities</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Liability</th>
                <th className="py-3 px-4 text-right">Principal Balance</th>
                <th className="py-3 px-4 text-right">Interest Rate (APR)</th>
                <th className="py-3 px-4 text-right">Minimum Monthly</th>
                <th className="py-3 px-4 text-center">Due Day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {debts.map(d => (
                <tr key={d.id} className="hover:bg-zinc-800/40">
                  <td className="py-3 px-4 font-sans font-medium text-zinc-200">{d.name}</td>
                  <td className="py-3 px-4 text-right font-bold text-red-400">${d.principal_balance}</td>
                  <td className="py-3 px-4 text-right text-zinc-300">{d.interest_rate}%</td>
                  <td className="py-3 px-4 text-right text-zinc-300">${d.minimum_payment}</td>
                  <td className="py-3 px-4 text-center text-zinc-400">{d.due_day_of_month}th</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
