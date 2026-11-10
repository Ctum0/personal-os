'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceContext';
import {
  Search,
  Plus,
  Terminal,
  Wifi,
  WifiOff,
  Folder,
  Briefcase,
  User,
  BookOpen,
  Activity,
  ChevronDown,
  Menu,
  Compass,
  Landmark,
} from 'lucide-react';

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
  const [spaces, setSpaces] = useState<any[]>([]);
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    fetch('/api/spaces')
      .then(res => res.json())
      .then(data => {
        if (data.spaces) setSpaces(data.spaces);
      })
      .catch(() => {});

    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine ?? true);
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getSpaceIcon = (iconName: string) => {
    switch (iconName) {
      case 'Briefcase': return <Briefcase className="w-3.5 h-3.5" />;
      case 'BookOpen': return <BookOpen className="w-3.5 h-3.5" />;
      case 'Activity': return <Activity className="w-3.5 h-3.5" />;
      default: return <User className="w-3.5 h-3.5" />;
    }
  };

  const currentSpace = spaces.find(s => s.id === activeSpaceId);
  const spaceMenuRef = React.useRef<HTMLDivElement>(null);

  // Close the space menu on Escape or clicks outside it
  useEffect(() => {
    if (!isSpaceMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsSpaceMenuOpen(false);
      }
    };
    const handleClick = (e: MouseEvent) => {
      if (spaceMenuRef.current && !spaceMenuRef.current.contains(e.target as Node)) {
        setIsSpaceMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [isSpaceMenuOpen]);
  // Derive current section label for clean breadcrumb orientation
  const getSectionLabel = () => {
    if (pathname === '/') return 'Today';
    if (pathname.startsWith('/productivity/tasks')) return 'Tasks & Planning';
    if (pathname.startsWith('/productivity/calendar')) return 'Calendar';
    if (pathname.startsWith('/productivity/projects')) return 'Projects';
    if (pathname.startsWith('/productivity/focus')) return 'Focus';
    if (pathname.startsWith('/finance/transactions')) return 'Transactions Ledger';
    if (pathname.startsWith('/finance/budgets')) return 'Budgets';
    if (pathname.startsWith('/finance/accounts')) return 'Accounts';
    if (pathname.startsWith('/finance/net-worth')) return 'Net Worth';
    if (pathname.startsWith('/finance')) return 'Financial Reality';
    if (pathname.startsWith('/productivity/habits')) return 'Habits & Rituals';
    if (pathname.startsWith('/productivity/goals')) return 'Goals';
    if (pathname.startsWith('/overview/settings')) return 'Operating Rules';
    if (pathname.startsWith('/overview/metrics')) return 'Metric Dictionary';
    if (pathname.startsWith('/overview')) return 'Settings & Governance';
    return 'Workstation';
  };

  // Only show the Space context filter on productivity surfaces where spaceId actually filters tasks
  const isProductivitySurface = pathname === '/' || pathname.startsWith('/productivity');

  return (
    <header className="h-14 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left: Mobile Toggle & Brand Link & Breadcrumb */}
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Mobile menu trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors -m-0.5"
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Home Brand Anchor */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-100 group-hover:border-zinc-500 transition-colors shadow-xs">
            {/* Clean, architectural SVG monogram */}
            <svg
              className="w-4 h-4 text-zinc-100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="4" />
              <path d="M9 9h6" />
              <path d="M9 15h6" />
              <path d="M12 9v6" />
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-100 group-hover:text-white transition-colors hidden sm:inline">
            Personal OS
          </span>
        </Link>

        {/* Subtle Breadcrumb Divider & Section Name */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-500 font-medium pl-2 border-l border-zinc-800 min-w-0">
          <span className="text-zinc-300">{getSectionLabel()}</span>
        </div>

        {/* Primary Workspace Segment Switcher */}
        <div className="flex items-center bg-zinc-950/90 border border-white/[0.08] rounded-md p-0.5 text-xs font-medium">
          <button
            onClick={() => switchWorkspace('productivity')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              workspace !== 'finance'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Switch to Productivity OS"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="font-medium text-xs">Productivity</span>
          </button>
          <button
            onClick={() => switchWorkspace('finance')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              workspace === 'finance'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Switch to Finance OS"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span className="font-medium text-xs">Finance</span>
          </button>
        </div>

        {/* Space Context Selector (Contextually visible on Productivity views) */}
        {isProductivitySurface && (
          <div ref={spaceMenuRef} className="relative hidden md:block">
            <button
              onClick={() => setIsSpaceMenuOpen(!isSpaceMenuOpen)}
              aria-expanded={isSpaceMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 px-2.5 py-1 text-xs text-zinc-300 bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800/80 rounded-md transition-colors"
            >
              <span className="text-zinc-500 text-[11px]">Space:</span>
              <span className="font-medium text-zinc-200">
                {activeSpaceId === 'all' ? 'All' : currentSpace?.name || 'Space'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {isSpaceMenuOpen && (
              <div role="menu" aria-label="Select space" className="absolute left-0 mt-1.5 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
                <button
                  onClick={() => {
                    setActiveSpaceId('all');
                    setIsSpaceMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                    activeSpaceId === 'all'
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                  }`}
                  role="menuitem"
                >
                  <Folder className="w-3.5 h-3.5 text-zinc-400" />
                  <span>All Spaces</span>
                </button>
                {spaces.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveSpaceId(s.id);
                      setIsSpaceMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                      activeSpaceId === s.id
                        ? 'bg-zinc-800 text-white font-medium'
                        : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                    }`}
                      role="menuitem"
                  >
                    <span style={{ color: s.color }}>{getSpaceIcon(s.icon)}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Search, Quick-Add, Assistant Console, Status, Profile */}
      <div className="flex items-center gap-2">
        {/* Command Palette Button */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="hidden xl:flex items-center gap-2 px-3 py-2 bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800/80 rounded-lg text-xs text-zinc-400 transition-colors w-40 lg:w-48 justify-between"
          aria-label="Open command palette"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="truncate">Search system...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700 font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Universal Quick Add Button */}
        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-98"
          aria-label="Universal quick add"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quick Add</span>
          <kbd className="hidden sm:inline px-1 py-0.5 text-[10px] bg-zinc-200 text-zinc-800 rounded font-mono">
            ⌘N
          </kbd>
        </button>

        {/* Assistant Console Drawer Trigger */}
        <button
          onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            isAiDrawerOpen
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
              : 'bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
          }`}
          aria-label="Open Assistant Console"
          aria-pressed={isAiDrawerOpen}
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-300" />
          <span className="hidden lg:inline">Console</span>
        </button>

        {/* Sync / Network status indicator */}
        <div
          role="status"
          aria-label={
            !isMounted
              ? 'Connecting'
              : isOnline
              ? offlinePendingCount > 0
                ? `${offlinePendingCount} pending offline sync mutations`
                : 'Connected and synced'
              : 'Offline, local storage active'
          }
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono transition-colors ${
            !isMounted || (isOnline && offlinePendingCount === 0)
              ? 'text-zinc-500 hover:text-zinc-300'
              : offlinePendingCount > 0
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
          }`}
          title={
            !isMounted
              ? 'Connecting...'
              : isOnline
              ? offlinePendingCount > 0
                ? `${offlinePendingCount} pending offline sync mutations`
                : 'Connected & synced'
              : 'Local offline storage active'
          }
        >
          {!isMounted || isOnline ? (
            <Wifi className={`w-3.5 h-3.5 ${offlinePendingCount > 0 ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
          )}
          {offlinePendingCount > 0 && <span className="text-[10px] tabular-nums">{offlinePendingCount}</span>}
        </div>

        {/* User profile avatar */}
        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 ml-0.5">
          AM
        </div>
      </div>
    </header>
  );
}
