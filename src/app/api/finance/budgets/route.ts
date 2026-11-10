import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateBudget } from '@/lib/finance/engine';
import { readJson } from '@/lib/db/validate';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get('budgetId') || undefined;

    const budget = calculateBudget(db, session.tenantId, budgetId);
    return NextResponse.json({ budget });
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

    const { budgetId, categoryId, allocatedAmount, rolloverAmount } = body;
    if (!budgetId || !categoryId) {
      return NextResponse.json({ error: 'budgetId and categoryId are required' }, { status: 400 });
    }
    // Isolation: both budget and category must belong to this tenant
    const budgetRow = db.prepare('SELECT id FROM budgets WHERE id = ? AND tenant_id = ?').get(budgetId, session.tenantId);
    if (!budgetRow) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }
    const categoryRow = db.prepare('SELECT id, type FROM categories WHERE id = ? AND tenant_id = ?').get(categoryId, session.tenantId);
    if (!categoryRow) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    let alloc = '0.00';
    let roll = '0.00';
    if (allocatedAmount !== undefined) {
      const n = Number(allocatedAmount);
      if (isNaN(n)) return NextResponse.json({ error: 'allocatedAmount must be a valid number' }, { status: 400 });
      if (n < 0) return NextResponse.json({ error: 'allocatedAmount must be non-negative' }, { status: 400 });
      alloc = n.toFixed(2);
    }
    if (rolloverAmount !== undefined) {
      const n = Number(rolloverAmount);
      if (isNaN(n)) return NextResponse.json({ error: 'rolloverAmount must be a valid number' }, { status: 400 });
      // Rollover may legitimately represent an overage deficit? No: budget
      // rollovers are unused budget only. Negative allocations are invalid.
      if (n < 0) return NextResponse.json({ error: 'rolloverAmount must be non-negative' }, { status: 400 });
      roll = n.toFixed(2);
    }

    db.prepare(`
      INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(budget_id, category_id) DO UPDATE SET
        allocated_amount = excluded.allocated_amount,
        rollover_amount = excluded.rollover_amount
    `).run(`bl_${budgetId}_${categoryId}`, session.tenantId, budgetId, categoryId, alloc, roll);

    const budget = calculateBudget(db, session.tenantId, budgetId);
    return NextResponse.json({ budget });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
