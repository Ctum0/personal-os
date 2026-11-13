import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { previewCsvImport, commitCsvImport, reverseImportBatch } from '@/lib/finance/csv-import';
import type { ColumnMapping, ParsedCsvRow } from '@/lib/finance/csv-import';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalBoolean,
  optionalString,
  requiredArray,
  requiredEnum,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const IMPORT_ACTIONS = ['preview', 'commit'] as const;

interface ImportBatchRow {
  id: string;
  status: string;
}

/**
 * Reads the column-mapping suggestion the client may send back from a preview.
 * Only the known string keys are copied; a non-string value is a 400 rather
 * than a silently ignored mapping.
 */
function readColumnMapping(value: unknown): Partial<ColumnMapping> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new FieldError('customMapping must be an object');
  }
  const raw = value as Record<string, unknown>;
  const mapping: Partial<ColumnMapping> = {};
  const keys: Array<keyof ColumnMapping> = [
    'dateColumn',
    'amountColumn',
    'debitColumn',
    'creditColumn',
    'payeeColumn',
    'descriptionColumn',
    'categoryColumn',
  ];
  for (const key of keys) {
    const parsed = optionalString(raw[key], `customMapping.${key}`, 200);
    if (parsed !== undefined) mapping[key] = parsed;
  }
  return mapping;
}

/** Commit rows are re-validated at the boundary: `commitCsvImport` types these fields. */
function readImportRows(value: unknown): ParsedCsvRow[] {
  const rows = requiredArray<unknown>(value, 'rows', 5000);
  if (rows.length === 0) {
    throw new FieldError('No rows provided to commit');
  }
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new FieldError(`rows[${index}] must be an object`);
    }
    const raw = row as Record<string, unknown>;
    if (typeof raw.raw !== 'object' || raw.raw === null || Array.isArray(raw.raw)) {
      throw new FieldError(`rows[${index}].raw must be an object`);
    }
    const cells: Record<string, string> = {};
    for (const [key, cell] of Object.entries(raw.raw as Record<string, unknown>)) {
      if (typeof cell !== 'string') {
        throw new FieldError(`rows[${index}].raw.${key} must be a string`);
      }
      cells[key] = cell;
    }
    return {
      rowIndex: typeof raw.rowIndex === 'number' ? raw.rowIndex : index,
      raw: cells,
      parsedDate: typeof raw.parsedDate === 'string' ? raw.parsedDate : null,
      parsedAmount: typeof raw.parsedAmount === 'string' ? raw.parsedAmount : null,
      parsedType: raw.parsedType === 'income' ? 'income' : 'expense',
      parsedPayee: typeof raw.parsedPayee === 'string' ? raw.parsedPayee : '',
      parsedDescription: typeof raw.parsedDescription === 'string' ? raw.parsedDescription : '',
      parsedCategory: typeof raw.parsedCategory === 'string' ? raw.parsedCategory : null,
      isDuplicate: raw.isDuplicate === true,
      duplicateReason: typeof raw.duplicateReason === 'string' ? raw.duplicateReason : undefined,
      error: typeof raw.error === 'string' ? raw.error : undefined,
    };
  });
}

export const GET = withApiLogging(async function GET() {
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

    return ok({ batches });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const action = requiredEnum(body.action, 'action', IMPORT_ACTIONS);
    const accountId = requiredString(body.accountId, 'accountId', 100);
    // Without this check a caller could post ledger rows into any tenant's
    // account by guessing its id.
    if (!referenceExists(db, session.tenantId, 'finance_accounts', accountId)) {
      notFound('Account');
    }
    const fileName = optionalString(body.fileName, 'fileName', 500) ?? 'statement.csv';

    if (action === 'preview') {
      const csvText = requiredString(body.csvText, 'csvText', 5_000_000);
      const customMapping = readColumnMapping(body.customMapping);
      const preview = previewCsvImport(db, session.tenantId, accountId, fileName, csvText, customMapping);
      return ok({ preview });
    }

    const rows = readImportRows(body.rows);
    const fileHash = optionalString(body.fileHash, 'fileHash', 200) ?? 'hash';
    const skipDuplicates = optionalBoolean(body.skipDuplicates, 'skipDuplicates') ?? true;

    const result = commitCsvImport(
      db,
      session.tenantId,
      accountId,
      fileName,
      fileHash,
      rows,
      skipDuplicates
    );
    return ok({ success: true, ...result }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      throw new FieldError('batchId is required');
    }

    const batch = db
      .prepare('SELECT id, status FROM import_batches WHERE id = ? AND tenant_id = ?')
      .get(batchId, session.tenantId) as ImportBatchRow | undefined;
    if (!batch) notFound('Import batch');

    const result = reverseImportBatch(db, session.tenantId, batchId);
    return ok(result);
  } catch (err) {
    return routeError(err);
  }
});
