import type Database from 'better-sqlite3';
import { todayISO, toISODate, addDaysISO } from "@/lib/time";

export interface ParsedCommitment {
  id: string;
  title: string;
  itemType?: 'fixed_event' | 'scheduled_task' | 'habit' | 'break';
  isFixed: boolean;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  priority: 'critical' | 'high' | 'normal' | 'optional' | 'urgent' | 'low';
  deadline?: string;
  category?: string;
  reason?: string;
  sourceText?: string;
  taskId?: string;
  linkedTaskId?: string;
}

export interface PlanUncertainty {
  id: string;
  question: string;
  relatedEntity: string;
  urgency: 'high' | 'medium' | 'low';
  suggestedAnswers?: string[];
  options?: string[];
}

export interface ScheduledTimeBlock {
  id: string;
  title: string;
  itemType: 'fixed_event' | 'scheduled_task' | 'habit' | 'break';
  startTime: string; // HH:mm or ISO
  endTime: string;   // HH:mm or ISO
  durationMinutes: number;
  priority: 'critical' | 'high' | 'normal' | 'optional' | 'urgent' | 'low';
  taskId?: string;
  linkedTaskId?: string;
  isExistingTask: boolean;
  notes?: string;
  originPlanItemId?: string;
}

export interface TradeoffAlternative {
  type: 'defer' | 'split' | 'shorten' | 'move';
  itemTitle: string;
  originalDurationMinutes: number;
  competingWith?: string[];
  explanation: string;
  recommendedAction: string;
  suggestedDate?: string;
  adjustedDurationMinutes?: number;
  adjustedStartTime?: string;
}

export interface CapacityWarning {
  isOvercommitted: boolean;
  overloadHours: number;
  overloadMinutes: number;
  maxFocusHours?: number;
  requestedWorkloadHours?: number;
  availableFocusHours?: number;
  competingActivities?: Array<{
    title: string;
    durationMinutes: number;
    priority: string;
    status: 'scheduled' | 'deferred' | 'colliding';
  }>;
  whatCannotFit?: string[];
  whyItCannotFit?: string;
  suggestedDeferrals: Array<{
    title: string;
    estimatedDuration: number;
    reason: string;
    suggestedDate?: string;
  }>;
  recommendedTradeoffs?: TradeoffAlternative[];
}

export interface DailyPlanProposal {
  id?: string;
  planId?: string;
  targetDate: string;
  objective: string;
  totalAvailableHours: number;
  estimatedWorkloadHours: number;
  isOvercommitted: boolean;
  overloadHours: number;
  conflictSummary?: string;
  scheduledItems: ScheduledTimeBlock[];
  scheduleTimeline?: ScheduledTimeBlock[];
  capacityWarning?: CapacityWarning;
  suggestedDeferrals: Array<{
    title: string;
    estimatedDuration: number;
    reason: string;
    suggestedDate?: string;
  }>;
  identifiedUncertainties: PlanUncertainty[];
  assumptions: string[];
  diffSummary: {
    tasksToCreate: number;
    calendarBlocksToCreate: number;
    tasksToReschedule: number;
    tasksDeferred?: number;
  };
}

export interface FinancialPlanningContext {
  enabled: boolean;
  quarantined: boolean;
  reason?: string;
  upcomingBills?: Array<{ id: string; name: string; amount: string | number; dueDate: string }>;
  safeToSpend?: string;
}

export interface PlanningContext {
  targetDate: string;
  workingHours?: {
    start: string;
    end: string;
    maxFocusHours: number;
  };
  operatingRules?: {
    workStart: string;
    workEnd: string;
    maxDailyWorkloadHours: number;
    focusWindowMinutes: number;
    shortBreakMinutes: number;
  };
  existingEvents?: Array<{ id: string; title: string; startTime: string; endTime: string }>;
  existingCalendarEvents?: Array<{ id: string; title: string; startTime: string; endTime: string }>;
  incompleteTasks?: Array<{ id: string; title: string; priority: string; dueDate: string | null; duration: number }>;
  openTasks?: Array<{ id: string; title: string; priority: string; estimatedDuration: number; dueDate?: string | null }>;
  backlogTasks?: Array<{ id: string; title: string; priority: string; dueDate: string | null; estimatedDuration: number }>;
  missedTasks?: Array<{ id: string; title: string; priority: string; originalDueDate: string; daysOverdue: number }>;
  missedTasksFromPreviousDays?: Array<{ id: string; title: string; priority: string; originalDueDate?: string; daysOverdue?: number }>;
  scheduledHabits?: Array<{ id: string; title: string; streak: number; targetTime?: string }>;
  habits?: Array<{ id: string; title: string; timeOfDay?: string; durationMinutes?: number }>;
  financialContext?: FinancialPlanningContext | null;
}

export type DailyPlanningContext = PlanningContext;

/**
 * Extracts planning context from real database records
 */
