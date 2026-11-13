import type { Metadata, Viewport } from 'next';
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
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#090a0b',
  width: 'device-width',
  initialScale: 1,
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
          {/* First focusable element: keyboard users can bypass the shell. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-zinc-100 focus:text-zinc-950 focus:text-xs focus:font-semibold"
          >
            Skip to main content
          </a>
          <div className="min-h-screen flex flex-col">
            <TopNavbar />
            <div className="flex flex-1">
              <AppSidebar />
              <main
                id="main-content"
                tabIndex={-1}
                className="flex-1 min-w-0 overflow-x-hidden min-h-[calc(100vh-3.5rem)] bg-zinc-950"
              >
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
