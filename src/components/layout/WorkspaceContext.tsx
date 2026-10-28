'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Workspace = 'productivity' | 'finance' | 'overview';

interface WorkspaceContextType {
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>('productivity');
  const [activeSpaceId, setActiveSpaceId] = useState<string>('all');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [selectedExplainer, setSelectedExplainer] = useState<any | null>(null);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(0);

  // Restore workspace from local storage
  useEffect(() => {
    const saved = localStorage.getItem('personal_os_workspace') as Workspace;
    if (saved && (saved === 'productivity' || saved === 'finance' || saved === 'overview')) {
      setWorkspaceState(saved);
    }
  }, []);

  const setWorkspace = (ws: Workspace) => {
    setWorkspaceState(ws);
    localStorage.setItem('personal_os_workspace', ws);
  };

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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
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
