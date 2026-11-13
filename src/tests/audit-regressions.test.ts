import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import { closeDb, runMigrations } from "@/lib/db";
import { taskVisibleClause } from "@/lib/db/visibility";
import { isISODateString, isISODateTimeString } from "@/lib/db/validate";
import { FieldError } from "@/lib/api/fields";
import {
  requiredString,
  optionalString,
  requiredInt,
  optionalEnum,
  requiredMoney,
  requiredISODate,
  requiredTimeOfDay,
} from "@/lib/api/fields";
import { routeError, ok, readBody } from "@/lib/api/http";

/**
 * Regression suite for the defects found in the full-codebase audit.
 *
 * Each test names the observable contract that was broken, so a future
 * refactor that reintroduces the bug fails here rather than silently shipping
 * a 500 or a wrong number.
 */

const memDb = (): Database.Database => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
};

describe("visibility clause aliasing", () => {
  it("excludes quarantined rows when called with the real table name", () => {
    const db = memDb();
    const tenant = (db.prepare("SELECT id FROM tenants LIMIT 1").get() as { id: string }).id;
    db.prepare("INSERT INTO tasks (id, tenant_id, title, status) VALUES ('t_ok', ?, 'Visible', 'inbox')").run(tenant);
    db.prepare("INSERT INTO tasks (id, tenant_id, title, status) VALUES ('t_q', ?, 'Hidden', 'quarantined')").run(tenant);

    // Unaliased FROM tasks — the shape that used to throw `no such column: t.status`.
    const rows = db
      .prepare(`SELECT id FROM tasks WHERE tenant_id = ? AND ${taskVisibleClause("tasks")}`)
      .all(tenant) as Array<{ id: string }>;

    const ids = rows.map(r => r.id);
    expect(ids).toContain("t_ok");
    expect(ids).not.toContain("t_q");
    db.close();
  });

  it("requires an explicit alias (no silent default)", () => {
    // The signature takes a required string; a default of `t` is what produced
    // `no such column: t.status` on every unaliased query.
    expect(taskVisibleClause("ta")).toBe("(ta.status != 'quarantined')");
    expect(taskVisibleClause.length).toBe(1);
  });
});

describe("calendar date validation", () => {
  it("rejects dates that do not exist", () => {
    expect(isISODateString("2026-02-31")).toBe(false);
    expect(isISODateString("2026-04-31")).toBe(false);
    expect(isISODateString("2026-13-01")).toBe(false);
    expect(isISODateString("2026-00-10")).toBe(false);
  });

  it("accepts real dates including leap days", () => {
    expect(isISODateString("2026-02-28")).toBe(true);
    expect(isISODateString("2028-02-29")).toBe(true);
    expect(isISODateString("2026-12-31")).toBe(true);
  });

  it("bounds the clock in datetimes", () => {
    expect(isISODateTimeString("2026-11-12T24:00:00")).toBe(false);
    expect(isISODateTimeString("2026-11-12T09:60:00")).toBe(false);
    expect(isISODateTimeString("2026-02-31T09:00:00")).toBe(false);
    expect(isISODateTimeString("2026-11-12T09:00:00")).toBe(true);
    expect(isISODateTimeString("2026-11-12T23:59:59Z")).toBe(true);
  });
});

