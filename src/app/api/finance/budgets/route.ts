import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateBudget } from '@/lib/finance/engine';
import { withApiLogging } from '@/lib/api/log';
import { notFound, ok, readBody, routeError } from '@/lib/api/http';
import { optionalMoney, requiredString } from '@/lib/api/fields';

interface BudgetLineRow {
  id: string;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get('budgetId') || undefined;

    const budget = calculateBudget(db, session.tenantId, budgetId);
    return ok({ budget });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const budgetId = requiredString(body.budgetId, 'budgetId', 100);
    const categoryId = requiredString(body.categoryId, 'categoryId', 100);
    const alloc = optionalMoney(body.allocatedAmount, 'allocatedAmount') ?? '0.00';
    // Rollovers are unused budget only; a negative carry is not a valid envelope.
    const roll = optionalMoney(body.rolloverAmount, 'rolloverAmount') ?? '0.00';

    // Isolation: both budget and category must belong to this tenant
    const budgetRow = db
      .prepare('SELECT id FROM budgets WHERE id = ? AND tenant_id = ?')
      .get(budgetId, session.tenantId) as BudgetLineRow | undefined;
    if (!budgetRow) notFound('Budget');

    const categoryRow = db
      .prepare('SELECT id, type FROM categories WHERE id = ? AND tenant_id = ?')
      .get(categoryId, session.tenantId) as { id: string; type: string } | undefined;
    if (!categoryRow) notFound('Category');

    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(budget_id, category_id) DO UPDATE SET
        allocated_amount = excluded.allocated_amount,
        rollover_amount = excluded.rollover_amount
    `).run(`bl_${budgetId}_${categoryId}`, session.tenantId, budgetId, categoryId, alloc, roll);

    const budget = calculateBudget(db, session.tenantId, budgetId);
    return ok({ budget });
  } catch (err) {
    return routeError(err);
  }
});
