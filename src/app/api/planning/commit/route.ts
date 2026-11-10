import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { commitApprovedDailyPlan, DailyPlanProposal } from '@/lib/productivity/planner';
import { readJson } from '@/lib/db/validate';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const { plan } = body;
    if (!plan || !plan.targetDate || !Array.isArray(plan.scheduledItems)) {
      return NextResponse.json({ error: 'Valid DailyPlanProposal is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.targetDate)) {
      return NextResponse.json({ error: 'plan.targetDate must be in YYYY-MM-DD format' }, { status: 400 });
    }
    for (const item of plan.scheduledItems) {
      if (!item || typeof item.title !== 'string' || typeof item.startTime !== 'string' || typeof item.endTime !== 'string') {
        return NextResponse.json({ error: 'Each scheduled item needs title, startTime and endTime' }, { status: 400 });
      }
      if (!/^\d{2}:\d{2}$/.test(item.startTime) || !/^\d{2}:\d{2}$/.test(item.endTime)) {
        return NextResponse.json({ error: `Item "${item.title}" must use HH:mm start/end times` }, { status: 400 });
      }
    }

    const result = commitApprovedDailyPlan(db, session.tenantId, session.userId, plan as DailyPlanProposal);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
