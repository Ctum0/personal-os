'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../layout/WorkspaceContext';
import {
  Search,
  X,
  CheckSquare,
  Briefcase,
  Target,
  Landmark,
  Receipt,
  CalendarCheck,
  Clock,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';

export function CommandPaletteModal() {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    workspace,
    setIsQuickAddOpen,
    setIsAiDrawerOpen,
  } = useWorkspace();

  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scope, setScope] = useState<'current' | 'global'>('current');

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setIsLoading(true);
      const searchScope = scope === 'global' ? 'global' : workspace;
      fetch(`/api/search?q=${encodeURIComponent(query)}&scope=${searchScope}`)
        .then(res => res.json())
        .then(data => {
          setResults(data.results || []);
        })
        .finally(() => setIsLoading(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [query, scope, workspace]);

  if (!isCommandPaletteOpen) return null;

  const quickActions = [
    {
      id: 'act_plan',
      title: "Open Today's Daily Plan",
      subtitle: 'View today schedule and AI prioritized tasks',
      icon: CalendarCheck,
      action: () => router.push('/productivity/today'),
    },
    {
      id: 'act_timer',
      title: 'Start Focus Timer',
      subtitle: 'Open focus session tracking',
      icon: Clock,
      action: () => router.push('/productivity/focus'),
    },
    {
      id: 'act_tx',
      title: 'View Transactions Ledger',
      subtitle: 'Inspect financial journal and balances',
      icon: Receipt,
      action: () => router.push('/finance/transactions'),
    },
    {
      id: 'act_import',
      title: 'Import Bank CSV Statement',
      subtitle: 'Upload, deduplicate, and commit bank files',
      icon: FileSpreadsheet,
      action: () => router.push('/finance/import'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Type a command or search ${scope === 'global' ? 'all workspaces' : workspace}...`}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300 p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Scope Toggle */}
          <button
            onClick={() => setScope(scope === 'current' ? 'global' : 'current')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 transition-colors ${
              scope === 'global'
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            {scope === 'global' ? 'Global Scope' : `${workspace} Scope`}
          </button>
        </div>

        {/* Results / Commands list */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-zinc-800/40">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-zinc-500">Searching records...</div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              <p className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-500">Search Results</p>
              {results.map(r => (
                <div
                  key={r.id}
                  onClick={() => {
                    setIsCommandPaletteOpen(false);
                    router.push(r.link);
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    {r.type === 'Task' && <CheckSquare className="w-4 h-4 text-indigo-400" />}
                    {r.type === 'Project' && <Briefcase className="w-4 h-4 text-blue-400" />}
                    {r.type === 'Goal' && <Target className="w-4 h-4 text-emerald-400" />}
                    {r.type === 'Account' && <Landmark className="w-4 h-4 text-amber-400" />}
                    {r.type === 'Transaction' && <Receipt className="w-4 h-4 text-emerald-400" />}
                    <div>
                      <p className="text-xs font-medium text-zinc-100 group-hover:text-indigo-300 transition-colors">
                        {r.title}
                      </p>
                      {r.subtitle && <p className="text-[11px] text-zinc-500">{r.subtitle}</p>}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          ) : query ? (
            <div className="p-6 text-center text-xs text-zinc-500">No matching records found</div>
          ) : (
            <div className="space-y-1">
              <p className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-500">Suggested Commands</p>
              {quickActions.map(action => {
                const Icon = action.icon;
                return (
                  <div
                    key={action.id}
                    onClick={() => {
                      setIsCommandPaletteOpen(false);
                      action.action();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                      <div>
                        <p className="text-xs font-medium text-zinc-200 group-hover:text-white">{action.title}</p>
                        <p className="text-[11px] text-zinc-500">{action.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>Navigation: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↑</kbd> <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↓</kbd></span>
            <span>Select: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↵</kbd></span>
            <span>Close: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">ESC</kbd></span>
          </div>
        </div>
      </div>
    </div>
  );
}
