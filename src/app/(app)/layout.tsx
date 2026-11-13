import { WorkspaceProvider } from '@/components/layout/WorkspaceContext';
import { TopNavbar } from '@/components/layout/TopNavbar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { QuickAddModal } from '@/components/modals/QuickAddModal';
import { CommandPaletteModal } from '@/components/modals/CommandPaletteModal';
import { ExplainerDrawer } from '@/components/modals/ExplainerDrawer';
import { AiAssistantDrawer } from '@/components/modals/AiAssistantDrawer';
import { HydrationMarker } from '@/components/layout/HydrationMarker';

/**
 * Authenticated application shell.
 *
 * Everything under this route group requires a session: `src/proxy.ts` redirects
 * signed-out page requests to `/login?next=…` before the server renders, and
 * every `/api/*` call needs the same cookie. `/login` lives outside this group,
 * so the sign-in page has no navbar or sidebar to browse from.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WorkspaceProvider>
      <HydrationMarker />
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

      <QuickAddModal />
      <CommandPaletteModal />
      <ExplainerDrawer />
      <AiAssistantDrawer />
    </WorkspaceProvider>
  );
}
