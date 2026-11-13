'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceContext';
import { apiFetch } from '@/lib/api/client';
import { Activity, BookOpen, Briefcase, ChevronDown, Compass, Folder, Landmark, Menu, Plus, Search, Terminal, User, Wifi, WifiOff } from 'lucide-react';

interface SpaceRow {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const SECTION_LABELS: Array<[string, string]> = [
  ['/', 'Today'],
  ['/productivity/today', 'Today'],
  ['/productivity/plan', 'Day Planner'],
  ['/productivity/tasks', 'Tasks & Planning'],
  ['/productivity/calendar', 'Calendar'],
  ['/productivity/projects', 'Projects'],
  ['/productivity/inbox', 'Inbox'],
  ['/productivity/habits', 'Habits & Rituals'],
  ['/productivity/goals', 'Goals'],
  ['/productivity/focus', 'Focus'],
  ['/productivity/analytics', 'Analytics'],
  ['/productivity/insights', 'Analytics'],
  ['/productivity/weekly-review', 'Weekly Review'],
  ['/finance/transactions', 'Transactions Ledger'],
  ['/finance/budgets', 'Budgets'],
  ['/finance/accounts', 'Accounts'],
  ['/finance/savings', 'Savings Goals'],
  ['/finance/debts', 'Debts & Liabilities'],
  ['/finance/recurring', 'Recurring Payments'],
  ['/finance/reports', 'Cash Flow'],
  ['/finance/net-worth', 'Net Worth'],
  ['/finance/import', 'CSV Import'],
  ['/finance', 'Financial Reality'],
  ['/overview/settings', 'Operating Rules'],
  ['/overview/metrics', 'Metric Dictionary'],
  ['/overview/ai-governance', 'AI Governance'],
  ['/overview/backup', 'Backup & Restore'],
  ['/overview/formulas', 'Formula Studio'],
  ['/overview', 'Executive Pulse'],
];

function spaceIcon(icon: string) {
  switch (icon) {
    case 'Briefcase': return <Briefcase className="w-3.5 h-3.5" />;
    case 'BookOpen': return <BookOpen className="w-3.5 h-3.5" />;
    case 'Activity': return <Activity className="w-3.5 h-3.5" />;
    default: return <User className="w-3.5 h-3.5" />;
  }
}

export function TopNavbar() {
  const {
    workspace,
    switchWorkspace,
    activeSpaceId,
    setActiveSpaceId,
    isAiDrawerOpen,
    setIsAiDrawerOpen,
    setIsQuickAddOpen,
    setIsCommandPaletteOpen,
    offlinePendingCount,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useWorkspace();

  const pathname = usePathname() || '/';
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const spaceMenuRef = useRef<HTMLDivElement>(null);

  // Mounted flag doubles as the hydration boundary: `isMounted` drives the
  // connection badge, and both writes happen in the same post-hydration frame
  // instead of synchronously inside the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      let loaded: SpaceRow[] = [];
      try {
        const data = await apiFetch<{ spaces: SpaceRow[] }>('/api/spaces');
        loaded = data.spaces ?? [];
      } catch {
        // The space filter degrades to "All" when the list cannot be loaded.
        loaded = [];
      }
      if (cancelled) return;
      setSpaces(loaded);
      setIsOnline(online);
      setIsMounted(true);
    })();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const closeSpaceMenu = useCallback(() => setIsSpaceMenuOpen(false), []);

