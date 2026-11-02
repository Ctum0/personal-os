import type Database from 'better-sqlite3';
import { calculateAccountBalances, calculateIncomeAndExpenses, calculateBudget, calculateSafeToSpend } from '@/lib/finance/engine';
import { calculateProjectProgress, calculateGoalProgress, calculateHabitStreak, generateDailyPlanProposal } from '@/lib/productivity/engine';
import { todayISO, toISODate } from "@/lib/time";

export type ToolPermissionLevel = 'read_and_recommend' | 'prepare_and_confirm' | 'auto_execute';

export interface AiToolDefinition {
  name: string;
  description: string;
  defaultLevel: ToolPermissionLevel;
  isConsequential: boolean;
  execute: (db: Database.Database, tenantId: string, userId: string, args: any) => Promise<any> | any;
}

export interface AiApprovalRequest {
  draftId: string;
  actionType: string;
  targetEntityType: string;
  targetEntityId?: string;
  reason: string;
  diffHash: string;
  proposedPayload: any;
  reversible: boolean;
}

/**
 * Validates permission policy before executing an AI tool
 */
export function checkToolPermission(
  db: Database.Database,
  tenantId: string,
  toolName: string
): { allowed: boolean; level: ToolPermissionLevel } {
  const policy = db.prepare(`
    SELECT permission_level, is_enabled 
    FROM ai_tool_policies 
    WHERE tenant_id = ? AND tool_name = ?
  `).get(tenantId, toolName) as { permission_level: ToolPermissionLevel; is_enabled: number } | undefined;

  if (!policy || policy.is_enabled === 0) {
    return { allowed: false, level: 'prepare_and_confirm' };
  }

  return { allowed: true, level: policy.permission_level };
}

/**
 * Creates an AI Action Draft requiring user confirmation
 */
export function createAiActionDraft(
  db: Database.Database,
  tenantId: string,
  userId: string,
  actionType: string,
  targetEntityType: string,
  proposedPayload: any,
  reason: string,
  targetEntityId?: string
): AiApprovalRequest {
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = `idem_${draftId}`;
  const payloadStr = JSON.stringify(proposedPayload);
  
  // Compute deterministic hash of the change
  let hash = 0;
  for (let i = 0; i < payloadStr.length; i++) {
    hash = (hash << 5) - hash + payloadStr.charCodeAt(i);
    hash |= 0;
  }
  const diffHash = 'diff_' + Math.abs(hash).toString(16);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO ai_action_drafts (
      id, tenant_id, user_id, action_type, proposed_payload, target_entity_type, target_entity_id, reason, status, idempotency_key, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    draftId,
    tenantId,
    userId,
    actionType,
    payloadStr,
    targetEntityType,
    targetEntityId || null,
    reason,
    idempotencyKey,
    expiresAt
  );

  // Log in AI audit events
  db.prepare(`
    INSERT INTO ai_audit_events (
      id, tenant_id, user_id, tool_name, input_payload, result_summary, execution_status, policy_decision
    ) VALUES (?, ?, ?, ?, ?, ?, 'prepared', 'prepare_and_confirm')
  `).run(
    `audit_${draftId}`,
    tenantId,
    userId,
    actionType,
    payloadStr,
    `Created draft proposal for ${actionType}: ${reason}`
  );

  return {
    draftId,
    actionType,
    targetEntityType,
    targetEntityId,
    reason,
    diffHash,
    proposedPayload,
    reversible: true,
  };
}

/**
 * Approves and applies an AI Action Draft
 */
