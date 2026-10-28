'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace, Workspace } from './WorkspaceContext';
import {
  CheckSquare,
  DollarSign,
  Layers,
  Search,
  Plus,
  Sparkles,
  Wifi,
  WifiOff,
  Bell,
  Sun,
  Moon,
  Folder,
  Briefcase,
  User,
  BookOpen,
  Activity,
  ChevronDown,
} from 'lucide-react';

export function TopNavbar() {
  const {
    workspace,
    setWorkspace,
    activeSpaceId,
    setActiveSpaceId,
    isAiDrawerOpen,
    setIsAiDrawerOpen,
    setIsQuickAddOpen,
    setIsCommandPaletteOpen,
    offlinePendingCount,
  } = useWorkspace();

  const [spaces, setSpaces] = useState<any[]>([]);
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    fetch('/api/spaces')
      .then(res => res.json())
      .then(data => {
        if (data.spaces) setSpaces(data.spaces);
      })
      .catch(() => {});

    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial theme check
    if (document.documentElement.classList.contains('light')) {
      setTheme('light');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      setTheme('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  };

  const getSpaceIcon = (iconName: string) => {
    switch (iconName) {
      case 'Briefcase': return <Briefcase className="w-3.5 h-3.5" />;
      case 'BookOpen': return <BookOpen className="w-3.5 h-3.5" />;
      case 'Activity': return <Activity className="w-3.5 h-3.5" />;
      default: return <User className="w-3.5 h-3.5" />;
    }
  };

  const currentSpace = spaces.find(s => s.id === activeSpaceId);

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left: Brand & Workspace Switcher */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-sm shadow-indigo-500/20">
            OS
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-100 hidden sm:inline">
            Personal OS
          </span>
        </div>

        {/* Primary Workspace Switcher */}
        <nav className="flex items-center bg-zinc-900 border border-zinc-800/80 rounded-lg p-0.5" aria-label="Workspaces">
          <button
            onClick={() => setWorkspace('productivity')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              workspace === 'productivity'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>Productivity</span>
          </button>

          <button
            onClick={() => setWorkspace('finance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              workspace === 'finance'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Finance</span>
          </button>

          <button
            onClick={() => setWorkspace('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              workspace === 'overview'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Overview</span>
          </button>
        </nav>

        {/* Space Context Selector */}
        <div className="relative">
          <button
            onClick={() => setIsSpaceMenuOpen(!isSpaceMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1 text-xs text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors"
          >
            <span className="text-zinc-500">Space:</span>
            <span className="font-medium text-zinc-200">
              {activeSpaceId === 'all' ? 'All Spaces' : currentSpace?.name || 'Space'}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>

          {isSpaceMenuOpen && (
            <div className="absolute left-0 mt-1 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setActiveSpaceId('all');
                  setIsSpaceMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                  activeSpaceId === 'all' ? 'bg-indigo-600/20 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
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
                    activeSpaceId === s.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span style={{ color: s.color }}>{getSpaceIcon(s.icon)}</span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center/Right: Global Search, Quick-Add, AI Drawer, Sync, Notifications */}
      <div className="flex items-center gap-2">
        {/* Command Palette Button */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-xs text-zinc-400 transition-colors w-44 justify-between"
          aria-label="Open command palette"
        >
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span className="truncate">Search {workspace}...</span>
          </div>
          <kbd className="px-1 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700">⌘K</kbd>
        </button>

        {/* Universal Quick Add Button */}
        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium shadow-sm transition-all shadow-indigo-600/20 active:scale-95"
          aria-label="Universal quick add"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quick Add</span>
          <kbd className="hidden sm:inline px-1 py-0.2 text-[9px] bg-indigo-700 text-indigo-200 rounded">⌘N</kbd>
        </button>

        {/* AI Assistant Button */}
        <button
          onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-xs font-medium transition-all ${
            isAiDrawerOpen
              ? 'bg-purple-600/20 border-purple-500 text-purple-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
          }`}
          aria-label="Open AI Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden md:inline">Assistant</span>
        </button>

        {/* Sync / Offline status indicator */}
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${
            isOnline
              ? offlinePendingCount > 0
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-500'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
          title={isOnline ? `${offlinePendingCount} pending offline sync mutations` : 'Offline Mode active'}
        >
          {isOnline ? (
            <Wifi className={`w-3 h-3 ${offlinePendingCount > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-500'}`} />
          ) : (
            <WifiOff className="w-3 h-3 text-red-400" />
          )}
          {offlinePendingCount > 0 && <span className="text-[10px]">{offlinePendingCount}</span>}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User profile avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-semibold text-white ml-1">
          AM
        </div>
      </div>
    </header>
  );
}
