// Finance-only display helpers (audit sprint Agent 2).
// Proposal for a shared src/components or src/lib home lives in
// .artifacts/final-audit/agent2-findings.md section (D). Until it is promoted,
// only finance pages import from this module so it stays within tooling scope.
import { Decimal } from 'decimal.js';

/** Accepts anything fmt helpers accept, plus a Decimal instance. */
export type MoneyLike = string | number | null | undefined | Decimal;

/** Parse any stored amount (string | number | Decimal | null) into an exact Decimal, defaulting to 0. */
export function toDecimal(value: MoneyLike): Decimal {
  try {
    const d = new Decimal(value == null || value === '' ? 0 : (value as Decimal | string | number));
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Exact sum of stored amounts (avoids parseFloat float artifacts like 0.1 + 0.2). */
export function sumDecimalParts(values: MoneyLike[]): Decimal {
  let total = new Decimal(0);
  for (const v of values) total = total.plus(toDecimal(v));
  return total;
}

export function fmtMoney(value: MoneyLike, opts: { signed?: boolean } = {}): string {
  const d = toDecimal(value);
  const grouped = d
    .abs()
    .toDecimalPlaces(2)
    .toNumber()
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = d.isNegative() ? '-' : opts.signed ? '+' : '';
  return `${sign}$${grouped}`;
}

/**
 * Absolute money string (no negative sign) for labelled contexts that already carry
 * direction words, e.g. "$763.35 owed", "+$102,500.00".
 */
export function fmtAbsMoney(value: MoneyLike, opts: { signed?: boolean } = {}): string {
  const d = toDecimal(value);
  const grouped = d
    .abs()
    .toDecimalPlaces(2)
    .toNumber()
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = d.isNegative() ? (opts.signed ? '-' : '') : opts.signed ? '+' : '';
  return `${sign}$${grouped}`;
}

/** 1st / 2nd / 3rd / 21st / 22nd … for due-day display ("15th" today, never "1th"). */
export function ordinalOf(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
