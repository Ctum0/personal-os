import type { Metadata, Viewport } from 'next';
import './globals.css';

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

/**
 * Root layout: document only.
 *
 * It deliberately renders no application chrome. The shell (navbar, sidebar,
 * modals) lives in the `(app)` route group, so `/login` cannot inherit a navbar
 * that navigates into a signed-out session. Before this split the root layout
 * rendered the shell for every route, which meant a visitor could browse the
 * navigation while every data call failed — "protected" that looked like
 * "empty".
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
