import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { AI_TOOLS, checkToolPermission, createAiActionDraft } from '@/lib/ai/tools';
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

    const { message, contextWorkspace } = body;
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const lower = message.toLowerCase().trim();
    let reply = '';
    let toolInvoked: string | undefined;
    let draftProposal: any = null;

    // Pattern matching to map natural user requests to strict server-side tools
    if (/daily summary|today.*summary|overview/i.test(lower)) {
      toolInvoked = 'get_daily_summary';
      const perm = checkToolPermission(db, session.tenantId, toolInvoked);
      if (perm.allowed) {
        const summary = await AI_TOOLS.get_daily_summary.execute(db, session.tenantId, session.userId, {});
        reply = `Here is your daily summary for ${summary.date}:
• Open Tasks: ${summary.openTasksCount}
• Completed Today: ${summary.completedTasksToday}
• Safe-to-Spend Projection: $${summary.safeToSpend} ${summary.currency}`;
      } else {
        reply = 'The daily summary tool is disabled by your policy settings.';
      }
    } else if (/plan.*day|daily plan|schedule.*today|priorit/i.test(lower)) {
      toolInvoked = 'draft_daily_plan';
      const perm = checkToolPermission(db, session.tenantId, toolInvoked);
      if (perm.allowed) {
        draftProposal = await AI_TOOLS.draft_daily_plan.execute(db, session.tenantId, session.userId, {});
        reply = `I have drafted a daily plan with ${draftProposal.proposedPayload.topPriorities.length} key priorities and ${draftProposal.proposedPayload.proposedTimeBlocks.length} focus blocks. Consequential calendar changes require your approval below before being added to your calendar.`;
      } else {
        reply = 'The planning tool is currently disabled in your AI settings.';
      }
    } else if (/safe.*spend|how much can i spend|spending money/i.test(lower)) {
      toolInvoked = 'get_daily_summary';
      const safeSpend = await AI_TOOLS.get_daily_summary.execute(db, session.tenantId, session.userId, {});
      reply = `Based on your liquid balances minus upcoming obligations, earmarked savings goals, and emergency buffer:
Your current Safe-to-Spend is $${safeSpend.safeToSpend} ${safeSpend.currency}.
Every variable and assumption can be inspected in the "How this is calculated" drawer.`;
    } else if (/budget.*status|how.*budget|spending/i.test(lower)) {
      toolInvoked = 'get_budget_status';
      const bgt = await AI_TOOLS.get_budget_status.execute(db, session.tenantId, session.userId, {});
      if (bgt) {
        reply = `Budget: ${bgt.budgetName}
• Total Budgeted: $${bgt.totalAllocated}
• Total Spent: $${bgt.totalSpent} (${bgt.overallPercentUsed}% used)
• Remaining: $${bgt.totalRemaining}`;
      } else {
        reply = 'No active budget found for the current period.';
      }
    } else if (/upcoming.*bill|obligations|due/i.test(lower)) {
      toolInvoked = 'list_upcoming_obligations';
      const bills = await AI_TOOLS.list_upcoming_obligations.execute(db, session.tenantId, session.userId, { days: 30 });
      if (bills.length === 0) {
        reply = 'No upcoming recurring obligations found in the next 30 days.';
      } else {
        reply = `Found ${bills.length} upcoming obligations:\n` +
          bills.map((b: any) => `• ${b.name}: $${b.expected_amount} on ${b.next_due_date} (${b.account_name})`).join('\n');
      }
    } else if (/create task|add task|todo/i.test(lower)) {
      toolInvoked = 'create_task_draft';
      // Extract task title
      const title = message.replace(/create task|add task|todo/i, '').replace(/[:"']/g, '').trim() || 'New Action Item';
      draftProposal = await AI_TOOLS.create_task_draft.execute(db, session.tenantId, session.userId, {
        title,
        priority: lower.includes('urgent') ? 'urgent' : lower.includes('high') ? 'high' : 'normal',
      });
      reply = `I prepared a draft to create task: "${title}". Please review and confirm below.`;
    } else if (/habit|streak/i.test(lower)) {
      toolInvoked = 'get_habit_summary';
      const habits = await AI_TOOLS.get_habit_summary.execute(db, session.tenantId, session.userId, {});
      reply = `Your active habit consistency:\n` +
        habits.map((h: any) => `• ${h.habitTitle}: ${h.currentStreak} day streak (${h.completionRatePercent}% consistency) ${h.isCompletedToday ? '✓ Done today' : '○ Pending today'}`).join('\n');
    } else {
      reply = `I am your Personal OS Agentic Assistant. I operate under strict authorization boundaries and can assist with:
• Daily Planning: "Plan my day" or "Prioritize today"
• Financial Clarity: "What is my safe to spend?" or "Budget status"
• Task Drafting: "Create task: [description]"
• Habits & Routine: "How are my habit streaks?"
• Upcoming obligations: "Show upcoming bills"`;
    }

    return NextResponse.json({
      reply,
      toolInvoked,
      draftProposal,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
