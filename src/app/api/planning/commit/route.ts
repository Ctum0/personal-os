import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { commitApprovedDailyPlan, DailyPlanProposal } from '@/lib/productivity/planner';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const { plan } = body;
    if (!plan || !plan.targetDate || !Array.isArray(plan.scheduledItems)) {
      return NextResponse.json({ error: 'Valid DailyPlanProposal is required' }, { status: 400 });
    }

    const result = commitApprovedDailyPlan(db, session.tenantId, session.userId, plan as DailyPlanProposal);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