export function applyAiActionDraft(
  db: Database.Database,
  tenantId: string,
  userId: string,
  draftId: string,
  decision: 'approved' | 'rejected'
): { success: boolean; appliedRecordId?: string; message: string } {
  const draft = db.prepare(`
    SELECT * FROM ai_action_drafts WHERE tenant_id = ? AND id = ?
  `).get(tenantId, draftId) as {
    id: string;
    action_type: string;
    proposed_payload: string;
    target_entity_type: string;
    target_entity_id: string | null;
    status: string;
  } | undefined;

  if (!draft) {
    return { success: false, message: 'Draft proposal not found' };
  }

  if (draft.status !== 'draft') {
    return { success: false, message: `Draft has already been ${draft.status}` };
  }

  if (decision === 'rejected') {
    db.prepare("UPDATE ai_action_drafts SET status = 'rejected' WHERE id = ?").run(draftId);
    return { success: true, message: 'Draft proposal rejected' };
  }

  const payload = JSON.parse(draft.proposed_payload);
  let appliedId: string | undefined;

  db.transaction(() => {
    switch (draft.action_type) {
      case 'create_task':
        appliedId = `task_ai_${Date.now()}`;
        db.prepare(`
          INSERT INTO tasks (id, tenant_id, title, description, priority, due_date, space_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          appliedId,
          tenantId,
          payload.title,
          payload.description || '',
          payload.priority || 'normal',
          payload.dueDate || null,
          payload.spaceId || 'space_personal'
        );
        break;

      case 'apply_daily_plan':
        for (const block of payload.timeBlocks || []) {
          const eventId = `ev_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          db.prepare(`
            INSERT INTO calendar_events (id, tenant_id, title, start_time, end_time, event_type, task_id)
            VALUES (?, ?, ?, ?, ?, 'time_block', ?)
          `).run(eventId, tenantId, block.title, block.startTime, block.endTime, block.taskId || null);
        }
        appliedId = 'plan_applied';
        break;

      case 'update_budget_allocation':
        db.prepare(`
          UPDATE budget_lines 
          SET allocated_amount = ?
          WHERE budget_id = ? AND category_id = ? AND tenant_id = ?
        `).run(payload.allocatedAmount, payload.budgetId, payload.categoryId, tenantId);
        appliedId = payload.categoryId;
        break;

      default:
        throw new Error(`Unknown action type: ${draft.action_type}`);
    }

    db.prepare("UPDATE ai_action_drafts SET status = 'approved' WHERE id = ?").run(draftId);

    db.prepare(`
      INSERT INTO ai_action_approvals (
        id, tenant_id, draft_id, approved_by, decision, changes_applied, diff_hash
      ) VALUES (?, ?, ?, ?, 'approved', ?, 'diff_applied')
    `).run(`appr_${draftId}`, tenantId, draftId, userId, draft.proposed_payload);
  })();

  return { success: true, appliedRecordId: appliedId, message: 'Changes approved and committed to system' };
}

/**
 * Server-side AI Tools Registry adhering to Spec Section 10.2
 */
