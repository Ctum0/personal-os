import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = 'SELECT * FROM calendar_events WHERE tenant_id = ?';
    const params: any[] = [session.tenantId];

    if (startDate && endDate) {
      query += ' AND date(start_time) >= ? AND date(end_time) <= ?';
      params.push(startDate, endDate);
    }
    query += ' ORDER BY start_time ASC';

    const events = db.prepare(query).all(...params);
    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.title || !body.startTime || !body.endTime) {
      return NextResponse.json({ error: 'Title, startTime, and endTime are required' }, { status: 400 });
    }

    const eventId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const eventType = body.eventType || 'time_block';
    const color = body.color || '#3b82f6';

    db.prepare(`
      INSERT INTO calendar_events (
        id, tenant_id, space_id, title, description, start_time, end_time, is_all_day, event_type, task_id, project_id, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      session.tenantId,
      body.spaceId || 'space_personal',
      body.title.trim(),
      body.description || '',
      body.startTime,
      body.endTime,
      body.isAllDay ? 1 : 0,
      eventType,
      body.taskId || null,
      body.projectId || null,
      color
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    db.prepare(`
      UPDATE calendar_events
      SET 
        title = coalesce(?, title),
        start_time = coalesce(?, start_time),
        end_time = coalesce(?, end_time),
        event_type = coalesce(?, event_type),
        color = coalesce(?, color),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(body.title, body.startTime, body.endTime, body.eventType, body.color, body.id, session.tenantId);

    const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(body.id);
    return NextResponse.json({ event: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM calendar_events WHERE id = ? AND tenant_id = ?').run(id, session.tenantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
