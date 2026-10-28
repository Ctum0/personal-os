import { describe, it, expect, beforeEach } from 'vitest';
import { getInMemoryDb } from '../lib/db';
import { evaluateFormula, validateFormula } from '../lib/customization/formula';
import {
  checkToolPermission,
  createAiActionDraft,
  applyAiActionDraft,
  AI_TOOLS,
} from '../lib/ai/tools';
import type Database from 'better-sqlite3';

describe('Customization Safe Formula & Agentic AI Engine', () => {
  let db: Database.Database;
  const tenantId = 'tenant_ai_test';
  const userId = 'user_ai_test';

  beforeEach(() => {
    db = getInMemoryDb();
    db.prepare("INSERT INTO tenants (id, name, slug) VALUES (?, 'Test AI Tenant', 'ai-test')").run(tenantId);
    db.prepare("INSERT INTO users (id, tenant_id, email, name) VALUES (?, ?, 'ai@test.local', 'AI Tester')").run(userId, tenantId);
  });

  describe('Safe Formula Evaluator', () => {
    it('evaluates basic arithmetic and operator precedence without arbitrary execution', () => {
      const res = evaluateFormula('10 + 5 * 2', { variables: {} });
      expect(res.success).toBe(true);
      expect(res.value).toBe(20);
    });

    it('handles variable substitutions safely', () => {
      const res = evaluateFormula('completed_tasks / total_tasks * 100', {
        variables: { completed_tasks: 8, total_tasks: 10 },
      });
      expect(res.success).toBe(true);
      expect(res.value).toBe(80);
    });

    it('safely catches division by zero errors without crashing', () => {
      const res = evaluateFormula('100 / 0', { variables: {} });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Division by zero');
    });

    it('evaluates logical expressions and IF conditionals', () => {
      const res = evaluateFormula("IF(spent > budget, 'Over Budget', 'On Track')", {
        variables: { spent: 650, budget: 500 },
      });
      expect(res.success).toBe(true);
      expect(res.value).toBe('Over Budget');

      const res2 = evaluateFormula("IF(spent > budget, 'Over Budget', 'On Track')", {
        variables: { spent: 400, budget: 500 },
      });
      expect(res2.success).toBe(true);
      expect(res2.value).toBe('On Track');
    });

    it('evaluates ROUND and math functions', () => {
      const res = evaluateFormula('ROUND(45.6789, 2)', { variables: {} });
      expect(res.success).toBe(true);
      expect(res.value).toBe(45.68);
    });
  });

  describe('Agentic AI Policy & Approval Workflow', () => {
    it('verifies AI tool permissions correctly from policy registry', () => {
      db.prepare(`
        INSERT INTO ai_tool_policies (id, tenant_id, tool_name, permission_level, is_enabled)
        VALUES 
          ('p1', ?, 'get_daily_summary', 'read_and_recommend', 1),
          ('p2', ?, 'draft_daily_plan', 'prepare_and_confirm', 1),
          ('p3', ?, 'disabled_tool', 'read_and_recommend', 0)
      `).run(tenantId, tenantId, tenantId);

      const check1 = checkToolPermission(db, tenantId, 'get_daily_summary');
      expect(check1.allowed).toBe(true);
      expect(check1.level).toBe('read_and_recommend');

      const check2 = checkToolPermission(db, tenantId, 'draft_daily_plan');
      expect(check2.allowed).toBe(true);
      expect(check2.level).toBe('prepare_and_confirm');

      const check3 = checkToolPermission(db, tenantId, 'disabled_tool');
      expect(check3.allowed).toBe(false);
    });

    it('creates AI action draft, generates diff hash, and requires explicit user approval', () => {
      const draft = createAiActionDraft(
        db,
        tenantId,
        userId,
        'create_task',
        'tasks',
        { title: 'AI Suggested Action Item', priority: 'high', dueDate: '2026-11-01' },
        'Detected upcoming project deadline with missing subtask'
      );

      expect(draft.draftId).toBeDefined();
      expect(draft.diffHash).toBeDefined();

      // Ensure task is NOT yet in tasks table before approval
      const tasksBefore = db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND title = 'AI Suggested Action Item'").get(tenantId) as { c: number };
      expect(tasksBefore.c).toBe(0);

      // Now approve the draft
      const result = applyAiActionDraft(db, tenantId, userId, draft.draftId, 'approved');
      expect(result.success).toBe(true);

      // Verify task is now inserted
      const tasksAfter = db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND title = 'AI Suggested Action Item'").get(tenantId) as { c: number };
      expect(tasksAfter.c).toBe(1);
    });

    it('safely handles draft rejection without applying state mutations', () => {
      const draft = createAiActionDraft(
        db,
        tenantId,
        userId,
        'create_task',
        'tasks',
        { title: 'Rejected Task Idea' },
        'User decided against this suggestion'
      );

      const result = applyAiActionDraft(db, tenantId, userId, draft.draftId, 'rejected');
      expect(result.success).toBe(true);

      const tasks = db.prepare("SELECT count(*) as c FROM tasks WHERE tenant_id = ? AND title = 'Rejected Task Idea'").get(tenantId) as { c: number };
      expect(tasks.c).toBe(0);
    });
  });
});
