'use client';

import React, { useState, useEffect } from 'react';
import { Decimal } from 'decimal.js';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { fmtMoney, fmtAbsMoney, sumDecimalParts, ordinalOf, toDecimal } from '../_shared/format';
import {
  TrendingDown,
  Plus,
  Zap,
  Snowflake,
  ShieldAlert,
  Calendar,
  Percent,
  ShieldCheck,
  CheckCircle2,
  Info,
  HelpCircle,
  Link2,
} from 'lucide-react';

export default function DebtsPage() {
  const [debts, setDebts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payoffScenarios, setPayoffScenarios] = useState<any | null>(null);
  const [extraPayment, setExtraPayment] = useState('100.00');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [interestRate, setInterestRate] = useState('18.00');
  const [minimumPayment, setMinimumPayment] = useState('50.00');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadDebts = () => {
    setIsLoading(true);
    fetch(`/api/finance/debts?extra=${extraPayment}`)
      .then(r => r.json())
      .then(data => {
        setDebts(data.debts || []);
        setPayoffScenarios(data.payoffScenarios);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(() => {});
  }, []);

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
        linkedAccountId: linkedAccountId || null,
      }),
    });

    setName('');
    setBalance('');
    setLinkedAccountId('');
    setIsAddOpen(false);
    loadDebts();
  };

  const totalDebt = sumDecimalParts(debts.map(d => d.principal_balance));

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Linked Ledger Account (Optional)</label>
            <select
              value={linkedAccountId}
              onChange={e => setLinkedAccountId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
            >
              <option value="">None (Standalone Liability)</option>
              {accounts.filter(a => a.type === 'liability' || a.type === 'credit_card').map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500 mt-1">
              Linked liabilities auto-reconcile with ledger balances and avoid double counting in Net Worth.
            </p>
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
      {payoffScenarios && debts.length > 0 && (
        <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">Payoff Strategy Comparison</h2>
                <button
                  type="button"
                  onClick={() => setShowFormula(!showFormula)}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{showFormula ? 'Hide Formula' : 'Calculation Formula'}</span>
                </button>
              </div>
              <p className="text-xs text-zinc-400 tabular-nums">Total Outstanding Liabilities: {fmtMoney(totalDebt)}</p>
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

          {showFormula && (
            <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-zinc-200">Compound Amortization Payoff Logic</div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Both strategies simulate monthly billing cycles where accrued interest is computed as <span className="font-mono text-zinc-300">I_m = Principal × (APR / 1200)</span>.
                Minimum payments are fulfilled across all obligations first. Any surplus extra payment (<span className="font-mono text-zinc-300">{fmtMoney(extraPayment)}/mo</span>) is allocated to the priority debt until retired, after which its freed payment cascades into the next liability.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                <div className="border-l-2 border-indigo-500 pl-2 text-zinc-400">
                  <strong className="text-indigo-300">Avalanche Method:</strong> Prioritizes highest APR first to mathematically minimize cumulative interest expense.
                </div>
                <div className="border-l-2 border-blue-500 pl-2 text-zinc-400">
                  <strong className="text-blue-300">Snowball Method:</strong> Prioritizes lowest principal first to eliminate individual debt accounts faster for behavioral momentum.
                </div>
              </div>
            </div>
          )}

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
                  <span className="font-mono text-lg font-bold text-zinc-100 tabular-nums">
                    {payoffScenarios.avalanche?.monthsToDebtFree} Months
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Interest Paid</span>
                  <span className="font-mono text-lg font-bold text-red-400 tabular-nums">
                    {fmtMoney(payoffScenarios.avalanche?.totalInterestPaid)}
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
                  <span className="font-mono text-lg font-bold text-zinc-100 tabular-nums">
                    {payoffScenarios.snowball?.monthsToDebtFree} Months
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Interest Paid</span>
                  <span className="font-mono text-lg font-bold text-red-400 tabular-nums">
                    {fmtMoney(payoffScenarios.snowball?.totalInterestPaid)}
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
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Current Liabilities</span>
          <span className="text-[11px] text-zinc-500">
            {debts.length} {debts.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {debts.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">Zero Outstanding Debt</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
                You have no active liabilities or loan obligations registered. If you maintain credit cards, personal loans, or mortgages, track them here to compare payoff timelines.
              </p>
            </div>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Track First Liability</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Liability & Linkage</th>
                  <th className="py-3 px-4 text-right">Principal Balance</th>
                  <th className="py-3 px-4 text-right">APR</th>
                  <th className="py-3 px-4 text-right">Minimum Monthly</th>
                  <th className="py-3 px-4 text-center">Due Day</th>
                  <th className="py-3 px-4 text-right">Next Payment Split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {debts.map(d => {
                  // Payment split + effective balance come from the server (engine
                  // calculateDebtPaymentSplit, ledger-reconciled since wave 2). The client-side
                  // mirror below is only a fallback for older API responses.
                  const principal = toDecimal(d.principal_balance);
                  const apr = toDecimal(d.interest_rate);
                  const minPay = toDecimal(d.minimum_payment);
                  const serverSplit = d.paymentSplit || null;
                  const fallbackInterest = principal.times(apr.dividedBy(100).dividedBy(12)).toDecimalPlaces(2);
                  const fallbackPrincipalPortion = Decimal.min(Decimal.max(toDecimal(minPay).minus(fallbackInterest), 0), principal);
                  const interestPortion = serverSplit ? toDecimal(serverSplit.interestPortion) : fallbackInterest;
                  const principalPortion = serverSplit ? toDecimal(serverSplit.principalPortion) : fallbackPrincipalPortion;
                  const splitBasis = serverSplit ? toDecimal(serverSplit.previousPrincipal) : principal;
                  const ledgerDebt = d.ledgerOutstanding != null
                    ? toDecimal(d.ledgerOutstanding)
                    : (d.linked_account_id && accounts.find(a => a.accountId === d.linked_account_id)
                        ? toDecimal(accounts.find(a => a.accountId === d.linked_account_id).currentBalance).abs()
                        : null);
                  const mismatch = serverSplit && d.ledgerPrincipalMismatch != null
                    ? Boolean(d.ledgerPrincipalMismatch)
                    : (ledgerDebt != null && !ledgerDebt.equals(principal));
                  const balanceSource = d.balanceSource === 'ledger' || (serverSplit && splitBasis.equals(ledgerDebt || 0));
                  return (
                    <tr key={d.id} className="hover:bg-zinc-800/40">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-medium text-zinc-200">{d.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {d.linked_account_name ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                              mismatch
                                ? 'text-amber-400 bg-amber-950/40 border-amber-800/50'
                                : 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50'
                            }`}>
                              {mismatch ? (
                                <ShieldAlert className="w-3 h-3 shrink-0" />
                              ) : (
                                <ShieldCheck className="w-3 h-3 shrink-0" />
                              )}
                              Linked: {d.linked_account_name} — ledger {ledgerDebt ? fmtMoney(ledgerDebt) : '—'} {ledgerDebt ? 'owed' : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-950/40 px-1.5 py-0.5 rounded border border-zinc-800/50">
                              Standalone Liability
                            </span>
                          )}
                        </div>
                        {mismatch && (
                          <p className="text-[10px] text-amber-400/90 mt-1 font-mono">
                            {balanceSource
                              ? `Tracked principal (${fmtMoney(principal)}) is stale vs ledger balance (${fmtMoney(ledgerDebt)} owed, incl. unsettled charges) — payoff scenarios and this payment split now use the ledger-reconciled figure (${fmtMoney(splitBasis)}). Update this debt record to align tracked figures.`
                              : `Ledger balance (${fmtMoney(ledgerDebt)} owed) differs from tracked principal (${fmtMoney(principal)}) — payoff scenarios use the ${fmtMoney(principal)} tracked figure.`}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-red-400 tabular-nums">{fmtMoney(principal)}</td>
                      <td className="py-3 px-4 text-right text-zinc-300 tabular-nums">{apr.toFixed(2)}%</td>
                      <td className="py-3 px-4 text-right text-zinc-300 tabular-nums">{fmtMoney(minPay)}</td>
                      <td className="py-3 px-4 text-center text-zinc-400">{ordinalOf(d.due_day_of_month)}</td>
                      <td className="py-3 px-4 text-right text-[11px]" title={splitBasis && !splitBasis.equals(principal) ? `Split computed on the ledger-reconciled balance ${fmtMoney(splitBasis)}` : undefined}>
                        <div>
                          <span className="text-rose-400">-{fmtMoney(interestPortion)}</span>
                          <span className="text-zinc-500"> interest</span>
                        </div>
                        <div>
                          <span className="text-emerald-400/90">+{fmtMoney(principalPortion)}</span>
                          <span className="text-zinc-500"> principal</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
