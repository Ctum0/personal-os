import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { Decimal } from 'decimal.js';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const goals = db.prepare(`
      SELECT sg.*, a.name as linked_account_name
      FROM savings_goals sg
      LEFT JOIN finance_accounts a ON sg.linked_account_id = a.id
      WHERE sg.tenant_id = ?
      ORDER BY sg.status ASC, sg.target_date ASC
    `).all(session.tenantId) as any[];

    const withProgress = goals.map(g => {
      const target = new Decimal(g.target_amount || '1');
      const current = new Decimal(g.current_amount || '0');
      const percent = target.greaterThan(0)
        ? current.dividedBy(target).times(100).toFixed(1)
        : '0.0';

      return {
        ...g,
        progressPercent: parseFloat(percent),
      };
    });

    return NextResponse.json({ savingsGoals: withProgress });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.name || !body.targetAmount) {
      return NextResponse.json({ error: 'Name and targetAmount are required' }, { status: 400 });
    }

    const goalId = `sg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const target = String(Number(body.targetAmount).toFixed(2));
    const current = body.currentAmount ? String(Number(body.currentAmount).toFixed(2)) : '0.00';

    db.prepare(`
      INSERT INTO savings_goals (
        id, tenant_id, name, target_amount, current_amount, currency, target_date, linked_account_id, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      goalId,
      session.tenantId,
      body.name.trim(),
      target,
      current,
      body.currency || 'USD',
      body.targetDate || null,
      body.linkedAccountId || null,
      body.notes || ''
    );

    const created = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
    return NextResponse.json({ savingsGoal: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
    }

    db.prepare(`
      UPDATE savings_goals
      SET 
        name = coalesce(?, name),
        target_amount = coalesce(?, target_amount),
        current_amount = coalesce(?, current_amount),
        status = coalesce(?, status),
        target_date = coalesce(?, target_date),
        notes = coalesce(?, notes),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      body.name,
      body.targetAmount !== undefined ? String(Number(body.targetAmount).toFixed(2)) : null,
      body.currentAmount !== undefined ? String(Number(body.currentAmount).toFixed(2)) : null,
      body.status,
      body.targetDate,
      body.notes,
      body.id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(body.id);
    return NextResponse.json({ savingsGoal: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