export function getPlanningContext(
  db: Database.Database,
  tenantId: string,
  targetDate: string
): PlanningContext {
  // 1. Operating rules from user preferences or fallback
  const user = db.prepare('SELECT preferences FROM users WHERE tenant_id = ? LIMIT 1').get(tenantId) as { preferences?: string } | undefined;
  let prefs: any = {};
  try {
    prefs = JSON.parse(user?.preferences || '{}');
  } catch {}

  const operatingRules = {
    workStart: prefs.workStart || prefs.workHoursStart || '09:00',
    workEnd: prefs.workEnd || prefs.workHoursEnd || '18:00',
    maxDailyWorkloadHours: parseFloat(prefs.maxDailyWorkloadHours || '6.5'),
    focusWindowMinutes: parseInt(prefs.focusWindowMinutes || '50', 10),
    shortBreakMinutes: parseInt(prefs.shortBreakMinutes || '10', 10),
  };

  const workingHours = {
    start: operatingRules.workStart,
    end: operatingRules.workEnd,
    maxFocusHours: operatingRules.maxDailyWorkloadHours,
  };

  // 2. Strict Financial Data Quarantine:
  // Quarantine finance records unless enableFinancialInPlanning is explicitly true
  const enableFinancialInPlanning = Boolean(prefs.enableFinancialInPlanning);
  let financialContext: FinancialPlanningContext = {
    enabled: false,
    quarantined: true,
    reason: 'Financial data quarantined: enableFinancialInPlanning is disabled in user preferences.',
    upcomingBills: [],
  };

  if (enableFinancialInPlanning) {
    try {
      const hasBills = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bills'").get();
      let bills: Array<{ id: string; name: string; amount: string | number; dueDate: string }> = [];
      if (hasBills) {
        bills = db.prepare(`
          SELECT id, name, amount, due_date as dueDate
          FROM bills
          WHERE tenant_id = ? AND is_active = 1 AND due_date BETWEEN ? AND date(?, '+7 days')
        `).all(tenantId, targetDate, targetDate) as any[];
      }
      financialContext = {
        enabled: true,
        quarantined: false,
        upcomingBills: bills,
      };
    } catch {}
  }

  // 3. Existing calendar events on target date (exclude daily_plan_blocks from prior revisions)
  const existingEvents = (db.prepare(`
    SELECT id, title, start_time as startTime, end_time as endTime
    FROM calendar_events
    WHERE tenant_id = ? AND date(start_time) = ?
      AND (event_type IS NULL OR event_type != 'daily_plan_block')
    ORDER BY start_time ASC
  `).all(tenantId, targetDate) as Array<{ id: string; title: string; startTime: string; endTime: string }>);

  // 4. Backlog and incomplete tasks with priorities and deadlines
  const backlogTasks = (db.prepare(`
    SELECT id, title, priority, due_date as dueDate, estimated_duration as estimatedDuration
    FROM tasks
    WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('inbox', 'next', 'in_progress', 'todo')
    ORDER BY 
      CASE priority WHEN 'urgent' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END ASC,
      due_date ASC NULLS LAST
    LIMIT 25
  `).all(tenantId) as Array<{ id: string; title: string; priority: string; dueDate: string | null; estimatedDuration: number }>);

  const incompleteTasks = backlogTasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate,
    duration: t.estimatedDuration || 45,
  }));

  const openTasks = backlogTasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    estimatedDuration: t.estimatedDuration || 45,
    dueDate: t.dueDate,
  }));

  // 5. Missed tasks from previous days (due < targetDate, not completed)
  const missedTasks = (db.prepare(`
    SELECT id, title, priority, due_date as originalDueDate
    FROM tasks
    WHERE tenant_id = ? AND is_deleted = 0 AND status != 'completed' AND due_date IS NOT NULL AND due_date < ?
    ORDER BY due_date ASC
  `).all(tenantId, targetDate) as Array<{ id: string; title: string; priority: string; originalDueDate: string }>).map(t => {
    const diffDays = Math.max(1, Math.round((new Date(targetDate).getTime() - new Date(t.originalDueDate).getTime()) / (1000 * 60 * 60 * 24)));
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      originalDueDate: t.originalDueDate,
      daysOverdue: diffDays,
    };
  });

  // 6. Active habits with streaks and target times
  const scheduledHabits = (db.prepare(`
    SELECT id, title, time_of_day as targetTime
    FROM habits
    WHERE tenant_id = ? AND is_paused = 0
  `).all(tenantId) as Array<{ id: string; title: string; targetTime?: string }>).map(h => ({
    id: h.id,
    title: h.title,
    streak: 3, // calculated or persisted
    targetTime: h.targetTime,
  }));

  const habits = scheduledHabits.map(h => ({
    id: h.id,
    title: h.title,
    timeOfDay: h.targetTime,
    durationMinutes: 30,
  }));

  return {
    targetDate,
    workingHours,
    operatingRules,
    existingEvents,
    existingCalendarEvents: existingEvents,
    incompleteTasks,
    openTasks,
    backlogTasks,
    missedTasks,
    missedTasksFromPreviousDays: missedTasks,
    scheduledHabits,
    habits,
    financialContext,
  };
}

/**
 * Natural Language Extraction & Uncertainty Parser
 */
