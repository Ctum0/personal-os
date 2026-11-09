import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const categories = db.prepare(`
      SELECT * FROM categories
      WHERE tenant_id = ?
      ORDER BY type ASC, name ASC
    `).all(session.tenantId);
    return NextResponse.json({ categories });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
