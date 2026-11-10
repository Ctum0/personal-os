import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson, isISODateString } from '@/lib/db/validate';
import { todayISO, startOfWeekISO, addDaysISO } from '@/lib/time';

/**
 * Weekly Review — authoritative persistence (weekly_reviews table, migration v4).
 *
 * GET  /api/weekly-review?weekStart=YYYY-MM-DD  → single review (or null)
 * GET  /api/weekly-review?limit=N               → recent review list (default 52, newest first)
 * POST /api/weekly-review                       → upsert { weekStart, ... , payload }
 * DELETE /api/weekly-review?weekStart=...&id=... → remove one review
 *
 * Contract for Agents 1/2 (frontend):
 *  - Save: POST { weekStart: 'YYYY-MM-DD' (startOfWeekISO of the reviewed week),
 *    weekEnd?: 'YYYY-MM-DD', title?, summary?, payload?: {
 *      completedCount, missedCount, openCount, habitsCount,
 *      reflectionNotes, nextWeekCommitments, ...anything }}
 *    The record is upserted on (tenant_id, weekStart): re-saving the same week
 *    overwrites; browsing weeks back or forward is then lossless.
 *  - Restore: GET list → { reviews: [...] }, single → { review }.
 *  - Backup participation: included in the pre-restore DB snapshot
 *    (snapshotDatabase) automatically; JSON backup import supports
 *    domains.productivity.weeklyReviews (see /api/backup/restore).
 */
function rowToReview(row: any) {
  if (!row) return null;
  let payload: unknown = {};
  try {
    payload = JSON.parse(row.payload || '{}');
  } catch {}
  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    title: row.title,
    summary: row.summary,
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('weekStart');
    const limitParam = parseInt(searchParams.get('limit') || '52', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 52 : Math.min(limitParam, 261);

    if (weekStart) {
      if (!isISODateString(weekStart)) {
        return NextResponse.json({ error: 'weekStart must be in YYYY-MM-DD format' }, { status: 400 });
      }
      const row = db.prepare(`
        SELECT * FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?
      `).get(session.tenantId, weekStart);
      return NextResponse.json({ review: rowToReview(row) });
    }

    const rows = db.prepare(`
      SELECT * FROM weekly_reviews
      WHERE tenant_id = ?
      ORDER BY week_start DESC
      LIMIT ?
    `).all(session.tenantId, limit);

    return NextResponse.json({ reviews: rows.map(rowToReview) });
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

    // weekStart is the anchor; legacy key weekEnding is accepted as an anchor
    // alias. Default anchor: start of the current week.
    const anchor = body.weekStart || body.weekEnding;
    if (anchor !== undefined && anchor !== null && !isISODateString(anchor)) {
      return NextResponse.json({ error: 'weekStart must be in YYYY-MM-DD format' }, { status: 400 });
    }
    const weekStart = anchor ? startOfWeekISO(anchor) : startOfWeekISO(todayISO());
    if (body.weekEnd !== undefined && body.weekEnd !== null && !isISODateString(body.weekEnd)) {
      return NextResponse.json({ error: 'weekEnd must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (body.title !== undefined && body.title !== null && (typeof body.title !== 'string' || body.title.length > 200)) {
      return NextResponse.json({ error: 'title must be a string of at most 200 characters' }, { status: 400 });
    }
    if (body.summary !== undefined && body.summary !== null && typeof body.summary !== 'string') {
      return NextResponse.json({ error: 'summary must be a string' }, { status: 400 });
    }
    if (body.payload !== undefined && body.payload !== null) {
      if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 });
      }
      if (JSON.stringify(body.payload).length > 200_000) {
        return NextResponse.json({ error: 'payload too large' }, { status: 413 });
      }
    }

    const summary = body.summary ?? body.payload?.reflectionNotes ?? null;
    // Normalize the legacy entry shape so the table also carries what the
    // historical users.preferences.weeklyReviews consumers expect.
    const normalized = {
      weekEnding: body.payload?.weekEnding ?? body.weekEnding ?? addDaysISO(weekStart, 6),
      completedCount: numOr0(body.payload?.completedCount ?? body.completedCount),
      missedCount: numOr0(body.payload?.missedCount ?? body.missedCount),
      openCount: numOr0(body.payload?.openCount ?? body.openCount),
      habitsCount: numOr0(body.payload?.habitsCount ?? body.habitsCount),
      reflectionNotes: body.payload?.reflectionNotes ?? body.reflectionNotes ?? '',
      nextWeekCommitments: body.payload?.nextWeekCommitments ?? body.nextWeekCommitments ?? '',
    };
    const mergedPayload = body.payload && typeof body.payload === 'object'
      ? { ...normalized, ...body.payload }
      : normalized;

    const id = `wrev_${session.tenantId}_${weekStart}`;

    db.prepare(`
      INSERT INTO weekly_reviews (id, tenant_id, week_start, week_end, title, summary, payload, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, week_start) DO UPDATE SET
        week_end = excluded.week_end,
        title = excluded.title,
        summary = excluded.summary,
        payload = excluded.payload,
        updated_at = datetime('now')
    `).run(
      id,
      session.tenantId,
      weekStart,
      body.weekEnd || addDaysISO(weekStart, 6),
      body.title || null,
      typeof summary === 'string' ? summary : null,
      JSON.stringify(mergedPayload),
      session.userId
    );

    const row = db.prepare(`
      SELECT * FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?
    `).get(session.tenantId, weekStart);

    return NextResponse.json({ review: rowToReview(row) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get('weekStart');
    const id = searchParams.get('id');

    if (!id && !weekStart) {
      return NextResponse.json({ error: 'id or weekStart is required' }, { status: 400 });
    }
    if (weekStart && !isISODateString(weekStart)) {
      return NextResponse.json({ error: 'weekStart must be in YYYY-MM-DD format' }, { status: 400 });
    }

    const target = (weekStart
      ? db.prepare('SELECT week_start FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?').get(session.tenantId, weekStart)
      : db.prepare('SELECT week_start FROM weekly_reviews WHERE tenant_id = ? AND id = ?').get(session.tenantId, id)) as { week_start: string } | undefined;

    if (!target) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?').run(session.tenantId, target.week_start);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function numOr0(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}
