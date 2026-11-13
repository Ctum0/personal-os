'use client';

import { useEffect } from 'react';

/**
 * Marks the shell as interactive once React has hydrated **and** every mounting
 * effect in the tree has run.
 *
 * The document HTML is static and looks identical before and after hydration, so
 * anything depending on a key handler or an onClick is silently a no-op until
 * React attaches its listeners. Tests wait for `<html data-app-ready="true">`
 * instead of sleeping.
 *
 * The flag is deferred by a macrotask on purpose. React flushes mount effects
 * child-first, so setting it synchronously in this component's effect would flip
 * the flag *before* an ancestor's effect has registered, for example, the ⌘K
 * handler in `WorkspaceContext`. A timeout runs after the whole commit's effects
 * have been processed.
 */
export function HydrationMarker() {
  useEffect(() => {
    const id = setTimeout(() => {
      document.documentElement.dataset.appReady = 'true';
    }, 0);
    return () => {
      clearTimeout(id);
      delete document.documentElement.dataset.appReady;
    };
  }, []);

  return null;
}
