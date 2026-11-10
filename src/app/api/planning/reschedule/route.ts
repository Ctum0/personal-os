import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { rescheduleTask } from '@/lib/productivity/planner';
import {isISODateString, readJson } from "@/lib/db/validate";

const VALID_RESCHEDULE_ACTIONS = ['rescheduled', 'postponed', 'moved_to_backlog', 'cancelled'];

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const { taskId, newDate, reason, actionType } = body;
    if (!taskId || !newDate) {
      return NextResponse.json({ error: 'taskId and newDate are required' }, { status: 400 });
    }
    if (typeof taskId !== 'string' || !isISODateString(newDate)) {
      return NextResponse.json({ error: 'newDate must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (actionType !== undefined && !VALID_RESCHEDULE_ACTIONS.includes(actionType)) {
      return NextResponse.json({ error: `Invalid actionType. Must be one of: ${VALID_RESCHEDULE_ACTIONS.join(', ')}` }, { status: 400 });
    }
    if (reason !== undefined && typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 400 });
    }

    const result = rescheduleTask(db, session.tenantId, taskId, newDate, reason, actionType);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.message.includes('not found') ? 404 : 500 });
  }
}
