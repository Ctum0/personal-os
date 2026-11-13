'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getOfflineQueue, syncOfflineQueue } from '@/lib/offline/queue';

export type Workspace = 'productivity' | 'finance' | 'overview';

/** Metric explainer payload rendered by ExplainerDrawer (shape owned by the engines). */
export interface ExplainerPayload {
  metricName?: string;
  definition?: string;
  formula?: string;
  dateRange?: { start?: string; end?: string; label?: string };
  currency?: string;
  includedEntities?: string[];
  excludedEntities?: string[];
  assumptions?: string[];
  inputs?: Record<string, string>;
  lastCalculatedAt?: string;
}

interface WorkspaceContextType {
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
  switchWorkspace: (ws: 'productivity' | 'finance') => void;
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;
  isQuickAddOpen: boolean;
  setIsQuickAddOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  selectedExplainer: ExplainerPayload | null;
  setSelectedExplainer: (explainer: ExplainerPayload | null) => void;
  offlinePendingCount: number;
  setOfflinePendingCount: (count: number) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Workspace is DERIVED from the URL, never stored: the address bar is the
  // single source of truth, and a mirrored state variable only creates
  // opportunities for the two to disagree (and for a setState-in-effect).
  const workspace: Workspace = pathname?.startsWith('/finance')
    ? 'finance'
    : pathname?.startsWith('/overview') || pathname?.startsWith('/settings')
      ? 'overview'
      : 'productivity';
  const [activeSpaceId, setActiveSpaceId] = useState<string>('all');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [selectedExplainer, setSelectedExplainer] = useState<ExplainerPayload | null>(null);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const setWorkspace = useCallback((ws: Workspace) => {
    try { localStorage.setItem('personal_os_workspace', ws); } catch { /* storage disabled */ }
  }, []);

  // Remember the last route in each domain so switching back returns there.
  // This only writes to storage — no component state, so it cannot cascade.
  useEffect(() => {
    if (!pathname) return;
    try {
      if (pathname.startsWith('/finance')) {
        localStorage.setItem('personal_os_last_finance', pathname);
      } else if (!pathname.startsWith('/overview') && !pathname.startsWith('/settings')) {
        localStorage.setItem('personal_os_last_prod', pathname);
      }
    } catch {
      /* storage disabled: switching simply falls back to the domain root */
    }
  }, [pathname]);

  const switchWorkspace = useCallback((targetWs: 'productivity' | 'finance') => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(targetWs === 'finance' ? 'personal_os_last_finance' : 'personal_os_last_prod');
    } catch {
      stored = null;
    }
    const fallback = targetWs === 'finance' ? '/finance' : '/';
    const destination = stored && stored.startsWith('/') && !stored.startsWith('//') ? stored : fallback;
    router.push(destination);
  }, [router]);

  // Keyboard shortcuts (Cmd+K for command palette, Cmd+N for quick add)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setIsQuickAddOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Offline queue check and auto-sync on network reconnect
    const updateQueueCount = () => {
      const q = getOfflineQueue();
      setOfflinePendingCount(q.filter(m => m.status === 'queued' || m.status === 'failed').length);
    };

    const handleOnline = async () => {
      await syncOfflineQueue();
      updateQueueCount();
    };

    updateQueueCount();
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
        switchWorkspace,
        activeSpaceId,
        setActiveSpaceId,
        isAiDrawerOpen,
        setIsAiDrawerOpen,
        isQuickAddOpen,
        setIsQuickAddOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        selectedExplainer,
        setSelectedExplainer,
        offlinePendingCount,
        setOfflinePendingCount,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