  useEffect(() => {
    if (!isSpaceMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeSpaceMenu();
        spaceMenuRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]')?.focus();
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (spaceMenuRef.current && !spaceMenuRef.current.contains(event.target as Node)) {
        closeSpaceMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [isSpaceMenuOpen, closeSpaceMenu]);

  const sectionLabel = SECTION_LABELS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'Workstation';
  const isProductivitySurface = pathname === '/' || pathname.startsWith('/productivity');
  const currentSpace = spaces.find(space => space.id === activeSpaceId);
  const syncLabel = !isMounted
    ? 'Connecting'
    : isOnline
      ? offlinePendingCount > 0
        ? `${offlinePendingCount} pending offline changes`
        : 'Connected and synced'
      : 'Offline, local storage active';

  return (
    <header className="h-14 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur-md px-2 sm:px-4 flex items-center justify-between gap-2 sticky top-0 z-40">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors"
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls="app-sidebar-mobile"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label="Personal OS home">
          <span
            aria-hidden="true"
            className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-100 group-hover:border-zinc-500 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="4" />
              <path d="M9 9h6" />
              <path d="M9 15h6" />
              <path d="M12 9v6" />
            </svg>
          </span>
          <span className="font-semibold text-sm tracking-tight text-zinc-100 group-hover:text-white transition-colors hidden sm:inline">
            Personal OS
          </span>
        </Link>

        <div className="hidden xl:flex items-center gap-2 text-xs text-zinc-500 font-medium pl-3 border-l border-zinc-800">
          <span className="text-zinc-300">{sectionLabel}</span>
        </div>

        <div
          role="group"
          aria-label="Workspace"
          className="flex items-center bg-zinc-950/90 border border-white/[0.08] rounded-md p-0.5 text-xs font-medium shrink-0"
        >
          <button
            type="button"
            onClick={() => switchWorkspace('productivity')}
            aria-pressed={workspace !== 'finance'}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
              workspace !== 'finance' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Productivity</span>
          </button>
          <button
            type="button"
            onClick={() => switchWorkspace('finance')}
            aria-pressed={workspace === 'finance'}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
              workspace === 'finance' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Finance</span>
          </button>
        </div>

        {isProductivitySurface && (
          <div ref={spaceMenuRef} className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setIsSpaceMenuOpen(open => !open)}
              aria-expanded={isSpaceMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 px-2.5 py-1 text-xs text-zinc-300 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800/80 rounded-md transition-colors"
            >
              <span className="text-zinc-500 text-[11px]">Space:</span>
              <span className="font-medium text-zinc-200 max-w-[7rem] truncate">
                {activeSpaceId === 'all' ? 'All' : (currentSpace?.name ?? 'All')}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" aria-hidden="true" />
            </button>

            {isSpaceMenuOpen && (
              <div
                role="menu"
                aria-label="Select space"
                className="absolute left-0 mt-1.5 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeSpaceId === 'all'}
                  onClick={() => {
                    setActiveSpaceId('all');
                    closeSpaceMenu();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                    activeSpaceId === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                  <span>All Spaces</span>
                </button>
                {spaces.map(space => (
                  <button
                    key={space.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeSpaceId === space.id}
                    onClick={() => {
                      setActiveSpaceId(space.id);
                      closeSpaceMenu();
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                      activeSpaceId === space.id ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                    }`}
                  >
                    <span style={{ color: space.color }} aria-hidden="true">{spaceIcon(space.icon)}</span>
                    <span className="truncate">{space.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          className="hidden xl:flex items-center gap-2 px-3 py-2 bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800/80 rounded-lg text-xs text-zinc-400 transition-colors justify-between"
        >
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <span>Search system</span>
          </span>
          <kbd aria-hidden="true" className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => setIsQuickAddOpen(true)}
          aria-label="Quick Add (⌘N)"
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-semibold transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Quick Add</span>
        </button>

        <button
          type="button"
          onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
          className={`flex items-center gap-1.5 p-2 sm:px-3 rounded-lg text-xs font-medium transition-all ${
            isAiDrawerOpen
              ? 'bg-zinc-800 border border-zinc-600 text-zinc-100'
              : 'bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
          }`}
          aria-label="Assistant console"
          aria-pressed={isAiDrawerOpen}
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
          <span className="hidden lg:inline">Console</span>
        </button>

        <div
          role="status"
          aria-label={syncLabel}
          title={syncLabel}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono transition-colors ${
            !isMounted || (isOnline && offlinePendingCount === 0)
              ? 'text-zinc-500'
              : offlinePendingCount > 0
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
          }`}
        >
          {!isMounted || isOnline ? (
            <Wifi className={`w-3.5 h-3.5 ${offlinePendingCount > 0 ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} aria-hidden="true" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          )}
          {offlinePendingCount > 0 && <span className="text-[10px] tabular-nums">{offlinePendingCount}</span>}
        </div>

        <Link
          href="/overview/settings"
          className="hidden sm:flex w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center text-[10px] font-semibold text-zinc-300 hover:border-zinc-500 transition-colors"
          aria-label="Operator settings — AM"
          title="Operator settings"
        >
          <span aria-hidden="true">AM</span>
        </Link>
      </div>
    </header>
  );
}