describe("typed field readers", () => {
  it("turns a numeric title into a FieldError, not a TypeError", () => {
    expect(() => requiredString(123, "title")).toThrow(FieldError);
    expect(() => requiredString(undefined, "title")).toThrow(/title/);
    expect(() => requiredString("   ", "title")).toThrow(/required/);
    expect(requiredString("  Hello  ", "title")).toBe("Hello");
  });

  it("bounds integers and names the range", () => {
    expect(() => requiredInt(0, "daysHorizon", 1, 365)).toThrow(/between 1 and 365/);
    expect(() => requiredInt(1.5, "daysHorizon", 1, 365)).toThrow(/integer/);
    expect(requiredInt("30", "daysHorizon", 1, 365)).toBe(30);
  });

  it("rejects NaN/infinite money instead of persisting 'NaN'", () => {
    expect(() => requiredMoney("abc", "safetyBuffer")).toThrow(FieldError);
    expect(() => requiredMoney("0", "safetyBuffer")).toThrow(/greater than zero/);
    expect(() => requiredMoney("-5", "safetyBuffer")).toThrow(FieldError);
    expect(requiredMoney("12.345", "amount")).toBe("12.35");
  });

  it("validates enums and optional fields distinctly", () => {
    expect(optionalEnum(undefined, "status", ["inbox"] as const)).toBeUndefined();
    expect(() => optionalEnum("bogus", "status", ["inbox"] as const)).toThrow(/must be one of/);
    expect(optionalString("", "notes")).toBeUndefined();
    expect(() => optionalString(5, "notes")).toThrow(FieldError);
  });

  it("validates dates and clock times", () => {
    expect(() => requiredISODate("2026-02-31", "date")).toThrow(FieldError);
    expect(requiredISODate("2026-02-28", "date")).toBe("2026-02-28");
    expect(() => requiredTimeOfDay("24:00", "startTime")).toThrow(FieldError);
    expect(requiredTimeOfDay("09:30", "startTime")).toBe("09:30");
  });
});

describe("HTTP error mapping", () => {
  it("maps validation errors to 400 and unknown errors to 500", async () => {
    expect(routeError(new FieldError("bad input")).status).toBe(400);
    expect(routeError(new FieldError("missing", 404)).status).toBe(404);
    expect(routeError(new Error("FOREIGN KEY constraint failed")).status).toBe(400);
    expect(routeError(new Error("UNIQUE constraint failed: spaces.slug")).status).toBe(409);
    expect(routeError(new Error("kaboom")).status).toBe(500);
  });

  it("rejects non-object bodies as a client error", async () => {
    await expect(readBody(new Request("http://x/api/t", { method: "POST", body: "[1,2]" }))).rejects.toThrow(FieldError);
    await expect(readBody(new Request("http://x/api/t", { method: "POST", body: "{bad" }))).rejects.toThrow(/valid JSON/);
    await expect(readBody(new Request("http://x/api/t", { method: "POST", body: '{"a":1}' }))).resolves.toEqual({ a: 1 });
  });

  it("marks created resources with 201", () => {
    expect(ok({ id: "x" }, 201).status).toBe(201);
    expect(ok({ id: "x" }).status).toBe(200);
  });
});

describe("in-memory database parity", () => {
  it("runs the full migration chain, not just the baseline DDL", () => {
    const db = memDb();
    const version = Number(db.pragma("user_version", { simple: true }));
    expect(version).toBeGreaterThanOrEqual(7);

    const columns = (db.prepare("PRAGMA table_info(journal_transactions)").all() as Array<{ name: string }>)
      .map(c => c.name);
    expect(columns).toContain("dup_fingerprint");

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
      .map(t => t.name);
    expect(tables).toContain("weekly_reviews");
    expect(tables).toContain("idempotency_keys");
    expect(tables).toContain("safe_to_spend_settings");
    db.close();
  });
});

describe("migration snapshots stay next to their own database", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-os-snap-"));
  let previousPath: string | undefined;

  beforeEach(() => {
    previousPath = process.env.PERSONAL_OS_DB_PATH;
    // Point the *live* path somewhere else entirely: snapshots must follow the
    // handle being migrated, never the configured live DB.
    process.env.PERSONAL_OS_DB_PATH = path.join(tmpDir, "live", "personal_os.db");
  });

  afterEach(() => {
    closeDb();
    if (previousPath === undefined) delete process.env.PERSONAL_OS_DB_PATH;
    else process.env.PERSONAL_OS_DB_PATH = previousPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("never writes into the configured live data directory", () => {
    const dbPath = path.join(tmpDir, "profile", "profile.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    // A second migration run has nothing pending, so seed a fake v4 database to
    // force an upgrade path that snapshots first.
    db.pragma("user_version = 4");
    const result = runMigrations(db);
    expect(result.from).toBe(4);
    expect(result.backup).toBeTruthy();
    expect(result.backup?.startsWith(path.join(tmpDir, "profile"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "live"))).toBe(false);
    db.close();
  });

  it("skips snapshots for in-memory databases", () => {
    const db = new Database(":memory:");
    runMigrations(db);
    db.pragma("user_version = 4");
    const result = runMigrations(db);
    expect(result.backup).toBeNull();
    db.close();
  });
});
