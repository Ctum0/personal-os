export const APP_TIMEZONE = process.env.PERSONAL_OS_TZ || "Asia/Colombo";

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Calendar date (YYYY-MM-DD) for an instant, in the given IANA timezone. */
export function toISODate(d: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const parts = formatter(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's calendar date in the app timezone. Use this instead of new Date().toISOString().slice(0,10). */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** A real timestamp. Stays UTC - use this for created_at / updated_at, never for calendar days. */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Add (or subtract) days to a YYYY-MM-DD string, calendar-correct across months and leap years. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday-based start of the week for a YYYY-MM-DD string. */
export function startOfWeekISO(iso: string, weekStartsOn = 1): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diff = (dt.getUTCDay() - weekStartsOn + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}
