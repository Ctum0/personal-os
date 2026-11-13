import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { optionalEnum, optionalString, requiredArray, requiredEnum } from '@/lib/api/fields';

const WORKSPACES = ['productivity', 'finance', 'overview'] as const;
type Workspace = (typeof WORKSPACES)[number];

interface DashboardLayoutRow {
  id: string;
  workspace: string;
  name: string;
  is_default: number;
  widgets: string;
  [column: string]: unknown;
}

function defaultWidgets(workspace: Workspace): unknown[] {
  if (workspace === 'productivity') {
    return [
      { id: 'w_today_schedule', type: 'today_schedule', title: "Today's Schedule & Focus", colSpan: 2 },
      { id: 'w_habit_streak', type: 'habit_streaks', title: 'Daily Habit Pulse', colSpan: 1 },
      { id: 'w_quick_tasks', type: 'urgent_tasks', title: 'High Priority Next Actions', colSpan: 2 },
      { id: 'w_active_projects', type: 'active_projects', title: 'Active Projects Progress', colSpan: 1 },
      { id: 'w_goal_milestones', type: 'goal_milestones', title: 'Active Goals', colSpan: 3 },
    ];
  }
  if (workspace === 'finance') {
    return [
      { id: 'w_safe_spend', type: 'safe_to_spend', title: 'Safe-To-Spend Projection', colSpan: 2 },
      { id: 'w_quick_balances', type: 'account_balances', title: 'Liquid Balances', colSpan: 1 },
      { id: 'w_budget_pulse', type: 'budget_pulse', title: 'Current Month Budget', colSpan: 2 },
      { id: 'w_upcoming_bills', type: 'upcoming_bills', title: 'Upcoming 30 Days Bills', colSpan: 1 },
      { id: 'w_cash_flow', type: 'income_expense_trend', title: 'Operating Income vs Expense', colSpan: 2 },
      { id: 'w_net_worth_snapshot', type: 'net_worth_card', title: 'Net Worth Valuation', colSpan: 1 },
    ];
  }
  // Overview workspace: blended opt-in high-level cards
  return [
    { id: 'w_ov_today', type: 'today_summary', title: "Today's Priorities", colSpan: 1 },
    { id: 'w_ov_habit', type: 'habit_summary', title: 'Habits Completed', colSpan: 1 },
    { id: 'w_ov_safe_spend', type: 'safe_spend_summary', title: 'Safe-To-Spend Pulse', colSpan: 1 },
    { id: 'w_ov_projects', type: 'projects_summary', title: 'Project Milestones', colSpan: 2 },
    { id: 'w_ov_bills', type: 'bills_summary', title: 'Upcoming Bills', colSpan: 1 },
  ];
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const workspace = optionalEnum(searchParams.get('workspace'), 'workspace', WORKSPACES) ?? 'productivity';

    const layout = db.prepare(`
      SELECT * FROM dashboard_layouts
      WHERE tenant_id = ? AND workspace = ? AND user_id = ? AND is_default = 1
    `).get(session.tenantId, workspace, session.userId) as DashboardLayoutRow | undefined;

    if (!layout) {
      return ok({
        layout: {
          workspace,
          name: 'Default Layout',
          widgets: defaultWidgets(workspace),
        },
      });
    }

    return ok({
      layout: {
        ...layout,
        widgets: JSON.parse(layout.widgets),
      },
    });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const workspace = requiredEnum(body.workspace, 'workspace', WORKSPACES);
    const widgets = requiredArray(body.widgets, 'widgets', 100);
    const name = optionalString(body.name, 'name', 200);

    const layoutId = `lay_${workspace}_${session.userId}`;

    db.prepare(`
      INSERT INTO dashboard_layouts (
        id, tenant_id, user_id, workspace, name, is_default, widgets, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        widgets = excluded.widgets,
        name = excluded.name,
        updated_at = datetime('now')
    `).run(layoutId, session.tenantId, session.userId, workspace, name || 'Custom Layout', JSON.stringify(widgets));

    return ok({ success: true, layoutId });
  } catch (err) {
    return routeError(err);
  }
});
