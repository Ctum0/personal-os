import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initSchema, runMigrations, schemaVersion } from "@/lib/db";

const fresh = () => new Database(":memory:");

describe("schema migrations", () => {
  it("stamps a fresh database at version 1", () => {
    const db = fresh();
    const result = runMigrations(db);
    expect(schemaVersion(db)).toBe(1);
    expect(result.applied).toEqual([1]);
    expect(result.backup).toBeNull();
    db.close();
  });

  it("is idempotent on a second run", () => {
    const db = fresh();
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(schemaVersion(db)).toBe(1);
    db.close();
  });

  it("upgrades a pre-versioning database without losing schema", () => {
    const db = fresh();
    initSchema(db);
    expect(schemaVersion(db)).toBe(0);
    const countTables = () =>
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
          .get() as { n: number }
      ).n;
    const before = countTables();
    expect(before).toBeGreaterThan(40);
    const result = runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(1);
    expect(countTables()).toBe(before);
    db.close();
  });

  it("reports no pending work on a current database", () => {
    const db = fresh();
    runMigrations(db);
    const again = runMigrations(db);
    expect(again.from).toBe(1);
    expect(again.to).toBe(1);
    expect(again.applied).toHaveLength(0);
    db.close();
  });
});
