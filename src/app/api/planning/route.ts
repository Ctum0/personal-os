import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { generateDailyPlanProposal } from '@/lib/productivity/engine';
import { todayISO } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || todayISO();

    const proposal = generateDailyPlanProposal(db, session.tenantId, date);
    return NextResponse.json({ proposal });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const { targetDate, timeBlocks } = body;
    if (!Array.isArray(timeBlocks)) {
      return NextResponse.json({ error: 'timeBlocks array is required' }, { status: 400 });
    }

    db.transaction(() => {
      const insertEvent = db.prepare(`
        INSERT INTO calendar_events (
          id, tenant_id, title, start_time, end_time, event_type, task_id, color
        ) VALUES (?, ?, ?, ?, ?, 'time_block', ?, '#6366f1')
      `);

      for (const block of timeBlocks) {
        const eventId = `ev_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        insertEvent.run(
          eventId,
          session.tenantId,
          block.title,
          block.startTime,
          block.endTime,
          block.taskId || null
        );

        // Update task status to 'next' or scheduled
        if (block.taskId) {
          db.prepare(`
            UPDATE tasks 
            SET status = CASE WHEN status = 'inbox' THEN 'next' ELSE status END,
                due_date = coalesce(due_date, ?)
            WHERE id = ? AND tenant_id = ?
          `).run(targetDate, block.taskId, session.tenantId);
        }
      }
    })();

    return NextResponse.json({ success: true, count: timeBlocks.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
