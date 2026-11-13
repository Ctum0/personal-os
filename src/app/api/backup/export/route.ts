import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/api/log";
import { routeError } from "@/lib/api/http";
import { todayISO } from "@/lib/time";

/**
 * Full JSON export.
 *
 * Built server-side on purpose: the page used to assemble the backup from six
 * paginated list endpoints, so any ledger beyond the first page (100
 * transactions) silently never made it into the file, and the payload shape
 * drifted from what restore accepts. One endpoint owns both directions.
 *
 * Shape (restore consumes exactly this):
 *   {
 *     version, exportedAt, schemaVersion,
 *     domains: {
 *       productivity: { tasks, habits, habitLogs, projects, milestones, goals, weeklyReviews },
 *       finance: { accounts, categories, transactions, journalLines, budget }
 *     }
 *   }
 */
export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const tenantId = session.tenantId;

    // A backup is a raw dump, not an operational view: archived (soft-deleted)
    // and quarantined tasks must round-trip, or restore can never bring them
    // back. Filtering here was the one place where UI semantics caused data loss.
    const tasks = db.prepare(
      "SELECT * FROM tasks WHERE tenant_id = ? ORDER BY created_at ASC"
    ).all(tenantId);
    const habits = db.prepare("SELECT * FROM habits WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const habitLogs = db.prepare("SELECT * FROM habit_logs WHERE tenant_id = ? ORDER BY log_date ASC").all(tenantId);
    const projects = db.prepare("SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const milestones = db.prepare("SELECT * FROM project_milestones WHERE tenant_id = ? ORDER BY sort_order ASC").all(tenantId);
    const goals = db.prepare("SELECT * FROM goals WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const weeklyReviews = db.prepare("SELECT * FROM weekly_reviews WHERE tenant_id = ? ORDER BY week_start ASC").all(tenantId);
    // Plan and rhythm records: without these a restore to a new machine loses the
    // calendar, focus history and daily plans entirely.
    const calendarEvents = db.prepare("SELECT * FROM calendar_events WHERE tenant_id = ? ORDER BY start_time ASC").all(tenantId);
    const focusSessions = db.prepare("SELECT * FROM focus_sessions WHERE tenant_id = ? ORDER BY started_at ASC").all(tenantId);
    const dailyPlans = db.prepare("SELECT * FROM daily_plans WHERE tenant_id = ? ORDER BY plan_date ASC").all(tenantId);
    const dailyPlanItems = db.prepare("SELECT * FROM daily_plan_items WHERE tenant_id = ? ORDER BY sort_order ASC").all(tenantId);

    const accounts = db.prepare("SELECT * FROM finance_accounts WHERE tenant_id = ? ORDER BY sort_order ASC").all(tenantId);
    const categories = db.prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY name ASC").all(tenantId);
    const transactions = db.prepare(
      "SELECT * FROM journal_transactions WHERE tenant_id = ? ORDER BY date ASC, created_at ASC"
    ).all(tenantId);
    const journalLines = db.prepare("SELECT * FROM journal_lines WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const payees = db.prepare("SELECT * FROM payees WHERE tenant_id = ? ORDER BY name ASC").all(tenantId);
    const recurringRules = db.prepare("SELECT * FROM recurring_financial_rules WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const savingsGoals = db.prepare("SELECT * FROM savings_goals WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const debts = db.prepare("SELECT * FROM debts WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    const importBatches = db.prepare("SELECT * FROM import_batches WHERE tenant_id = ? ORDER BY created_at ASC").all(tenantId);
    // Operator configuration that money maths reads (the safety buffer lives
    // here, not in users.preferences).
    const safeToSpendSettings = db.prepare("SELECT * FROM safe_to_spend_settings WHERE tenant_id = ?").get(tenantId) ?? null;

    const budgetRow = db.prepare(
      "SELECT * FROM budgets WHERE tenant_id = ? AND is_active = 1 ORDER BY start_date DESC LIMIT 1"
    ).get(tenantId) as { id: string } | undefined;
    const budget = budgetRow
      ? {
          ...(budgetRow as Record<string, unknown>),
          items: db.prepare("SELECT * FROM budget_lines WHERE tenant_id = ? AND budget_id = ? ORDER BY category_id ASC")
            .all(tenantId, budgetRow.id),
        }
      : null;

    const payload = {
      version: '1.2',
      exportedAt: new Date().toISOString(),
      schemaVersion: Number(db.pragma('user_version', { simple: true }) ?? 0),
      domains: {
        productivity: {
          tasks,
          habits,
          habitLogs,
          projects,
          milestones,
          goals,
          weeklyReviews,
          calendarEvents,
          focusSessions,
          dailyPlans,
          dailyPlanItems,
        },
        finance: {
          accounts,
          categories,
          payees,
          transactions,
          journalLines,
          budget,
          recurringRules,
          savingsGoals,
          debts,
          importBatches,
          safeToSpendSettings,
        },
      },
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="personal_os_backup_${todayISO()}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return routeError(err);
  }
});
