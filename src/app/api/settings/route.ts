import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const user = db.prepare('SELECT preferences FROM users WHERE id = ? AND tenant_id = ?').get(session.userId, session.tenantId) as { preferences?: string } | undefined;
    
    let preferences = {};
    if (user?.preferences) {
      try {
        preferences = JSON.parse(user.preferences);
      } catch {
        preferences = {};
      }
    }

    return NextResponse.json({ preferences });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const current = db.prepare('SELECT preferences FROM users WHERE id = ? AND tenant_id = ?').get(session.userId, session.tenantId) as { preferences?: string } | undefined;
    let existingPrefs = {};
    if (current?.preferences) {
      try {
        existingPrefs = JSON.parse(current.preferences);
      } catch {
        existingPrefs = {};
      }
    }

    const updated = { ...existingPrefs, ...body };
    const jsonStr = JSON.stringify(updated);

    db.prepare(`
      UPDATE users 
      SET preferences = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(jsonStr, session.userId, session.tenantId);

    return NextResponse.json({ preferences: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
