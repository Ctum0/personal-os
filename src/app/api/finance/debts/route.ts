import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import {
  calculateDebtPayoffScenarios,
  calculateDebtLedgerReconciliations,
  calculateDebtPaymentSplit,
} from '@/lib/finance/engine';
import type { DebtPaymentSplitResult } from '@/lib/finance/engine';
import { Decimal } from 'decimal.js';
import { withApiLogging } from '@/lib/api/log';
import { notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalInt,
  optionalMoney,
  optionalString,
  requiredMoney,
  requiredString,
} from '@/lib/api/fields';

interface DebtRow {
  id: string;
  name: string;
  liability_type: string;
  principal_balance: string;
  interest_rate: string;
  minimum_payment: string;
  due_day_of_month: number | null;
  payoff_strategy: string;
  linked_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  linked_account_name: string | null;
  principalBalance?: string;
  effectiveBalance?: string;
  balanceSource?: 'ledger' | 'principal';
  ledgerBalance?: string | null;
  ledgerOutstanding?: string | null;
  ledgerPrincipalMismatch?: boolean;
  paymentSplit?: DebtPaymentSplitResult;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const extraPayment = optionalMoney(searchParams.get('extra'), 'extra') ?? '100.00';

    const debts = db.prepare(`
      SELECT d.*, a.name as linked_account_name
      FROM debts d
      LEFT JOIN finance_accounts a ON d.linked_account_id = a.id
      WHERE d.tenant_id = ?
    `).all(session.tenantId) as DebtRow[];

    debts.sort((a, b) => new Decimal(b.interest_rate || '0').minus(new Decimal(a.interest_rate || '0')).toNumber());

    // Dual-truth exposure (B3) + per-debt payment split (Agent 2 request):
    // principal record vs ledger-derived outstanding; payoff runs on the ledger
    // figure when a linked account exists (see calculateDebtLedgerReconciliations).
    const reconciliations = new Map(
      calculateDebtLedgerReconciliations(db, session.tenantId).map(r => [r.debtId, r])
    );
    for (const d of debts) {
      const rec = reconciliations.get(d.id);
      const effectiveBalance = rec?.effectivePrincipal ?? d.principal_balance;
      d.principalBalance = d.principal_balance;
      d.effectiveBalance = effectiveBalance;
      d.balanceSource = rec?.balanceSource ?? 'principal';
      d.ledgerBalance = rec?.ledgerBalance ?? null;
      d.ledgerOutstanding = rec?.ledgerOutstanding ?? null;
      d.ledgerPrincipalMismatch = rec?.mismatch ?? false;

      const minPay = new Decimal(d.minimum_payment || '0.00');
      // Default payment used by the UI's next-payment split preview:
      // max(minimum_payment, 1% of balance, floored at $25) — documented for the UI.
      const defaultPayment = Decimal.max(minPay, new Decimal(effectiveBalance).times(0.01), new Decimal(25));
      d.paymentSplit = calculateDebtPaymentSplit(effectiveBalance, d.interest_rate || '0', defaultPayment.toFixed(2));
    }

    const payoffScenarios = calculateDebtPayoffScenarios(db, session.tenantId, extraPayment);

    return ok({ debts, payoffScenarios });
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
    const principal = requiredMoney(body.principalBalance, 'principalBalance');
    const apr = optionalMoney(body.interestRate, 'interestRate') ?? '0.00';
    const minPay = optionalMoney(body.minimumPayment, 'minimumPayment') ?? '0.00';
    const dueDay = optionalInt(body.dueDayOfMonth, 'dueDayOfMonth', 1, 31) ?? 15;
    const liabilityType = optionalString(body.liabilityType, 'liabilityType', 40) ?? 'credit_card';
    const payoffStrategy = optionalString(body.payoffStrategy, 'payoffStrategy', 40) ?? 'avalanche';
    const linkedAccountId = optionalString(body.linkedAccountId, 'linkedAccountId', 100);
    const notes = optionalString(body.notes, 'notes', 2000) ?? '';

    if (linkedAccountId) {
      const acc = db
        .prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?')
        .get(linkedAccountId, session.tenantId);
      if (!acc) notFound('Linked account');
    }

    const debtId = `debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO debts (
        id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, due_day_of_month, payoff_strategy, linked_account_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      debtId,
      session.tenantId,
      name,
      liabilityType,
      principal,
      apr,
      minPay,
      dueDay,
      payoffStrategy,
      linkedAccountId ?? null,
      notes
    );

    const created = db.prepare('SELECT * FROM debts WHERE id = ? AND tenant_id = ?').get(debtId, session.tenantId);
    return ok({ debt: created }, 201);
  } catch (err) {
    return routeError(err);
  }
});
