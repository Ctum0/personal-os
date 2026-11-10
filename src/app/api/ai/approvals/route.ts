import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { applyAiActionDraft } from '@/lib/ai/tools';
import { readJson } from '@/lib/db/validate';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const drafts = db.prepare(`
      SELECT * FROM ai_action_drafts
      WHERE tenant_id = ? AND status = 'draft' AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all(session.tenantId) as any[];

    const formatted = drafts.map(d => ({
      ...d,
      proposedPayload: JSON.parse(d.proposed_payload),
    }));

    return NextResponse.json({ pendingDrafts: formatted });
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

    const { draftId, decision } = body;
    if (!draftId || !decision) {
      return NextResponse.json({ error: 'draftId and decision (approved|rejected) are required' }, { status: 400 });
    }

    const result = applyAiActionDraft(db, session.tenantId, session.userId, draftId, decision);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
