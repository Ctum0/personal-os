import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson } from '@/lib/db/validate';

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
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    // Preferences merge must be a flat JSON object of safe size. Rejects
    // arrays, null, nested-injection keys (e.g. __proto__), and oversized blobs.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Preferences body must be a JSON object' }, { status: 400 });
    }
    const bodyObj = body as Record<string, unknown>;
    if (('__proto__' in bodyObj) || ('constructor' in bodyObj) || ('prototype' in bodyObj)) {
      return NextResponse.json({ error: 'Preferences contain protected keys' }, { status: 400 });
    }
    if (JSON.stringify(bodyObj).length > 100_000) {
      return NextResponse.json({ error: 'Preferences payload too large' }, { status: 413 });
    }

    const current = db.prepare('SELECT preferences FROM users WHERE id = ? AND tenant_id = ?').get(session.userId, session.tenantId) as { preferences?: string } | undefined;
    let existingPrefsRaw = {};
    if (current?.preferences) {
      try {
        existingPrefsRaw = JSON.parse(current.preferences);
      } catch {
        existingPrefsRaw = {};
      }
    }
    const existingPrefs: Record<string, unknown> =
      existingPrefsRaw && typeof existingPrefsRaw === 'object' && !Array.isArray(existingPrefsRaw)
        ? (existingPrefsRaw as Record<string, unknown>)
        : {};

    const updated = Object.assign({}, existingPrefs, bodyObj);
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
