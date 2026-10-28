import type { Metadata } from 'next';
import './globals.css';
import { WorkspaceProvider } from '@/components/layout/WorkspaceContext';
import { TopNavbar } from '@/components/layout/TopNavbar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { QuickAddModal } from '@/components/modals/QuickAddModal';
import { CommandPaletteModal } from '@/components/modals/CommandPaletteModal';
import { ExplainerDrawer } from '@/components/modals/ExplainerDrawer';
import { AiAssistantDrawer } from '@/components/modals/AiAssistantDrawer';

export const metadata: Metadata = {
  title: 'Personal OS — Productivity & Finance Platform',
  description: 'A desktop-first personal management platform combining productivity and deterministic personal finance.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
        <WorkspaceProvider>
          <div className="min-h-screen flex flex-col">
            <TopNavbar />
            <div className="flex flex-1">
              <AppSidebar />
              <main className="flex-1 overflow-x-hidden min-h-[calc(100vh-3.5rem)] bg-zinc-950">
                {children}
              </main>
            </div>
          </div>

          {/* Global Modals & Drawers */}
          <QuickAddModal />
          <CommandPaletteModal />
          <ExplainerDrawer />
          <AiAssistantDrawer />
        </WorkspaceProvider>
      </body>
    </html>
  );
}
