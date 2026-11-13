import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { AI_TOOLS, AiApprovalRequest, checkToolPermission } from '@/lib/ai/tools';
import type { BudgetCalculationResult } from '@/lib/finance/engine';
import type { HabitStreakResult } from '@/lib/productivity/engine';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { optionalString, requiredString } from '@/lib/api/fields';

interface DailySummary {
  date: string;
  openTasksCount: number;
  completedTasksToday: number;
  safeToSpend: string;
  currency: string;
}

interface DailyPlanDraftPayload {
  topPriorities: unknown[];
  proposedTimeBlocks: unknown[];
}

interface DailyPlanDraft extends AiApprovalRequest {
  proposedPayload: DailyPlanDraftPayload;
}

interface UpcomingObligation {
  name: string;
  expected_amount: string;
  next_due_date: string;
  account_name: string;
}

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const message = requiredString(body.message, 'message', 10_000);
    // Accepted for API compatibility with the assistant drawer; intent routing
    // is message-driven today.
    optionalString(body.contextWorkspace, 'contextWorkspace', 50);

    const lower = message.toLowerCase().trim();
    let reply = '';
    let toolInvoked: string | undefined;
    let draftProposal: AiApprovalRequest | null = null;

    // Pattern matching to map natural user requests to strict server-side tools.
    // EVERY branch consults checkToolPermission: a policy that disables a tool
    // must stop the tool from executing, not merely relabel its output.
    if (/daily summary|today.*summary|overview/i.test(lower)) {
      toolInvoked = 'get_daily_summary';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const summary = (await AI_TOOLS.get_daily_summary.execute(
          db,
          session.tenantId,
          session.userId,
          {}
        )) as DailySummary;
        reply = `Here is your daily summary for ${summary.date}:
• Open Tasks: ${summary.openTasksCount}
• Completed Today: ${summary.completedTasksToday}
• Safe-to-Spend Projection: $${summary.safeToSpend} ${summary.currency}`;
      } else {
        reply = 'The daily summary tool is disabled by your policy settings.';
      }
    } else if (/plan.*day|daily plan|schedule.*today|priorit/i.test(lower)) {
      toolInvoked = 'draft_daily_plan';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const draft = (await AI_TOOLS.draft_daily_plan.execute(
          db,
          session.tenantId,
          session.userId,
          {}
        )) as DailyPlanDraft;
        draftProposal = draft;
        const { topPriorities, proposedTimeBlocks } = draft.proposedPayload;
        reply = `I have drafted a daily plan with ${topPriorities.length} key priorities and ${proposedTimeBlocks.length} focus blocks. Consequential calendar changes require your approval below before being added to your calendar.`;
      } else {
        reply = 'The planning tool is currently disabled in your AI settings.';
      }
    } else if (/safe.*spend|how much can i spend|spending money/i.test(lower)) {
      toolInvoked = 'get_daily_summary';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const safeSpend = (await AI_TOOLS.get_daily_summary.execute(
          db,
          session.tenantId,
          session.userId,
          {}
        )) as DailySummary;
        reply = `Based on your liquid balances minus upcoming obligations, earmarked savings goals, and emergency buffer:
Your current Safe-to-Spend is $${safeSpend.safeToSpend} ${safeSpend.currency}.
Every variable and assumption can be inspected in the "How this is calculated" drawer.`;
      } else {
        reply = 'The safe-to-spend calculation is disabled by your policy settings.';
      }
    } else if (/budget.*status|how.*budget|spending/i.test(lower)) {
      toolInvoked = 'get_budget_status';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const bgt = (await AI_TOOLS.get_budget_status.execute(
          db,
          session.tenantId,
          session.userId,
          {}
        )) as BudgetCalculationResult | null;
        if (bgt) {
          reply = `Budget: ${bgt.budgetName}
• Total Budgeted: $${bgt.totalAllocated}
• Total Spent: $${bgt.totalSpent} (${bgt.overallPercentUsed}% used)
• Remaining: $${bgt.totalRemaining}`;
        } else {
          reply = 'No active budget found for the current period.';
        }
      } else {
        reply = 'The budget status tool is disabled by your policy settings.';
      }
    } else if (/upcoming.*bill|obligations|due/i.test(lower)) {
      toolInvoked = 'list_upcoming_obligations';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const bills = (await AI_TOOLS.list_upcoming_obligations.execute(
          db,
          session.tenantId,
          session.userId,
          { days: 30 }
        )) as UpcomingObligation[];
        if (bills.length === 0) {
          reply = 'No upcoming recurring obligations found in the next 30 days.';
        } else {
          reply =
            `Found ${bills.length} upcoming obligations:\n` +
            bills
              .map((b) => `• ${b.name}: $${b.expected_amount} on ${b.next_due_date} (${b.account_name})`)
              .join('\n');
        }
      } else {
        reply = 'The upcoming obligations tool is disabled by your policy settings.';
      }
    } else if (/create task|add task|todo/i.test(lower)) {
      toolInvoked = 'create_task_draft';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const title =
          message.replace(/create task|add task|todo/i, '').replace(/[:"']/g, '').trim() || 'New Action Item';
        draftProposal = (await AI_TOOLS.create_task_draft.execute(db, session.tenantId, session.userId, {
          title,
          priority: lower.includes('urgent') ? 'urgent' : lower.includes('high') ? 'high' : 'normal',
        })) as AiApprovalRequest;
        reply = `I prepared a draft to create task: "${title}". Please review and confirm below.`;
      } else {
        reply = 'The task drafting tool is disabled by your policy settings.';
      }
    } else if (/habit|streak/i.test(lower)) {
      toolInvoked = 'get_habit_summary';
      if (checkToolPermission(db, session.tenantId, toolInvoked).allowed) {
        const habits = (await AI_TOOLS.get_habit_summary.execute(
          db,
          session.tenantId,
          session.userId,
          {}
        )) as HabitStreakResult[];
        reply =
          `Your active habit consistency:\n` +
          habits
            .map(
              (h) =>
                `• ${h.habitTitle}: ${h.currentStreak} day streak (${h.completionRatePercent}% consistency) ${
                  h.isCompletedToday ? '✓ Done today' : '○ Pending today'
                }`
            )
            .join('\n');
      } else {
        reply = 'The habit summary tool is disabled by your policy settings.';
      }
    } else {
      reply = `I am your Personal OS Agentic Assistant. I operate under strict authorization boundaries and can assist with:
• Daily Planning: "Plan my day" or "Prioritize today"
• Financial Clarity: "What is my safe to spend?" or "Budget status"
• Task Drafting: "Create task: [description]"
• Habits & Routine: "How are my habit streaks?"
• Upcoming obligations: "Show upcoming bills"`;
    }

    return ok({ reply, toolInvoked, draftProposal });
  } catch (err) {
    return routeError(err);
  }
});
