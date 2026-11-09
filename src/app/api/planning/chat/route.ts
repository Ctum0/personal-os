import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import {
  getPlanningContext,
  parseUnstructuredPlanInput,
  buildIntelligentDailySchedule,
  normalizeTimeString,
  addMinutesToTimeString,
  reviseDailyPlan,
  savePlanningSession,
  getPlanningSession,
  ParsedCommitment,
  PlanUncertainty,
  DailyPlanProposal,
} from '@/lib/productivity/planner';
import { todayISO, addDaysISO } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const sessionData = getPlanningSession(db, session.tenantId, sessionId);
    if (!sessionData) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session: sessionData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const {
      message = '',
      targetDate = addDaysISO(todayISO(), 1),
      sessionId = `sess_${Date.now()}`,
      answers = {},
      existingCommitments = [],
      action,
    } = body;

    if (typeof message !== 'string') {
      return NextResponse.json({ error: 'message must be a string' }, { status: 400 });
    }
    if (message.length > 10000) {
      return NextResponse.json({ error: 'message cannot exceed 10,000 characters' }, { status: 400 });
    }
    if (sessionId && (typeof sessionId !== 'string' || sessionId.length > 100 || !/^[a-zA-Z0-9_\-:]+$/.test(sessionId))) {
      return NextResponse.json({ error: 'invalid sessionId format' }, { status: 400 });
    }
    if (targetDate && (typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate))) {
      return NextResponse.json({ error: 'targetDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    const context = getPlanningContext(db, session.tenantId, targetDate);

    // Hydrate existing commitments and proposed plan from database session if not passed explicitly
    let mergedCommitments: ParsedCommitment[] = [...existingCommitments];
    let priorConversation: any[] = [];
    let priorProposedPlan: DailyPlanProposal | null = null;
    let priorAnswers: Record<string, any> = {};

    const existingSession = getPlanningSession(db, session.tenantId, sessionId);
    if (existingSession) {
      priorConversation = existingSession.conversation || [];
      priorProposedPlan = existingSession.proposedPlan;
      priorAnswers = existingSession.extractedState.answers || {};

      if (mergedCommitments.length === 0 && existingSession.extractedState.commitments.length > 0) {
        mergedCommitments = existingSession.extractedState.commitments;
      }
    }

    const combinedAnswers = { ...priorAnswers, ...answers };

    // Case 0: Adaptive Plan Revision if a proposal already exists and user requests an adjustment
    const isRevision = Boolean(
      priorProposedPlan && (
        action === 'revise' ||
        /(?:move|reschedule|shift|meeting|call|sync|cancel|remove|drop|change|shorten)\b/i.test(message)
      )
    );

    if (isRevision && priorProposedPlan) {
      const revision = reviseDailyPlan(context, priorProposedPlan, message);
      const reply = `${revision.explanation}\n\nYour schedule for ${targetDate} has been updated. Unchanged blocks remain preserved.`;

      const turns = [
        ...priorConversation,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString(), revisedPlan: revision.proposal },
      ];

      savePlanningSession(db, {
        id: sessionId,
        tenantId: session.tenantId,
        userId: session.userId,
        targetDate,
        conversation: turns,
        extractedState: {
          commitments: mergedCommitments,
          uncertainties: [],
          answers: combinedAnswers,
        },
        proposedPlan: revision.proposal,
        status: 'proposed',
      });

      return NextResponse.json({
        sessionId,
        status: 'proposed',
        reply,
        proposal: revision.proposal,
        changedItems: revision.changedItems,
        preservedItems: revision.preservedItems,
        commitments: mergedCommitments,
        uncertainties: [],
      });
    }

    let remainingUncertainties: PlanUncertainty[] = [];

    // Case A: Initial message (no existing commitments yet)
    if (mergedCommitments.length === 0) {
      const parsed = parseUnstructuredPlanInput(message, targetDate, context);
      mergedCommitments = parsed.commitments;
      remainingUncertainties = parsed.uncertainties;
    } else {
      // Case B: Subsequent turn (clarification answers or follow-up edits)
      const msgLower = message.toLowerCase();

      // 1. Check for call clarification (from answers or message text)
      const callAnswer = combinedAnswers.call_time || combinedAnswers.callTime || combinedAnswers.unc_call_time;
      const callTimeMatch = message.match(/(?:call.*?at\s*|call.*?is\s*at\s*|at\s*)(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      const rawCallTime = callAnswer || (callTimeMatch ? callTimeMatch[1] : null);

      if (rawCallTime) {
        const normTime = normalizeTimeString(rawCallTime);
        const call = mergedCommitments.find(c => /call|meeting|sync/i.test(c.title));
        if (call) {
          call.isFixed = true;
          call.startTime = normTime;
          call.durationMinutes = call.durationMinutes || 30;
          call.endTime = addMinutesToTimeString(normTime, call.durationMinutes);
          call.itemType = 'fixed_event';
        }
      }

      // 2. Check for gym / workout clarification
      const gymAnswer = combinedAnswers.gym_duration || combinedAnswers.gymDuration || combinedAnswers.unc_gym_travel;
      const gymDurMatch = message.match(/(?:gym.*?takes?\s*|gym.*?duration\s*|gym.*?is\s*|workout.*?)(\d+)\s*(?:mins?|minutes?)/i);
      const rawGymDur = gymAnswer || (gymDurMatch ? gymDurMatch[1] : null);

      if (rawGymDur) {
        const mins = parseInt(String(rawGymDur).match(/\d+/)?.[0] || '75', 10);
        const gym = mergedCommitments.find(c => /gym|workout/i.test(c.title));
        if (gym) {
          gym.durationMinutes = mins;
        }
      }

      // 3. Check for assignment deadline / priority clarification
      const assignmentAnswer = combinedAnswers.assignment_deadline || combinedAnswers.unc_assignment_deadline;
      if (assignmentAnswer || /assignment.*?due/i.test(msgLower) || /tomorrow\s+evening/i.test(msgLower)) {
        const assignment = mergedCommitments.find(c => /assignment|report/i.test(c.title));
        if (assignment) {
          assignment.priority = 'critical';
        }
      }

      // 4. Check if message adds any NEW commitment not yet mentioned
      if (message.length > 5 && !callTimeMatch && !gymDurMatch && !assignmentAnswer) {
        const parsed = parseUnstructuredPlanInput(message, targetDate, context);
        for (const c of parsed.commitments) {
          const alreadyExists = mergedCommitments.some(
            m => m.title.toLowerCase() === c.title.toLowerCase() ||
                 (/call/i.test(m.title) && /call/i.test(c.title)) ||
                 (/gym/i.test(m.title) && /gym/i.test(c.title)) ||
                 (/assignment/i.test(m.title) && /assignment/i.test(c.title)) ||
                 (/work/i.test(m.title) && /work/i.test(c.title))
          );
          if (!alreadyExists) {
            mergedCommitments.push(c);
          }
        }
      }
    }

    // Determine if high-urgency uncertainties remain
    const callHasFixedTime = mergedCommitments.some(c => /call|meeting|sync/i.test(c.title) && c.isFixed && c.startTime);
    const hasCallUncertainty = mergedCommitments.some(c => /call|meeting|sync/i.test(c.title)) && !callHasFixedTime;

    if (hasCallUncertainty && !combinedAnswers.call_time && !combinedAnswers.callTime && !/(?:at\s*|is\s*at\s*)\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i.test(message)) {
      remainingUncertainties = [
        {
          id: 'call_time',
          question: 'What time is your call in the evening, and how long will it take?',
          relatedEntity: 'Evening call',
          urgency: 'high',
          suggestedAnswers: ['6:00 PM (30 mins)', '7:00 PM (30 mins)', '8:00 PM (45 mins)'],
          options: ['6:00 PM (30 mins)', '7:00 PM (30 mins)', '8:00 PM (45 mins)'],
        },
      ];
    } else {
      remainingUncertainties = [];
    }

    // Check if any extracted commitment was already completed in the database
    const completedTasksInDb = db.prepare(`
      SELECT title FROM tasks 
      WHERE tenant_id = ? AND status = 'completed' AND is_deleted = 0
      ORDER BY updated_at DESC LIMIT 20
    `).all(session.tenantId) as Array<{ title: string }>;
    const completedTitles = new Set(completedTasksInDb.map(t => t.title.toLowerCase().trim()));
    const alreadyCompletedCommitments = mergedCommitments.filter(c => completedTitles.has(c.title.toLowerCase().trim()));
    const completedNotice = alreadyCompletedCommitments.length > 0
      ? `\n\n📌 Note: ${alreadyCompletedCommitments.map(c => `"${c.title}"`).join(', ')} is already recorded as completed in your task history.`
      : '';

    // If there are mandatory clarification questions:
    if (remainingUncertainties.length > 0 && Object.keys(combinedAnswers).length === 0) {
      const questionList = remainingUncertainties.map(u => `• ${u.question}`).join('\n');
      const reply = `I've extracted your planned commitments for ${targetDate}:\n${mergedCommitments.map(c => `  - ${c.title} (${c.durationMinutes}m${c.isFixed ? `, ${c.startTime}-${c.endTime}` : ''})`).join('\n')}${completedNotice}\n\nBefore I schedule your day, I need to clarify a detail to place it properly:\n${questionList}\n\nCould you clarify so I can finalize your schedule?`;

      const turns = [
        ...priorConversation,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ];

      savePlanningSession(db, {
        id: sessionId,
        tenantId: session.tenantId,
        userId: session.userId,
        targetDate,
        conversation: turns,
        extractedState: {
          commitments: mergedCommitments,
          uncertainties: remainingUncertainties,
          clarificationQuestions: remainingUncertainties.map(u => u.question),
          answers: combinedAnswers,
        },
        proposedPlan: null,
        status: 'interviewing',
      });

      return NextResponse.json({
        sessionId,
        status: 'interviewing',
        reply,
        commitments: mergedCommitments,
        uncertainties: remainingUncertainties,
        context: {
          availableHours: context.operatingRules?.maxDailyWorkloadHours || 6.5,
          existingEventsCount: (context.existingEvents || []).length,
          missedTasksCount: (context.missedTasks || []).length,
        },
      });
    }

    // Schedule generation
    const proposal = buildIntelligentDailySchedule(context, mergedCommitments);

    let reply = `Here is your complete schedule for ${targetDate} (${proposal.scheduledItems.length} blocks, estimated ${proposal.estimatedWorkloadHours}h workload).`;
    if (proposal.isOvercommitted) {
      reply += `\n\n⚠️ ${proposal.conflictSummary}`;
    } else {
      reply += `\n\nAll commitments have been fitted into your timeline with zero conflicts and protected transition buffers. You can review and adjust any block on the right, or approve to commit.`;
    }
    if (completedNotice) {
      reply += completedNotice;
    }

    // Persist turn in planning session
    const turns = [
      ...priorConversation,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ];

    savePlanningSession(db, {
      id: sessionId,
      tenantId: session.tenantId,
      userId: session.userId,
      targetDate,
      conversation: turns,
      extractedState: {
        commitments: mergedCommitments,
        uncertainties: [],
        answers: combinedAnswers,
      },
      proposedPlan: proposal,
      status: 'proposed',
    });

    return NextResponse.json({
      sessionId,
      status: 'proposed',
      reply,
      proposal,
      commitments: mergedCommitments,
      uncertainties: [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
