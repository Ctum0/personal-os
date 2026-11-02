import { describe, it, expect } from "vitest";
import { APP_TIMEZONE, toISODate, todayISO, addDaysISO, startOfWeekISO } from "@/lib/time";

describe("timezone-safe calendar dates", () => {
  it("defaults to Asia/Colombo", () => {
    expect(APP_TIMEZONE).toBe("Asia/Colombo");
  });

  it("keeps the same day at 18:29:59Z", () => {
    expect(toISODate(new Date("2026-11-03T18:29:59Z"))).toBe("2026-11-03");
  });

  it("rolls to the next day at 18:30:00Z (00:00 Colombo)", () => {
    expect(toISODate(new Date("2026-11-03T18:30:00Z"))).toBe("2026-11-04");
  });

  it("returns the next day at 02:00 Colombo", () => {
    expect(toISODate(new Date("2026-11-03T20:30:00Z"))).toBe("2026-11-04");
  });

  it("honours an explicit timezone", () => {
    expect(toISODate(new Date("2026-11-03T23:00:00Z"), "UTC")).toBe("2026-11-03");
  });

  it("adds days across a month boundary", () => {
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("handles a leap day", () => {
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("computes a Monday-based week start", () => {
    expect(startOfWeekISO("2026-11-04")).toBe("2026-11-02");
  });
});
