'use client';

import { useSyncExternalStore } from 'react';
import { todayISO } from './index';

/** Today's date never changes during a session's lifetime; nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

const getClientToday = (): string => todayISO();

/** Prerendering and hydration both see `null`; the real value arrives after mount. */
const getServerToday = (): string | null => null;

/**
 * Client hook: today's date in the app timezone.
 *
 * Returns `null` on the initial render (and during prerendering): a synchronous
 * `new Date()` read in a client component is an unstable value and aborts route
 * prerendering under Cache Components, so every page that derives flags from
 * "today" must read it here and treat `null` as "not yet known".
 *
 * `useSyncExternalStore` is what makes the deferral explicit instead of a
 * `setState` inside an effect: React renders with the server snapshot
 * (`null`) and re-renders with the client snapshot once mounted.
 */
export function useTodayISO(): string | null {
  return useSyncExternalStore(subscribe, getClientToday, getServerToday);
}
