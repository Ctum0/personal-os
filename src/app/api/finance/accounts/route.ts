import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateAccountBalances } from '@/lib/finance/engine';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const accounts = calculateAccountBalances(db, session.tenantId);
    return NextResponse.json({ accounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    }

    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const openingBalance = body.openingBalance ? String(Number(body.openingBalance).toFixed(2)) : '0.00';
    const currency = body.currency || 'USD';
    const type = body.type || 'checking';
    const color = body.displayColor || '#3b82f6';

    db.prepare(`
      INSERT INTO finance_accounts (
        id, tenant_id, name, type, currency, opening_balance, institution, masked_number, display_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      session.tenantId,
      body.name.trim(),
      type,
      currency,
      openingBalance,
      body.institution || null,
      body.maskedNumber || null,
      color
    );

    const accounts = calculateAccountBalances(db, session.tenantId);
    const created = accounts.find(a => a.accountId === accountId);
    return NextResponse.json({ account: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
