'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { fmtMoney, fmtAbsMoney } from '../_shared/format';
import {
  BarChart3,
  TrendingUp,
  HelpCircle,
  Camera,
  Landmark,
  CreditCard,
} from 'lucide-react';

export default function NetWorthPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const loadNetWorth = () => {
    setIsLoading(true);
    fetch('/api/finance/net-worth')
      .then(r => r.json())
      .then(data => {
        setNetWorth(data.netWorth || null);
        setSnapshots(data.snapshots || []);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadNetWorth();
  }, []);

  const handleCaptureSnapshot = async () => {
    setIsTakingSnapshot(true);
    await fetch('/api/finance/net-worth', { method: 'POST' });
    setIsTakingSnapshot(false);
    loadNetWorth();
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <span>Net Worth Valuation</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Total valued assets minus outstanding liabilities, backed by verified ledger postings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {netWorth && (
            <button
              onClick={() => setSelectedExplainer(netWorth.explainer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
              <span>How Net Worth Is Calculated</span>
            </button>
          )}

          <button
            onClick={handleCaptureSnapshot}
            disabled={isTakingSnapshot}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isTakingSnapshot ? 'Recording...' : 'Capture Snapshot'}</span>
          </button>
        </div>
      </div>

      {/* Main Net Worth Metric Card */}
      {netWorth ? (
        <div className="p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-blue-950/40 border border-zinc-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Total Valued Net Worth
            </span>
            <p className={`text-4xl font-extrabold font-mono tracking-tight mt-1 tabular-nums ${parseFloat(String(netWorth.netWorth)) < 0 ? 'text-red-400' : 'text-zinc-100'}`}>
              {fmtMoney(netWorth.netWorth)} <span className="text-sm font-normal text-zinc-400">{netWorth.currency}</span>
            </p>
            <p className="text-xs text-zinc-400 mt-1">Snapshot as of {netWorth.asOfDate}</p>
          </div>

          <div className="flex items-center gap-8 text-xs font-mono tabular-nums">
            <div>
              <span className="text-zinc-500 block uppercase text-[10px]">Total Assets</span>
              <span className="text-lg font-bold text-emerald-400">+{fmtAbsMoney(netWorth.totalAssets)}</span>
            </div>
            <div>
              <span className="text-zinc-500 block uppercase text-[10px]">Total Liabilities</span>
              <span className="text-lg font-bold text-red-400">-{fmtAbsMoney(netWorth.totalLiabilities)}</span>
            </div>
          </div>
        </div>
      ) : !isLoading ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-xl max-w-md mx-auto space-y-3">
          <BarChart3 className="w-8 h-8 text-blue-400 mx-auto" />
          <h2 className="text-sm font-semibold text-zinc-200">No Net Worth Data Available</h2>
          <p className="text-xs text-zinc-400">Connect accounts or post transactions to generate your financial net worth balance sheet.</p>
        </div>
      ) : null}

      {/* Double Counting Protection Banner */}
      {netWorth && (
        <div className="p-3.5 bg-blue-950/20 border border-blue-500/20 rounded-xl text-xs text-blue-200/90 flex items-start gap-2.5">
          <TrendingUp className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Double-Counting Guard Active:</strong> Any liability account (such as credit cards or loans) linked to debt records is reconciled once through ledger balances. Standalone unlinked debt obligations are incorporated without duplication.
          </p>
        </div>
      )}

      {/* Assets & Liabilities Lists */}
      {netWorth && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider tabular-nums">
                Assets ({fmtMoney(netWorth.totalAssets)})
              </span>
              <span className="text-[11px] text-zinc-500">{netWorth.assetsList?.length || 0} accounts</span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {netWorth.assetsList?.map((a: any, i: number) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <p className="font-semibold text-zinc-200">{a.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase font-mono">{a.type}</p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">+{fmtAbsMoney(a.balance)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider tabular-nums">
                Liabilities ({fmtMoney(netWorth.totalLiabilities)})
              </span>
              <span className="text-[11px] text-zinc-500">{netWorth.liabilitiesList?.length || 0} accounts</span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {netWorth.liabilitiesList?.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">No outstanding liabilities.</div>
              ) : (
                netWorth.liabilitiesList?.map((l: any, i: number) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-red-400" />
                      <div>
                        <p className="font-semibold text-zinc-200">{l.name}</p>
                        <p className="text-[10px] text-zinc-500 uppercase font-mono">{l.type}</p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-red-400 tabular-nums">-{fmtAbsMoney(l.balance)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historical Snapshots Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Historical Valuation Snapshots
            </h2>
          </div>
          <span className="text-[11px] text-zinc-500">
            {snapshots.length} recorded {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 space-y-1">
            <p>No historical snapshots recorded yet.</p>
            <p className="text-[11px] text-zinc-600">
              Click &quot;Capture Snapshot&quot; to freeze today&apos;s verified valuation for longitudinal trend analysis.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800 font-mono">
                <tr>
                  <th className="py-2.5 px-3">Snapshot Date</th>
                  <th className="py-2.5 px-3 text-right">Total Assets</th>
                  <th className="py-2.5 px-3 text-right">Total Liabilities</th>
                  <th className="py-2.5 px-3 text-right">Net Worth</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {snapshots.map((s: any) => (
                  <tr key={s.id} className="hover:bg-zinc-800/40">
                    <td className="py-2.5 px-3 text-zinc-300 font-sans">{s.snapshot_date}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 tabular-nums">+{fmtAbsMoney(s.total_assets)}</td>
                    <td className="py-2.5 px-3 text-right text-red-400 tabular-nums">-{fmtAbsMoney(s.total_liabilities)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-zinc-100 tabular-nums">{fmtMoney(s.net_worth)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[9px] uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold font-sans">
                        Immutable
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
