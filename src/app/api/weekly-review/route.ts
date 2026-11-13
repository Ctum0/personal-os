import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO, startOfWeekISO, addDaysISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import { optionalISODate, optionalString, requiredISODate } from '@/lib/api/fields';

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

/** Payload ceiling: a review holds free text, not a data dump. */
const MAX_PAYLOAD_BYTES = 200_000;
const DEFAULT_LIMIT = 52;
const MAX_LIMIT = 261;

interface WeeklyReviewRow {
  id: string;
  week_start: string;
  week_end: string | null;
  title: string | null;
  summary: string | null;
  payload: string | null;
  created_at: string;
  updated_at: string | null;
}

function rowToReview(row: WeeklyReviewRow | undefined) {
  if (!row) return null;
  let payload: unknown = {};
  try {
    payload = JSON.parse(row.payload || '{}');
  } catch {
    payload = {};
  }
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

function numOr0(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rawWeekStart = searchParams.get('weekStart');
    const limitParam = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : Math.min(limitParam, MAX_LIMIT);

    if (rawWeekStart) {
      const weekStart = requiredISODate(rawWeekStart, 'weekStart');
      const row = db.prepare(`
        SELECT * FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?
      `).get(session.tenantId, weekStart) as WeeklyReviewRow | undefined;
      return ok({ review: rowToReview(row) });
    }

    const rows = db.prepare(`
      SELECT * FROM weekly_reviews
      WHERE tenant_id = ?
      ORDER BY week_start DESC
      LIMIT ?
    `).all(session.tenantId, limit) as WeeklyReviewRow[];

    return ok({ reviews: rows.map(rowToReview) });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    // weekStart is the anchor; legacy key weekEnding is accepted as an anchor
    // alias. Default anchor: start of the current week.
    const anchor = optionalISODate(body.weekStart, 'weekStart') ?? optionalISODate(body.weekEnding, 'weekEnding');
    const weekStart = anchor ? startOfWeekISO(anchor) : startOfWeekISO(todayISO());
    const weekEnd = optionalISODate(body.weekEnd, 'weekEnd') ?? addDaysISO(weekStart, 6);
    const title = optionalString(body.title, 'title', 200);
    const summary = optionalString(body.summary, 'summary', 20_000);

    if (body.payload !== undefined && body.payload !== null) {
      if (typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        throw new FieldError('payload must be a JSON object');
      }
      if (JSON.stringify(body.payload).length > MAX_PAYLOAD_BYTES) {
        throw new FieldError('payload too large', 413);
      }
    }
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

    // Normalize the legacy entry shape so the table also carries what the
    // historical users.preferences.weeklyReviews consumers expect.
    const normalized = {
      weekEnding: payload.weekEnding ?? optionalISODate(body.weekEnding, 'weekEnding') ?? weekEnd,
      completedCount: numOr0(payload.completedCount ?? body.completedCount),
      missedCount: numOr0(payload.missedCount ?? body.missedCount),
      openCount: numOr0(payload.openCount ?? body.openCount),
      habitsCount: numOr0(payload.habitsCount ?? body.habitsCount),
      reflectionNotes: payload.reflectionNotes ?? optionalString(body.reflectionNotes, 'reflectionNotes', 20_000) ?? '',
      nextWeekCommitments: payload.nextWeekCommitments ?? optionalString(body.nextWeekCommitments, 'nextWeekCommitments', 20_000) ?? '',
    };
    const mergedPayload = { ...normalized, ...payload };

    const id = `wrev_${session.tenantId}_${weekStart}`;
    const effectiveSummary = summary ?? (typeof payload.reflectionNotes === 'string' ? payload.reflectionNotes : null);

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
      weekEnd,
      title ?? null,
      effectiveSummary,
      JSON.stringify(mergedPayload),
      session.userId
    );

    const row = db.prepare(`
      SELECT * FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?
    `).get(session.tenantId, weekStart) as WeeklyReviewRow | undefined;

    return ok({ review: rowToReview(row) }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rawWeekStart = searchParams.get('weekStart');
    const id = searchParams.get('id');

    if (!id && !rawWeekStart) {
      throw new FieldError('id or weekStart is required');
    }
    const weekStart = optionalISODate(rawWeekStart, 'weekStart');

    const target = (weekStart
      ? db.prepare('SELECT week_start FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?').get(session.tenantId, weekStart)
      : db.prepare('SELECT week_start FROM weekly_reviews WHERE tenant_id = ? AND id = ?').get(session.tenantId, id)) as
      | { week_start: string }
      | undefined;

    if (!target) notFound('Review');

    const result = db
      .prepare('DELETE FROM weekly_reviews WHERE tenant_id = ? AND week_start = ?')
      .run(session.tenantId, target.week_start);
    if (result.changes === 0) notFound('Review');

    return ok({ success: true });
  } catch (err) {
    return routeError(err);
  }
});
