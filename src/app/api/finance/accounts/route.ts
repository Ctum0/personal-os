import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateAccountBalances } from '@/lib/finance/engine';
import { readJson } from '@/lib/db/validate';

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
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    }

    const validTypes = ['checking', 'savings', 'cash', 'credit_card', 'loan', 'investment', 'liability'];
    if (!validTypes.includes(body.type || 'checking')) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let openingBalance = '0.00';
    if (body.openingBalance !== undefined && body.openingBalance !== null && body.openingBalance !== '') {
      const n = Number(body.openingBalance);
      if (isNaN(n) || !isFinite(n)) {
        return NextResponse.json({ error: 'openingBalance must be a valid number' }, { status: 400 });
      }
      openingBalance = n.toFixed(2);
    }
    const currency = body.currency || 'USD';
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: 'currency must be a 3-letter ISO code (e.g. USD)' }, { status: 400 });
    }
    const color = body.displayColor || '#3b82f6';

    db.prepare(`
      INSERT INTO finance_accounts (
        id, tenant_id, name, type, currency, opening_balance, institution, masked_number, display_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      session.tenantId,
      body.name.trim(),
      body.type || 'checking',
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
