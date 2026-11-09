import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from "@/lib/time";
import { Decimal } from 'decimal.js';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const rules = db.prepare(`
      SELECT r.*, a.name as account_name, c.name as category_name, c.color as category_color
      FROM recurring_financial_rules r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.tenant_id = ?
      ORDER BY r.is_active DESC, r.next_due_date ASC
    `).all(session.tenantId);

    return NextResponse.json({ recurringRules: rules });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.name || !body.name.trim() || body.expectedAmount === undefined || !body.accountId || !body.nextDueDate) {
      return NextResponse.json({ error: 'Name, expectedAmount, accountId, and nextDueDate are required' }, { status: 400 });
    }

    let amountDec: Decimal;
    try {
      amountDec = new Decimal(body.expectedAmount);
      if (!amountDec.isFinite() || amountDec.lte(0)) {
        return NextResponse.json({ error: 'expectedAmount must be a positive number' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid expectedAmount' }, { status: 400 });
    }

    const account = db.prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(body.accountId, session.tenantId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (body.categoryId) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND tenant_id = ?').get(body.categoryId, session.tenantId);
      if (!cat) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
    }

    const ruleId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const amount = amountDec.toFixed(2);
    const today = todayISO();

    db.prepare(`
      INSERT INTO recurring_financial_rules (
        id, tenant_id, name, rule_type, frequency, interval_count, day_of_month, start_date, expected_amount, account_id, category_id, auto_action, next_due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ruleId,
      session.tenantId,
      body.name.trim(),
      body.ruleType || 'bill',
      body.frequency || 'monthly',
      body.intervalCount || 1,
      body.dayOfMonth || 1,
      body.startDate || today,
      amount,
      body.accountId,
      body.categoryId || null,
      body.autoAction || 'reminder_only',
      body.nextDueDate
    );

    const created = db.prepare('SELECT * FROM recurring_financial_rules WHERE id = ? AND tenant_id = ?').get(ruleId, session.tenantId);
    return NextResponse.json({ recurringRule: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
