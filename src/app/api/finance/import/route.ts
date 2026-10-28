import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { previewCsvImport, commitCsvImport, reverseImportBatch } from '@/lib/finance/csv-import';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const batches = db.prepare(`
      SELECT b.*, a.name as account_name
      FROM import_batches b
      JOIN finance_accounts a ON b.account_id = a.id
      WHERE b.tenant_id = ?
      ORDER BY b.created_at DESC LIMIT 20
    `).all(session.tenantId);

    return NextResponse.json({ batches });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const { action, accountId, fileName, csvText, customMapping, fileHash, rows, skipDuplicates } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    if (action === 'preview') {
      if (!csvText) {
        return NextResponse.json({ error: 'csvText is required for preview' }, { status: 400 });
      }
      const preview = previewCsvImport(
        db,
        session.tenantId,
        accountId,
        fileName || 'statement.csv',
        csvText,
        customMapping
      );
      return NextResponse.json({ preview });
    }

    if (action === 'commit') {
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: 'No rows provided to commit' }, { status: 400 });
      }

      const result = commitCsvImport(
        db,
        session.tenantId,
        accountId,
        fileName || 'statement.csv',
        fileHash || 'hash',
        rows,
        skipDuplicates !== false
      );
      return NextResponse.json({ success: true, ...result }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid action, expected preview or commit' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const result = reverseImportBatch(db, session.tenantId, batchId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