export const AI_TOOLS: Record<string, AiToolDefinition> = {
  get_daily_summary: {
    name: 'get_daily_summary',
    description: 'Retrieves high level overview of today tasks, schedule, habit completion, and safe-to-spend pulse',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId) => {
      const today = todayISO();
      const openTasks = (db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('inbox', 'next', 'in_progress')").get(tenantId) as any).c;
      const completedToday = (db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND status = 'completed' AND date(completion_at) = ?").get(tenantId, today) as any).c;
      const safeSpend = calculateSafeToSpend(db, tenantId);
      return {
        date: today,
        openTasksCount: openTasks,
        completedTasksToday: completedToday,
        safeToSpend: safeSpend.safeToSpendAmount,
        currency: safeSpend.currency,
      };
    },
  },

  list_tasks: {
    name: 'list_tasks',
    description: 'Lists open and high-priority tasks with deadlines',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const limit = args?.limit || 20;
      return db.prepare(`
        SELECT id, title, priority, status, due_date, estimated_duration, space_id
        FROM tasks
        WHERE tenant_id = ? AND is_deleted = 0 AND status != 'completed'
        ORDER BY 
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END ASC,
          due_date ASC
        LIMIT ?
      `).all(tenantId, limit);
    },
  },

  get_calendar_availability: {
    name: 'get_calendar_availability',
    description: 'Finds booked and free slots for a given target date',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const targetDate = args?.date || todayISO();
      return db.prepare(`
        SELECT id, title, start_time, end_time, event_type
        FROM calendar_events
        WHERE tenant_id = ? AND date(start_time) = ?
        ORDER BY start_time ASC
      `).all(tenantId, targetDate);
    },
  },

  get_goal_progress: {
    name: 'get_goal_progress',
    description: 'Returns progress calculations for active goals',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId) => {
      const goals = db.prepare("SELECT id FROM goals WHERE tenant_id = ? AND status != 'abandoned'").all(tenantId) as Array<{ id: string }>;
      return goals.map(g => calculateGoalProgress(db, tenantId, g.id));
    },
  },

  get_habit_summary: {
    name: 'get_habit_summary',
    description: 'Returns streak, completion rate, and today status for all active habits',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId) => {
      const habits = db.prepare('SELECT id FROM habits WHERE tenant_id = ? AND is_paused = 0').all(tenantId) as Array<{ id: string }>;
      return habits.map(h => calculateHabitStreak(db, tenantId, h.id));
    },
  },

  get_spending_summary: {
    name: 'get_spending_summary',
    description: 'Returns income vs expense figures calculated from authoritative posted ledger',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const today = todayISO();
      const start = args?.startDate || today.slice(0, 7) + '-01';
      const end = args?.endDate || today;
      return calculateIncomeAndExpenses(db, tenantId, start, end);
    },
  },

  get_budget_status: {
    name: 'get_budget_status',
    description: 'Returns active budget allocations, spend, and remaining amounts',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId) => {
      return calculateBudget(db, tenantId);
    },
  },

  list_upcoming_obligations: {
    name: 'list_upcoming_obligations',
    description: 'Lists upcoming recurring bills and scheduled payments',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const days = args?.days || 30;
      const today = todayISO();
      const future = new Date();
      future.setDate(future.getDate() + days);
      const endDate = toISODate(future);

      return db.prepare(`
        SELECT r.id, r.name, r.expected_amount, r.currency, r.next_due_date, r.rule_type, a.name as account_name
        FROM recurring_financial_rules r
        JOIN finance_accounts a ON r.account_id = a.id
        WHERE r.tenant_id = ? AND r.is_active = 1 AND r.next_due_date >= ? AND r.next_due_date <= ?
        ORDER BY r.next_due_date ASC
      `).all(tenantId, today, endDate);
    },
  },

  draft_daily_plan: {
    name: 'draft_daily_plan',
    description: 'Creates a proposed daily plan and prepares it for user approval',
    defaultLevel: 'prepare_and_confirm',
    isConsequential: true,
    execute: (db, tenantId, userId, args) => {
      const date = args?.date || todayISO();
      const proposal = generateDailyPlanProposal(db, tenantId, date);
      return createAiActionDraft(
        db,
        tenantId,
        userId,
        'apply_daily_plan',
        'calendar_events',
        proposal,
        `Proposed daily plan with ${proposal.proposedTimeBlocks.length} prioritized blocks for ${date}`
      );
    },
  },

  create_task_draft: {
    name: 'create_task_draft',
    description: 'Prepares a new task draft with title, priority, due date for user confirmation',
    defaultLevel: 'prepare_and_confirm',
    isConsequential: true,
    execute: (db, tenantId, userId, args) => {
      return createAiActionDraft(
        db,
        tenantId,
        userId,
        'create_task',
        'tasks',
        {
          title: args.title,
          description: args.description || '',
          priority: args.priority || 'normal',
          dueDate: args.dueDate || null,
          spaceId: args.spaceId || 'space_personal',
        },
        `Create task "${args.title}"`
      );
    },
  },

  suggest_transaction_category: {
    name: 'suggest_transaction_category',
    description: 'Predicts appropriate category for a merchant or transaction description based on existing categorization history',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const payee = args?.payee || '';
      const match = db.prepare(`
        SELECT category_id, count(*) as freq 
        FROM journal_transactions
        WHERE tenant_id = ? AND payee_name LIKE ? AND category_id IS NOT NULL
        GROUP BY category_id
        ORDER BY freq DESC LIMIT 1
      `).get(tenantId, `%${payee}%`) as { category_id: string } | undefined;

      if (match) {
        const cat = db.prepare('SELECT id, name, color FROM categories WHERE id = ?').get(match.category_id) as any;
        return { suggestedCategory: cat, confidence: 'high' };
      }

      // Default fallback
      return { suggestedCategory: null, confidence: 'low' };
    },
  },
};
