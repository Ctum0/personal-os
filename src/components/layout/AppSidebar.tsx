'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceContext';
import {
  LayoutDashboard,
  Inbox,
  CalendarCheck,
  CheckSquare,
  Calendar,
  Briefcase,
  Flame,
  Target,
  Clock,
  BarChart3,
  Receipt,
  Landmark,
  PiggyBank,
  FileSpreadsheet,
  TrendingDown,
  ShieldAlert,
  Sliders,
  Database,
  ArrowRightLeft,
  PieChart,
} from 'lucide-react';

export function AppSidebar() {
  const { workspace } = useWorkspace();
  const pathname = usePathname();

  const productivityLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/productivity/inbox', label: 'Inbox / Capture', icon: Inbox },
    { href: '/productivity/today', label: 'Today View', icon: CalendarCheck },
    { href: '/productivity/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/productivity/calendar', label: 'Calendar & Planning', icon: Calendar },
    { href: '/productivity/projects', label: 'Projects & Milestones', icon: Briefcase },
    { href: '/productivity/habits', label: 'Habits & Routines', icon: Flame },
    { href: '/productivity/goals', label: 'Goals', icon: Target },
    { href: '/productivity/focus', label: 'Focus Timer', icon: Clock },
    { href: '/productivity/insights', label: 'Productivity Insights', icon: BarChart3 },
  ];

  const financeLinks = [
    { href: '/finance', label: 'Finance Dashboard', icon: LayoutDashboard },
    { href: '/finance/transactions', label: 'Transactions Ledger', icon: Receipt },
    { href: '/finance/accounts', label: 'Accounts & Balances', icon: Landmark },
    { href: '/finance/budgets', label: 'Budgets & Envelopes', icon: PieChart },
    { href: '/finance/recurring', label: 'Bills & Subscriptions', icon: ArrowRightLeft },
    { href: '/finance/savings', label: 'Savings Goals', icon: PiggyBank },
    { href: '/finance/debts', label: 'Debts & Liabilities', icon: TrendingDown },
    { href: '/finance/net-worth', label: 'Net Worth', icon: BarChart3 },
    { href: '/finance/reports', label: 'Reports & Forecasts', icon: Sliders },
    { href: '/finance/import', label: 'CSV Import Studio', icon: FileSpreadsheet },
  ];

  const overviewLinks = [
    { href: '/overview', label: 'Executive Pulse', icon: LayoutDashboard },
    { href: '/overview/formulas', label: 'Custom Formula Studio', icon: Sliders },
    { href: '/overview/ai-governance', label: 'AI Governance & Policies', icon: ShieldAlert },
    { href: '/overview/backup', label: 'Data Backup & Export', icon: Database },
  ];

  const navLinks = workspace === 'finance'
    ? financeLinks
    : workspace === 'overview'
    ? overviewLinks
    : productivityLinks;

  return (
    <aside className="w-60 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between py-4 select-none shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="space-y-4 px-3">
        {/* Workspace section header */}
        <div className="px-3 py-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {workspace === 'finance' ? 'Finance Domain' : workspace === 'overview' ? 'Overview Domain' : 'Productivity Domain'}
          </p>
        </div>

        {/* Navigation list */}
        <nav className="space-y-0.5" aria-label="Sidebar navigation">
          {navLinks.map(link => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer system status */}
      <div className="px-4 pt-3 border-t border-zinc-900 text-[11px] text-zinc-500 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Personal OS v1.0
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">PWA Active</span>
      </div>
    </aside>
  );
}
