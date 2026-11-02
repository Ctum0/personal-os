import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from "@/lib/time";

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

    if (!body.name || !body.expectedAmount || !body.accountId || !body.nextDueDate) {
      return NextResponse.json({ error: 'Name, expectedAmount, accountId, and nextDueDate are required' }, { status: 400 });
    }

    const ruleId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const amount = String(Number(body.expectedAmount).toFixed(2));
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

    const created = db.prepare('SELECT * FROM recurring_financial_rules WHERE id = ?').get(ruleId);
    return NextResponse.json({ recurringRule: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
