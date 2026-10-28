import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateBudget } from '@/lib/finance/engine';

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
    const body = await request.json();

    const { budgetId, categoryId, allocatedAmount, rolloverAmount } = body;
    if (!budgetId || !categoryId) {
      return NextResponse.json({ error: 'budgetId and categoryId are required' }, { status: 400 });
    }

    const alloc = allocatedAmount !== undefined ? String(Number(allocatedAmount).toFixed(2)) : '0.00';
    const roll = rolloverAmount !== undefined ? String(Number(rolloverAmount).toFixed(2)) : '0.00';

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
