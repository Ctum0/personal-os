import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { rescheduleTask } from '@/lib/productivity/planner';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const { taskId, newDate, reason, actionType } = body;
    if (!taskId || !newDate) {
      return NextResponse.json({ error: 'taskId and newDate are required' }, { status: 400 });
    }

    const result = rescheduleTask(db, session.tenantId, taskId, newDate, reason, actionType);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
