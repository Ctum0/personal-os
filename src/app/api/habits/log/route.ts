import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from "@/lib/time";
import { readJson, referenceExists } from '@/lib/db/validate';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const { habitId, date, value, status, notes } = body;
    if (!habitId) {
      return NextResponse.json({ error: 'Habit ID is required' }, { status: 400 });
    }
    if (typeof habitId !== 'string' || !referenceExists(db, session.tenantId, 'habits', habitId)) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (value !== undefined && (isNaN(Number(value)) || Number(value) < 0)) {
      return NextResponse.json({ error: 'value must be a non-negative number' }, { status: 400 });
    }
    const validStatuses = ['completed', 'excused', 'missed', 'failed'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const logDate = date || todayISO();
    const logId = `hl_${habitId}_${logDate.replace(/-/g, '')}`;
    const logStatus = status || 'completed';
    const logVal = value !== undefined ? value : 1;

    // Insert or update existing log for the day
    db.prepare(`
      INSERT INTO habit_logs (id, tenant_id, habit_id, log_date, value, status, notes, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, habit_id, log_date) DO UPDATE SET
        value = excluded.value,
        status = excluded.status,
        notes = excluded.notes,
        logged_at = datetime('now')
    `).run(
      logId,
      session.tenantId,
      habitId,
      logDate,
      logVal,
      logStatus,
      notes || null
    );

    const log = db.prepare('SELECT * FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?').get(session.tenantId, habitId, logDate);
    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get('habitId');
    const date = searchParams.get('date') || todayISO();

    if (!habitId) {
      return NextResponse.json({ error: 'Habit ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?').run(session.tenantId, habitId, date);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
