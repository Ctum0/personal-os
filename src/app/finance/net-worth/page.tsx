'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
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

  const loadNetWorth = () => {
    fetch('/api/finance/net-worth')
      .then(r => r.json())
      .then(data => {
        setNetWorth(data.netWorth);
        setSnapshots(data.snapshots || []);
      });
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
    <div className="w-full px-8 py-6 space-y-6">
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
      {netWorth && (
        <div className="p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-blue-950/40 border border-zinc-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Total Valued Net Worth
            </span>
            <p className="text-4xl font-extrabold text-zinc-100 font-mono tracking-tight mt-1">
              ${netWorth.netWorth} <span className="text-sm font-normal text-zinc-400">{netWorth.currency}</span>
            </p>
            <p className="text-xs text-zinc-400 mt-1">Snapshot as of {netWorth.asOfDate}</p>
          </div>

          <div className="flex items-center gap-8 text-xs font-mono">
            <div>
              <span className="text-zinc-500 block uppercase text-[10px]">Total Assets</span>
              <span className="text-lg font-bold text-emerald-400">+${netWorth.totalAssets}</span>
            </div>
            <div>
              <span className="text-zinc-500 block uppercase text-[10px]">Total Liabilities</span>
              <span className="text-lg font-bold text-red-400">-${netWorth.totalLiabilities}</span>
            </div>
          </div>
        </div>
      )}

      {/* Assets & Liabilities Lists */}
      {netWorth && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Assets (${netWorth.totalAssets})
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
                  <span className="font-mono font-bold text-emerald-400">+${a.balance}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Liabilities (${netWorth.totalLiabilities})
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
                    <span className="font-mono font-bold text-red-400">-${l.balance}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
