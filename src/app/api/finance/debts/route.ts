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

    if (!body.name || !body.name.trim() || body.principalBalance === undefined) {
      return NextResponse.json({ error: 'Name and principalBalance are required' }, { status: 400 });
    }

    let principalDec: Decimal;
    try {
      principalDec = new Decimal(body.principalBalance);
      if (!principalDec.isFinite() || principalDec.lte(0)) {
        return NextResponse.json({ error: 'principalBalance must be a positive number' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid principalBalance' }, { status: 400 });
    }

    let aprDec = new Decimal(0);
    if (body.interestRate !== undefined && body.interestRate !== null && body.interestRate !== '') {
      try {
        aprDec = new Decimal(body.interestRate);
        if (!aprDec.isFinite() || aprDec.lt(0)) {
          return NextResponse.json({ error: 'interestRate must be non-negative' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid interestRate' }, { status: 400 });
      }
    }

    let minPayDec = new Decimal(0);
    if (body.minimumPayment !== undefined && body.minimumPayment !== null && body.minimumPayment !== '') {
      try {
        minPayDec = new Decimal(body.minimumPayment);
        if (!minPayDec.isFinite() || minPayDec.lt(0)) {
          return NextResponse.json({ error: 'minimumPayment must be non-negative' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid minimumPayment' }, { status: 400 });
      }
    }

    if (body.linkedAccountId) {
      const acc = db.prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(body.linkedAccountId, session.tenantId);
      if (!acc) {
        return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
      }
    }

    const debtId = `debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const principal = principalDec.toFixed(2);
    const apr = aprDec.toFixed(2);
    const minPay = minPayDec.toFixed(2);

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

    const created = db.prepare('SELECT * FROM debts WHERE id = ? AND tenant_id = ?').get(debtId, session.tenantId);
    return NextResponse.json({ debt: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
