import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateDebtPayoffScenarios } from '@/lib/finance/engine';
import { Decimal } from 'decimal.js';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const extraPayment = searchParams.get('extra') || '100.00';

    const debts = db.prepare(`
      SELECT d.*, a.name as linked_account_name
      FROM debts d
      LEFT JOIN finance_accounts a ON d.linked_account_id = a.id
      WHERE d.tenant_id = ?
    `).all(session.tenantId) as any[];

    debts.sort((a, b) => new Decimal(b.interest_rate || '0').minus(new Decimal(a.interest_rate || '0')).toNumber());

    const payoffScenarios = calculateDebtPayoffScenarios(db, session.tenantId, extraPayment);

    return NextResponse.json({ debts, payoffScenarios });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.name || !body.principalBalance) {
      return NextResponse.json({ error: 'Name and principalBalance are required' }, { status: 400 });
    }

    const debtId = `debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const principal = String(Number(body.principalBalance).toFixed(2));
    const apr = body.interestRate ? String(Number(body.interestRate).toFixed(2)) : '0.00';
    const minPay = body.minimumPayment ? String(Number(body.minimumPayment).toFixed(2)) : '0.00';

    db.prepare(`
      INSERT INTO debts (
        id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, due_day_of_month, payoff_strategy, linked_account_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      debtId,
      session.tenantId,
      body.name.trim(),
      body.liabilityType || 'credit_card',
      principal,
      apr,
      minPay,
      body.dueDayOfMonth || 15,
      body.payoffStrategy || 'avalanche',
      body.linkedAccountId || null,
      body.notes || ''
    );

    const created = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
    return NextResponse.json({ debt: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
