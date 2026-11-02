import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { Decimal } from 'decimal.js';
import { todayISO } from "@/lib/time";

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
    const body = await request.json();

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
    } = body;

    if (!accountId || !amount || !description) {
      return NextResponse.json({ error: 'Account, amount, and description are required' }, { status: 400 });
    }

    const txType = transactionType || 'expense';
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const txDate = date || todayISO();
    const decAmount = new Decimal(amount).abs().toFixed(2);

    // Get account currency
    const acc = db.prepare('SELECT currency FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(accountId, session.tenantId) as { currency: string };
    const currency = acc?.currency || 'USD';

    db.transaction(() => {
      // 1. Insert master transaction
      db.prepare(`
        INSERT INTO journal_transactions (
          id, tenant_id, transaction_type, date, account_id, to_account_id, amount, currency, base_amount, payee_name, category_id, description, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')
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
        notes || null
      );

      // 2. Insert balanced ledger lines (debit / credit)
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

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'finance', 'create_transaction', 'journal_transaction', ?, ?)
      `).run(`aud_${txId}`, session.tenantId, session.userId, txId, JSON.stringify(body));
    })();

    const created = db.prepare('SELECT * FROM journal_transactions WHERE id = ?').get(txId);
    return NextResponse.json({ transaction: created }, { status: 201 });
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
      // Per spec: financial corrections preserve history or mark as reversed/voided
      db.prepare(`
        UPDATE journal_transactions 
        SET status = 'voided', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, session.tenantId);

      db.prepare(`
        DELETE FROM journal_lines 
        WHERE transaction_id = ? AND tenant_id = ?
      `).run(id, session.tenantId);

      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'finance', 'void_transaction', 'journal_transaction', ?, '{}')
      `).run(`aud_void_${id}`, session.tenantId, session.userId, id);
    })();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
