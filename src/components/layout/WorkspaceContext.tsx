'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getOfflineQueue, syncOfflineQueue } from '@/lib/offline/queue';

export type Workspace = 'productivity' | 'finance' | 'overview';

interface WorkspaceContextType {
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
  switchWorkspace: (ws: 'productivity' | 'finance') => void;
  lastProductivityRoute: string;
  lastFinanceRoute: string;
  activeSpaceId: string;
  setActiveSpaceId: (spaceId: string) => void;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;
  isQuickAddOpen: boolean;
  setIsQuickAddOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  selectedExplainer: any | null;
  setSelectedExplainer: (explainer: any | null) => void;
  offlinePendingCount: number;
  setOfflinePendingCount: (count: number) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [workspace, setWorkspaceState] = useState<Workspace>('productivity');
  const [lastProductivityRoute, setLastProductivityRoute] = useState<string>('/');
  const [lastFinanceRoute, setLastFinanceRoute] = useState<string>('/finance');
  const [activeSpaceId, setActiveSpaceId] = useState<string>('all');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [selectedExplainer, setSelectedExplainer] = useState<any | null>(null);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Sync workspace strictly with active URL pathname (URL is the single source of truth)
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith('/finance')) {
      setWorkspaceState('finance');
      setLastFinanceRoute(pathname);
      try { localStorage.setItem('personal_os_last_finance', pathname); } catch {}
    } else if (pathname.startsWith('/overview') || pathname.startsWith('/settings')) {
      setWorkspaceState('overview');
    } else {
      setWorkspaceState('productivity');
      setLastProductivityRoute(pathname);
      try { localStorage.setItem('personal_os_last_prod', pathname); } catch {}
    }
  }, [pathname]);

  const setWorkspace = (ws: Workspace) => {
    setWorkspaceState(ws);
    try { localStorage.setItem('personal_os_workspace', ws); } catch {}
  };

  const switchWorkspace = useCallback((targetWs: 'productivity' | 'finance') => {
    setWorkspace(targetWs);
    if (targetWs === 'finance') {
      const destination = lastFinanceRoute || '/finance';
      router.push(destination);
    } else {
      const destination = lastProductivityRoute || '/';
      router.push(destination);
    }
  }, [lastFinanceRoute, lastProductivityRoute, router]);

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
        lastProductivityRoute,
        lastFinanceRoute,
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
