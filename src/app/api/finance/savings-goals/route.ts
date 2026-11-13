import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { Decimal } from 'decimal.js';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalISODate,
  optionalMoney,
  optionalString,
  requiredMoney,
  requiredString,
} from '@/lib/api/fields';

interface SavingsGoalRow {
  id: string;
  name: string;
  target_amount: string;
  current_amount: string;
  currency: string;
  target_date: string | null;
  linked_account_id: string | null;
  linked_goal_id: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  linked_account_name: string | null;
}

function readCurrency(value: unknown): string {
  const currency = optionalString(value, 'currency', 10) ?? 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new FieldError('currency must be a 3-letter ISO code (e.g. USD)');
  }
  return currency;
}

function assertLinkedAccount(
  db: Database.Database,
  tenantId: string,
  linkedAccountId: string | undefined
): void {
  if (!linkedAccountId) return;
  const acc = db
    .prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?')
    .get(linkedAccountId, tenantId);
  if (!acc) notFound('Linked account');
}

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const goals = db.prepare(`
      SELECT sg.*, a.name as linked_account_name
      FROM savings_goals sg
      LEFT JOIN finance_accounts a ON sg.linked_account_id = a.id
      WHERE sg.tenant_id = ?
      ORDER BY sg.status ASC, sg.target_date ASC
    `).all(session.tenantId) as SavingsGoalRow[];

    const withProgress = goals.map(g => {
      const target = new Decimal(g.target_amount || '1');
      const current = new Decimal(g.current_amount || '0');
      const percent = target.greaterThan(0)
        ? current.dividedBy(target).times(100).toFixed(1)
        : '0.0';

      return {
        ...g,
        progressPercent: parseFloat(percent),
      };
    });

    return ok({ savingsGoals: withProgress });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const name = requiredString(body.name, 'name', 200);
    const target = requiredMoney(body.targetAmount, 'targetAmount');
    const current = optionalMoney(body.currentAmount, 'currentAmount') ?? '0.00';
    const currency = readCurrency(body.currency);
    const targetDate = optionalISODate(body.targetDate, 'targetDate');
    const linkedAccountId = optionalString(body.linkedAccountId, 'linkedAccountId', 100);
    const notes = optionalString(body.notes, 'notes', 2000) ?? '';

    assertLinkedAccount(db, session.tenantId, linkedAccountId);

    const goalId = `sg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO savings_goals (
        id, tenant_id, name, target_amount, current_amount, currency, target_date, linked_account_id, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      goalId,
      session.tenantId,
      name,
      target,
      current,
      currency,
      targetDate ?? null,
      linkedAccountId ?? null,
      notes
    );

    const created = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?')
      .get(goalId, session.tenantId);
    return ok({ savingsGoal: created }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const id = requiredString(body.id, 'id', 100);
    const existing = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId) as SavingsGoalRow | undefined;
    if (!existing) notFound('Goal');

    const name = optionalString(body.name, 'name', 200);
    const targetAmount = optionalMoney(body.targetAmount, 'targetAmount');
    if (targetAmount !== undefined && Number(targetAmount) <= 0) {
      throw new FieldError('targetAmount must be greater than zero');
    }
    const currentAmount = optionalMoney(body.currentAmount, 'currentAmount');
    const status = optionalString(body.status, 'status', 40);
    const targetDate = optionalISODate(body.targetDate, 'targetDate');
    const notes = optionalString(body.notes, 'notes', 2000);

    db.prepare(`
      UPDATE savings_goals
      SET 
        name = coalesce(?, name),
        target_amount = coalesce(?, target_amount),
        current_amount = coalesce(?, current_amount),
        status = coalesce(?, status),
        target_date = coalesce(?, target_date),
        notes = coalesce(?, notes),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      name ?? null,
      targetAmount ?? null,
      currentAmount ?? null,
      status ?? null,
      targetDate ?? null,
      notes ?? null,
      id,
      session.tenantId
    );

    const updated = db
      .prepare('SELECT * FROM savings_goals WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId);
    return ok({ savingsGoal: updated });
  } catch (err) {
    return routeError(err);
  }
});
