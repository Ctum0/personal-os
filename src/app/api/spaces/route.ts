import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const spaces = db.prepare(`
      SELECT * FROM spaces 
      WHERE tenant_id = ? 
      ORDER BY is_default DESC, name ASC
    `).all(session.tenantId);

    return NextResponse.json({ spaces });
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
      return NextResponse.json({ error: 'Space name is required' }, { status: 400 });
    }

    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const spaceId = `space_${slug}_${Date.now().toString(36).substring(4)}`;

    db.prepare(`
      INSERT INTO spaces (id, tenant_id, name, slug, icon, color, description, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      spaceId,
      session.tenantId,
      body.name.trim(),
      slug,
      body.icon || 'Folder',
      body.color || '#6366f1',
      body.description || ''
    );

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
    return NextResponse.json({ space }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
