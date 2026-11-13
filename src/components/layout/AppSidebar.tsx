'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceContext';
import {
  CalendarCheck,
  CheckSquare,
  Landmark,
  Target,
  Sliders,
  Calendar,
  Briefcase,
  Flame,
  BarChart3,
  Receipt,
  PieChart,
  PiggyBank,
  TrendingDown,
  ArrowRightLeft,
  BookOpen,
  Shield,
  Database,
  X,
  Compass,
  Sparkles,
  Inbox,
  Clock,
  CheckCheck,
  Wallet,
  TrendingUp,
} from 'lucide-react';

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  badge?: string;
}

export function AppSidebar() {
  const { workspace, isMobileMenuOpen, setIsMobileMenuOpen } = useWorkspace();
  const pathname = usePathname() || '/';

  const isFinance = workspace === 'finance' || pathname.startsWith('/finance');

  // Productivity OS Navigation Items
  const productivityNav: NavItem[] = [
    {
      id: 'today',
      href: '/',
      label: 'Today',
      icon: Compass,
      isActive: pathname === '/' || pathname === '/productivity/today',
    },
    {
      id: 'plan',
      href: '/productivity/plan',
      label: 'Plan My Day',
      icon: Sparkles,
      isActive: pathname.startsWith('/productivity/plan'),
      badge: 'AI',
    },
    {
      id: 'tasks',
      href: '/productivity/tasks',
      label: 'Tasks',
      icon: CheckSquare,
      isActive: pathname.startsWith('/productivity/tasks'),
    },
    {
      id: 'projects',
      href: '/productivity/projects',
      label: 'Projects',
      icon: Briefcase,
      isActive: pathname.startsWith('/productivity/projects'),
    },
    {
      id: 'calendar',
      href: '/productivity/calendar',
      label: 'Calendar',
      icon: Calendar,
      isActive: pathname.startsWith('/productivity/calendar'),
    },
    {
      id: 'inbox',
      href: '/productivity/inbox',
      label: 'Inbox',
      icon: Inbox,
      isActive: pathname.startsWith('/productivity/inbox'),
    },
    {
      id: 'habits',
      href: '/productivity/habits',
      label: 'Habits & Routines',
      icon: Flame,
      isActive: pathname.startsWith('/productivity/habits'),
    },
    {
      id: 'goals',
      href: '/productivity/goals',
      label: 'Goals',
      icon: Target,
      isActive: pathname.startsWith('/productivity/goals'),
    },
    {
      id: 'focus',
      href: '/productivity/focus',
      label: 'Focus',
      icon: Clock,
      isActive: pathname.startsWith('/productivity/focus'),
    },
    {
      id: 'analytics',
      href: '/productivity/analytics',
      label: 'Analytics',
      icon: BarChart3,
      isActive: pathname.startsWith('/productivity/analytics') || pathname.startsWith('/productivity/insights'),
    },
    {
      id: 'review',
      href: '/productivity/weekly-review',
      label: 'Weekly Review',
      icon: CheckCheck,
      isActive: pathname.startsWith('/productivity/weekly-review'),
    },
  ];

  // Finance OS Navigation Items
  const financeNav: NavItem[] = [
    {
      id: 'fin_overview',
      href: '/finance',
      label: 'Overview',
      icon: Landmark,
      isActive: pathname === '/finance',
    },
    {
      id: 'fin_accounts',
      href: '/finance/accounts',
      label: 'Accounts',
      icon: Wallet,
      isActive: pathname.startsWith('/finance/accounts'),
    },
    {
      id: 'fin_transactions',
      href: '/finance/transactions',
      label: 'Transactions',
      icon: Receipt,
      isActive: pathname.startsWith('/finance/transactions'),
    },
    {
      id: 'fin_budgets',
      href: '/finance/budgets',
      label: 'Budgets',
      icon: PieChart,
      isActive: pathname.startsWith('/finance/budgets'),
    },
    {
      id: 'fin_savings',
      href: '/finance/savings',
      label: 'Savings',
      icon: PiggyBank,
      isActive: pathname.startsWith('/finance/savings'),
    },
    {
      id: 'fin_debts',
      href: '/finance/debts',
      label: 'Debts & Liabilities',
      icon: TrendingDown,
      isActive: pathname.startsWith('/finance/debts'),
    },
    {
      id: 'fin_recurring',
      href: '/finance/recurring',
      label: 'Recurring Payments',
      icon: CalendarCheck,
      isActive: pathname.startsWith('/finance/recurring'),
    },
    {
      id: 'fin_cashflow',
      href: '/finance/reports',
      label: 'Cash Flow',
      icon: ArrowRightLeft,
      isActive: pathname.startsWith('/finance/reports'),
    },
    {
      id: 'fin_networth',
      href: '/finance/net-worth',
      label: 'Net Worth',
      icon: TrendingUp,
      isActive: pathname.startsWith('/finance/net-worth'),
    },
  ];

  const systemNav = [
    {
      id: 'sys_overview',
      href: '/overview',
      label: 'Executive Pulse',
      icon: Compass,
      isActive: pathname === '/overview',
    },
    {
      id: 'sys_settings',
      href: '/overview/settings',
      label: 'Operating Rules',
      icon: Sliders,
      isActive: pathname.startsWith('/overview/settings'),
    },
    {
      id: 'sys_metrics',
      href: '/overview/metrics',
      label: 'Metric Dictionary',
      icon: BookOpen,
      isActive: pathname.startsWith('/overview/metrics'),
    },
    {
      id: 'sys_ai',
      href: '/overview/ai-governance',
      label: 'AI Governance',
      icon: Shield,
      isActive: pathname.startsWith('/overview/ai-governance'),
    },
    {
      id: 'sys_formulas',
      href: '/overview/formulas',
      label: 'Formula Studio',
      icon: Sparkles,
      isActive: pathname.startsWith('/overview/formulas'),
    },
    {
      id: 'sys_backup',
      href: '/overview/backup',
      label: 'Backup & Restore',
      icon: Database,
      isActive: pathname.startsWith('/overview/backup'),
    },
  ];

  const currentNav = isFinance ? financeNav : productivityNav;

  // Mobile drawer: Escape closes, focus enters the panel, and background scroll
  // is locked while it is open. Without this the drawer is a modal that only a
  // mouse can dismiss.
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = drawerRef.current?.querySelector<HTMLElement>('#app-sidebar-mobile-panel');
    panel?.querySelector<HTMLElement>('a, button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isMobileMenuOpen, setIsMobileMenuOpen]);

  const renderNavContent = () => (
    <div className="space-y-4 px-3">
      {/* Workspace Context Section Header */}
      <div className="px-2 py-2 flex items-center justify-between text-xs border-b border-white/[0.06] mb-1">
        <div className="flex items-center gap-2">
          {isFinance ? (
            <div className="w-5 h-5 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
              <Landmark className="w-3 h-3" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-300">
              <Compass className="w-3 h-3" />
            </div>
          )}
          <span className="font-semibold text-xs tracking-tight text-zinc-200">
            {isFinance ? 'Finance Workspace' : 'Productivity Workspace'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Active</span>
      </div>

      {/* Main Workspace Navigation */}
      <div className="space-y-1">
        <p className="px-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
          {isFinance ? 'Financial Core' : 'Execution & Planning'}
        </p>
        <nav className="space-y-0.5" aria-label={isFinance ? 'Finance Navigation' : 'Productivity Navigation'}>
          {currentNav.map(item => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={item.isActive ? 'page' : undefined}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  item.isActive
                    ? 'bg-zinc-850/90 text-zinc-100 font-semibold border-l-2 border-zinc-200 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ItemIcon
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      item.isActive ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-white/[0.06]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Shared System & Settings Section */}
      <div className="space-y-1 pt-3 border-t border-white/[0.04]">
        <p className="px-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
          System & Operating Rules
        </p>
        <nav className="space-y-0.5" aria-label="System Navigation">
          {systemNav.map(item => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={item.isActive ? 'page' : undefined}
                className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  item.isActive
                    ? 'bg-zinc-850/90 text-zinc-100 font-semibold border-l-2 border-zinc-200 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <ItemIcon
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    item.isActive ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );

  const footerStatus = (
    <div className="px-4 py-3 border-t border-zinc-900/80 text-[11px] text-zinc-500 flex items-center justify-between select-none">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></span>
        Personal OS
      </span>
      <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Local Active</span>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar (>= lg) */}
      <aside className="hidden lg:flex w-60 border-r border-zinc-800/60 bg-zinc-950 flex-col justify-between py-4 select-none shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 overflow-y-auto">
        {renderNavContent()}
        {footerStatus}
      </aside>

      {/* Mobile Slide-Over Drawer (< lg) */}
      {isMobileMenuOpen && (
        <div
          id="app-sidebar-mobile"
          ref={drawerRef}
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            id="app-sidebar-mobile-panel"
            className="relative z-50 w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between overflow-y-auto py-4 shadow-2xl"
          >
            <div>
              <div className="flex items-center justify-between px-4 pb-3 mb-3 border-b border-zinc-900">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Navigation
                </span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderNavContent()}
            </div>
            {footerStatus}
          </div>
        </div>
      )}
    </>
  );
}