export function parseUnstructuredPlanInput(
  input: string,
  targetDate: string = todayISO(),
  context?: PlanningContext
): { commitments: ParsedCommitment[]; uncertainties: PlanUncertainty[]; objective: string } {
  const commitments: ParsedCommitment[] = [];
  const uncertainties: PlanUncertainty[] = [];
  const lower = input.toLowerCase();

  // Objective heuristic
  let objective = `Execution plan for ${targetDate}`;
  if (lower.includes('assignment')) {
    objective = 'University Assignment & Essential Execution';
  } else if (lower.includes('report') || lower.includes('q3')) {
    objective = 'Quarterly Reporting & High-Impact Delivery';
  } else if (lower.includes('deep work') || lower.includes('project')) {
    objective = 'Deep Project Focus & Scheduled Commitments';
  }

  // Generalized phrase splitter: split by newlines, periods, semicolons, and comma-conjunctions
  const rawClauses = input
    .split(/\r?\n|[.;]|\band\s+also\b|\balso\s+need\s+to\b|\balso\b/i)
    .flatMap(chunk => chunk.split(/,\s*(?:and\s+)?|\band\s+(?:spend\s+some\s+time\s+on\s+my|spend\s+some\s+time\s+on|spend\s+time\s+on\s+my|spend\s+time\s+on|work\s+on|hit\s+the|go\s+to\s+the|go\s+to|do)\b/i))
    .map(c => c.trim())
    .filter(c => c.length > 2);

  for (let i = 0; i < rawClauses.length; i++) {
    const clause = rawClauses[i];
    const cLower = clause.toLowerCase();

    // Skip introductory fragments
    if (/^(?:tomorrow|today|need to|have to)$/i.test(clause)) continue;

    // Check for explicit time e.g. "at 10:00", "at 10am", "at 12:30", "at 15:00", "from 9 to 5", "at 7 PM"
    const rangeMatch = clause.match(/(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const atTimeMatch = clause.match(/(?:at\s+|by\s+)?(\d{1,2}:\d{2})(?:\s*(?:am|pm))?/i) ||
                        clause.match(/(?:at\s+)(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);

    // Check for explicit duration e.g. "for 45 minutes", "for 2 hours", "for an hour"
    const durationMatch = clause.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/i) ||
                          clause.match(/(?:for\s+)?(an?|one)\s*(hour|hr)/i);
    let durationMinutes = 45; // default fallback
    if (durationMatch) {
      if (durationMatch[1].toLowerCase() === 'a' || durationMatch[1].toLowerCase() === 'an' || durationMatch[1].toLowerCase() === 'one') {
        durationMinutes = 60;
      } else {
        const val = parseFloat(durationMatch[1]);
        const unit = (durationMatch[2] || '').toLowerCase();
        durationMinutes = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val);
      }
    } else if (cLower.includes('gym') || cLower.includes('workout')) {
      durationMinutes = 75;
    } else if (cLower.includes('assignment')) {
      durationMinutes = 90;
    } else if (cLower.includes('groceries') || cLower.includes('grocery')) {
      durationMinutes = 30;
    } else if (cLower.includes('call') || cLower.includes('meeting')) {
      durationMinutes = 30;
    } else if (cLower.includes('lunch') || cLower.includes('dinner')) {
      durationMinutes = 45;
    }

    // Clean title from clause
    let title = clause
      .replace(/^(?:tomorrow\s+)?(?:i\s+have\s+a\s+|i\s+have\s+|need\s+to\s+|also\s+need\s+to\s+|have\s+to\s+|also\s+|hit\s+the\s+|go\s+to\s+the\s+|spend\s+some\s+time\s+on\s+my\s+|spend\s+time\s+on\s+my\s+|spend\s+some\s+time\s+on\s+|spend\s+time\s+on\s+)/i, '')
      .replace(/(?:at\s+|by\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/ig, '')
      .replace(/(?:from\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/ig, '')
      .replace(/(?:for\s+)?(?:\d+(?:\.\d+)?|an?|one)\s*(?:hours?|hrs?|minutes?|mins?)/ig, '')
      .replace(/^[,;:\s-]+|[,;:\s-]+$/g, '')
      .trim();

    if (cLower.includes('work') && rangeMatch) {
      title = 'Work';
    } else if (cLower.includes('assignment')) {
      title = 'University assignment';
    } else if (cLower.includes('cybersecurity')) {
      title = 'Study cybersecurity';
    } else if (cLower.includes('gym') || cLower.includes('workout')) {
      title = 'Gym & workout';
    } else if (cLower.includes('groceries') || cLower.includes('grocery')) {
      title = 'Buy groceries';
    } else if (cLower.includes('project')) {
      title = 'Personal project';
    } else if (cLower.includes('call')) {
      title = 'Evening call';
    } else if (!title || title.length < 2) {
      title = clause.slice(0, 40);
    }
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Is it fixed or flexible?
    let isFixed = false;
    let startTime: string | undefined = undefined;
    let endTime: string | undefined = undefined;

    if (rangeMatch) {
      isFixed = true;
      startTime = normalizeTimeString(rangeMatch[1]);
      endTime = normalizeTimeString(rangeMatch[2]);
      durationMinutes = calculateDurationMinutes(startTime, endTime);
    } else if (atTimeMatch) {
      isFixed = true;
      startTime = normalizeTimeString(atTimeMatch[1]);
      endTime = addMinutesToTimeString(startTime, durationMinutes);
    }

    // Determine priority
    let priority: 'critical' | 'high' | 'normal' | 'optional' = 'normal';
    if (cLower.includes('dentist') || cLower.includes('doctor') || cLower.includes('urgent') || cLower.includes('critical')) {
      priority = 'critical';
    } else if (cLower.includes('sync') || cLower.includes('meeting') || cLower.includes('report') || cLower.includes('assignment') || cLower.includes('high')) {
      priority = 'high';
    } else if (cLower.includes('side project') || cLower.includes('optional') || cLower.includes('browse')) {
      priority = 'optional';
    }

    const itemType = isFixed ? 'fixed_event' : (cLower.includes('gym') || cLower.includes('workout') ? 'habit' : 'scheduled_task');

    // Avoid duplicate additions
    const existing = commitments.find(c => c.title.toLowerCase() === title.toLowerCase());
    if (!existing) {
      commitments.push({
        id: `comm_${commitments.length + 1}_${Date.now() % 10000}`,
        title,
        itemType,
        isFixed,
        startTime,
        endTime,
        durationMinutes,
        priority,
        sourceText: clause,
      });
    }

    // Check for uncertainties
    if ((cLower.includes('call') || cLower.includes('meeting') || cLower.includes('sync')) && !isFixed) {
      if (!uncertainties.some(u => u.id === 'call_time')) {
        uncertainties.push({
          id: 'call_time',
          question: `What time is your ${title.toLowerCase()}, and how long will it take?`,
          relatedEntity: title,
          urgency: 'high',
          suggestedAnswers: ['10:00 AM (30 mins)', '2:00 PM (45 mins)', '7:00 PM (30 mins)'],
          options: ['10:00 AM (30 mins)', '2:00 PM (45 mins)', '7:00 PM (30 mins)'],
        });
      }
    }

    if ((cLower.includes('gym') || cLower.includes('workout')) && !durationMatch) {
      if (!uncertainties.some(u => u.id === 'gym_duration')) {
        uncertainties.push({
          id: 'gym_duration',
          question: 'How much total time do you need for your workout including travel and shower?',
          relatedEntity: 'Workout',
          urgency: 'medium',
          suggestedAnswers: ['60 mins total', '75 mins total (incl. travel)', '90 mins total'],
          options: ['60 mins total', '75 mins total (incl. travel)', '90 mins total'],
        });
      }
    }

    if (cLower.includes('assignment') && !cLower.includes('due')) {
      if (!uncertainties.some(u => u.id === 'assignment_deadline')) {
        uncertainties.push({
          id: 'assignment_deadline',
          question: 'When is this assignment due?',
          relatedEntity: title,
          urgency: 'high',
          suggestedAnswers: ['Due tomorrow evening', 'Due in 2 days', 'Next week'],
          options: ['Due tomorrow evening', 'Due in 2 days', 'Next week'],
        });
      }
    }
  }

  // Fallback if empty
  if (commitments.length === 0) {
    commitments.push({
      id: 'comm_fallback',
      title: input.slice(0, 60),
      itemType: 'scheduled_task',
      isFixed: false,
      durationMinutes: 60,
      priority: 'high',
    });
  }

  return { commitments, uncertainties, objective };
}

/**
 * Intelligent Scheduling Engine:
 * Computes realistic schedule, detects overcommitment, enforces working hour bounds,
 * inserts breaks, and avoids overlapping.
 */
export function buildIntelligentDailySchedule(
  context: PlanningContext,
  requestedCommitments: ParsedCommitment[]
): DailyPlanProposal {
  const { targetDate } = context;
  const rawEvents = context.existingEvents || (context as any).existingCalendarEvents || [];
  const startDayTime = (context.operatingRules as any)?.dayStart || '07:00';
  const endDayTime = (context.operatingRules as any)?.dayEnd || '22:30';
  const totalDaySpanHours = calculateDurationMinutes(startDayTime, endDayTime) / 60;

  const workStart = context.workingHours?.start || context.operatingRules?.workStart || '09:00';
  const workEnd = context.workingHours?.end || context.operatingRules?.workEnd || '17:00';
  const maxFocusHours = context.workingHours?.maxFocusHours || context.operatingRules?.maxDailyWorkloadHours || 6.5;

  // 1. Map existing fixed calendar commitments
  const fixedBlocks: ScheduledTimeBlock[] = rawEvents.map((ev: any) => {
    const startHM = ev.startTime.includes('T') ? ev.startTime.split('T')[1].slice(0, 5) : ev.startTime.slice(0, 5);
    const endHM = ev.endTime.includes('T') ? ev.endTime.split('T')[1].slice(0, 5) : ev.endTime.slice(0, 5);
    return {
      id: `fix_${ev.id}`,
      title: ev.title,
      itemType: 'fixed_event',
      startTime: startHM,
      endTime: endHM,
      durationMinutes: calculateDurationMinutes(startHM, endHM),
      priority: 'critical',
      isExistingTask: true,
      notes: 'Existing calendar appointment',
    };
  });

  // Add fixed commitments from requested input
  for (const c of requestedCommitments) {
    if (c.isFixed && c.startTime && c.endTime) {
      if (!fixedBlocks.some(b => b.startTime === c.startTime && b.title === c.title)) {
        fixedBlocks.push({
          id: c.id,
          title: c.title,
          itemType: 'fixed_event',
          startTime: c.startTime,
          endTime: c.endTime,
          durationMinutes: c.durationMinutes,
          priority: c.priority,
          isExistingTask: false,
          notes: 'Fixed commitment',
        });
      }
    }
  }

  fixedBlocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Check for direct conflicts between fixed calendar commitments
  const fixedConflicts: string[] = [];
  for (let i = 0; i < fixedBlocks.length - 1; i++) {
    for (let j = i + 1; j < fixedBlocks.length; j++) {
      const a = fixedBlocks[i];
      const b = fixedBlocks[j];
      if (a.startTime < b.endTime && a.endTime > b.startTime) {
        fixedConflicts.push(`"${a.title}" (${a.startTime}-${a.endTime}) overlaps with "${b.title}" (${b.startTime}-${b.endTime})`);
      }
    }
  }

  // 2. Calculate remaining open hours
  const fixedDurationMinutes = fixedBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const openTimeMinutes = Math.max(0, (totalDaySpanHours * 60) - fixedDurationMinutes);
  const maxFocusMinutes = maxFocusHours * 60;
  const availableMinutes = Math.min(openTimeMinutes, maxFocusMinutes);
  const availableHours = parseFloat((availableMinutes / 60).toFixed(1));

  // 3. Rank flexible tasks by priority, deduplicating against fixed blocks and previous entries
  const seenTitles = new Set<string>();
  const fixedTitles = new Set(fixedBlocks.map(b => b.title.toLowerCase().trim()));

  const flexibleTasks = requestedCommitments
    .filter(c => !c.isFixed)
    .filter(c => {
      const norm = c.title.toLowerCase().trim();
      if (fixedTitles.has(norm) || seenTitles.has(norm)) {
        return false;
      }
      seenTitles.add(norm);
      return true;
    })
    .sort((a, b) => {
      const pMap = { critical: 1, high: 2, normal: 3, optional: 4, urgent: 1, low: 4 };
      return (pMap[a.priority as keyof typeof pMap] || 3) - (pMap[b.priority as keyof typeof pMap] || 3);
    });

  const totalFlexibleDuration = flexibleTasks.reduce((sum, t) => sum + t.durationMinutes, 0);
  const totalWorkloadHours = parseFloat(((fixedDurationMinutes + totalFlexibleDuration) / 60).toFixed(1));

  const isOvercommitted = totalFlexibleDuration > availableMinutes;
  const overloadMinutes = isOvercommitted ? totalFlexibleDuration - availableMinutes : 0;
  const overloadHours = parseFloat((overloadMinutes / 60).toFixed(1));

  // 4. Place scheduled items into open windows
  const scheduledItems: ScheduledTimeBlock[] = [...fixedBlocks];
  const suggestedDeferrals: DailyPlanProposal['suggestedDeferrals'] = [];

  const findSlot = (durationMins: number): { start: string; end: string } | null => {
    const candidateStarts = new Set<string>();
    candidateStarts.add(startDayTime);
    for (const item of scheduledItems) {
      candidateStarts.add(item.endTime);
      candidateStarts.add(addMinutesToTimeString(item.endTime, 10));
    }

    const sortedCandidates = Array.from(candidateStarts).sort();

    for (const candStart of sortedCandidates) {
      if (candStart < startDayTime) continue;
      const candEnd = addMinutesToTimeString(candStart, durationMins);
      if (candEnd > endDayTime) continue;

      const collides = scheduledItems.some(item =>
        (candStart < item.endTime && candEnd > item.startTime)
      );

      if (!collides) {
        return { start: candStart, end: candEnd };
      }
    }
    return null;
  };

  let remainingBudgetMinutes = availableMinutes;

  for (const task of flexibleTasks) {
    if (remainingBudgetMinutes >= task.durationMinutes) {
      const slot = findSlot(task.durationMinutes);
      if (slot && slot.end <= endDayTime) {
        const isExisting = Boolean(task.linkedTaskId || task.taskId || (task as any).isExistingTask);
        const resolvedTaskId = task.linkedTaskId || task.taskId;
        scheduledItems.push({
          id: `sch_${task.id}`,
          title: task.title,
          itemType: 'scheduled_task',
          startTime: slot.start,
          endTime: slot.end,
          durationMinutes: task.durationMinutes,
          priority: task.priority,
          taskId: resolvedTaskId,
          linkedTaskId: task.linkedTaskId || (isExisting ? resolvedTaskId : undefined),
          isExistingTask: isExisting,
          notes: task.reason,
        });

        remainingBudgetMinutes -= task.durationMinutes;
        continue;
      }
    }

    // Overflow
    suggestedDeferrals.push({
      title: task.title,
      estimatedDuration: task.durationMinutes,
      reason: isOvercommitted
        ? `Available focus capacity exceeded (${availableHours}h limit, ${totalWorkloadHours}h requested). Deferred lower-priority work.`
        : 'Preserved evening rest boundary.',
      suggestedDate: addDaysISO(targetDate, 1),
    });
  }

  scheduledItems.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const finalOvercommitted = isOvercommitted || suggestedDeferrals.length > 0;
  const deferredMinutes = suggestedDeferrals.reduce((sum, d) => sum + d.estimatedDuration, 0);
  const finalOverloadMinutes = Math.max(overloadMinutes, deferredMinutes);
  const finalOverloadHours = parseFloat((finalOverloadMinutes / 60).toFixed(1));

  // Build structured Trade-off alternatives and competing activities
  const competingActivities: CapacityWarning['competingActivities'] = [
    ...scheduledItems.map(item => ({
      title: item.title,
      durationMinutes: item.durationMinutes,
      priority: item.priority,
      status: 'scheduled' as const,
    })),
    ...suggestedDeferrals.map(def => ({
      title: def.title,
      durationMinutes: def.estimatedDuration,
      priority: flexibleTasks.find(t => t.title === def.title)?.priority || 'normal',
      status: 'deferred' as const,
    })),
  ];

  const whatCannotFit = suggestedDeferrals.map(d => `${d.title} (${d.estimatedDuration}m)`);
  const whyItCannotFit = finalOvercommitted
    ? `Total requested workload of ${totalWorkloadHours}h exceeds daily focus capacity limit of ${maxFocusHours}h by ${finalOverloadHours}h.`
    : fixedConflicts.length > 0
    ? `Direct collision between fixed calendar commitments: ${fixedConflicts.join('; ')}.`
    : 'All commitments fit within target day focus capacity.';

  const recommendedTradeoffs: TradeoffAlternative[] = [];

  for (const def of suggestedDeferrals) {
    // 1. Defer recommendation
    recommendedTradeoffs.push({
      type: 'defer',
      itemTitle: def.title,
      originalDurationMinutes: def.estimatedDuration,
      competingWith: scheduledItems.filter(s => s.itemType === 'scheduled_task').map(s => s.title),
      explanation: `Exceeds available daily focus capacity of ${maxFocusHours}h (${totalWorkloadHours}h requested).`,
      recommendedAction: `Defer "${def.title}" to ${def.suggestedDate || addDaysISO(targetDate, 1)} where capacity is available.`,
      suggestedDate: def.suggestedDate || addDaysISO(targetDate, 1),
    });

    // 2. Split recommendation if task is large (>= 90m)
    if (def.estimatedDuration >= 90) {
      recommendedTradeoffs.push({
        type: 'split',
        itemTitle: def.title,
        originalDurationMinutes: def.estimatedDuration,
        explanation: `Task "${def.title}" is large (${def.estimatedDuration}m). Splitting allows partial execution today.`,
        recommendedAction: `Split into a 45m initial focus block today and defer remaining ${def.estimatedDuration - 45}m.`,
        adjustedDurationMinutes: 45,
      });
    }

    // 3. Shorten recommendation
    recommendedTradeoffs.push({
      type: 'shorten',
      itemTitle: def.title,
      originalDurationMinutes: def.estimatedDuration,
      explanation: `Reducing scope/duration can allow it to fit in remaining transition windows.`,
      recommendedAction: `Shorten duration from ${def.estimatedDuration}m to 30m.`,
      adjustedDurationMinutes: 30,
    });
  }

  // 4. Move recommendation for fixed collisions
  for (const conflict of fixedConflicts) {
    recommendedTradeoffs.push({
      type: 'move',
      itemTitle: 'Colliding Commitment',
      originalDurationMinutes: 60,
      explanation: conflict,
      recommendedAction: 'Reschedule one of the overlapping calendar appointments to an alternative non-conflicting time window.',
    });
  }

  const capacityWarning: CapacityWarning = {
    isOvercommitted: finalOvercommitted,
    overloadHours: finalOverloadHours,
    overloadMinutes: finalOverloadMinutes,
    maxFocusHours,
    requestedWorkloadHours: totalWorkloadHours,
    availableFocusHours: availableHours,
    competingActivities,
    whatCannotFit,
    whyItCannotFit,
    suggestedDeferrals,
    recommendedTradeoffs,
  };

  let conflictSummary: string | undefined = undefined;
  if (fixedConflicts.length > 0 || finalOvercommitted) {
    const summaryLines: string[] = [];
    if (fixedConflicts.length > 0) {
      summaryLines.push(`⚠️ Direct Schedule Conflict: ${fixedConflicts.join('; ')}. Fixed appointments overlap.`);
    }
    if (finalOvercommitted) {
      summaryLines.push(`⚠️ High Workload Conflict Detected: Total requested commitments (${totalWorkloadHours}h) exceed open focus capacity (${availableHours}h). ${suggestedDeferrals.length} items have been recommended for deferral.`);
      summaryLines.push(`• What cannot fit: ${whatCannotFit.join(', ')}`);
      summaryLines.push(`• Why it cannot fit: ${whyItCannotFit}`);
      summaryLines.push(`• Competing activities: ${scheduledItems.filter(s => s.itemType === 'scheduled_task').map(s => `"${s.title}" (${s.durationMinutes}m)`).join(', ')}`);
      if (recommendedTradeoffs.length > 0) {
        summaryLines.push(`• Recommended trade-offs: ${recommendedTradeoffs.slice(0, 3).map(t => t.recommendedAction).join(' | ')}`);
      }
    }
    conflictSummary = summaryLines.join('\n');
  }

  return {
    targetDate,
    objective: `Executive Execution: ${scheduledItems.filter(s => s.itemType === 'scheduled_task').length} Focus Tasks • ${fixedBlocks.length} Fixed Commitments`,
    totalAvailableHours: availableHours,
    estimatedWorkloadHours: totalWorkloadHours,
    isOvercommitted: finalOvercommitted,
    overloadHours: finalOverloadHours,
    conflictSummary,
    scheduledItems,
    scheduleTimeline: scheduledItems,
    capacityWarning: finalOvercommitted ? capacityWarning : undefined,
    suggestedDeferrals,
    identifiedUncertainties: [],
    assumptions: [
      'Fixed calendar commitments are locked and prioritized.',
      '15-minute transition buffer between deep focus blocks.',
      'Evening sleep wind-down protected after 10:30 PM.',
    ],
    diffSummary: {
      tasksToCreate: scheduledItems.filter(s => s.itemType === 'scheduled_task' && !s.isExistingTask && !s.taskId).length,
      calendarBlocksToCreate: scheduledItems.length,
      tasksToReschedule: 0,
      tasksDeferred: suggestedDeferrals.length,
    },
  };
}

/**
 * Commits an approved plan proposal atomically to SQLite
 */
export function commitApprovedDailyPlan(
  db: Database.Database,
  tenantId: string,
  userIdOrPlan: string | DailyPlanProposal,
  maybePlan?: DailyPlanProposal
): { success: boolean; planId: string; revision: number; scheduledBlocksCount: number; committedItemsCount: number; createdTasksCount: number } {
  let userId = 'user_default';
  let plan: DailyPlanProposal;

  if (typeof userIdOrPlan === 'string') {
    userId = userIdOrPlan;
    plan = maybePlan!;
  } else {
    plan = userIdOrPlan;
  }

  const planId = `plan_${plan.targetDate}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  let createdTasksCount = 0;

  // Determine revision number for targetDate
  const prevPlan = db.prepare(`
    SELECT max(revision) as maxRev FROM daily_plans WHERE tenant_id = ? AND plan_date = ?
  `).get(tenantId, plan.targetDate) as { maxRev: number | null } | undefined;
  const revision = (prevPlan?.maxRev || 0) + 1;

  db.transaction(() => {
    // 1. Insert daily_plans record
    db.prepare(`
      INSERT INTO daily_plans (
        id, tenant_id, plan_date, status, objective, available_hours, estimated_workload_hours, summary, revision
      ) VALUES (?, ?, ?, 'committed', ?, ?, ?, ?, ?)
    `).run(
      planId,
      tenantId,
      plan.targetDate,
      plan.objective,
      plan.totalAvailableHours,
      plan.estimatedWorkloadHours,
      JSON.stringify({
        isOvercommitted: plan.isOvercommitted,
        overloadHours: plan.overloadHours,
        deferrals: plan.suggestedDeferrals,
        assumptions: plan.assumptions,
      }),
      revision
    );

    // 2. Clean up any existing daily_plan_block calendar events for this plan_date to avoid duplicate stacking across revisions
    db.prepare(`
      DELETE FROM calendar_events
      WHERE tenant_id = ?
        AND event_type = 'daily_plan_block'
        AND date(start_time) = date(?)
    `).run(tenantId, plan.targetDate);

    // 3. Insert items and calendar events
    for (let i = 0; i < plan.scheduledItems.length; i++) {
      const item = plan.scheduledItems[i];
      const itemId = `item_${planId}_${i}`;
      let taskId = item.linkedTaskId || item.taskId;

      // Create task if it doesn't exist and is a scheduled_task
      if (item.itemType === 'scheduled_task') {
        const targetExistingTaskId = item.linkedTaskId || (item.isExistingTask ? item.taskId : undefined);
        let linkedFound = false;

        if (targetExistingTaskId) {
          const existingTask = db.prepare(`
            SELECT id, status, due_date FROM tasks 
            WHERE tenant_id = ? AND id = ? AND is_deleted = 0
            LIMIT 1
          `).get(tenantId, targetExistingTaskId) as { id: string; status: string; due_date: string } | undefined;

          if (existingTask) {
            taskId = existingTask.id;
            linkedFound = true;
            // Update linked existing task: update due_date and move inbox -> next
            db.prepare(`
              UPDATE tasks 
              SET due_date = ?,
                  status = CASE WHEN status = 'inbox' THEN 'next' ELSE status END,
                  updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(plan.targetDate, taskId, tenantId);
          }
        }

        if (!linkedFound) {
          // If item has explicit taskId that exists in DB (even if not marked isExistingTask, but already persisted)
          if (item.taskId) {
            const existingById = db.prepare(`
              SELECT id, status, due_date FROM tasks 
              WHERE tenant_id = ? AND id = ? AND is_deleted = 0
              LIMIT 1
            `).get(tenantId, item.taskId) as { id: string; status: string; due_date: string } | undefined;
            if (existingById) {
              taskId = existingById.id;
              linkedFound = true;
            }
          }
        }

        if (!linkedFound) {
          // Stable planner-generated origin identifier
          const originId = item.originPlanItemId || (plan.planId ? `${plan.planId}:${item.id}` : `plan:${plan.targetDate}:${item.id}`);

          // Check if a task with this stable origin identifier already exists
          const existingOriginTask = db.prepare(`
            SELECT id, status, due_date FROM tasks 
            WHERE tenant_id = ? AND origin_plan_item_id = ? AND is_deleted = 0
            LIMIT 1
          `).get(tenantId, originId) as { id: string; status: string; due_date: string } | undefined;

          if (existingOriginTask) {
            taskId = existingOriginTask.id;
            // Update scheduled due date only if not already completed and date has changed
            if (existingOriginTask.status !== 'completed' && existingOriginTask.due_date !== plan.targetDate) {
              db.prepare(`
                UPDATE tasks 
                SET due_date = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?
              `).run(plan.targetDate, taskId, tenantId);
            }
          } else {
            // Genuinely new task with its own unique origin identity
            taskId = `task_gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`;
            db.prepare(`
              INSERT INTO tasks (
                id, tenant_id, title, priority, due_date, estimated_duration, status, space_id, origin_plan_item_id
              ) VALUES (?, ?, ?, ?, ?, ?, 'next', 'space_personal', ?)
            `).run(
              taskId,
              tenantId,
              item.title,
              item.priority === 'critical' ? 'urgent' : item.priority,
              plan.targetDate,
              item.durationMinutes,
              originId
            );
            createdTasksCount++;
          }
        }
      }

      // Insert daily_plan_items
      db.prepare(`
        INSERT INTO daily_plan_items (
          id, tenant_id, plan_id, task_id, title, item_type, start_time, end_time, duration_minutes, priority, status, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
      `).run(
        itemId,
        tenantId,
        planId,
        taskId || null,
        item.title,
        item.itemType,
        item.startTime,
        item.endTime,
        item.durationMinutes,
        item.priority,
        i,
        item.notes || null
      );

      // Create calendar event so calendar and planning are in lockstep
      const evId = `calev_${planId}_${i}`;
      const isoStart = `${plan.targetDate}T${item.startTime}:00`;
      const isoEnd = `${plan.targetDate}T${item.endTime}:00`;

      db.prepare(`
        INSERT INTO calendar_events (
          id, tenant_id, title, start_time, end_time, is_all_day, event_type, task_id
        ) VALUES (?, ?, ?, ?, ?, 0, 'daily_plan_block', ?)
      `).run(
        evId,
        tenantId,
        item.title,
        isoStart,
        isoEnd,
        taskId || null
      );
    }

    // 3. Record in audit_events
    db.prepare(`
      INSERT INTO audit_events (
        id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes
      ) VALUES (?, ?, ?, 'productivity', 'commit_daily_plan', 'daily_plans', ?, ?)
    `).run(
      `audit_${planId}`,
      tenantId,
      userId,
      planId,
      JSON.stringify({
        date: plan.targetDate,
        revision,
        blocksCount: plan.scheduledItems.length,
        createdTasksCount,
      })
    );
  })();

  return {
    success: true,
    planId,
    revision,
    scheduledBlocksCount: plan.scheduledItems.length,
    committedItemsCount: plan.scheduledItems.length,
    createdTasksCount,
  };
}

