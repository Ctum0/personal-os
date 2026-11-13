import type Database from 'better-sqlite3';
import {
  calculateIncomeAndExpenses,
  calculateBudget,
  calculateSafeToSpend,
} from '@/lib/finance/engine';
import { calculateGoalProgress, calculateHabitStreak, generateDailyPlanProposal } from '@/lib/productivity/engine';
import { todayISO, toISODate } from "@/lib/time";
import { taskVisibleClause } from '@/lib/db/visibility';

export type ToolPermissionLevel = 'read_and_recommend' | 'prepare_and_confirm' | 'auto_execute';

/** Arguments accepted by a tool. Untrusted: each tool narrows what it reads. */
export type ToolArgs = Record<string, unknown>;

export interface AiToolDefinition {
  name: string;
  description: string;
  defaultLevel: ToolPermissionLevel;
  isConsequential: boolean;
  execute: (db: Database.Database, tenantId: string, userId: string, args: ToolArgs) => Promise<unknown> | unknown;
}

/** Shape of a proposed daily-plan payload as produced by generateDailyPlanProposal. */
interface DailyPlanBlockPayload {
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string | null;
}

interface DailyPlanPayload {
  targetDate: string;
  proposedTimeBlocks: DailyPlanBlockPayload[];
}

export interface AiApprovalRequest {
  draftId: string;
  actionType: string;
  targetEntityType: string;
  targetEntityId?: string;
  reason: string;
  diffHash: string;
  proposedPayload: unknown;
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
 * Normalizes a proposed block time to a full timestamp.
 *
 * `generateDailyPlanProposal` already emits `YYYY-MM-DDTHH:mm:ss`, while other
 * producers (and hand-written plans) may supply bare `HH:mm`. Prefixing the date
 * unconditionally produced `2026-11-13T2026-11-13T09:00:00`, which nothing can
 * parse — so the date is only added when the value is time-only.
 */
function toEventTimestamp(targetDate: string, value: string): string {
  if (value.includes('T')) return value;
  return `${targetDate}T${value.length === 5 ? `${value}:00` : value}`;
}

/** 32-bit FNV-style rolling hash used to fingerprint a proposed change. */
function payloadHash(payload: string): string {
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return 'diff_' + Math.abs(hash).toString(16);
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
  proposedPayload: unknown,
  reason: string,
  targetEntityId?: string
): AiApprovalRequest {
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const idempotencyKey = `idem_${draftId}`;
  const payloadStr = JSON.stringify(proposedPayload);
  const diffHash = payloadHash(payloadStr);
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

interface DraftRow {
  id: string;
  user_id: string;
  action_type: string;
  proposed_payload: string;
  target_entity_type: string;
  target_entity_id: string | null;
  status: string;
  expires_at: string;
}

export const DRAFT_DECISIONS = ['approved', 'rejected'] as const;
export type DraftDecision = (typeof DRAFT_DECISIONS)[number];

/**
 * Approves and applies an AI Action Draft.
 *
 * Guards that previously did not exist: the draft must belong to the caller's
 * tenant (query scoping) and to the deciding user, and it must not be expired.
 * An expired draft is a rejected proposal — applying it would commit a decision
 * the operator can no longer see in the pending list.
 */
export function applyAiActionDraft(
  db: Database.Database,
  tenantId: string,
  userId: string,
  draftId: string,
  decision: DraftDecision
): { success: boolean; appliedRecordId?: string; message: string } {
  const draft = db.prepare(`
    SELECT * FROM ai_action_drafts WHERE tenant_id = ? AND id = ?
  `).get(tenantId, draftId) as DraftRow | undefined;

  if (!draft) {
    return { success: false, message: 'Draft proposal not found' };
  }

  if (draft.status !== 'draft') {
    return { success: false, message: `Draft has already been ${draft.status}` };
  }

  if (draft.expires_at <= new Date().toISOString()) {
    db.prepare("UPDATE ai_action_drafts SET status = 'expired' WHERE id = ? AND tenant_id = ?").run(draftId, tenantId);
    return { success: false, message: 'Draft proposal has expired' };
  }

  if (draft.user_id !== userId) {
    return { success: false, message: 'Draft proposal belongs to a different operator' };
  }

  if (decision === 'rejected') {
    db.transaction(() => {
      db.prepare("UPDATE ai_action_drafts SET status = 'rejected' WHERE id = ? AND tenant_id = ?").run(draftId, tenantId);
      // Rejections are audited too: an unaudited rejection is indistinguishable
      // from a draft that was never reviewed.
      db.prepare(`
        INSERT INTO ai_action_approvals (id, tenant_id, draft_id, approved_by, decision, changes_applied, diff_hash)
        VALUES (?, ?, ?, ?, 'rejected', '{}', ?)
      `).run(`appr_${draftId}`, tenantId, draftId, userId, payloadHash(draft.proposed_payload));
      db.prepare(`
        INSERT INTO ai_audit_events (id, tenant_id, user_id, tool_name, input_payload, result_summary, execution_status, policy_decision)
        VALUES (?, ?, ?, ?, ?, ?, 'rejected', 'prepare_and_confirm')
      `).run(
        `audit_${draftId}_rejected`,
        tenantId,
        userId,
        draft.action_type,
        draft.proposed_payload,
        'Operator rejected the draft proposal'
      );
    })();
    return { success: true, message: 'Draft proposal rejected' };
  }

  const payload: unknown = JSON.parse(draft.proposed_payload);
  let appliedId: string | undefined;

  db.transaction(() => {
    switch (draft.action_type) {
      case 'create_task': {
        const task = payload as { title: string; description?: string; priority?: string; dueDate?: string | null; spaceId?: string };
        appliedId = `task_ai_${Date.now()}`;
        const spaceId = task.spaceId || 'space_personal';
        const spaceExists = db.prepare('SELECT id FROM spaces WHERE id = ? AND tenant_id = ?').get(spaceId, tenantId);
        db.prepare(`
          INSERT INTO tasks (id, tenant_id, title, description, priority, due_date, space_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          appliedId,
          tenantId,
          task.title,
          task.description || '',
          task.priority || 'normal',
          task.dueDate || null,
          spaceExists ? spaceId : null
        );
        break;
      }

      case 'apply_daily_plan': {
        // The proposal is produced by generateDailyPlanProposal, whose field is
        // `proposedTimeBlocks`. Reading `timeBlocks` silently applied nothing
        // while reporting success.
        const plan = payload as DailyPlanPayload;
        const blocks = Array.isArray(plan.proposedTimeBlocks) ? plan.proposedTimeBlocks : [];
        if (blocks.length === 0) {
          throw new Error('Daily plan proposal contains no time blocks; nothing to apply');
        }
        for (const block of blocks) {
          const eventId = `ev_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          db.prepare(`
            INSERT INTO calendar_events (id, tenant_id, title, start_time, end_time, event_type, task_id)
            VALUES (?, ?, ?, ?, ?, 'daily_plan_block', ?)
          `).run(
            eventId,
            tenantId,
            block.title,
            toEventTimestamp(plan.targetDate, block.startTime),
            toEventTimestamp(plan.targetDate, block.endTime),
            block.taskId || null
          );
        }
        appliedId = 'plan_applied';
        break;
      }

      case 'update_budget_allocation': {
        const allocation = payload as { allocatedAmount: string; budgetId: string; categoryId: string };
        const result = db.prepare(`
          UPDATE budget_lines
          SET allocated_amount = ?
          WHERE budget_id = ? AND category_id = ? AND tenant_id = ?
        `).run(allocation.allocatedAmount, allocation.budgetId, allocation.categoryId, tenantId);
        if (result.changes === 0) {
          throw new Error('Budget line not found');
        }
        appliedId = allocation.categoryId;
        break;
      }

      default:
        throw new Error(`Unknown action type: ${draft.action_type}`);
    }

    db.prepare("UPDATE ai_action_drafts SET status = 'approved' WHERE id = ? AND tenant_id = ?").run(draftId, tenantId);

    db.prepare(`
      INSERT INTO ai_action_approvals (
        id, tenant_id, draft_id, approved_by, decision, changes_applied, diff_hash
      ) VALUES (?, ?, ?, ?, 'approved', ?, ?)
    `).run(
      `appr_${draftId}`,
      tenantId,
      draftId,
      userId,
      draft.proposed_payload,
      payloadHash(draft.proposed_payload)
    );
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
      const openTasks = (db.prepare(`SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('inbox', 'next', 'in_progress') AND ${taskVisibleClause('tasks')}`).get(tenantId) as { c: number }).c;
      const completedToday = (db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND status = 'completed' AND date(completion_at) = ?").get(tenantId, today) as { c: number }).c;
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
      const requested = typeof args.limit === 'number' ? args.limit : 20;
      const limit = Math.max(1, Math.min(Math.trunc(requested), 200));
      return db.prepare(`
        SELECT id, title, priority, status, due_date, estimated_duration, space_id
        FROM tasks
        WHERE tenant_id = ? AND is_deleted = 0 AND status != 'completed'
          AND ${taskVisibleClause('tasks')}
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
      const targetDate = typeof args.date === 'string' ? args.date : todayISO();
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
      const start = typeof args.startDate === 'string' ? args.startDate : today.slice(0, 7) + '-01';
      const end = typeof args.endDate === 'string' ? args.endDate : today;
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
      const requested = typeof args.days === 'number' ? args.days : 30;
      const days = Math.max(1, Math.min(Math.trunc(requested), 365));
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
      const date = typeof args.date === 'string' ? args.date : todayISO();
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
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : 'New Action Item';
      return createAiActionDraft(
        db,
        tenantId,
        userId,
        'create_task',
        'tasks',
        {
          title,
          description: typeof args.description === 'string' ? args.description : '',
          priority: typeof args.priority === 'string' ? args.priority : 'normal',
          dueDate: typeof args.dueDate === 'string' ? args.dueDate : null,
          spaceId: typeof args.spaceId === 'string' ? args.spaceId : 'space_personal',
        },
        `Create task "${title}"`
      );
    },
  },

  suggest_transaction_category: {
    name: 'suggest_transaction_category',
    description: 'Predicts appropriate category for a merchant or transaction description based on existing categorization history',
    defaultLevel: 'read_and_recommend',
    isConsequential: false,
    execute: (db, tenantId, _, args) => {
      const payee = typeof args.payee === 'string' ? args.payee : '';
      const match = db.prepare(`
        SELECT category_id, count(*) as freq
        FROM journal_transactions
        WHERE tenant_id = ? AND payee_name LIKE ? AND category_id IS NOT NULL
        GROUP BY category_id
        ORDER BY freq DESC LIMIT 1
      `).get(tenantId, `%${payee}%`) as { category_id: string } | undefined;

      if (match) {
        const cat = db.prepare('SELECT id, name, color FROM categories WHERE id = ?').get(match.category_id) as {
          id: string;
          name: string;
          color: string;
        };
        return { suggestedCategory: cat, confidence: 'high' };
      }

      return { suggestedCategory: null, confidence: 'low' };
    },
  },
};
