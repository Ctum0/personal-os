import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { Decimal } from 'decimal.js';
import { todayISO } from "@/lib/time";
import { readJson } from '@/lib/db/validate';
import { detectDuplicateTransaction } from '@/lib/finance/engine';

export async function GET(request: Request) {
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
    const params: any[] = [session.tenantId];

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

    const transactions = db.prepare(query).all(...params);
    return NextResponse.json({ transactions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const {
      transactionType,
      date,
      accountId,
      toAccountId,
      amount,
      categoryId,
      payeeName,
      description,
      notes,
      tags,
      status: reqStatus,
      recurringConfig,
    } = body;

    if (!accountId || amount === undefined || amount === null || !description || !String(description).trim()) {
      return NextResponse.json({ error: 'Account, amount, and description are required' }, { status: 400 });
    }

    let parsedDecimal: Decimal;
    try {
      parsedDecimal = new Decimal(amount);
      if (!parsedDecimal.isFinite() || parsedDecimal.isNaN() || parsedDecimal.isZero() || parsedDecimal.isNegative()) {
        return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Amount must be a valid numeric value' }, { status: 400 });
    }
    const decAmount = parsedDecimal.toFixed(2);

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 });
    }

    const validTxTypes = ['income', 'expense', 'transfer', 'refund'];
    const txType = transactionType || 'expense';
    if (!validTxTypes.includes(txType)) {
      return NextResponse.json({ error: `Invalid transactionType. Must be one of: ${validTxTypes.join(', ')}` }, { status: 400 });
    }

    // Verify account exists and belongs to current tenant
    const acc = db.prepare('SELECT id, currency FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(accountId, session.tenantId) as { id: string; currency: string } | undefined;
    if (!acc) {
      return NextResponse.json({ error: 'Source account not found' }, { status: 404 });
    }

    // Category must exist within the tenant (prevents cross-tenant category ids)
    if (categoryId) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND tenant_id = ?').get(categoryId, session.tenantId);
      if (!cat) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
    }
    if (payeeName !== undefined && payeeName !== null && typeof payeeName !== 'string') {
      return NextResponse.json({ error: 'payeeName must be a string' }, { status: 400 });
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
    }

    // For transfers, verify destination account exists and belongs to current tenant
    if (txType === 'transfer') {
      if (!toAccountId) {
        return NextResponse.json({ error: 'Destination account is required for transfer' }, { status: 400 });
      }
      if (toAccountId === accountId) {
        return NextResponse.json({ error: 'Destination account must be different from source account' }, { status: 400 });
      }
      const toAcc = db.prepare('SELECT id FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(toAccountId, session.tenantId);
      if (!toAcc) {
        return NextResponse.json({ error: 'Destination account not found' }, { status: 404 });
      }
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const txDate = date || todayISO();
    const txStatus = reqStatus === 'pending' ? 'pending' : 'posted';
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' && tags.trim().startsWith('[') ? tags : JSON.stringify(tags ? [tags] : []));
    const currency = acc.currency || 'USD';

    db.transaction(() => {
      // 1. Insert master transaction
      db.prepare(`
        INSERT INTO journal_transactions (
          id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, payee_name, category_id, description, notes, tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        session.tenantId,
        txType,
        txDate,
        accountId,
        toAccountId || null,
        decAmount,
        currency,
        decAmount,
        payeeName || null,
        categoryId || null,
        description.trim(),
        notes || null,
        tagsJson,
        txStatus
      );

      // 2. Insert balanced ledger lines (debit / credit) when status is posted
      if (txStatus === 'posted') {
        if (txType === 'income') {
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, decAmount, currency, decAmount, description);
        } else if (txType === 'expense') {
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, decAmount, currency, decAmount, description);
        } else if (txType === 'transfer') {
          if (!toAccountId) {
            throw new Error('Destination account is required for transfer');
          }
          // Credit source account (money out)
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, decAmount, currency, decAmount, `Transfer to ${toAccountId}`);

          // Debit destination account (money in)
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_2`, session.tenantId, txId, toAccountId, decAmount, currency, decAmount, `Transfer from ${accountId}`);
        } else if (txType === 'refund') {
          // Refund is debit into asset account
          db.prepare(`
            INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
            VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?)
          `).run(`jl_${txId}_1`, session.tenantId, txId, accountId, decAmount, currency, decAmount, `Refund: ${description}`);
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
          description.trim(),
          recurringConfig.ruleType || (txType === 'income' ? 'income' : 'bill'),
          recurringConfig.frequency || 'monthly',
          txDate,
          recurringConfig.nextDueDate || txDate,
          decAmount,
          currency,
          accountId,
          toAccountId || null,
          categoryId || null
        );
      }

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'finance', 'create_transaction', 'journal_transaction', ?, ?)
      `).run(`aud_${txId}`, session.tenantId, session.userId, txId, JSON.stringify(body));
    })();

    const created = db.prepare('SELECT * FROM journal_transactions WHERE id = ? AND tenant_id = ?').get(txId, session.tenantId);

    // Advisory duplicate warning (B6): same account + date + type + amount already
    // posted. Response-only flag; nothing is blocked or mutated.
    const duplicateWarning = detectDuplicateTransaction(db, session.tenantId, {
      accountId,
      date: txDate,
      transactionType: txType,
      amount: decAmount,
      excludeTransactionId: txId,
    });

    return NextResponse.json({ transaction: created, duplicateWarning }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
    }

    db.transaction(() => {
      // Per spec: financial corrections preserve history or mark as reversed/voided.
      // journal_lines are preserved intact for immutable audit history.
      const existing = db.prepare('SELECT id, status FROM journal_transactions WHERE id = ? AND tenant_id = ?').get(id, session.tenantId) as { id: string; status: string } | undefined;
      if (!existing) {
        return;
      }
      const alreadyVoided = existing.status === 'voided';
      db.prepare(`
        UPDATE journal_transactions
        SET status = 'voided', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, session.tenantId);

      // Idempotent: re-voiding a voided transaction does not duplicate audit rows.
      if (!alreadyVoided) {
        db.prepare(`
          INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
          VALUES (?, ?, ?, 'finance', 'void_transaction', 'journal_transaction', ?, '{}')
        `).run(`aud_void_${id}`, session.tenantId, session.userId, id);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
