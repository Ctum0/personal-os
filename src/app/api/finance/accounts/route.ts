import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateAccountBalances } from '@/lib/finance/engine';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';
import { optionalEnum, optionalMoney, optionalNumber, optionalString, requiredString } from '@/lib/api/fields';

const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'cash',
  'credit_card',
  'loan',
  'investment',
  'liability',
] as const;

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const accounts = calculateAccountBalances(db, session.tenantId);
    return ok({ accounts });
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
    const type = optionalEnum(body.type, 'type', ACCOUNT_TYPES) ?? 'checking';
    // Opening balance may legitimately be negative (liability accounts carry a
    // debit balance), so it is read as a finite number, not as positive money.
    const openingBalance = (optionalNumber(body.openingBalance, 'openingBalance') ?? 0).toFixed(2);
    const currencyInput = optionalString(body.currency, 'currency', 3) ?? 'USD';
    if (!/^[A-Z]{3}$/.test(currencyInput)) {
      throw new FieldError('currency must be a 3-letter ISO code (e.g. USD)');
    }
    const institution = optionalString(body.institution, 'institution', 200);
    const maskedNumber = optionalString(body.maskedNumber, 'maskedNumber', 40);
    const color = optionalString(body.displayColor, 'displayColor', 20) ?? '#3b82f6';
    // Credit lines need a limit for "include available credit" to mean anything:
    // headroom = limit - balance owed. Read as non-negative money, stored as TEXT
    // like every other amount in the ledger.
    const creditLimit = optionalMoney(body.creditLimit, 'creditLimit') ?? null;

    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO finance_accounts (
        id, tenant_id, name, type, currency, opening_balance, institution, masked_number, display_color, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId,
      session.tenantId,
      name,
      type,
      currencyInput,
      openingBalance,
      institution ?? null,
      maskedNumber ?? null,
      color,
      creditLimit
    );

    const accounts = calculateAccountBalances(db, session.tenantId);
    const created = accounts.find(a => a.accountId === accountId);
    return ok({ account: created }, 201);
  } catch (err) {
    return routeError(err);
  }
});

/**
 * Updates the mutable account settings. Today that is the credit limit, which is
 * what makes the safe-to-spend `includeCreditLines` option meaningful for an
 * account created before the setting existed.
 */
export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const id = requiredString(body.id, 'id', 100);
    const creditLimit = optionalMoney(body.creditLimit, 'creditLimit');

    const existing = db
      .prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId);
    if (!existing) {
      throw new FieldError('Account not found', 404);
    }
    if (creditLimit !== undefined) {
      db.prepare(
        "UPDATE finance_accounts SET credit_limit = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
      ).run(creditLimit, id, session.tenantId);
    }

    const accounts = calculateAccountBalances(db, session.tenantId);
    return ok({ account: accounts.find(account => account.accountId === id) ?? null });
  } catch (err) {
    return routeError(err);
  }
});
