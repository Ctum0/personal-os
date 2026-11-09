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

    if (!body.name || !String(body.name).trim() || body.targetAmount === undefined || body.targetAmount === null) {
      return NextResponse.json({ error: 'Name and targetAmount are required' }, { status: 400 });
    }

    let targetDec: Decimal;
    try {
      targetDec = new Decimal(body.targetAmount);
      if (!targetDec.isFinite() || targetDec.isNaN() || targetDec.isZero() || targetDec.isNegative()) {
        return NextResponse.json({ error: 'targetAmount must be a positive number' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'targetAmount must be a valid numeric value' }, { status: 400 });
    }

    let currentDec = new Decimal(0);
    if (body.currentAmount !== undefined && body.currentAmount !== null) {
      try {
        currentDec = new Decimal(body.currentAmount);
        if (!currentDec.isFinite() || currentDec.isNaN() || currentDec.isNegative()) {
          return NextResponse.json({ error: 'currentAmount must be a non-negative number' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'currentAmount must be a valid numeric value' }, { status: 400 });
      }
    }

    if (body.linkedAccountId) {
      const acc = db.prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(body.linkedAccountId, session.tenantId);
      if (!acc) {
        return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
      }
    }

    const goalId = `sg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const target = targetDec.toFixed(2);
    const current = currentDec.toFixed(2);

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

    const created = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?').get(goalId, session.tenantId);
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

    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    let targetStr: string | null = null;
    if (body.targetAmount !== undefined && body.targetAmount !== null) {
      try {
        const d = new Decimal(body.targetAmount);
        if (!d.isFinite() || d.isNaN() || d.isZero() || d.isNegative()) {
          return NextResponse.json({ error: 'targetAmount must be a positive number' }, { status: 400 });
        }
        targetStr = d.toFixed(2);
      } catch {
        return NextResponse.json({ error: 'targetAmount must be a valid numeric value' }, { status: 400 });
      }
    }

    let currentStr: string | null = null;
    if (body.currentAmount !== undefined && body.currentAmount !== null) {
      try {
        const d = new Decimal(body.currentAmount);
        if (!d.isFinite() || d.isNaN() || d.isNegative()) {
          return NextResponse.json({ error: 'currentAmount must be a non-negative number' }, { status: 400 });
        }
        currentStr = d.toFixed(2);
      } catch {
        return NextResponse.json({ error: 'currentAmount must be a valid numeric value' }, { status: 400 });
      }
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
      targetStr,
      currentStr,
      body.status,
      body.targetDate,
      body.notes,
      body.id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    return NextResponse.json({ savingsGoal: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
