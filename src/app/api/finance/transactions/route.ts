import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from '@/lib/time';
import { detectDuplicateTransaction, transactionFingerprint } from '@/lib/finance/engine';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalBoolean,
  optionalEnum,
  optionalISODate,
  optionalString,
  requiredMoney,
  requiredString,
} from '@/lib/api/fields';

const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'refund'] as const;
const TRANSACTION_STATUSES = ['posted', 'pending'] as const;
const RECURRING_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
const RECURRING_RULE_TYPES = ['bill', 'subscription', 'loan_payment', 'income'] as const;

interface TransactionRow {
  id: string;
}

interface AccountRow {
  id: string;
  currency: string;
}

interface RecurringConfigInput {
  isRecurring: boolean;
  frequency: string;
  nextDueDate: string | undefined;
  ruleType: string;
}

/**
 * Normalizes the `tags` payload into the JSON string stored on the row.
 * Arrays are serialized as-is, a JSON string is passed through, a bare string
 * becomes a single-element array, and anything else is a client error.
 */
function readTags(value: unknown): string {
  if (value === undefined || value === null || value === '') return '[]';
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((tag, index) => {
        if (typeof tag !== 'string') {
          throw new FieldError(`tags[${index}] must be a string`);
        }
        return tag;
      })
    );
  }
  if (typeof value === 'string') {
    return value.trim().startsWith('[') ? value : JSON.stringify([value]);
  }
  throw new FieldError('tags must be an array of strings');
}