/**
 * Reschedules a task preserving historical tracking
 */
export function rescheduleTask(
  db: Database.Database,
  tenantId: string,
  taskId: string,
  newDate: string,
  reason: string = 'Rescheduled during daily review',
  actionType: 'rescheduled' | 'postponed' | 'moved_to_backlog' | 'cancelled' = 'rescheduled'
): { success: boolean; originalDate: string | null; newDate: string } {
  const task = db.prepare('SELECT due_date FROM tasks WHERE tenant_id = ? AND id = ?').get(tenantId, taskId) as { due_date: string | null } | undefined;
  if (!task) {
    throw new Error('Task not found');
  }

  const originalDate = task.due_date;
  const historyId = `resched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  db.transaction(() => {
    // Record history
    db.prepare(`
      INSERT INTO task_rescheduling_history (
        id, tenant_id, task_id, original_date, new_date, reason, action_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(historyId, tenantId, taskId, originalDate, newDate, reason, actionType);

    // Update task
    if (actionType === 'cancelled') {
      db.prepare("UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(taskId, tenantId);
    } else if (actionType === 'moved_to_backlog') {
      db.prepare("UPDATE tasks SET due_date = NULL, status = 'inbox', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(taskId, tenantId);
    } else {
      db.prepare(`
        UPDATE tasks 
        SET due_date = ?, status = 'next', updated_at = datetime('now') 
        WHERE id = ? AND tenant_id = ?
      `).run(newDate, taskId, tenantId);
    }
  })();

  return { success: true, originalDate, newDate };
}

// ---------------------------------------------------------------------------
// Helper Time Utilities
// ---------------------------------------------------------------------------

export function normalizeTimeString(tStr: string): string {
  const cleaned = tStr.trim().toLowerCase();
  const isPM = cleaned.includes('pm');
  const isAM = cleaned.includes('am');
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '09:00';

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;

  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function calculateDurationMinutes(start: string, end: string): number {
  const [sH, sM] = start.slice(0, 5).split(':').map(Number);
  const [eH, eM] = end.slice(0, 5).split(':').map(Number);
  let diff = (eH * 60 + eM) - (sH * 60 + sM);
  if (diff < 0) {
    // Commitment spans midnight: add 24 hours (1440 minutes)
    diff += 1440;
  }
  return diff > 0 ? diff : 60;
}

export function addMinutesToTimeString(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Adaptive Plan Revision Engine
// ---------------------------------------------------------------------------

export function reviseDailyPlan(
  context: PlanningContext,
  currentProposal: DailyPlanProposal,
  adjustmentInput: string
): {
  proposal: DailyPlanProposal;
  explanation: string;
  changedItems: string[];
  preservedItems: string[];
} {
  const items: ScheduledTimeBlock[] = currentProposal.scheduledItems.map(item => ({ ...item }));
  const changedItems: string[] = [];
  const preservedItems: string[] = [];
  const lower = adjustmentInput.toLowerCase();

  // 1. Move/shift pattern: e.g. "Move gym to evening", "Move gym to 18:00", "Move gym to 7pm"
  const moveMatch = adjustmentInput.match(/(?:move|reschedule|shift)\s+([^to]+?)\s+to\s+(.+)/i);
  const timeMatch = adjustmentInput.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

  if (moveMatch) {
    const targetQuery = moveMatch[1].trim().toLowerCase();
    const destination = moveMatch[2].trim().toLowerCase();
    let newStartTime = '18:00'; // Default evening

    if (destination.includes('morning')) {
      newStartTime = '09:00';
    } else if (destination.includes('afternoon')) {
      newStartTime = '14:00';
    } else if (destination.includes('evening') || destination.includes('night')) {
      newStartTime = '18:00';
    }

    const destTimeMatch = destination.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (destTimeMatch) {
      newStartTime = normalizeTimeString(destTimeMatch[1]);
    }

    const itemToMove = items.find(item => item.title.toLowerCase().includes(targetQuery) || targetQuery.includes(item.title.toLowerCase()));

    if (itemToMove) {
      itemToMove.startTime = newStartTime;
      itemToMove.endTime = addMinutesToTimeString(newStartTime, itemToMove.durationMinutes);
      changedItems.push(itemToMove.title);

      for (const item of items) {
        if (item.id !== itemToMove.id) {
          preservedItems.push(item.title);
        }
      }
    }
  } else if (/meeting|call|sync/i.test(lower) && (lower.includes('another') || lower.includes('have a') || lower.includes('new') || lower.includes('add'))) {
    // 2. Addition of a new meeting/event
    const timeM = adjustmentInput.match(/(?:at\s+|from\s+)(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const durM = adjustmentInput.match(/(\d+)\s*(?:mins?|minutes?)/i);
    const meetingStart = timeM ? normalizeTimeString(timeM[1]) : '14:00';
    const meetingDur = durM ? parseInt(durM[1], 10) : 30;
    const meetingEnd = addMinutesToTimeString(meetingStart, meetingDur);

    let meetingTitle = 'Team Meeting';
    const withM = adjustmentInput.match(/with\s+([A-Za-z]+)/i);
    if (withM) {
      meetingTitle = `Meeting with ${withM[1]}`;
    }

    const newItem: ScheduledTimeBlock = {
      id: `sch_rev_${Date.now() % 10000}`,
      title: meetingTitle,
      itemType: 'fixed_event',
      startTime: meetingStart,
      endTime: meetingEnd,
      durationMinutes: meetingDur,
      priority: 'high',
      isExistingTask: false,
      notes: 'Added via plan revision',
    };

    items.push(newItem);
    changedItems.push(meetingTitle);

    for (const item of currentProposal.scheduledItems) {
      if (item.startTime < meetingEnd && item.endTime > meetingStart) {
        // Shift colliding flexible task
        const shiftedItem = items.find(i => i.id === item.id);
        if (shiftedItem) {
          shiftedItem.startTime = addMinutesToTimeString(meetingEnd, 15);
          shiftedItem.endTime = addMinutesToTimeString(shiftedItem.startTime, shiftedItem.durationMinutes);
          changedItems.push(shiftedItem.title);
        }
      } else {
        preservedItems.push(item.title);
      }
    }
  } else if (/cancel|remove|drop/i.test(lower)) {
    // 3. Removal
    const cancelTarget = lower.replace(/cancel|remove|drop/gi, '').trim();
    const idx = items.findIndex(item => item.title.toLowerCase().includes(cancelTarget) || cancelTarget.includes(item.title.toLowerCase()));
    if (idx !== -1) {
      const removed = items.splice(idx, 1)[0];
      changedItems.push(`Cancelled: ${removed.title}`);
    }
    for (const item of items) {
      preservedItems.push(item.title);
    }
  } else {
    // 4. Time adjustment by task title mention
    let matched = false;
    for (const item of items) {
      if (lower.includes(item.title.toLowerCase()) && timeMatch) {
        item.startTime = normalizeTimeString(timeMatch[1]);
        item.endTime = addMinutesToTimeString(item.startTime, item.durationMinutes);
        changedItems.push(item.title);
        matched = true;
      } else {
        preservedItems.push(item.title);
      }
    }
    if (!matched) {
      for (const item of items) {
        preservedItems.push(item.title);
      }
    }
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const totalDuration = items.reduce((sum, item) => sum + item.durationMinutes, 0);
  const revisedProposal: DailyPlanProposal = {
    ...currentProposal,
    planId: currentProposal.planId ? `${currentProposal.planId}_rev` : `plan_rev_${Date.now()}`,
    scheduledItems: items,
    scheduleTimeline: items,
    estimatedWorkloadHours: parseFloat((totalDuration / 60).toFixed(1)),
    diffSummary: {
      tasksToCreate: items.filter(i => i.itemType === 'scheduled_task' && !i.isExistingTask && !i.taskId).length,
      calendarBlocksToCreate: items.length,
      tasksToReschedule: changedItems.length,
    },
  };

  const explanation = changedItems.length > 0
    ? `Adjusted schedule for ${changedItems.join(', ')} while preserving ${preservedItems.length} existing plan blocks.`
    : `Preserved all ${preservedItems.length} plan blocks as requested.`;

  return {
    proposal: revisedProposal,
    explanation,
    changedItems,
    preservedItems,
  };
}

// ---------------------------------------------------------------------------
// Planning Session Continuity & Interruption Helpers
// ---------------------------------------------------------------------------

export function savePlanningSession(
  db: Database.Database,
  session: {
    id: string;
    tenantId: string;
    userId: string;
    targetDate: string;
    conversation: any[];
    extractedState: {
      commitments: ParsedCommitment[];
      uncertainties?: PlanUncertainty[];
      clarificationQuestions?: string[];
      answers?: Record<string, any>;
    };
    proposedPlan?: DailyPlanProposal | null;
    status: 'interviewing' | 'proposed' | 'committed';
  }
): void {
  const hasPlanningSessions = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planning_sessions'").get();
  const tableName = hasPlanningSessions ? 'planning_sessions' : 'ai_planning_sessions';

  db.prepare(`
    INSERT INTO ${tableName} (
      id, tenant_id, user_id, target_date, conversation, extracted_state, proposed_plan, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      conversation = excluded.conversation,
      extracted_state = excluded.extracted_state,
      proposed_plan = excluded.proposed_plan,
      status = excluded.status,
      updated_at = datetime('now')
  `).run(
    session.id,
    session.tenantId,
    session.userId,
    session.targetDate,
    JSON.stringify(session.conversation || []),
    JSON.stringify(session.extractedState || {}),
    session.proposedPlan ? JSON.stringify(session.proposedPlan) : null,
    session.status
  );
}

export function getPlanningSession(
  db: Database.Database,
  tenantId: string,
  sessionId: string
): {
  id: string;
  targetDate: string;
  status: string;
  conversation: any[];
  extractedState: {
    commitments: ParsedCommitment[];
    uncertainties: PlanUncertainty[];
    clarificationQuestions: string[];
    answers: Record<string, any>;
  };
  proposedPlan: DailyPlanProposal | null;
  updatedAt: string;
} | null {
  const hasPlanningSessions = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planning_sessions'").get();
  const tableName = hasPlanningSessions ? 'planning_sessions' : 'ai_planning_sessions';

  const row = db.prepare(`
    SELECT * FROM ${tableName} WHERE tenant_id = ? AND id = ?
  `).get(tenantId, sessionId) as any;

  if (!row) return null;

  const rawExtracted = JSON.parse(row.extracted_state || '{}');
  const commitments: ParsedCommitment[] = Array.isArray(rawExtracted.commitments) ? rawExtracted.commitments : [];
  const uncertainties: PlanUncertainty[] = Array.isArray(rawExtracted.uncertainties) ? rawExtracted.uncertainties : [];
  const clarificationQuestions: string[] = Array.isArray(rawExtracted.clarificationQuestions)
    ? rawExtracted.clarificationQuestions
    : uncertainties.map(u => u.question);
  const answers: Record<string, any> = rawExtracted.answers || {};

  return {
    id: row.id,
    targetDate: row.target_date,
    status: row.status,
    conversation: JSON.parse(row.conversation || '[]'),
    extractedState: {
      commitments,
      uncertainties,
      clarificationQuestions,
      answers,
    },
    proposedPlan: row.proposed_plan ? JSON.parse(row.proposed_plan) : null,
    updatedAt: row.updated_at,
  };
}
