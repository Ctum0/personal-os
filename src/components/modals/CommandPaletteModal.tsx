'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../layout/WorkspaceContext';
import { apiFetch } from '@/lib/api/client';
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
  BookOpen,
  Sliders,
  Sparkles,
  Compass,
} from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'Task' | 'Project' | 'Goal' | 'Account' | 'Transaction';
  title: string;
  subtitle?: string;
  link: string;
}

interface Command {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/**
 * Command palette.
 *
 * The footer advertises ↑/↓/↵ navigation, so this implements it for real: one
 * flat list of selectable rows (commands when the query is empty, search hits
 * otherwise), an active index, and Enter to activate. Rows are real buttons so
 * keyboard and assistive technology reach them without a bespoke key handler.
 */
export function CommandPaletteModal() {
  const { isCommandPaletteOpen } = useWorkspace();
  // The body mounts only while open, so every open starts from a clean slate
  // (query, results, active row) without a reset effect.
  if (!isCommandPaletteOpen) return null;
  return <CommandPaletteBody />;
}

function CommandPaletteBody() {
  const { setIsCommandPaletteOpen, workspace, switchWorkspace } = useWorkspace();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'current' | 'global'>('current');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Remember the trigger and restore focus when the palette unmounts (i.e. when
  // it closes), so keyboard users land back where they started.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  const close = useCallback(() => setIsCommandPaletteOpen(false), [setIsCommandPaletteOpen]);

  const navigate = (href: string) => {
    close();
    router.push(href);
  };

  const commands = useMemo<Command[]>(
    () => [
      { id: 'act_plan_ai', title: 'Plan My Day (AI Conversational Planner)', subtitle: 'Interview-driven scheduling with a visual timeline', icon: Sparkles, run: () => navigate('/productivity/plan') },
      { id: 'act_switch_prod', title: 'Switch to Productivity OS', subtitle: 'Tasks, projects, calendar, habits & focus', icon: Compass, run: () => { close(); switchWorkspace('productivity'); } },
      { id: 'act_switch_fin', title: 'Switch to Finance OS', subtitle: 'Accounts, ledger, budgets & safe-to-spend', icon: Landmark, run: () => { close(); switchWorkspace('finance'); } },
      { id: 'act_today', title: "Open Today's Execution Cockpit", subtitle: 'Today schedule, priorities, and overdue review', icon: CalendarCheck, run: () => navigate('/') },
      { id: 'act_review', title: 'Open Weekly Review Workspace', subtitle: 'Structured review of tasks, habits and blockers', icon: CalendarCheck, run: () => navigate('/productivity/weekly-review') },
      { id: 'act_timer', title: 'Start Focus Timer', subtitle: 'Open focus session tracking', icon: Clock, run: () => navigate('/productivity/focus') },
      { id: 'act_tx', title: 'View Transactions Ledger', subtitle: 'Inspect the financial journal and balances', icon: Receipt, run: () => navigate('/finance/transactions') },
      { id: 'act_import', title: 'Import Bank CSV Statement', subtitle: 'Upload, deduplicate, and commit bank files', icon: FileSpreadsheet, run: () => navigate('/finance/import') },
      { id: 'act_metrics', title: 'Browse Metric Dictionary', subtitle: 'Authoritative formulas and calculation contracts', icon: BookOpen, run: () => navigate('/overview/metrics') },
      { id: 'act_settings', title: 'Personal Operating Rules & Settings', subtitle: 'Workload limits, quiet hours, and safety buffers', icon: Sliders, run: () => navigate('/overview/settings') },
    ],
    // navigate/close are stable per render of this component; the list itself is static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace]
  );

  // Results follow the query. Clearing on an empty query is not a synchronous
  // setState in the effect body — it happens in the timeout below, after the
  // debounce, which keeps the render/effect cycle stable.
  useEffect(() => {
    if (!query.trim()) {
      const clear = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(clear);
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const searchScope = scope === 'global' ? 'global' : workspace;
        const data = await apiFetch<{ results: SearchResult[] }>(
          `/api/search?q=${encodeURIComponent(query.trim())}&scope=${encodeURIComponent(searchScope)}`
        );
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) {
          setResults([]);
          setError('Search is unavailable right now.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, scope, workspace]);

  const rowCount = query.trim() ? results.length : commands.length;

  // Arrowing past the end of a shorter result set must not leave the cursor out
  // of range; the active index is clamped where it is read instead of reset in
  // an effect.
  const safeIndex = rowCount === 0 ? 0 : Math.min(activeIndex, rowCount - 1);

  const activate = useCallback(
    (index: number) => {
      if (query.trim()) {
        const result = results[index];
        if (result) navigate(result.link);
        return;
      }
      commands[index]?.run();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, results, commands]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(current => (rowCount === 0 ? 0 : (current + 1) % rowCount));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(current => (rowCount === 0 ? 0 : (current - 1 + rowCount) % rowCount));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        activate(safeIndex);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rowCount, activeIndex, safeIndex, activate, close]);

  // Keep the active row visible while arrowing through a long result list.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results.length, safeIndex]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
      >
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <label htmlFor="command-palette-input" className="sr-only">
            Search commands and records
          </label>
          <input
            id="command-palette-input"
            type="text"
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={rowCount > 0 ? `command-palette-row-${safeIndex}` : undefined}
            placeholder={`Type a command or search ${scope === 'global' ? 'all workspaces' : workspace}...`}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setScope(current => (current === 'current' ? 'global' : 'current'))}
            aria-label={`Search scope: ${scope === 'global' ? 'all workspaces' : workspace}. Activate to switch.`}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 transition-colors ${
              scope === 'global'
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            {scope === 'global' ? 'Global Scope' : `${workspace} Scope`}
          </button>
        </div>

        <div
          id="command-palette-list"
          role="listbox"
          aria-label={query.trim() ? 'Search results' : 'Suggested commands'}
          ref={listRef}
          className="max-h-80 overflow-y-auto p-2"
        >
          {isLoading ? (
            <p className="p-6 text-center text-xs text-zinc-500" role="status">
              Searching records…
            </p>
          ) : error ? (
            <p className="p-6 text-center text-xs text-zinc-400" role="alert">
              {error}
            </p>
          ) : query.trim() ? (
            results.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-500">No matching records found</p>
            ) : (
              results.map((result, index) => (
                <button
                  key={result.id}
                  id={`command-palette-row-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === safeIndex}
                  data-active={index === safeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigate(result.link)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                    index === safeIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {result.type === 'Task' && <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />}
                    {result.type === 'Project' && <Briefcase className="w-4 h-4 text-blue-400 shrink-0" />}
                    {result.type === 'Goal' && <Target className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {result.type === 'Account' && <Landmark className="w-4 h-4 text-amber-400 shrink-0" />}
                    {result.type === 'Transaction' && <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-zinc-100 truncate">{result.title}</span>
                      {result.subtitle && <span className="block text-[11px] text-zinc-500 truncate">{result.subtitle}</span>}
                    </span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 shrink-0">
                    {result.type}
                  </span>
                </button>
              ))
            )
          ) : (
            commands.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.id}
                  id={`command-palette-row-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === safeIndex}
                  data-active={index === safeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={command.run}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                    index === safeIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-zinc-200 truncate">{command.title}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{command.subtitle}</span>
                    </span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/60 flex items-center gap-3 text-[11px] text-zinc-500">
          <span>
            Navigation: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↑</kbd>{' '}
            <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↓</kbd>
          </span>
          <span>
            Select: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">↵</kbd>
          </span>
          <span>
            Close: <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">ESC</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
