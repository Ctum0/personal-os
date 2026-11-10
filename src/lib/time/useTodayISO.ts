'use client';

import { useEffect, useState } from 'react';
import { todayISO } from './index';

/**
 * Client hook: today's date in the app timezone, deferred to an effect.
 *
 * Returns `null` on the initial render (and during prerendering): a synchronous
 * `new Date()` read in a client component is an unstable value and aborts route
 * prerendering under Cache Components, so every page that derives flags from
 * "today" must read it here and treat `null` as "not yet known".
 */
export function useTodayISO(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayISO());
  }, []);
  return today;
}
