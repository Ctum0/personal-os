/**
 * Agent 3 — wave 3 regression tests (Agent 1's productivity loose ends).
 * 1. bestStreak computes the TRUE historical best run from logged history
 *    (was: Math.max(currentStreak, currentStreak) — a no-op).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '@/lib/db';
import { calculateHabitStreak } from '@/lib/productivity/engine';

const tenantId = 'tenant_wave3';
let db: ReturnType<typeof getInMemoryDb>;

beforeEach(() => {
  db = getInMemoryDb();
  db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (?, 'Wave3', 'wave3')`).run(tenantId);
});

const makeHabit = (id: string, opts: { scheduleDays?: number[]; scheduleType?: string; startDate?: string; minimum?: number } = {}) => {
  db.prepare(`
    INSERT INTO habits (id, tenant_id, title, schedule_type, schedule_days, start_date, minimum_threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tenantId, `Habit ${id}`,
    opts.scheduleType ?? 'specific_days',
    JSON.stringify(opts.scheduleDays ?? [1, 2, 3, 4, 5, 6, 7]),
    opts.startDate ?? '2026-10-01',
    opts.minimum ?? 1
  );
};

const log = (habitId: string, date: string, value = 1, status = 'completed') => {
  db.prepare(`
    INSERT OR REPLACE INTO habit_logs (id, tenant_id, habit_id, log_date, value, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`hl_${habitId}_${date}`, tenantId, habitId, date, value, status);
};

const range = (start: string, end: string): string[] => {
  const out: string[] = [];
  const d = new Date(start + 'T12:00:00Z');
  while (d.toISOString().slice(0, 10) <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

describe('bestStreak: true historical best from logged history', () => {
  it('a missed scheduled day keeps the LONGER EARLIER run as best while current is the resumed run', () => {
    // 2026-10-01..05 completed (5-day run), miss 10-06, resume 10-07..09 (3-day run)
    makeHabit('h_best', { scheduleType: 'daily', startDate: '2026-10-01' });
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    for (let i = 1; i <= 5; i++) log('h_best', day(i));
    for (let i = 7; i <= 9; i++) log('h_best', day(i));

    const result = calculateHabitStreak(db, tenantId, 'h_best', '2026-10-09');
    expect(result!.currentStreak).toBe(3);       // resumed run
    expect(result!.bestStreak).toBe(5);          // earlier longer run retained
    expect(result!.bestStreak).toBeGreaterThanOrEqual(result!.currentStreak);
  });

  it('current streak extending beyond the old record becomes the new best', () => {
    makeHabit('h_grow', { scheduleType: 'daily', startDate: '2026-10-01' });
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    // 3-day run, 1 miss, then a 6-day run (both fully logged, reference = last day)
    for (let i = 1; i <= 3; i++) log('h_grow', day(i));
    for (let i = 5; i <= 10; i++) log('h_grow', day(i));

    const result = calculateHabitStreak(db, tenantId, 'h_grow', '2026-10-10');
    expect(result!.currentStreak).toBe(6);
    expect(result!.bestStreak).toBe(6);
  });

  it('excused scheduled days with a sub-threshold value neither break (nor extend) a run', () => {
    makeHabit('h_exc', { scheduleType: 'daily', startDate: '2026-10-01' });
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    for (let i = 1; i <= 3; i++) log('h_exc', day(i));           // run of 3
    log('h_exc', day(4), 0, 'excused');                          // excused, no progress
    for (let i = 5; i <= 6; i++) log('h_exc', day(i));           // run continues

    const result = calculateHabitStreak(db, tenantId, 'h_exc', '2026-10-06');
    expect(result!.currentStreak).toBe(5);
    expect(result!.bestStreak).toBe(5);
  });

  it('unscheduled-day interludes do not interrupt runs (schedule-aware best walk)', () => {
    // Mon/Wed/Fri weekly habit (iso days 1,3,5); 2026-10-05 is a Monday
    makeHabit('h_week', { scheduleDays: [1, 3, 5], startDate: '2026-10-05' });
    log('h_week', '2026-10-05'); // Mon
    log('h_week', '2026-10-07'); // Wed
    log('h_week', '2026-10-09'); // Fri

    const result = calculateHabitStreak(db, tenantId, 'h_week', '2026-10-10');
    // Unscheduled Tue/Thu/Sat are transparent: both walks see consecutive scheduled hits
    expect(result!.currentStreak).toBe(3);
    expect(result!.bestStreak).toBe(3);
  });

  it('isCompletedToday-altering exits keep bestStreak at least equal to currentStreak', () => {
    makeHabit('h_today', { scheduleType: 'daily', startDate: '2026-10-01' });
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
    for (let i = 1; i <= 4; i++) log('h_today', day(i));
    // Reference after end of logged run: nothing logged 'today' → current computed from yesterday
    const result = calculateHabitStreak(db, tenantId, 'h_today', '2026-10-10');
    // 10-05..09 missed → current 0; earlier run 4 stands as best
    expect(result!.currentStreak).toBe(0);
    expect(result!.bestStreak).toBe(4);
  });

  it('a full month of daily logs yields best == current == 30 (typical case sanity)', () => {
    makeHabit('h_full', { scheduleType: 'daily', startDate: '2026-10-01' });
    for (const d of range('2026-10-01', '2026-10-30')) log('h_full', d);
    const result = calculateHabitStreak(db, tenantId, 'h_full', '2026-10-30');
    expect(result!.currentStreak).toBe(30);
    expect(result!.bestStreak).toBe(30);
    expect(result!.completionRatePercent).toBe(100);
  });
});
