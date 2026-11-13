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

type PaletteRow =
  | { kind: 'command'; command: Command }
  | { kind: 'record'; result: SearchResult };

interface Command {
  id: string;
  title: string;
  subtitle: string;
  /** Extra words a query may match: routes, synonyms, the thing's common name. */
  keywords: string[];
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
      { id: 'act_plan_ai', title: 'Plan My Day (AI Conversational Planner)', subtitle: 'Interview-driven scheduling with a visual timeline', keywords: ['plan', 'planner', 'day', 'ai', 'schedule', 'productivity'], icon: Sparkles, run: () => navigate('/productivity/plan') },
      { id: 'act_switch_prod', title: 'Switch to Productivity OS', subtitle: 'Tasks, projects, calendar, habits & focus', keywords: ['productivity', 'workspace', 'switch', 'tasks'], icon: Compass, run: () => { close(); switchWorkspace('productivity'); } },
      { id: 'act_switch_fin', title: 'Switch to Finance OS', subtitle: 'Accounts, ledger, budgets & safe-to-spend', keywords: ['finance', 'workspace', 'switch', 'money', 'accounts'], icon: Landmark, run: () => { close(); switchWorkspace('finance'); } },
      { id: 'act_today', title: "Open Today's Execution Cockpit", subtitle: 'Today schedule, priorities, and overdue review', keywords: ['today', 'home', 'dashboard', 'cockpit', 'overdue'], icon: CalendarCheck, run: () => navigate('/') },
      { id: 'act_review', title: 'Open Weekly Review Workspace', subtitle: 'Structured review of tasks, habits and blockers', keywords: ['weekly', 'review', 'retro', 'habits', 'blockers'], icon: CalendarCheck, run: () => navigate('/productivity/weekly-review') },
      { id: 'act_timer', title: 'Start Focus Timer', subtitle: 'Open focus session tracking', keywords: ['focus', 'timer', 'pomodoro', 'session'], icon: Clock, run: () => navigate('/productivity/focus') },
      { id: 'act_tx', title: 'View Transactions Ledger', subtitle: 'Inspect the financial journal and balances', keywords: ['transactions', 'ledger', 'journal', 'finance', 'spending'], icon: Receipt, run: () => navigate('/finance/transactions') },
      { id: 'act_import', title: 'Import Bank CSV Statement', subtitle: 'Upload, deduplicate, and commit bank files', keywords: ['import', 'csv', 'upload', 'bank', 'statement', 'finance'], icon: FileSpreadsheet, run: () => navigate('/finance/import') },
      { id: 'act_metrics', title: 'Browse Metric Dictionary', subtitle: 'Authoritative formulas and calculation contracts', keywords: ['metrics', 'dictionary', 'formulas', 'definitions', 'overview'], icon: BookOpen, run: () => navigate('/overview/metrics') },
      { id: 'act_settings', title: 'Personal Operating Rules & Settings', subtitle: 'Workload limits, quiet hours, and safety buffers', keywords: ['settings', 'rules', 'preferences', 'quiet', 'hours', 'workload', 'config', 'overview'], icon: Sliders, run: () => navigate('/overview/settings') },
    ],
    // navigate/close are stable per render of this component; the list itself is static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace]
  );

  /**
   * Commands matching the current query.
   *
   * The palette used to show commands only while the query was empty, so typing
   * "settings" replaced the ten commands with a record search that knew nothing
   * about them — the list went empty and the command became unreachable by name.
   * Commands are now filtered locally and always shown above record hits.
   */
  const matchingCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(command => {
      const haystack = `${command.title} ${command.subtitle} ${command.keywords.join(' ')}`.toLowerCase();
      return q.split(/\s+/).every(term => haystack.includes(term));
    });
  }, [commands, query]);

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

  /**
   * One flat row list: matching commands first, then record hits.
   *
   * A single index drives keyboard navigation across both groups, so arrow
   * behaviour is identical whether the palette is showing commands, records or
   * both — and a query can never hide the commands entirely.
   */
  const rows = useMemo<PaletteRow[]>(
    () => [
      ...matchingCommands.map(command => ({ kind: 'command' as const, command })),
      ...(query.trim() ? results.map(result => ({ kind: 'record' as const, result })) : []),
    ],
    [matchingCommands, results, query]
  );

  const rowCount = rows.length;

  // Arrowing past the end of a shorter result set must not leave the cursor out
  // of range; the active index is clamped where it is read instead of reset in
  // an effect.
  const safeIndex = rowCount === 0 ? 0 : Math.min(activeIndex, rowCount - 1);

  const activate = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      if (row.kind === 'command') row.command.run();
      else navigate(row.result.link);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
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
            aria-label={`${scope === 'global' ? 'Global Scope' : `${workspace} Scope`} — search scope, activate to switch`}
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
          aria-label="Commands and records"
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
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">
              No commands or records match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            rows.map((row, index) => {
              const selected = index === safeIndex;
              const className = `w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                selected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
              }`;
              const common = {
                id: `command-palette-row-${index}`,
                role: 'option' as const,
                'aria-selected': selected,
                'data-active': selected,
                onMouseEnter: () => setActiveIndex(index),
                className,
              };

              if (row.kind === 'command') {
                const Icon = row.command.icon;
                return (
                  <button key={row.command.id} type="button" onClick={row.command.run} {...common}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-zinc-200 truncate">{row.command.title}</span>
                        {/* 12px at text-zinc-400: the previous 11px zinc-500 failed AA contrast. */}
                        <span className="block text-xs text-zinc-400 truncate">{row.command.subtitle}</span>
                      </span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                  </button>
                );
              }

              const { result } = row;
              return (
                <button key={result.id} type="button" onClick={() => navigate(result.link)} {...common}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    {result.type === 'Task' && <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />}
                    {result.type === 'Project' && <Briefcase className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />}
                    {result.type === 'Goal' && <Target className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />}
                    {result.type === 'Account' && <Landmark className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />}
                    {result.type === 'Transaction' && <Receipt className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-zinc-100 truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="block text-xs text-zinc-400 truncate">{result.subtitle}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50 shrink-0">
                    {result.type}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
