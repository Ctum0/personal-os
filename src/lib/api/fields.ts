/**
 * Typed field readers for untrusted JSON bodies.
 *
 * Every accessor takes `unknown` and either returns a precise type or throws
 * `FieldError` (400). Routes therefore never see `any`, never call `.trim()`
 * on a value that might be a number, and never leak a TypeError as a 500.
 */

const DEFAULT_MAX_STRING = 2000;

/**
 * Client input error carrying the HTTP status the route must answer with.
 * Thrown by every reader below so routes have one error path, not one branch
 * per field.
 */
export class FieldError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FieldError";
    this.status = status;
  }
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength = DEFAULT_MAX_STRING
): string {
  if (typeof value !== "string") {
    throw new FieldError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new FieldError(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new FieldError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/** Optional string: absent/null/empty → undefined, wrong type → 400. */
export function optionalString(
  value: unknown,
  field: string,
  maxLength = DEFAULT_MAX_STRING
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new FieldError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FieldError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed || undefined;
}

/** Required finite number. Accepts numeric strings; rejects NaN/Infinity. */
export function requiredNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new FieldError(`${field} must be a finite number`);
  }
  return n;
}

export function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredNumber(value, field);
}

/** Required positive decimal string normalized to 2dp (money). */
export function requiredMoney(value: unknown, field: string): string {
  const n = requiredNumber(value, field);
  if (n <= 0) {
    throw new FieldError(`${field} must be greater than zero`);
  }
  return n.toFixed(2);
}

/** Required non-negative decimal string normalized to 2dp (money). */
export function requiredMoneyNonNegative(value: unknown, field: string): string {
  const n = requiredNumber(value, field);
  if (n < 0) {
    throw new FieldError(`${field} must not be negative`);
  }
  return n.toFixed(2);
}

export function optionalMoney(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredMoneyNonNegative(value, field);
}

/** Required integer within [min, max]. */
export function requiredInt(value: unknown, field: string, min: number, max: number): number {
  const n = requiredNumber(value, field);
  if (!Number.isInteger(n)) {
    throw new FieldError(`${field} must be an integer`);
  }
  if (n < min || n > max) {
    throw new FieldError(`${field} must be between ${min} and ${max}`);
  }
  return n;
}

export function optionalInt(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredInt(value, field, min, max);
}

/** Required enum value; the error names every allowed member. */
export function requiredEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new FieldError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

/** Optional enum: absent/empty → undefined, unknown value → 400. */
export function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredEnum(value, field, allowed);
}

export function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new FieldError(`${field} must be a boolean`);
  }
  return value;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredBoolean(value, field);
}

/** Required `YYYY-MM-DD` real calendar date. */
export function requiredISODate(value: unknown, field: string): string {
  if (typeof value !== "string" || !isRealISODate(value)) {
    throw new FieldError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

export function optionalISODate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredISODate(value, field);
}

/** Required ISO-ish datetime with real date/clock bounds. */
export function requiredISODateTime(value: unknown, field: string): string {
  if (typeof value !== "string" || !isRealISODateTime(value)) {
    throw new FieldError(`${field} must be a valid ISO date-time`);
  }
  return value;
}

export function optionalISODateTime(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredISODateTime(value, field);
}

/** `HH:mm` or `HH:mm:ss` clock time. */
export function requiredTimeOfDay(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) {
    throw new FieldError(`${field} must be a HH:mm time`);
  }
  return value;
}

export function optionalTimeOfDay(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredTimeOfDay(value, field);
}

/** Required array; a non-array (including a string) is a 400. */
export function requiredArray<T = unknown>(value: unknown, field: string, maxItems = 5000): T[] {
  if (!Array.isArray(value)) {
    throw new FieldError(`${field} must be an array`);
  }
  if (value.length > maxItems) {
    throw new FieldError(`${field} must contain at most ${maxItems} items`);
  }
  return value as T[];
}

function isRealISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRealISODateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(value);
  if (!match) return false;
  if (!isRealISODate(match[1])) return false;
  if (match[2] === undefined) return true;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = match[4] === undefined ? 0 : Number(match[4]);
  return hours <= 23 && minutes <= 59 && seconds <= 59;
}
