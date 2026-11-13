import type Database from 'better-sqlite3';
import { backfillTransactionFingerprints, getDb, snapshotDatabase, schemaVersion } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { isISODateString, referenceExists } from '@/lib/db/validate';
import { Decimal } from 'decimal.js';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';

const RESTORE_TX_TYPES = ['income', 'expense', 'transfer', 'refund'];

/** Ownership lookups: true when the id is already claimed by another tenant. */
const TENANT_LOOKUP_SQL: Record<string, string> = {
  tasks: 'SELECT tenant_id FROM tasks WHERE id = ?',
  habits: 'SELECT tenant_id FROM habits WHERE id = ?',
  habit_logs: 'SELECT tenant_id FROM habit_logs WHERE id = ?',
  projects: 'SELECT tenant_id FROM projects WHERE id = ?',
  project_milestones: 'SELECT tenant_id FROM project_milestones WHERE id = ?',
  goals: 'SELECT tenant_id FROM goals WHERE id = ?',
  weekly_reviews: 'SELECT tenant_id FROM weekly_reviews WHERE id = ?',
  categories: 'SELECT tenant_id FROM categories WHERE id = ?',
  finance_accounts: 'SELECT tenant_id FROM finance_accounts WHERE id = ?',
  journal_transactions: 'SELECT tenant_id FROM journal_transactions WHERE id = ?',
  journal_lines: 'SELECT tenant_id FROM journal_lines WHERE id = ?',
  budgets: 'SELECT tenant_id FROM budgets WHERE id = ?',
  budget_lines: 'SELECT tenant_id FROM budget_lines WHERE id = ?',
  recurring_financial_rules: 'SELECT tenant_id FROM recurring_financial_rules WHERE id = ?',
  savings_goals: 'SELECT tenant_id FROM savings_goals WHERE id = ?',
  debts: 'SELECT tenant_id FROM debts WHERE id = ?',
  payees: 'SELECT tenant_id FROM payees WHERE id = ?',
  calendar_events: 'SELECT tenant_id FROM calendar_events WHERE id = ?',
  focus_sessions: 'SELECT tenant_id FROM focus_sessions WHERE id = ?',
  daily_plans: 'SELECT tenant_id FROM daily_plans WHERE id = ?',
  daily_plan_items: 'SELECT tenant_id FROM daily_plan_items WHERE id = ?',
  import_batches: 'SELECT tenant_id FROM import_batches WHERE id = ?',
};

function ownedByOtherTenant(db: Database.Database, table: string, id: string, tenantId: string): boolean {
  const row = db.prepare(TENANT_LOOKUP_SQL[table]).get(id) as { tenant_id: string } | undefined;
  return row !== undefined && row.tenant_id !== tenantId;
}

function asText(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function asNumber(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asIntegerFlag(value: unknown, fallback: 0 | 1): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = asNumber(value, fallback);
  return n === 1 ? 1 : n === 0 ? 0 : fallback;
}

/** `YYYY-MM-DD` prefix of a backup date, or null when it is not a real date. */
function asIsoDateOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return isISODateString(day) ? day : null;
}

function asObjectArray(value: unknown, maxItems: number): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of value.slice(0, maxItems)) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      rows.push(entry as Record<string, unknown>);
    }
  }
  return rows;
}

function asDomainObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const domains = asDomainObject(body.domains);
    if (!domains) {
      throw new FieldError('Invalid backup file format: missing domains object');
    }
    const productivity = asDomainObject(domains.productivity);
    const finance = asDomainObject(domains.finance);

    // Pre-restore snapshot for guaranteed disaster recovery (full DB, includes
    // weekly_reviews and every other table — nothing is lost by a bad import).
    const ver = schemaVersion(db);
    const snapshotPath = snapshotDatabase(db, ver);

    const counts = {
      tasks: { imported: 0, skipped: 0 },
      habits: { imported: 0, skipped: 0 },
      habitLogs: { imported: 0, skipped: 0 },
      projects: { imported: 0, skipped: 0 },
      milestones: { imported: 0, skipped: 0 },
      goals: { imported: 0, skipped: 0 },
      weeklyReviews: { imported: 0, skipped: 0 },
      categories: { imported: 0, skipped: 0 },
      accounts: { imported: 0, skipped: 0 },
      transactions: { imported: 0, skipped: 0 },
      invalidTransactions: 0,
      journalLines: { imported: 0, skipped: 0 },
      budgetLines: { imported: 0, skipped: 0 },
      calendarEvents: { imported: 0, skipped: 0 },
      focusSessions: { imported: 0, skipped: 0 },
      dailyPlans: { imported: 0, skipped: 0 },
      dailyPlanItems: { imported: 0, skipped: 0 },
      payees: { imported: 0, skipped: 0 },
      recurringRules: { imported: 0, skipped: 0 },
      savingsGoals: { imported: 0, skipped: 0 },
      debts: { imported: 0, skipped: 0 },
      importBatches: { imported: 0, skipped: 0 },
      safeToSpendSettings: { imported: 0, skipped: 0 },
    };

    db.transaction(() => {
      // Restore order cannot satisfy every foreign key: tasks reference spaces,
      // projects and goals that are themselves restored in later steps. Deferring
      // FK enforcement to COMMIT keeps the whole import atomic without reordering
      // (and without silently dropping references the payload legitimately has).
      db.pragma('defer_foreign_keys = ON');

      // 1. Tasks (upsert-only: unrelated data outside the backup payloads is
      //    never touched or wiped).
      const taskRows = asObjectArray(productivity?.tasks, 5000);
      if (taskRows.length > 0) {
        // `is_deleted` and the completion fields are part of a task's state, not
        // decoration: without them a restore silently re-activates archived work
        // and loses completion history. The export is a raw dump precisely so
        // these can round-trip.
        const stmt = db.prepare(`
          INSERT INTO tasks (
            id, tenant_id, title, description, status, priority,
            estimated_duration, actual_duration, due_date, space_id, project_id, goal_id,
            is_deleted, completion_at, due_time, start_date, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            priority = excluded.priority,
            due_date = excluded.due_date,
            is_deleted = excluded.is_deleted,
            completion_at = excluded.completion_at,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);

        for (const t of taskRows) {
          const id = asText(t.id, 100);
          const title = asText(t.title, 500);
          if (!id || !title || ownedByOtherTenant(db, 'tasks', id, session.tenantId)) {
            counts.tasks.skipped++;
            continue;
          }
          const due = t.due_date ? asIsoDateOrNull(t.due_date) : null;
          if (t.due_date && !due) {
            counts.tasks.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            title,
            asText(t.description, 20_000) ?? null,
            asText(t.status, 50) ?? 'inbox',
            asText(t.priority, 20) ?? 'normal',
            asNumber(t.estimated_duration, 0),
            asNumber(t.actual_duration, 0),
            due,
            asText(t.space_id, 100) ?? null,
            asText(t.project_id, 100) ?? null,
            asText(t.goal_id, 100) ?? null,
            t.is_deleted === 1 || t.is_deleted === true ? 1 : 0,
            asText(t.completion_at, 40) ?? null,
            asText(t.due_time, 10) ?? null,
            asIsoDateOrNull(t.start_date),
            asText(t.updated_at, 40) ?? null,
            session.tenantId
          );
          counts.tasks.imported++;
        }
      }

      // 2. Habits (derived streak fields in the payload are ignored; they are
      //    recomputed at read time).
      const habitRows = asObjectArray(productivity?.habits, 2000);
      if (habitRows.length > 0) {
        const habitStmt = db.prepare(`
          INSERT INTO habits (
            id, tenant_id, space_id, title, description, tracking_type, unit,
            target_value, minimum_threshold, ideal_target, schedule_type, schedule_days,
            frequency_target, time_of_day, start_date, end_date, is_paused, pause_reason, color, icon
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            tracking_type = excluded.tracking_type,
            unit = excluded.unit,
            target_value = excluded.target_value,
            minimum_threshold = excluded.minimum_threshold,
            ideal_target = excluded.ideal_target,
            schedule_type = excluded.schedule_type,
            schedule_days = excluded.schedule_days,
            frequency_target = excluded.frequency_target,
            time_of_day = excluded.time_of_day,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            is_paused = excluded.is_paused,
            pause_reason = excluded.pause_reason,
            color = excluded.color,
            icon = excluded.icon,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);

        for (const h of habitRows) {
          const id = asText(h.id, 100);
          const title = asText(h.title, 500);
          if (!id || !title || ownedByOtherTenant(db, 'habits', id, session.tenantId)) {
            counts.habits.skipped++;
            continue;
          }
          const spaceId = asText(h.space_id, 100);
          const rawDays = h.schedule_days;
          habitStmt.run(
            id,
            session.tenantId,
            spaceId && referenceExists(db, session.tenantId, 'spaces', spaceId) ? spaceId : null,
            title,
            asText(h.description, 20_000) ?? null,
            asText(h.tracking_type, 30) ?? 'boolean',
            asText(h.unit, 30) ?? 'times',
            asNumber(h.target_value, 1),
            asNumber(h.minimum_threshold, 1),
            asNumber(h.ideal_target, 1),
            asText(h.schedule_type, 30) ?? 'daily',
            Array.isArray(rawDays) ? JSON.stringify(rawDays.slice(0, 7)) : (asText(rawDays, 100) ?? '[1,2,3,4,5,6,7]'),
            Math.trunc(asNumber(h.frequency_target, 1)),
            asText(h.time_of_day, 30) ?? 'anytime',
            asIsoDateOrNull(h.start_date) ?? new Date().toISOString().slice(0, 10),
            asIsoDateOrNull(h.end_date),
            asIntegerFlag(h.is_paused, 0),
            asText(h.pause_reason, 500) ?? null,
            asText(h.color, 20) ?? '#8b5cf6',
            asText(h.icon, 50) ?? 'CheckCircle2',
            session.tenantId
          );
          counts.habits.imported++;
        }
      }

      // 3. Habit logs. UNIQUE(tenant_id, habit_id, log_date) is the natural key,
      //    so an existing entry for that day is updated in place instead of
      //    aborting the whole import on a uniqueness violation.
      const habitLogRows = asObjectArray(productivity?.habitLogs, 5000);
      if (habitLogRows.length > 0) {
        const logInsert = db.prepare(`
          INSERT INTO habit_logs (id, tenant_id, habit_id, log_date, value, status, notes, logged_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const logUpdate = db.prepare(
          'UPDATE habit_logs SET value = ?, status = ?, notes = ? WHERE id = ? AND tenant_id = ?'
        );
        const logByNaturalKey = db.prepare(
          'SELECT id FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?'
        );

        for (const row of habitLogRows) {
          const id = asText(row.id, 100);
          const habitId = asText(row.habit_id, 100);
          const logDate = asIsoDateOrNull(row.log_date);
          if (
            !id ||
            !habitId ||
            !logDate ||
            !referenceExists(db, session.tenantId, 'habits', habitId) ||
            ownedByOtherTenant(db, 'habit_logs', id, session.tenantId)
          ) {
            counts.habitLogs.skipped++;
            continue;
          }
          const value = asNumber(row.value, 1);
          const status = asText(row.status, 30) ?? 'completed';
          const notes = asText(row.notes, 2000);
          const natural = logByNaturalKey.get(session.tenantId, habitId, logDate) as { id: string } | undefined;
          if (natural) {
            logUpdate.run(value, status, notes, natural.id, session.tenantId);
          } else {
            logInsert.run(
              id,
              session.tenantId,
              habitId,
              logDate,
              value,
              status,
              notes,
              asText(row.logged_at, 50) ?? new Date().toISOString()
            );
          }
          counts.habitLogs.imported++;
        }
      }

      // 4. Goals (before projects: projects.goal_id references goals).
      const goalRows = asObjectArray(productivity?.goals, 2000);
      if (goalRows.length > 0) {
        const goalStmt = db.prepare(`
          INSERT INTO goals (
            id, tenant_id, space_id, title, description, type, start_value, target_value,
            current_value, unit, direction, progress_method, start_date, deadline, cadence,
            status, linked_savings_goal_id, color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            type = excluded.type,
            start_value = excluded.start_value,
            target_value = excluded.target_value,
            current_value = excluded.current_value,
            unit = excluded.unit,
            direction = excluded.direction,
            progress_method = excluded.progress_method,
            start_date = excluded.start_date,
            deadline = excluded.deadline,
            cadence = excluded.cadence,
            status = excluded.status,
            linked_savings_goal_id = excluded.linked_savings_goal_id,
            color = excluded.color,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);

        for (const g of goalRows) {
          const id = asText(g.id, 100);
          const title = asText(g.title, 500);
          if (!id || !title || ownedByOtherTenant(db, 'goals', id, session.tenantId)) {
            counts.goals.skipped++;
            continue;
          }
          const spaceId = asText(g.space_id, 100);
          const savingsGoalId = asText(g.linked_savings_goal_id, 100);
          goalStmt.run(
            id,
            session.tenantId,
            spaceId && referenceExists(db, session.tenantId, 'spaces', spaceId) ? spaceId : null,
            title,
            asText(g.description, 20_000) ?? null,
            asText(g.type, 30) ?? 'numeric',
            asNumber(g.start_value, 0),
            asNumber(g.target_value, 100),
            asNumber(g.current_value, 0),
            asText(g.unit, 30) ?? '%',
            asText(g.direction, 20) ?? 'ascending',
            asText(g.progress_method, 30) ?? 'log_latest',
            asIsoDateOrNull(g.start_date),
            asIsoDateOrNull(g.deadline),
            asText(g.cadence, 30) ?? 'quarterly',
            asText(g.status, 30) ?? 'in_progress',
            savingsGoalId && referenceExists(db, session.tenantId, 'savings_goals', savingsGoalId)
              ? savingsGoalId
              : null,
            asText(g.color, 20) ?? '#10b981',
            session.tenantId
          );
          counts.goals.imported++;
        }
      }

      // 5. Projects.
      const projectRows = asObjectArray(productivity?.projects, 2000);
      if (projectRows.length > 0) {
        const projectStmt = db.prepare(`
          INSERT INTO projects (
            id, tenant_id, space_id, goal_id, name, description, status, objective,
            definition_of_done, start_date, target_date, progress_method, manual_progress, color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            objective = excluded.objective,
            definition_of_done = excluded.definition_of_done,
            start_date = excluded.start_date,
            target_date = excluded.target_date,
            progress_method = excluded.progress_method,
            manual_progress = excluded.manual_progress,
            color = excluded.color,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);

        for (const p of projectRows) {
          const id = asText(p.id, 100);
          const name = asText(p.name, 500);
          if (!id || !name || ownedByOtherTenant(db, 'projects', id, session.tenantId)) {
            counts.projects.skipped++;
            continue;
          }
          const spaceId = asText(p.space_id, 100);
          const goalId = asText(p.goal_id, 100);
          projectStmt.run(
            id,
            session.tenantId,
            spaceId && referenceExists(db, session.tenantId, 'spaces', spaceId) ? spaceId : null,
            goalId && referenceExists(db, session.tenantId, 'goals', goalId) ? goalId : null,
            name,
            asText(p.description, 20_000) ?? null,
            asText(p.status, 30) ?? 'active',
            asText(p.objective, 20_000) ?? null,
            asText(p.definition_of_done, 20_000) ?? null,
            asIsoDateOrNull(p.start_date),
            asIsoDateOrNull(p.target_date),
            asText(p.progress_method, 30) ?? 'completion',
            Math.trunc(asNumber(p.manual_progress, 0)),
            asText(p.color, 20) ?? '#3b82f6',
            session.tenantId
          );
          counts.projects.imported++;
        }
      }

      // 6. Project milestones (after projects).
      const milestoneRows = asObjectArray(productivity?.milestones, 5000);
      if (milestoneRows.length > 0) {
        const milestoneStmt = db.prepare(`
          INSERT INTO project_milestones (
            id, tenant_id, project_id, title, description, target_date,
            is_completed, completed_at, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            target_date = excluded.target_date,
            is_completed = excluded.is_completed,
            completed_at = excluded.completed_at,
            sort_order = excluded.sort_order
          WHERE tenant_id = ?
        `);

        for (const m of milestoneRows) {
          const id = asText(m.id, 100);
          const projectId = asText(m.project_id, 100);
          const title = asText(m.title, 500);
          if (
            !id ||
            !projectId ||
            !title ||
            !referenceExists(db, session.tenantId, 'projects', projectId) ||
            ownedByOtherTenant(db, 'project_milestones', id, session.tenantId)
          ) {
            counts.milestones.skipped++;
            continue;
          }
          milestoneStmt.run(
            id,
            session.tenantId,
            projectId,
            title,
            asText(m.description, 20_000) ?? null,
            asIsoDateOrNull(m.target_date),
            asIntegerFlag(m.is_completed, 0),
            asText(m.completed_at, 50) ?? null,
            Math.trunc(asNumber(m.sort_order, 0)),
            session.tenantId
          );
          counts.milestones.imported++;
        }
      }

      // 7. Weekly reviews (authoritative store, migration v4).
      const reviewRows = asObjectArray(productivity?.weeklyReviews, 2000);
      if (reviewRows.length > 0) {
        const reviewStmt = db.prepare(`
          INSERT INTO weekly_reviews (id, tenant_id, week_start, week_end, title, summary, payload, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, week_start) DO UPDATE SET
            title = excluded.title,
            summary = excluded.summary,
            payload = excluded.payload,
            updated_at = datetime('now')
        `);
        for (const r of reviewRows) {
          const weekStart = asIsoDateOrNull(r.weekStart ?? r.week_start);
          if (!weekStart) {
            counts.weeklyReviews.skipped++;
            continue;
          }
          const reviewId = asText(r.id, 100) ?? `wrev_${session.tenantId}_${weekStart}`;
          if (ownedByOtherTenant(db, 'weekly_reviews', reviewId, session.tenantId)) {
            counts.weeklyReviews.skipped++;
            continue;
          }
          let payloadJson = '{}';
          if (r.payload !== undefined) {
            try {
              payloadJson = JSON.stringify(typeof r.payload === 'object' && r.payload !== null ? r.payload : {});
            } catch {
              payloadJson = '{}';
            }
          }
          reviewStmt.run(
            reviewId,
            session.tenantId,
            weekStart,
            asIsoDateOrNull(r.weekEnd ?? r.week_end) ?? weekStart,
            asText(r.title, 300) ?? null,
            asText(r.summary, 20_000) ?? null,
            payloadJson,
            asText(r.created_by, 100) ?? session.userId
          );
          counts.weeklyReviews.imported++;
        }
      }

      // 8. Categories (before transactions/budget lines: both reference them).
      //    parent_id is written in a second pass so an out-of-order child never
      //    trips the self-referencing foreign key.
      const categoryRows = asObjectArray(finance?.categories, 2000);
      if (categoryRows.length > 0) {
        const categoryStmt = db.prepare(`
          INSERT INTO categories (id, tenant_id, name, type, parent_id, icon, color, is_hidden)
          VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            icon = excluded.icon,
            color = excluded.color,
            is_hidden = excluded.is_hidden
          WHERE tenant_id = ?
        `);
        const parentStmt = db.prepare('UPDATE categories SET parent_id = ? WHERE id = ? AND tenant_id = ?');

        for (const c of categoryRows) {
          const id = asText(c.id, 100);
          const name = asText(c.name, 200);
          if (!id || !name || ownedByOtherTenant(db, 'categories', id, session.tenantId)) {
            counts.categories.skipped++;
            continue;
          }
          categoryStmt.run(
            id,
            session.tenantId,
            name,
            asText(c.type, 30) ?? 'expense',
            asText(c.icon, 50) ?? 'Tag',
            asText(c.color, 20) ?? '#64748b',
            asIntegerFlag(c.is_hidden, 0),
            session.tenantId
          );
          counts.categories.imported++;
        }

        for (const c of categoryRows) {
          const id = asText(c.id, 100);
          const parentId = asText(c.parent_id, 100);
          if (!id || !parentId || !referenceExists(db, session.tenantId, 'categories', parentId)) continue;
          parentStmt.run(parentId, id, session.tenantId);
        }
      }

      // 9. Finance accounts.
      const accountRows = asObjectArray(finance?.accounts, 2000);
      if (accountRows.length > 0) {
        // The export is `SELECT *`, so every operator-visible column has to make
        // the return trip: `credit_limit` is what makes includeCreditLines work,
        // and institution/masked_number/sort_order are part of the account.
        const accStmt = db.prepare(`
          INSERT INTO finance_accounts (
            id, tenant_id, name, type, currency, opening_balance, opening_date,
            institution, masked_number, credit_limit, is_active, display_color, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            currency = excluded.currency,
            opening_balance = excluded.opening_balance,
            opening_date = excluded.opening_date,
            institution = excluded.institution,
            masked_number = excluded.masked_number,
            credit_limit = excluded.credit_limit,
            is_active = excluded.is_active,
            display_color = excluded.display_color,
            sort_order = excluded.sort_order,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);

        for (const a of accountRows) {
          const id = asText(a.id, 100);
          const name = asText(a.name, 200);
          if (!id || !name || ownedByOtherTenant(db, 'finance_accounts', id, session.tenantId)) {
            counts.accounts.skipped++;
            continue;
          }
          let opening = '0.00';
          if (a.opening_balance !== undefined && a.opening_balance !== null && a.opening_balance !== '') {
            try {
              const d = new Decimal(a.opening_balance as Decimal.Value);
              if (!d.isFinite()) {
                counts.accounts.skipped++;
                continue;
              }
              opening = d.toFixed(2);
            } catch {
              counts.accounts.skipped++;
              continue;
            }
          }
          accStmt.run(
            id,
            session.tenantId,
            name,
            asText(a.type, 50) ?? 'checking',
            asText(a.currency, 10) ?? 'USD',
            opening,
            asIsoDateOrNull(a.opening_date),
            asText(a.institution, 200) ?? null,
            asText(a.masked_number, 40) ?? null,
            asText(a.credit_limit, 30) ?? null,
            asIntegerFlag(a.is_active, 1),
            asText(a.display_color, 20) ?? '#10b981',
            asNumber(a.sort_order, 0),
            session.tenantId
          );
          counts.accounts.imported++;
        }
      }

      // 10. Finance transactions. Validated strictly: amount must be a positive
      //     finite decimal, type an allowed enum, date a real calendar date.
      //     Posted movements also get balanced journal_lines — unless the backup
      //     carries an authoritative journalLines array (format 1.1), in which
      //     case those rows are restored verbatim in step 11 and synthesising
      //     them again would double the ledger.
      const exportsJournalLines = Array.isArray(finance?.journalLines);
      const txRows = asObjectArray(finance?.transactions, 5000);
      if (txRows.length > 0) {
        const txStmt = db.prepare(`
          INSERT INTO journal_transactions (
            id, tenant_id, transaction_type, status, date, amount, currency, base_amount,
            account_id, to_account_id, category_id, payee_name, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            amount = excluded.amount,
            base_amount = excluded.base_amount,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        const existingTx = db.prepare('SELECT tenant_id FROM journal_transactions WHERE id = ?');
        const lineStmt = db.prepare(`
          INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const existingLine = db.prepare('SELECT id FROM journal_lines WHERE id = ?');

        for (const tx of txRows) {
          const id = asText(tx.id, 100);
          if (!id) {
            counts.transactions.skipped++;
            counts.invalidTransactions++;
            continue;
          }
          if (ownedByOtherTenant(db, 'journal_transactions', id, session.tenantId)) {
            counts.transactions.skipped++;
            continue;
          }
          let dec: Decimal;
          try {
            dec = new Decimal((tx.amount ?? 0) as Decimal.Value);
          } catch {
            counts.transactions.skipped++;
            counts.invalidTransactions++;
            continue;
          }
          if (!dec.isFinite() || dec.lte(0)) {
            counts.transactions.skipped++;
            counts.invalidTransactions++;
            continue;
          }
          const type = asText(tx.transaction_type, 30) ?? 'expense';
          if (!RESTORE_TX_TYPES.includes(type)) {
            counts.transactions.skipped++;
            counts.invalidTransactions++;
            continue;
          }
          const date = asIsoDateOrNull(tx.date);
          if (!date) {
            counts.transactions.skipped++;
            counts.invalidTransactions++;
            continue;
          }

          const amountStr = dec.toFixed(2);
          const existed = existingTx.get(id) !== undefined;
          txStmt.run(
            id,
            session.tenantId,
            type,
            asText(tx.status, 30) ?? 'posted',
            date,
            amountStr,
            asText(tx.currency, 10) ?? 'USD',
            amountStr,
            asText(tx.account_id, 100) ?? null,
            asText(tx.to_account_id, 100) ?? null,
            asText(tx.category_id, 100) ?? null,
            asText(tx.payee, 200) ?? asText(tx.payee_name, 200) ?? null,
            asText(tx.description, 20_000) ?? '',
            session.tenantId
          );
          counts.transactions.imported++;

          if (existed || exportsJournalLines) continue;
          if ((asText(tx.status, 30) ?? 'posted') === 'posted') {
            const accountId = asText(tx.account_id, 100) ?? null;
            const toAccountId = asText(tx.to_account_id, 100) ?? null;
            const description = asText(tx.description, 20_000) ?? type;
            const lines: Array<{ id: string; account: string | null; entry: string; desc: string }> = [];
            if (type === 'income' || type === 'refund') {
              lines.push({ id: `jl_${id}_1`, account: accountId, entry: 'debit', desc: `Restore: ${description}` });
            } else if (type === 'expense') {
              lines.push({ id: `jl_${id}_1`, account: accountId, entry: 'credit', desc: `Restore: ${description}` });
            } else if (type === 'transfer') {
              lines.push({ id: `jl_${id}_1`, account: accountId, entry: 'credit', desc: `Restore: transfer to ${toAccountId}` });
              lines.push({ id: `jl_${id}_2`, account: toAccountId, entry: 'debit', desc: `Restore: transfer from ${accountId}` });
            }
            for (const l of lines) {
              if (!l.account || existingLine.get(l.id)) continue;
              lineStmt.run(
                l.id,
                session.tenantId,
                id,
                l.account,
                l.entry,
                amountStr,
                asText(tx.currency, 10) ?? 'USD',
                amountStr,
                l.desc
              );
              counts.journalLines.imported++;
            }
          }
        }
      }

      // 11. Journal lines carried by the backup (format 1.1). Restored verbatim
      //     so the ledger invariant is preserved exactly, not re-derived.
      const journalLineRows = asObjectArray(finance?.journalLines, 20_000);
      if (journalLineRows.length > 0) {
        const lineStmt = db.prepare(`
          INSERT INTO journal_lines (
            id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            entry_type = excluded.entry_type,
            amount = excluded.amount,
            currency = excluded.currency,
            base_amount = excluded.base_amount,
            description = excluded.description
          WHERE tenant_id = ?
        `);
        const txExists = db.prepare('SELECT id FROM journal_transactions WHERE id = ? AND tenant_id = ?');

        for (const l of journalLineRows) {
          const id = asText(l.id, 100);
          const transactionId = asText(l.transaction_id, 100);
          const accountId = asText(l.account_id, 100);
          const entryType = asText(l.entry_type, 20);
          if (
            !id ||
            !transactionId ||
            !accountId ||
            !entryType ||
            !txExists.get(transactionId, session.tenantId) ||
            !referenceExists(db, session.tenantId, 'finance_accounts', accountId) ||
            ownedByOtherTenant(db, 'journal_lines', id, session.tenantId)
          ) {
            counts.journalLines.skipped++;
            continue;
          }
          let amount: string;
          let baseAmount: string;
          try {
            amount = new Decimal((l.amount ?? 0) as Decimal.Value).toFixed(2);
            baseAmount = new Decimal((l.base_amount ?? l.amount ?? 0) as Decimal.Value).toFixed(2);
          } catch {
            counts.journalLines.skipped++;
            continue;
          }
          lineStmt.run(
            id,
            session.tenantId,
            transactionId,
            accountId,
            entryType,
            amount,
            asText(l.currency, 10) ?? 'USD',
            baseAmount,
            asText(l.description, 20_000) ?? null,
            session.tenantId
          );
          counts.journalLines.imported++;
        }
      }

      // 12. The active budget snapshot together with its per-category lines.
      //     Categories are tenant-owned, so lines for categories outside this
      //     tenant are skipped rather than failing the whole import on an FK.
      const budget = asDomainObject(finance?.budget);
      if (budget) {
        const budgetId = asText(budget.budgetId ?? budget.id, 100);
        const startDate = asIsoDateOrNull(budget.start_date ?? budget.persistedPeriodStart ?? budget.periodStart);
        const endDate = asIsoDateOrNull(budget.end_date ?? budget.persistedPeriodEnd ?? budget.periodEnd);
        if (budgetId && startDate && endDate && !ownedByOtherTenant(db, 'budgets', budgetId, session.tenantId)) {
          db.prepare(`
            INSERT INTO budgets (
              id, tenant_id, name, budget_type, period_type, start_date, end_date,
              currency, rollover_mode, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              budget_type = excluded.budget_type,
              period_type = excluded.period_type,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              currency = excluded.currency,
              rollover_mode = excluded.rollover_mode,
              is_active = excluded.is_active,
              updated_at = datetime('now')
            WHERE tenant_id = ?
          `).run(
            budgetId,
            session.tenantId,
            asText(budget.name ?? budget.budgetName, 300) ?? 'Restored Budget',
            asText(budget.budget_type ?? budget.budgetType, 50) ?? 'category_limit',
            asText(budget.period_type ?? budget.periodType, 30) ?? 'monthly',
            startDate,
            endDate,
            asText(budget.currency, 10) ?? 'USD',
            asText(budget.rollover_mode ?? budget.rolloverMode, 30) ?? 'none',
            asIntegerFlag(budget.is_active ?? budget.isActive, 1),
            session.tenantId
          );

          const budgetLineStmt = db.prepare(`
            INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(budget_id, category_id) DO UPDATE SET
              allocated_amount = excluded.allocated_amount,
              rollover_amount = excluded.rollover_amount,
              notes = excluded.notes
            WHERE tenant_id = ?
          `);

          for (const item of asObjectArray(budget.items, 1000)) {
            const categoryId = asText(item.category_id ?? item.categoryId, 100);
            if (!categoryId || !referenceExists(db, session.tenantId, 'categories', categoryId)) {
              counts.budgetLines.skipped++;
              continue;
            }
            let allocated: string;
            let rollover: string;
            try {
              allocated = new Decimal((item.allocated_amount ?? item.allocatedAmount ?? 0) as Decimal.Value).toFixed(2);
              rollover = new Decimal((item.rollover_amount ?? item.rolloverAmount ?? 0) as Decimal.Value).toFixed(2);
            } catch {
              counts.budgetLines.skipped++;
              continue;
            }
            const lineId = asText(item.id, 100) ?? `bl_${budgetId}_${categoryId}`;
            // The conflict target is (budget_id, category_id); a line whose id is
            // already the primary key of another tenant's row cannot be inserted.
            if (ownedByOtherTenant(db, 'budget_lines', lineId, session.tenantId)) {
              counts.budgetLines.skipped++;
              continue;
            }
            budgetLineStmt.run(
              lineId,
              session.tenantId,
              budgetId,
              categoryId,
              allocated,
              rollover,
              asText(item.notes, 2000) ?? null,
              session.tenantId
            );
            counts.budgetLines.imported++;
          }
        }
      }

      // 13. Recurring rules, savings goals and debts. Restored before goals are
      //     re-linked below; `goals.linked_savings_goal_id` is nulled above when
      //     the referenced goal did not exist yet, so it is repaired here.
      const recurringRows = asObjectArray(finance?.recurringRules, 2000);
      if (recurringRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO recurring_financial_rules (
            id, tenant_id, name, rule_type, frequency, interval_count, day_of_month,
            day_of_week, start_date, end_date, expected_amount, currency, account_id,
            to_account_id, category_id, payee_id, auto_action, reminder_days_before,
            last_generated_at, next_due_date, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            rule_type = excluded.rule_type,
            frequency = excluded.frequency,
            interval_count = excluded.interval_count,
            day_of_month = excluded.day_of_month,
            day_of_week = excluded.day_of_week,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            expected_amount = excluded.expected_amount,
            currency = excluded.currency,
            account_id = excluded.account_id,
            to_account_id = excluded.to_account_id,
            category_id = excluded.category_id,
            payee_id = excluded.payee_id,
            auto_action = excluded.auto_action,
            reminder_days_before = excluded.reminder_days_before,
            last_generated_at = excluded.last_generated_at,
            next_due_date = excluded.next_due_date,
            is_active = excluded.is_active,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        for (const r of recurringRows) {
          const id = asText(r.id, 100);
          const name = asText(r.name, 300);
          if (!id || !name || ownedByOtherTenant(db, 'recurring_financial_rules', id, session.tenantId)) {
            counts.recurringRules.skipped++;
            continue;
          }
          let amount: string;
          try {
            amount = new Decimal((r.expected_amount ?? 0) as Decimal.Value).toFixed(2);
          } catch {
            counts.recurringRules.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            name,
            asText(r.rule_type, 30) ?? 'bill',
            asText(r.frequency, 30) ?? 'monthly',
            asNumber(r.interval_count, 1),
            r.day_of_month === null || r.day_of_month === undefined ? null : asNumber(r.day_of_month, 1),
            r.day_of_week === null || r.day_of_week === undefined ? null : asNumber(r.day_of_week, 0),
            asIsoDateOrNull(r.start_date),
            asIsoDateOrNull(r.end_date),
            amount,
            asText(r.currency, 10) ?? 'USD',
            asText(r.account_id, 100) ?? null,
            asText(r.to_account_id, 100) ?? null,
            asText(r.category_id, 100) ?? null,
            asText(r.payee_id, 100) ?? null,
            asText(r.auto_action, 40) ?? 'reminder_only',
            asNumber(r.reminder_days_before, 0),
            asText(r.last_generated_at, 40) ?? null,
            asIsoDateOrNull(r.next_due_date),
            asIntegerFlag(r.is_active, 1),
            session.tenantId
          );
          counts.recurringRules.imported++;
        }
      }

      const savingsRows = asObjectArray(finance?.savingsGoals, 2000);
      if (savingsRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO savings_goals (
            id, tenant_id, name, target_amount, current_amount, currency, target_date,
            linked_account_id, linked_goal_id, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')), coalesce(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            target_amount = excluded.target_amount,
            current_amount = excluded.current_amount,
            currency = excluded.currency,
            target_date = excluded.target_date,
            linked_account_id = excluded.linked_account_id,
            linked_goal_id = excluded.linked_goal_id,
            status = excluded.status,
            notes = excluded.notes,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        for (const g of savingsRows) {
          const id = asText(g.id, 100);
          const name = asText(g.name, 300);
          if (!id || !name || ownedByOtherTenant(db, 'savings_goals', id, session.tenantId)) {
            counts.savingsGoals.skipped++;
            continue;
          }
          let target: string;
          let current: string;
          try {
            target = new Decimal((g.target_amount ?? 0) as Decimal.Value).toFixed(2);
            current = new Decimal((g.current_amount ?? 0) as Decimal.Value).toFixed(2);
          } catch {
            counts.savingsGoals.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            name,
            target,
            current,
            asText(g.currency, 10) ?? 'USD',
            asIsoDateOrNull(g.target_date),
            asText(g.linked_account_id, 100) ?? null,
            asText(g.linked_goal_id, 100) ?? null,
            asText(g.status, 30) ?? 'active',
            asText(g.notes, 4000) ?? null,
            asText(g.created_at, 40) ?? null,
            asText(g.updated_at, 40) ?? null,
            session.tenantId
          );
          counts.savingsGoals.imported++;
        }
      }

      const debtRows = asObjectArray(finance?.debts, 2000);
      if (debtRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO debts (
            id, tenant_id, name, liability_type, principal_balance, interest_rate,
            minimum_payment, due_day_of_month, payoff_strategy, linked_account_id, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')), coalesce(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            liability_type = excluded.liability_type,
            principal_balance = excluded.principal_balance,
            interest_rate = excluded.interest_rate,
            minimum_payment = excluded.minimum_payment,
            due_day_of_month = excluded.due_day_of_month,
            payoff_strategy = excluded.payoff_strategy,
            linked_account_id = excluded.linked_account_id,
            notes = excluded.notes,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        for (const d of debtRows) {
          const id = asText(d.id, 100);
          const name = asText(d.name, 300);
          if (!id || !name || ownedByOtherTenant(db, 'debts', id, session.tenantId)) {
            counts.debts.skipped++;
            continue;
          }
          let principal: string;
          try {
            principal = new Decimal((d.principal_balance ?? 0) as Decimal.Value).toFixed(2);
          } catch {
            counts.debts.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            name,
            asText(d.liability_type, 40) ?? 'credit_card',
            principal,
            asText(d.interest_rate, 20) ?? '0',
            asText(d.minimum_payment, 20) ?? '0',
            asNumber(d.due_day_of_month, 1),
            asText(d.payoff_strategy, 40) ?? 'avalanche',
            asText(d.linked_account_id, 100) ?? null,
            asText(d.notes, 4000) ?? null,
            asText(d.created_at, 40) ?? null,
            asText(d.updated_at, 40) ?? null,
            session.tenantId
          );
          counts.debts.imported++;
        }
      }

      // Repair goal → savings-goal links now that savings goals exist.
      const goalLinks = asObjectArray(productivity?.goals, 2000);
      if (goalLinks.length > 0 && counts.savingsGoals.imported + counts.savingsGoals.skipped > 0) {
        const relink = db.prepare(
          'UPDATE goals SET linked_savings_goal_id = ? WHERE id = ? AND tenant_id = ?'
        );
        for (const g of goalLinks) {
          const id = asText(g.id, 100);
          const savingsId = asText(g.linked_savings_goal_id, 100);
          if (!id || !savingsId) continue;
          if (!referenceExists(db, session.tenantId, 'savings_goals', savingsId)) continue;
          relink.run(savingsId, id, session.tenantId);
        }
      }

      // 14. Payees, calendar, focus, daily plans, import batches, STS settings.
      const payeeRows = asObjectArray(finance?.payees, 2000);
      if (payeeRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO payees (id, tenant_id, name, default_category_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            default_category_id = excluded.default_category_id
          WHERE tenant_id = ?
        `);
        for (const p of payeeRows) {
          const id = asText(p.id, 100);
          const name = asText(p.name, 200);
          if (!id || !name || ownedByOtherTenant(db, 'payees', id, session.tenantId)) {
            counts.payees.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            name,
            asText(p.default_category_id, 100) ?? null,
            session.tenantId
          );
          counts.payees.imported++;
        }
      }

      const calendarRows = asObjectArray(productivity?.calendarEvents, 20_000);
      if (calendarRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO calendar_events (
            id, tenant_id, space_id, title, description, start_time, end_time,
            is_all_day, event_type, task_id, project_id, color, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, datetime('now')), coalesce(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            is_all_day = excluded.is_all_day,
            event_type = excluded.event_type,
            task_id = excluded.task_id,
            project_id = excluded.project_id,
            color = excluded.color,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        for (const e of calendarRows) {
          const id = asText(e.id, 100);
          const title = asText(e.title, 500);
          const start = asText(e.start_time, 40);
          const end = asText(e.end_time, 40);
          if (!id || !title || !start || !end || ownedByOtherTenant(db, 'calendar_events', id, session.tenantId)) {
            counts.calendarEvents.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            asText(e.space_id, 100) ?? null,
            title,
            asText(e.description, 20_000) ?? null,
            start,
            end,
            asIntegerFlag(e.is_all_day, 0),
            asText(e.event_type, 40) ?? 'time_block',
            asText(e.task_id, 100) ?? null,
            asText(e.project_id, 100) ?? null,
            asText(e.color, 20) ?? null,
            asText(e.created_at, 40) ?? null,
            asText(e.updated_at, 40) ?? null,
            session.tenantId
          );
          counts.calendarEvents.imported++;
        }
      }

      const focusRows = asObjectArray(productivity?.focusSessions, 20_000);
      if (focusRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO focus_sessions (
            id, tenant_id, task_id, project_id, planned_duration, actual_duration,
            status, notes, interruptions_count, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            actual_duration = excluded.actual_duration,
            status = excluded.status,
            notes = excluded.notes,
            interruptions_count = excluded.interruptions_count,
            ended_at = excluded.ended_at
          WHERE tenant_id = ?
        `);
        for (const f of focusRows) {
          const id = asText(f.id, 100);
          const startedAt = asText(f.started_at, 40);
          if (!id || !startedAt || ownedByOtherTenant(db, 'focus_sessions', id, session.tenantId)) {
            counts.focusSessions.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            asText(f.task_id, 100) ?? null,
            asText(f.project_id, 100) ?? null,
            asNumber(f.planned_duration, 25),
            asNumber(f.actual_duration, 0),
            asText(f.status, 30) ?? 'completed',
            asText(f.notes, 4000) ?? null,
            asNumber(f.interruptions_count, 0),
            startedAt,
            asText(f.ended_at, 40) ?? null,
            session.tenantId
          );
          counts.focusSessions.imported++;
        }
      }

      const planRows = asObjectArray(productivity?.dailyPlans, 2000);
      if (planRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO daily_plans (
            id, tenant_id, plan_date, status, objective, available_hours,
            estimated_workload_hours, summary, revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            objective = excluded.objective,
            available_hours = excluded.available_hours,
            estimated_workload_hours = excluded.estimated_workload_hours,
            summary = excluded.summary,
            revision = excluded.revision,
            updated_at = datetime('now')
          WHERE tenant_id = ?
        `);
        for (const p of planRows) {
          const id = asText(p.id, 100);
          const planDate = asIsoDateOrNull(p.plan_date);
          if (!id || !planDate || ownedByOtherTenant(db, 'daily_plans', id, session.tenantId)) {
            counts.dailyPlans.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            planDate,
            asText(p.status, 30) ?? 'committed',
            asText(p.objective, 4000) ?? null,
            asNumber(p.available_hours, 8),
            asNumber(p.estimated_workload_hours, 0),
            asText(p.summary, 20_000) ?? null,
            asNumber(p.revision, 1),
            session.tenantId
          );
          counts.dailyPlans.imported++;
        }
      }

      const planItemRows = asObjectArray(productivity?.dailyPlanItems, 20_000);
      if (planItemRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO daily_plan_items (
            id, tenant_id, plan_id, task_id, title, item_type, start_time, end_time,
            duration_minutes, priority, status, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            item_type = excluded.item_type,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            duration_minutes = excluded.duration_minutes,
            priority = excluded.priority,
            status = excluded.status,
            sort_order = excluded.sort_order
          WHERE tenant_id = ?
        `);
        for (const i of planItemRows) {
          const id = asText(i.id, 100);
          const planId = asText(i.plan_id, 100);
          if (!id || !planId || ownedByOtherTenant(db, 'daily_plan_items', id, session.tenantId)) {
            counts.dailyPlanItems.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            planId,
            asText(i.task_id, 100) ?? null,
            asText(i.title, 500) ?? 'Untitled',
            asText(i.item_type, 40) ?? 'task',
            asText(i.start_time, 10) ?? '09:00',
            asText(i.end_time, 10) ?? '09:30',
            asNumber(i.duration_minutes, 30),
            asText(i.priority, 20) ?? 'normal',
            asText(i.status, 30) ?? 'scheduled',
            asNumber(i.sort_order, 0),
            session.tenantId
          );
          counts.dailyPlanItems.imported++;
        }
      }

      const batchRows = asObjectArray(finance?.importBatches, 5000);
      if (batchRows.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO import_batches (
            id, tenant_id, account_id, file_name, file_hash, total_rows, accepted_rows,
            skipped_rows, duplicate_rows, column_mapping, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            accepted_rows = excluded.accepted_rows,
            skipped_rows = excluded.skipped_rows,
            duplicate_rows = excluded.duplicate_rows
          WHERE tenant_id = ?
        `);
        for (const b of batchRows) {
          const id = asText(b.id, 100);
          if (!id || ownedByOtherTenant(db, 'import_batches', id, session.tenantId)) {
            counts.importBatches.skipped++;
            continue;
          }
          stmt.run(
            id,
            session.tenantId,
            asText(b.account_id, 100) ?? null,
            asText(b.file_name, 500) ?? 'statement.csv',
            asText(b.file_hash, 200) ?? 'hash',
            asNumber(b.total_rows, 0),
            asNumber(b.accepted_rows, 0),
            asNumber(b.skipped_rows, 0),
            asNumber(b.duplicate_rows, 0),
            asText(b.column_mapping, 4000) ?? '{}',
            asText(b.status, 30) ?? 'committed',
            session.tenantId
          );
          counts.importBatches.imported++;
        }
      }

      // Safe-to-spend settings live in their own table; without them a restore
      // reverts the operator's safety buffer, horizon and credit-line choice.
      const sts = asDomainObject(finance?.safeToSpendSettings);
      if (sts) {
        db.prepare(`
          INSERT INTO safe_to_spend_settings (tenant_id, safety_buffer, include_credit_lines, days_horizon, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(tenant_id) DO UPDATE SET
            safety_buffer = excluded.safety_buffer,
            include_credit_lines = excluded.include_credit_lines,
            days_horizon = excluded.days_horizon,
            updated_at = datetime('now')
        `).run(
          session.tenantId,
          asText(sts.safety_buffer, 30) ?? '500.00',
          asIntegerFlag(sts.include_credit_lines, 0),
          asNumber(sts.days_horizon, 30)
        );
        counts.safeToSpendSettings.imported++;
      }

      // Duplicate fingerprints are derived, not stored in the payload: recompute
      // them so ?strict=1 rejection keeps working on restored rows.
      backfillTransactionFingerprints(db);

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'platform', 'restore_backup', 'system_backup', 'all', ?)
      `).run(
        `aud_restore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        session.tenantId,
        session.userId,
        JSON.stringify({ ...counts, snapshotPath })
      );
    })();

    const importStats = {
      tasks: counts.tasks.imported,
      accounts: counts.accounts.imported,
      transactions: counts.transactions.imported,
      journalLines: counts.journalLines.imported,
      weeklyReviews: counts.weeklyReviews.imported,
      habits: counts.habits.imported,
      habitLogs: counts.habitLogs.imported,
      projects: counts.projects.imported,
      milestones: counts.milestones.imported,
      goals: counts.goals.imported,
      categories: counts.categories.imported,
      budgetLines: counts.budgetLines.imported,
      calendarEvents: counts.calendarEvents.imported,
      focusSessions: counts.focusSessions.imported,
      dailyPlans: counts.dailyPlans.imported,
      dailyPlanItems: counts.dailyPlanItems.imported,
      payees: counts.payees.imported,
      recurringRules: counts.recurringRules.imported,
      savingsGoals: counts.savingsGoals.imported,
      debts: counts.debts.imported,
      importBatches: counts.importBatches.imported,
      safeToSpendSettings: counts.safeToSpendSettings.imported,
    };
    const skippedStats = {
      tasks: counts.tasks.skipped,
      accounts: counts.accounts.skipped,
      transactions: counts.transactions.skipped,
      invalidTransactions: counts.invalidTransactions,
      journalLines: counts.journalLines.skipped,
      weeklyReviews: counts.weeklyReviews.skipped,
      habits: counts.habits.skipped,
      habitLogs: counts.habitLogs.skipped,
      projects: counts.projects.skipped,
      milestones: counts.milestones.skipped,
      goals: counts.goals.skipped,
      categories: counts.categories.skipped,
      budgetLines: counts.budgetLines.skipped,
      calendarEvents: counts.calendarEvents.skipped,
      focusSessions: counts.focusSessions.skipped,
      dailyPlans: counts.dailyPlans.skipped,
      dailyPlanItems: counts.dailyPlanItems.skipped,
      payees: counts.payees.skipped,
      recurringRules: counts.recurringRules.skipped,
      savingsGoals: counts.savingsGoals.skipped,
      debts: counts.debts.skipped,
      importBatches: counts.importBatches.skipped,
      safeToSpendSettings: counts.safeToSpendSettings.skipped,
    };

    return ok({
      success: true,
      snapshotPath,
      imported: importStats,
      stats: importStats,
      skipped: skippedStats,
    });
  } catch (err) {
    console.error('[restore] failed:', err);
    return routeError(err);
  }
});
