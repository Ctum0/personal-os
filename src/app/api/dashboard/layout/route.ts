import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson } from '@/lib/db/validate';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const workspace = searchParams.get('workspace') || 'productivity';

    const layout = db.prepare(`
      SELECT * FROM dashboard_layouts 
      WHERE tenant_id = ? AND workspace = ? AND user_id = ? AND is_default = 1
    `).get(session.tenantId, workspace, session.userId) as any;

    if (!layout) {
      // Default widget layouts per workspace
      const defaultWidgets = workspace === 'productivity'
        ? [
            { id: 'w_today_schedule', type: 'today_schedule', title: "Today's Schedule & Focus", colSpan: 2 },
            { id: 'w_habit_streak', type: 'habit_streaks', title: 'Daily Habit Pulse', colSpan: 1 },
            { id: 'w_quick_tasks', type: 'urgent_tasks', title: 'High Priority Next Actions', colSpan: 2 },
            { id: 'w_active_projects', type: 'active_projects', title: 'Active Projects Progress', colSpan: 1 },
            { id: 'w_goal_milestones', type: 'goal_milestones', title: 'Active Goals', colSpan: 3 },
          ]
        : workspace === 'finance'
        ? [
            { id: 'w_safe_spend', type: 'safe_to_spend', title: 'Safe-To-Spend Projection', colSpan: 2 },
            { id: 'w_quick_balances', type: 'account_balances', title: 'Liquid Balances', colSpan: 1 },
            { id: 'w_budget_pulse', type: 'budget_pulse', title: 'Current Month Budget', colSpan: 2 },
            { id: 'w_upcoming_bills', type: 'upcoming_bills', title: 'Upcoming 30 Days Bills', colSpan: 1 },
            { id: 'w_cash_flow', type: 'income_expense_trend', title: 'Operating Income vs Expense', colSpan: 2 },
            { id: 'w_net_worth_snapshot', type: 'net_worth_card', title: 'Net Worth Valuation', colSpan: 1 },
          ]
        : [
            // Overview workspace: blended opt-in high-level cards
            { id: 'w_ov_today', type: 'today_summary', title: "Today's Priorities", colSpan: 1 },
            { id: 'w_ov_habit', type: 'habit_summary', title: 'Habits Completed', colSpan: 1 },
            { id: 'w_ov_safe_spend', type: 'safe_spend_summary', title: 'Safe-To-Spend Pulse', colSpan: 1 },
            { id: 'w_ov_projects', type: 'projects_summary', title: 'Project Milestones', colSpan: 2 },
            { id: 'w_ov_bills', type: 'bills_summary', title: 'Upcoming Bills', colSpan: 1 },
          ];

      return NextResponse.json({
        layout: {
          workspace,
          name: 'Default Layout',
          widgets: defaultWidgets,
        },
      });
    }

    return NextResponse.json({
      layout: {
        ...layout,
        widgets: JSON.parse(layout.widgets),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const { workspace, widgets, name } = body;
    if (!workspace || !Array.isArray(widgets)) {
      return NextResponse.json({ error: 'workspace and widgets array are required' }, { status: 400 });
    }

    const layoutId = `lay_${workspace}_${session.userId}`;
    const widgetsJson = JSON.stringify(widgets);

    db.prepare(`
      INSERT INTO dashboard_layouts (
        id, tenant_id, user_id, workspace, name, is_default, widgets, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        widgets = excluded.widgets,
        name = excluded.name,
        updated_at = datetime('now')
    `).run(layoutId, session.tenantId, session.userId, workspace, name || 'Custom Layout', widgetsJson);

    return NextResponse.json({ success: true, layoutId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
