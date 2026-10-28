import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const { habitId, date, value, status, notes } = body;
    if (!habitId) {
      return NextResponse.json({ error: 'Habit ID is required' }, { status: 400 });
    }

    const logDate = date || new Date().toISOString().slice(0, 10);
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
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    if (!habitId) {
      return NextResponse.json({ error: 'Habit ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?').run(session.tenantId, habitId, date);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
