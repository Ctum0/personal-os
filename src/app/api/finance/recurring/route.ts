import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalEnum,
  optionalInt,
  optionalISODate,
  optionalString,
  requiredISODate,
  requiredMoney,
  requiredString,
} from '@/lib/api/fields';

const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
const VALID_AUTO_ACTIONS = ['reminder_only', 'auto_post', 'draft_transaction'] as const;

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const rules = db.prepare(`
      SELECT r.*, a.name as account_name, c.name as category_name, c.color as category_color
      FROM recurring_financial_rules r
      LEFT JOIN finance_accounts a ON r.account_id = a.id
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.tenant_id = ?
      ORDER BY r.is_active DESC, r.next_due_date ASC
    `).all(session.tenantId);

    return ok({ recurringRules: rules });
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
    const amount = requiredMoney(body.expectedAmount, 'expectedAmount');
    const accountId = requiredString(body.accountId, 'accountId', 100);
    const nextDueDate = requiredISODate(body.nextDueDate, 'nextDueDate');
    const frequency = optionalEnum(body.frequency, 'frequency', VALID_FREQUENCIES) ?? 'monthly';
    const autoAction = optionalEnum(body.autoAction, 'autoAction', VALID_AUTO_ACTIONS) ?? 'reminder_only';
    const intervalCount = optionalInt(body.intervalCount, 'intervalCount', 1, 3650) ?? 1;
    const dayOfMonth = optionalInt(body.dayOfMonth, 'dayOfMonth', 1, 31) ?? 1;
    const startDate = optionalISODate(body.startDate, 'startDate') ?? todayISO();
    const ruleType = optionalString(body.ruleType, 'ruleType', 40) ?? 'bill';
    const categoryId = optionalString(body.categoryId, 'categoryId', 100);

    const account = db
      .prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?')
      .get(accountId, session.tenantId);
    if (!account) notFound('Account');

    if (categoryId) {
      const cat = db
        .prepare('SELECT id FROM categories WHERE id = ? AND tenant_id = ?')
        .get(categoryId, session.tenantId);
      if (!cat) notFound('Category');
    }

    const ruleId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO recurring_financial_rules (
        id, tenant_id, name, rule_type, frequency, interval_count, day_of_month, start_date, expected_amount, account_id, category_id, auto_action, next_due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ruleId,
      session.tenantId,
      name,
      ruleType,
      frequency,
      intervalCount,
      dayOfMonth,
      startDate,
      amount,
      accountId,
      categoryId ?? null,
      autoAction,
      nextDueDate
    );

    const created = db
      .prepare('SELECT * FROM recurring_financial_rules WHERE id = ? AND tenant_id = ?')
      .get(ruleId, session.tenantId);
    return ok({ recurringRule: created }, 201);
  } catch (err) {
    return routeError(err);
  }
});