function readRecurringConfig(value: unknown, txType: string): RecurringConfigInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new FieldError('recurringConfig must be an object');
  }
  const cfg = value as Record<string, unknown>;
  return {
    isRecurring: optionalBoolean(cfg.isRecurring, 'recurringConfig.isRecurring') ?? false,
    frequency: optionalEnum(cfg.frequency, 'recurringConfig.frequency', RECURRING_FREQUENCIES) ?? 'monthly',
    nextDueDate: optionalISODate(cfg.nextDueDate, 'recurringConfig.nextDueDate'),
    ruleType:
      optionalEnum(cfg.ruleType, 'recurringConfig.ruleType', RECURRING_RULE_TYPES) ??
      (txType === 'income' ? 'income' : 'bill'),
  };
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const categoryId = searchParams.get('categoryId');
    const transactionType = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    let query = `
      SELECT t.*, a.name as account_name, a.currency as account_currency, 
             to_a.name as to_account_name, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM journal_transactions t
      LEFT JOIN finance_accounts a ON t.account_id = a.id
      LEFT JOIN finance_accounts to_a ON t.to_account_id = to_a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.tenant_id = ?
    `;
    const params: Array<string | number> = [session.tenantId];

    if (accountId && accountId !== 'all') {
      query += ' AND (t.account_id = ? OR t.to_account_id = ?)';
      params.push(accountId, accountId);
    }
    if (categoryId && categoryId !== 'all') {
      query += ' AND t.category_id = ?';
      params.push(categoryId);
    }
    if (transactionType && transactionType !== 'all') {
      query += ' AND t.transaction_type = ?';
      params.push(transactionType);
    }
    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    if (search) {
      query += ' AND (t.description LIKE ? OR t.payee_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC LIMIT 100';

    // Opt-in pagination: default limit preserved (100, matching the historical
    // cap) so page behavior is untouched; callers may send ?limit/?offset and
    // now receive an accurate total for paging/count-based UI.
    const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
    const rawOffset = Number.parseInt(searchParams.get('offset') || '', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 500)) : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    // Fanout check: LEFT JOINs are many-to-one (account, category) so the
    // filtered base row count equals the joined row count and a plain COUNT is
    // safe here.
    const countSql = query.replace(/LIMIT \d+\s*$/, '').replace(/SELECT(.|\s)*?FROM/i, 'SELECT COUNT(*) AS c FROM');
    const total = (db.prepare(countSql).get(...params) as { c: number }).c;

    query = query.replace(/\sLIMIT\s+\d+\s*$/i, '') + ' LIMIT ? OFFSET ?';
    const transactions = db.prepare(query).all(...params, limit, offset);

    return ok({ transactions, total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const accountId = requiredString(body.accountId, 'accountId', 100);
    const amount = requiredMoney(body.amount, 'amount');
    const description = requiredString(body.description, 'description', 2000);
    const txType = optionalEnum(body.transactionType, 'transactionType', TRANSACTION_TYPES) ?? 'expense';
    const date = optionalISODate(body.date, 'date');
    const toAccountId = optionalString(body.toAccountId, 'toAccountId', 100);
    const categoryId = optionalString(body.categoryId, 'categoryId', 100);
    const payeeName = optionalString(body.payeeName, 'payeeName', 200);
    const notes = optionalString(body.notes, 'notes', 2000);
    const txStatus = optionalEnum(body.status, 'status', TRANSACTION_STATUSES) ?? 'posted';
    const tagsJson = readTags(body.tags);
    const recurringConfig = readRecurringConfig(body.recurringConfig, txType);

    // Source account is also the currency source for the whole entry.
    const acc = db
      .prepare('SELECT id, currency FROM finance_accounts WHERE id = ? AND tenant_id = ?')
      .get(accountId, session.tenantId) as AccountRow | undefined;
    if (!acc) notFound('Source account');

    // Category must exist within the tenant (prevents cross-tenant category ids)
    if (categoryId) {
      const cat = db
        .prepare('SELECT id FROM categories WHERE id = ? AND tenant_id = ?')
        .get(categoryId, session.tenantId);
      if (!cat) notFound('Category');
    }

    // For transfers, verify destination account exists and belongs to current tenant
    if (txType === 'transfer') {
      if (!toAccountId) {
        throw new FieldError('Destination account is required for transfer');
      }
      if (toAccountId === accountId) {
        throw new FieldError('Destination account must be different from source account');
      }
      const toAcc = db
        .prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?')
        .get(toAccountId, session.tenantId);
      if (!toAcc) notFound('Destination account');
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const txDate = date ?? todayISO();
    const currency = acc.currency || 'USD';

    // Strict mode (?strict=1): hard-reject a byte-identical posted duplicate
    // using the persisted v5 fingerprint. Advisory mode (default) keeps the
    // B6 behavior: create anyway, return a duplicateWarning flag.
    const fingerprint = transactionFingerprint(session.tenantId, {
      accountId,
      date: txDate,
      transactionType: txType,
      amount,
    });
    const strictMode = new URL(request.url).searchParams.get('strict') === '1';
    if (strictMode && txStatus === 'posted') {
      const existing = db
        .prepare(
          `SELECT id FROM journal_transactions
           WHERE tenant_id = ? AND dup_fingerprint = ? AND status = 'posted'
           LIMIT 1`
        )
        .get(session.tenantId, fingerprint) as TransactionRow | undefined;
      if (existing) {
        return ok(
          {
            error: 'Duplicate transaction rejected (strict mode)',
            duplicateOf: existing.id,
            fingerprint,
          },
          409
        );
      }
    }

    db.transaction(() => {
      // 1. Insert master transaction
      db.prepare(`
        INSERT INTO journal_transactions (
          id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, payee_name, category_id, description, notes, tags, status, dup_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        session.tenantId,
        txType,
        txDate,
        accountId,
        toAccountId ?? null,
        amount,
        currency,
        amount,
        payeeName ?? null,
        categoryId ?? null,
        description,
        notes ?? null,
        tagsJson,
        txStatus,
        fingerprint
      );

      // 2. Insert balanced ledger lines (debit / credit) when status is posted
      if (txStatus === 'posted') {
        if (txType === 'income') {
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, amount, currency, amount, description);
        } else if (txType === 'expense') {
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, amount, currency, amount, description);
        } else if (txType === 'transfer') {
          if (!toAccountId) {
            throw new FieldError('Destination account is required for transfer');
          }
          // Credit source account (money out)
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, amount, currency, amount, `Transfer to ${toAccountId}`);

          // Debit destination account (money in)
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_2`, session.tenantId, txId, toAccountId, amount, currency, amount, `Transfer from ${accountId}`);
        } else if (txType === 'refund') {
          // Refund is debit into asset account
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, amount, currency, amount, `Refund: ${description}`);
        }
      }

      // 3. Optional recurring rule generation
      if (recurringConfig?.isRecurring) {
        const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO recurring_financial_rules (
            id, tenant_id, name, rule_type, frequency, start_date, next_due_date, expected_amount, currency, account_id, to_account_id, category_id, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          recId,
          session.tenantId,
          description,
          recurringConfig.ruleType,
          recurringConfig.frequency,
          txDate,
          recurringConfig.nextDueDate ?? txDate,
          amount,
          currency,
          accountId,
          toAccountId ?? null,
          categoryId ?? null
        );
      }

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'finance', 'create_transaction', 'journal_transaction', ?, ?)
      `).run(`aud_${txId}`, session.tenantId, session.userId, txId, JSON.stringify(body));
    })();

    const created = db
      .prepare('SELECT * FROM journal_transactions WHERE id = ? AND tenant_id = ?')
      .get(txId, session.tenantId);

    // Advisory duplicate warning (B6): same account + date + type + amount already
    // posted. Response-only flag; nothing is blocked or mutated.
    const duplicateWarning = detectDuplicateTransaction(db, session.tenantId, {
      accountId,
      date: txDate,
      transactionType: txType,
      amount,
      excludeTransactionId: txId,
    });

    return ok({ transaction: created, duplicateWarning }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return ok({ error: 'Transaction ID is required' }, 400);
    }

    let updated = 0;
    db.transaction(() => {
      // Per spec: financial corrections preserve history or mark as reversed/voided.
      // journal_lines are preserved intact for immutable audit history.
      const existing = db
        .prepare('SELECT id, status FROM journal_transactions WHERE id = ? AND tenant_id = ?')
        .get(id, session.tenantId) as { id: string; status: string } | undefined;
      if (!existing) return;

      updated = db
        .prepare(
          `UPDATE journal_transactions
           SET status = 'voided', updated_at = datetime('now')
           WHERE id = ? AND tenant_id = ?`
        )
        .run(id, session.tenantId).changes;

      // Idempotent: re-voiding a voided transaction does not duplicate audit rows.
      if (existing.status !== 'voided') {
        db.prepare(`
          INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
          VALUES (?, ?, ?, 'finance', 'void_transaction', 'journal_transaction', ?, '{}')
        `).run(`aud_void_${id}`, session.tenantId, session.userId, id);
      }
    })();

    if (updated === 0) notFound('Transaction');

    return ok({ success: true });
  } catch (err) {
    return routeError(err);
  }
});
