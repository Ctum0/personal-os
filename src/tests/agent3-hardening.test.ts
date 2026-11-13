import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, schemaVersion, initSchema, LATEST_SCHEMA_VERSION } from '@/lib/db';
import { taskVisibleClause, isOperationallyVisibleTask } from '@/lib/db/visibility';
import {
  isISODateString,
  isISODateTimeString,
  isTimeString,
  parseFiniteNumber,
  isNonNegativeInteger,
  matchesEnum,
  readJson,
  referenceExists,
} from '@/lib/db/validate';
import { advanceRecurringNextDueDate } from '@/lib/finance/engine';
import { reviseDailyPlan, type PlanningContext, type DailyPlanProposal } from '@/lib/productivity/planner';
import { commitCsvImport } from '@/lib/finance/csv-import';

const freshMigrated = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
};

// ---------------------------------------------------------------------------
// Quarantine visibility policy (centralized, no id-NOT-LIKE heuristics)
// ---------------------------------------------------------------------------

describe('quarantine visibility policy', () => {
  it('hides only explicitly quarantined tasks, regardless of id naming', () => {
    expect(isOperationallyVisibleTask({ status: 'inbox' })).toBe(true);
    expect(isOperationallyVisibleTask({ status: 'next' })).toBe(true);
    expect(isOperationallyVisibleTask({ status: 'completed' })).toBe(true);
    expect(isOperationallyVisibleTask({ status: 'quarantined' })).toBe(false);
    expect(isOperationallyVisibleTask({ status: 'inbox', is_deleted: 1 })).toBe(false);
  });

  it('builds a SQL clause that excludes quarantined rows for any alias', () => {
    expect(taskVisibleClause('t')).toBe(`(t.status != 'quarantined')`);
    expect(taskVisibleClause('ta')).toBe(`(ta.status != 'quarantined')`);
    // Unaliased callers must pass the table name, never rely on a default.
    expect(taskVisibleClause('tasks')).toBe(`(tasks.status != 'quarantined')`);
  });

  it('keeps a quarantined task out of list queries while a normal task passes', () => {
    const db = freshMigrated();
    const tenantId = 'tenant_default'; // seeded by initSchema baseline migration
    db.prepare(
      `INSERT INTO tasks (id, tenant_id, title, status) VALUES ('t_visible', ?, 'Real task', 'inbox')`
    ).run(tenantId);
    db.prepare(
      `INSERT INTO tasks (id, tenant_id, title, status) VALUES ('t_clearly_not_a_test_name', ?, 'Fixture noise', 'quarantined')`
    ).run(tenantId);

    const rows = db
      .prepare(`SELECT id FROM tasks t WHERE t.tenant_id = ? AND ${taskVisibleClause('t')}`)
      .all(tenantId) as Array<{ id: string }>;

    const ids = rows.map(r => r.id);
    expect(ids).toContain('t_visible');
    expect(ids).not.toContain('t_clearly_not_a_test_name');
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Migration v4: weekly_reviews is the authoritative weekly-review store
// ---------------------------------------------------------------------------

describe('weekly_reviews migration (v4)', () => {
  it('reports the latest schema version and creates the table on a fresh db', () => {
    const db = freshMigrated();
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_reviews'`)
      .get();
    expect(table).toBeDefined();
    db.close();
  });

  it('upgrades a pre-versioning database and migrates legacy weeklyReviews', () => {
    const legacy = '2026-11-02';
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db); // no versioning: version 0, no weekly_reviews
    // Seed a legacy preference payload before upgrade: the UI's legacy shape
    // is an ARRAY of entries anchored by `date` (not an object map).
    db.prepare(`UPDATE users SET preferences = ? WHERE id = 'user_default'`).run(
      JSON.stringify({
        weeklyReviews: [
          {
            id: 'legacy_rev_1',
            date: legacy,
            completedCount: 5,
            openCount: 1,
            habitsCount: 4,
            reflectionNotes: 'Focused week',
            nextWeekCommitments: 'Ship audit',
            savedAt: '2026-11-08T20:00:00.000Z',
          },
        ],
      })
    );
    const countsBefore = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    expect((countsBefore as any).n).toBeGreaterThan(0);

    const result = runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_SCHEMA_VERSION);

    const row = db
      .prepare(`SELECT * FROM weekly_reviews WHERE tenant_id = 'tenant_default' AND week_start = ?`)
      .get(legacy);
    expect(row).toBeDefined();
    const payload = JSON.parse((row as any).payload);
    expect(payload).toMatchObject({
      completedCount: 5,
      habitsCount: 4,
      reflectionNotes: 'Focused week',
      nextWeekCommitments: 'Ship audit',
    });
    db.close();
  });

  it('enforces one review per (tenant, week_start) via upsert semantics', () => {
    const db = freshMigrated();
    const upsert = db.prepare(`
      INSERT INTO weekly_reviews (id, tenant_id, week_start, payload)
      VALUES (?, 'tenant_default', ?, ?)
      ON CONFLICT(tenant_id, week_start) DO UPDATE SET payload = excluded.payload
    `);
    upsert.run('wrev_a', '2026-11-02', '{"completedCount":1}');
    upsert.run('wrev_a', '2026-11-02', '{"completedCount":2}');

    const rows = db
      .prepare(`SELECT * FROM weekly_reviews WHERE tenant_id = 'tenant_default'`)
      .all();
    expect(rows).toHaveLength(1);
    expect(JSON.parse((rows as any)[0].payload)).toEqual({ completedCount: 2 });
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Manual validation helpers
// ---------------------------------------------------------------------------

describe('manual validation helpers', () => {
  it('isISODateString accepts real calendar dates only', () => {
    expect(isISODateString('2026-11-09')).toBe(true);
    expect(isISODateString('2026-02-28')).toBe(true);
    expect(isISODateString('2026-13-01')).toBe(false); // month 13
    expect(isISODateString('2026-00-10')).toBe(false);
    expect(isISODateString('2026-01-00')).toBe(false);
    expect(isISODateString('2026-01-32')).toBe(false);
    expect(isISODateString('09-11-2026')).toBe(false);
    expect(isISODateString('2026-1-1')).toBe(false);
    expect(isISODateString(20261109)).toBe(false);
    expect(isISODateString(null)).toBe(false);
  });

  it('isISODateTimeString accepts datetime variants AND plain dates (lenient by design)', () => {
    expect(isISODateTimeString('2026-11-09T09:30:00Z')).toBe(true);
    expect(isISODateTimeString('2026-11-09 09:30')).toBe(true);
    expect(isISODateTimeString('2026-11-09T09:30:00.123+02:00')).toBe(true);
    // Time portion is deliberately optional: the DB stores TEXT and sorts
    // correctly either way; strict date-only validation is isISODateString's job.
    expect(isISODateTimeString('2026-11-09')).toBe(true);
    expect(isISODateTimeString('tomorrow')).toBe(false);
    expect(isISODateTimeString('09:30')).toBe(false);
  });

  it('isTimeString accepts HH:mm[:ss] within clock bounds', () => {
    expect(isTimeString('09:30')).toBe(true);
    expect(isTimeString('23:59:59')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('9:30')).toBe(false);
    expect(isTimeString('12:60')).toBe(false);
  });

  it('parseFiniteNumber strictly rejects NaN/Infinity/junk', () => {
    expect(parseFiniteNumber(3.5)).toBe(3.5);
    expect(parseFiniteNumber('-12')).toBe(-12);
    expect(parseFiniteNumber(' 4 ')).toBe(4);
    expect(parseFiniteNumber(NaN)).toBeNull();
    expect(parseFiniteNumber(Infinity)).toBeNull();
    expect(parseFiniteNumber('abc')).toBeNull();
    expect(parseFiniteNumber('')).toBeNull();
    expect(parseFiniteNumber(null)).toBeNull();
    expect(isNonNegativeInteger('5')).toBe(true);
    expect(isNonNegativeInteger(-1)).toBe(false);
    expect(isNonNegativeInteger(1.5)).toBe(false);
  });

  it('matchesEnum passes undefined/null/empty (default fallback) but rejects junk', () => {
    const statuses = ['inbox', 'next', 'in_progress'];
    expect(matchesEnum('inbox', statuses)).toBe(true);
    expect(matchesEnum(undefined, statuses)).toBe(true);
    expect(matchesEnum('', statuses)).toBe(true);
    expect(matchesEnum('quarantined-anything', statuses)).toBe(false);
    expect(matchesEnum(42, statuses)).toBe(false);
  });

  it('readJson turns malformed bodies into a 400-shaped error, valid ones into data', async () => {
    const bad = await readJson(
      new Request('http://x/api', { method: 'POST', body: '{not json' })
    );
    expect('error' in bad).toBe(true);
    if (!('error' in bad)) throw new Error('expected error shape');
    expect(bad.status).toBe(400);

    const good = await readJson(
      new Request('http://x/api', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    );
    expect('data' in good).toBe(true);
  });

  it('referenceExists is tenant-scoped and treats missing values as satisfied', () => {
    const db = freshMigrated();
    expect(referenceExists(db, 'tenant_default', 'spaces', 'space_personal')).toBe(true);
    expect(referenceExists(db, 'tenant_default', 'spaces', 'space_work')).toBe(true);
    // cross-tenant reference must fail: 'other_tenant space'
    expect(referenceExists(db, 'tenant_default', 'spaces', 'space_from_other_tenant')).toBe(false);
    expect(referenceExists(db, 'tenant_default', 'spaces', undefined)).toBe(true);
    expect(referenceExists(db, 'tenant_default', 'spaces', 12345)).toBe(false);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Recurring rule date advancement (idempotency contract)
// ---------------------------------------------------------------------------

describe('advanceRecurringNextDueDate', () => {
  it('clamps month-end overflow: Jan 31 monthly -> Feb 28', () => {
    expect(advanceRecurringNextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceRecurringNextDueDate('2027-01-31', 'monthly')).toBe('2027-02-28');
  });

  it('preserves the anchor day once the month allows it again: Feb 28 (anchor 31) -> Mar 31', () => {
    expect(advanceRecurringNextDueDate('2026-02-28', 'monthly', 1, 31)).toBe('2026-03-31');
  });

  it('handles leap years for yearly cadence', () => {
    expect(advanceRecurringNextDueDate('2024-02-29', 'yearly')).toBe('2025-02-28');
    expect(advanceRecurringNextDueDate('2024-02-29', 'yearly', 1, 29)).toBe('2025-02-28');
  });

  it('quarterly advances exactly 3 months with anchoring', () => {
    expect(advanceRecurringNextDueDate('2026-01-15', 'quarterly')).toBe('2026-04-15');
    expect(advanceRecurringNextDueDate('2026-08-31', 'quarterly')).toBe('2026-11-30');
  });

  it('biweekly doubles the weekly interval', () => {
    expect(advanceRecurringNextDueDate('2026-11-09', 'biweekly')).toBe('2026-11-23');
    expect(advanceRecurringNextDueDate('2026-11-09', 'weekly')).toBe('2026-11-16');
  });

  it('daily respects multi-day intervals', () => {
    expect(advanceRecurringNextDueDate('2026-11-30', 'daily', 2)).toBe('2026-12-02');
    expect(advanceRecurringNextDueDate('2026-11-30', 'daily')).toBe('2026-12-01');
  });

  it('degrades gracefully: interval 0 -> 1, unknown cadence -> conservative monthly', () => {
    expect(advanceRecurringNextDueDate('2026-01-31', 'daily', 0)).toBe('2026-02-01');
    expect(advanceRecurringNextDueDate('2026-01-31', 'wat_frequency')).toBe('2026-02-28');
  });
});

// ---------------------------------------------------------------------------
// Planner revision honesty (no silent no-ops)
// ---------------------------------------------------------------------------

const revisionFixture = (
  items: Array<{ id: string; title: string; start: string; minutes: number }>
): { context: PlanningContext; proposal: DailyPlanProposal } => {
  let cursor = 9 * 60;
  const scheduledItems = items.map(i => {
    const startMin = cursor;
    cursor += i.minutes + 15;
    const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return {
      id: i.id,
      title: i.title,
      itemType: 'scheduled_task',
      startTime: toHM(startMin),
      endTime: toHM(startMin + i.minutes),
      durationMinutes: i.minutes,
      priority: 'normal',
      isExistingTask: false,
    };
  });

  return {
    context: { targetDate: '2026-11-09', workingHours: { start: '09:00', end: '18:00', maxFocusHours: 6 } },
    proposal: {
      planId: 'plan_fixture',
      targetDate: '2026-11-09',
      objective: 'Fixture',
      totalAvailableHours: 8,
      estimatedWorkloadHours: 1,
      isOvercommitted: false,
      overloadHours: 0,
      scheduledItems: scheduledItems as DailyPlanProposal['scheduledItems'],
      suggestedDeferrals: [],
      identifiedUncertainties: [],
      assumptions: [],
      diffSummary: { tasksToCreate: 0, calendarBlocksToCreate: 1, tasksToReschedule: 0 },
    },
  };
};

describe('planner revision honesty', () => {
  it('an unidentifiable revision ("move that to later") changes NOTHING and says so', () => {
    const { context, proposal } = revisionFixture([
      { id: 'i1', title: 'Write audit report', start: '09:00', minutes: 120 },
      { id: 'i2', title: 'Lunch', start: '12:00', minutes: 60 },
    ]);

    const revision = reviseDailyPlan(context, proposal, 'move that to later');
    expect(revision.changedItems).toEqual([]);

    // Worst case would be a silent mutation: proposal blocks must be untouched
    for (const block of revision.proposal.scheduledItems) {
      const original = proposal.scheduledItems.find(i => i.id === block.id)!;
      expect(block.startTime).toBe(original.startTime);
      expect(block.endTime).toBe(original.endTime);
    }
  });

  it('an empty cancel target does not delete the first matching block', () => {
    const { context, proposal } = revisionFixture([
      { id: 'i1', title: 'Deep work', start: '09:00', minutes: 120 },
      { id: 'i2', title: 'Lunch', start: '12:00', minutes: 60 },
    ]);

    const revision = reviseDailyPlan(context, proposal, 'cancel');
    expect(revision.changedItems).toEqual([]);
    expect(revision.proposal.scheduledItems).toHaveLength(2);
    expect(revision.proposal.scheduledItems.map(i => i.title)).toEqual(['Deep work', 'Lunch']);

    const vague = reviseDailyPlan(context, proposal, 'remove it');
    expect(vague.proposal.scheduledItems).toHaveLength(2);
  });

  it('a specific cancel still works', () => {
    const { context, proposal } = revisionFixture([
      { id: 'i1', title: 'Deep work', start: '09:00', minutes: 120 },
      { id: 'i2', title: 'Lunch', start: '12:00', minutes: 60 },
    ]);
    const revision = reviseDailyPlan(context, proposal, 'cancel lunch');
    expect(revision.changedItems.map(c => c.toLowerCase())).toContain('cancelled: lunch');
    expect(revision.proposal.scheduledItems).toHaveLength(1);
    expect(revision.proposal.scheduledItems[0].title).toBe('Deep work');
  });
});

// ---------------------------------------------------------------------------
// CSV import: single-transaction rollback on partial failure
// ---------------------------------------------------------------------------

describe('csv import commit atomicity', () => {
  it('rolls the whole batch back when an unexpected constraint failure hits mid-commit', () => {
    const db = freshMigrated();
    const tenantId = 'tenant_default';
    db.prepare(
      `INSERT INTO finance_accounts (id, tenant_id, name, type) VALUES ('acc_csv', ?, 'CSV Acc', 'checking')`
    ).run(tenantId);

    const goodRow = {
      rowIndex: 0,
      raw: {},
      parsedDate: '2026-11-01',
      parsedAmount: '10.00',
      parsedType: 'expense' as const,
      parsedPayee: 'Coffee',
      parsedDescription: 'legit row',
      parsedCategory: null,
      isDuplicate: false,
    };
    // Simulate an unexpected hard failure: parsedDate=null violates the
    // journal_transactions.date NOT NULL constraint mid-transaction.
    const corruptRow = { ...goodRow, rowIndex: 1, parsedDate: null };

    expect(() =>
      commitCsvImport(
        db, tenantId, 'acc_csv', 'f.csv', 'hash_atomic', [goodRow, corruptRow] as any, false
      )
    ).toThrow();

    // Atomic: the valid row from the same batch must not survive a rolled-back commit
    const surviving = db
      .prepare(`SELECT COUNT(*) AS n FROM journal_transactions WHERE account_id = 'acc_csv'`)
      .get() as { n: number };
    expect(surviving.n).toBe(0);
    const survivingLines = db
      .prepare(
        `SELECT COUNT(*) AS n FROM journal_lines WHERE account_id = 'acc_csv'`
      )
      .get() as { n: number };
    expect(survivingLines.n).toBe(0);
    const survivingBatches = db
      .prepare(`SELECT COUNT(*) AS n FROM import_batches WHERE account_id = 'acc_csv'`)
      .get() as { n: number };
    expect(survivingBatches.n).toBe(0);
    db.close();
  });

  it('rows explicitly marked with an error are skipped and recorded, not fatal', () => {
    const db = freshMigrated();
    const tenantId = 'tenant_default';
    db.prepare(
      `INSERT INTO finance_accounts (id, tenant_id, name, type) VALUES ('acc_csv2', ?, 'CSV Acc 2', 'checking')`
    ).run(tenantId);

    const goodRow = {
      rowIndex: 0,
      raw: {},
      parsedDate: '2026-11-02',
      parsedAmount: '25.50',
      parsedType: 'income' as const,
      parsedPayee: 'Refund',
      parsedDescription: 'good',
      parsedCategory: null,
      isDuplicate: false,
    };
    const errorRow = {
      ...goodRow,
      rowIndex: 1,
      parsedDate: null,
      parsedAmount: '1.00',
      parsedDescription: 'bad',
      error: 'Unable to parse date',
    };

    const result = commitCsvImport(db, tenantId, 'acc_csv2', 'f2.csv', 'hash_skip', [goodRow, errorRow] as any, true);
    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(1);

    const txs = db
      .prepare(`SELECT status FROM journal_transactions WHERE account_id = 'acc_csv2'`)
      .all() as Array<{ status: string }>;
    expect(txs).toHaveLength(1);
    expect(txs[0].status).toBe('posted');
    // every posted transaction has its matching asset-side journal line
    const lines = db
      .prepare(`SELECT entry_type FROM journal_lines WHERE account_id = 'acc_csv2'`)
      .all() as Array<{ entry_type: string }>;
    expect(lines).toEqual([{ entry_type: 'debit' }]); // income -> debit line
    db.close();
  });
});
