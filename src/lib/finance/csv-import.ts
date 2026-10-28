import Papa from 'papaparse';
import { Decimal } from 'decimal.js';
import type Database from 'better-sqlite3';

export interface ColumnMapping {
  dateColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  payeeColumn?: string;
  descriptionColumn?: string;
  categoryColumn?: string;
}

export interface ParsedCsvRow {
  rowIndex: number;
  raw: Record<string, string>;
  parsedDate: string | null;
  parsedAmount: string | null;
  parsedType: 'income' | 'expense';
  parsedPayee: string;
  parsedDescription: string;
  parsedCategory: string | null;
  isDuplicate: boolean;
  duplicateReason?: string;
  error?: string;
}

export interface CsvPreviewResult {
  fileName: string;
  fileHash: string;
  totalRows: number;
  validRowsCount: number;
  duplicateRowsCount: number;
  errorRowsCount: number;
  detectedColumns: string[];
  suggestedMapping: ColumnMapping;
  rows: ParsedCsvRow[];
}

/**
 * Normalizes common date string formats into standard YYYY-MM-DD
 */
export function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // Check YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // Check MM/DD/YYYY or DD/MM/YYYY
  const slashParts = clean.split('/');
  if (slashParts.length === 3) {
    let [p1, p2, p3] = slashParts;
    if (p3.length === 2) p3 = '20' + p3;
    if (parseInt(p1, 10) > 12 && parseInt(p2, 10) <= 12) {
      // DD/MM/YYYY
      return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
    }
    // Default to MM/DD/YYYY
    return `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Normalizes money string into absolute decimal string and direction
 */
export function normalizeMoney(amountStr: string): { amount: string; isNegative: boolean } | null {
  if (!amountStr) return null;
  let clean = amountStr.trim().replace(/[\$,\s]/g, '');

  let isNegative = false;
  // Handle (100.00) accounting format
  if (clean.startsWith('(') && clean.endsWith(')')) {
    isNegative = true;
    clean = clean.slice(1, -1);
  } else if (clean.startsWith('-')) {
    isNegative = true;
    clean = clean.slice(1);
  } else if (clean.startsWith('+')) {
    clean = clean.slice(1);
  }

  try {
    const dec = new Decimal(clean);
    return {
      amount: dec.abs().toFixed(2),
      isNegative: isNegative || dec.isNegative(),
    };
  } catch {
    return null;
  }
}

/**
 * Simple string hash
 */
export function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

/**
 * Parses and previews CSV content against an account for deduplication
 */
export function previewCsvImport(
  db: Database.Database,
  tenantId: string,
  accountId: string,
  fileName: string,
  csvText: string,
  customMapping?: Partial<ColumnMapping>
): CsvPreviewResult {
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const detectedColumns = parseResult.meta.fields || [];

  // Suggest mapping based on header column names
  const mapping: ColumnMapping = {
    dateColumn: customMapping?.dateColumn || detectedColumns.find(c => /date|trans/i.test(c)) || detectedColumns[0] || '',
    amountColumn: customMapping?.amountColumn || detectedColumns.find(c => /amount|total/i.test(c)),
    debitColumn: customMapping?.debitColumn || detectedColumns.find(c => /debit|spent|out/i.test(c)),
    creditColumn: customMapping?.creditColumn || detectedColumns.find(c => /credit|received|in/i.test(c)),
    payeeColumn: customMapping?.payeeColumn || detectedColumns.find(c => /payee|merchant|vendor|name/i.test(c)),
    descriptionColumn: customMapping?.descriptionColumn || detectedColumns.find(c => /desc|memo|details/i.test(c)),
    categoryColumn: customMapping?.categoryColumn || detectedColumns.find(c => /cat/i.test(c)),
  };

  // Pre-load existing transactions for this account for duplicate detection
  const existingTx = db.prepare(`
    SELECT date, amount, transaction_type, payee_name, description
    FROM journal_transactions
    WHERE tenant_id = ? AND account_id = ?
  `).all(tenantId, accountId) as Array<{
    date: string;
    amount: string;
    transaction_type: string;
    payee_name: string;
    description: string;
  }>;

  const rows: ParsedCsvRow[] = [];
  let validCount = 0;
  let dupCount = 0;
  let errCount = 0;

  parseResult.data.forEach((row, index) => {
    const rawDate = row[mapping.dateColumn];
    const parsedDate = normalizeDate(rawDate);

    let parsedAmount: string | null = null;
    let parsedType: 'income' | 'expense' = 'expense';

    if (mapping.amountColumn && row[mapping.amountColumn]) {
      const norm = normalizeMoney(row[mapping.amountColumn]);
      if (norm) {
        parsedAmount = norm.amount;
        // In bank CSVs, negative amounts are typically expenses / debits, positive are deposits / credits
        parsedType = norm.isNegative ? 'expense' : 'income';
      }
    } else if (mapping.debitColumn && row[mapping.debitColumn]) {
      const norm = normalizeMoney(row[mapping.debitColumn]);
      if (norm) {
        parsedAmount = norm.amount;
        parsedType = 'expense';
      }
    } else if (mapping.creditColumn && row[mapping.creditColumn]) {
      const norm = normalizeMoney(row[mapping.creditColumn]);
      if (norm) {
        parsedAmount = norm.amount;
        parsedType = 'income';
      }
    }

    const payee = (mapping.payeeColumn && row[mapping.payeeColumn]) ||
                  (mapping.descriptionColumn && row[mapping.descriptionColumn]) ||
                  'Unknown Merchant';
    const description = (mapping.descriptionColumn && row[mapping.descriptionColumn]) || payee;
    const category = mapping.categoryColumn ? row[mapping.categoryColumn] || null : null;

    let error: string | undefined;
    if (!parsedDate) {
      error = 'Invalid date format';
    } else if (!parsedAmount) {
      error = 'Could not parse transaction amount';
    }

    let isDuplicate = false;
    let duplicateReason: string | undefined;

    if (parsedDate && parsedAmount) {
      const match = existingTx.find(t => 
        t.date === parsedDate &&
        new Decimal(t.amount).equals(new Decimal(parsedAmount!)) &&
        t.transaction_type === parsedType
      );
      if (match) {
        isDuplicate = true;
        duplicateReason = `Matches existing ${match.transaction_type} of $${match.amount} on ${match.date}`;
      }
    }

    if (error) {
      errCount++;
    } else if (isDuplicate) {
      dupCount++;
      validCount++;
    } else {
      validCount++;
    }

    rows.push({
      rowIndex: index,
      raw: row,
      parsedDate,
      parsedAmount,
      parsedType,
      parsedPayee: payee.trim(),
      parsedDescription: description.trim(),
      parsedCategory: category ? category.trim() : null,
      isDuplicate,
      duplicateReason,
      error,
    });
  });

  return {
    fileName,
    fileHash: computeHash(csvText),
    totalRows: rows.length,
    validRowsCount: validCount,
    duplicateRowsCount: dupCount,
    errorRowsCount: errCount,
    detectedColumns,
    suggestedMapping: mapping,
    rows,
  };
}

/**
 * Commits a CSV import preview atomically into the database ledger
 */
export function commitCsvImport(
  db: Database.Database,
  tenantId: string,
  accountId: string,
  fileName: string,
  fileHash: string,
  rowsToImport: ParsedCsvRow[],
  skipDuplicates: boolean = true
): { batchId: string; importedCount: number; skippedCount: number } {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let importedCount = 0;
  let skippedCount = 0;

  // Find account currency
  const acc = db.prepare('SELECT currency FROM finance_accounts WHERE id = ? AND tenant_id = ?').get(accountId, tenantId) as { currency: string };
  const currency = acc?.currency || 'USD';

  db.transaction(() => {
    // 1. Insert batch record
    db.prepare(`
      INSERT INTO import_batches (
        id, tenant_id, account_id, file_name, file_hash, total_rows, accepted_rows, skipped_rows, duplicate_rows, column_mapping, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed')
    `).run(
      batchId,
      tenantId,
      accountId,
      fileName,
      fileHash,
      rowsToImport.length,
      0,
      0,
      0,
      '{}'
    );

    const insertTx = db.prepare(`
      INSERT INTO journal_transactions (
        id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, payee_name, description, status, import_batch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)
    `);

    const insertLine = db.prepare(`
      INSERT INTO journal_lines (
        id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertImportRow = db.prepare(`
      INSERT INTO import_rows (
        id, tenant_id, batch_id, row_index, raw_data, parsed_date, parsed_amount, parsed_payee, status, transaction_id, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of rowsToImport) {
      const rowId = `ir_${batchId}_${r.rowIndex}`;

      if (r.error) {
        skippedCount++;
        insertImportRow.run(rowId, tenantId, batchId, r.rowIndex, JSON.stringify(r.raw), r.parsedDate, r.parsedAmount, r.parsedPayee, 'error', null, r.error);
        continue;
      }

      if (r.isDuplicate && skipDuplicates) {
        skippedCount++;
        insertImportRow.run(rowId, tenantId, batchId, r.rowIndex, JSON.stringify(r.raw), r.parsedDate, r.parsedAmount, r.parsedPayee, 'skipped', null, r.duplicateReason);
        continue;
      }

      const txId = `tx_imp_${batchId}_${r.rowIndex}`;
      insertTx.run(
        txId,
        tenantId,
        r.parsedType,
        r.parsedDate,
        accountId,
        r.parsedAmount,
        currency,
        r.parsedAmount,
        r.parsedPayee,
        r.parsedDescription,
        batchId
      );

      // Balanced ledger line
      const entryType = r.parsedType === 'income' ? 'debit' : 'credit';
      insertLine.run(
        `jl_${txId}`,
        tenantId,
        txId,
        accountId,
        entryType,
        r.parsedAmount,
        currency,
        r.parsedAmount,
        r.parsedDescription
      );

      insertImportRow.run(rowId, tenantId, batchId, r.rowIndex, JSON.stringify(r.raw), r.parsedDate, r.parsedAmount, r.parsedPayee, 'accepted', txId, null);
      importedCount++;
    }

    // Update batch stats
    db.prepare(`
      UPDATE import_batches
      SET accepted_rows = ?, skipped_rows = ?
      WHERE id = ?
    `).run(importedCount, skippedCount, batchId);
  })();

  return { batchId, importedCount, skippedCount };
}

/**
 * Reverses all transactions created by an import batch safely and atomically
 */
export function reverseImportBatch(
  db: Database.Database,
  tenantId: string,
  batchId: string
): { success: boolean; reversedCount: number } {
  let reversedCount = 0;

  db.transaction(() => {
    // Count transactions created by this batch
    const countRow = db.prepare(`
      SELECT count(*) as count FROM journal_transactions
      WHERE tenant_id = ? AND import_batch_id = ?
    `).get(tenantId, batchId) as { count: number };
    reversedCount = countRow.count;

    // Delete created journal lines and transactions
    db.prepare(`
      DELETE FROM journal_lines
      WHERE tenant_id = ? AND transaction_id IN (
        SELECT id FROM journal_transactions WHERE tenant_id = ? AND import_batch_id = ?
      )
    `).run(tenantId, tenantId, batchId);

    db.prepare(`
      DELETE FROM journal_transactions
      WHERE tenant_id = ? AND import_batch_id = ?
    `).run(tenantId, batchId);

    // Update batch status
    db.prepare(`
      UPDATE import_batches
      SET status = 'reversed'
      WHERE id = ? AND tenant_id = ?
    `).run(batchId, tenantId);
  })();

  return { success: true, reversedCount };
}
