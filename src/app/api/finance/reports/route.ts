import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateIncomeAndExpenses } from '@/lib/finance/engine';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const today = new Date().toISOString().slice(0, 10);
    const startDate = searchParams.get('startDate') || today.slice(0, 7) + '-01';
    const endDate = searchParams.get('endDate') || today;

    const reports = calculateIncomeAndExpenses(db, session.tenantId, startDate, endDate);
    return NextResponse.json({ reports });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
