import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { closeDb, getDb } from "@/lib/db";
import { readApiLogTail } from "@/lib/api/logger";
import { GET as tasksGet, POST as tasksPost, PUT as tasksPut, DELETE as tasksDelete } from "@/app/api/tasks/route";
import { GET as searchGet } from "@/app/api/search/route";
import { GET as settingsGet, PUT as settingsPut } from "@/app/api/settings/route";
import { GET as stsGet, POST as stsPost } from "@/app/api/finance/safe-to-spend/route";
import { GET as policiesGet, PUT as policiesPut } from "@/app/api/ai/policies/route";
import { POST as approvalsPost } from "@/app/api/ai/approvals/route";
import { POST as chatPost } from "@/app/api/ai/chat/route";
import { GET as layoutGet, POST as layoutPost } from "@/app/api/dashboard/layout/route";
import { GET as exportGet } from "@/app/api/backup/export/route";
import { POST as restorePost } from "@/app/api/backup/restore/route";
import { GET as calendarGet } from "@/app/api/calendar/route";
import { POST as txPost, DELETE as txDelete } from "@/app/api/finance/transactions/route";
import { GET as accountsGet } from "@/app/api/finance/accounts/route";
import { POST as importPreview, POST as importCommit } from "@/app/api/finance/import/route";

/**
 * Route-level regression suite for the API defects found in the audit.
 *
 * Every handler runs against an isolated database file through the production
 * boot path (migrations, seeding, WAL), so status codes and persisted state are
 * exactly what the client observes.
 */

const TMP_ROOT = path.join(os.tmpdir(), `personal-os-api-${randomUUID()}`);
const DB_FILE = path.join(TMP_ROOT, "profile.db");
let previousDbPath: string | undefined;

interface Seed {
  tenantId: string;
  userId: string;
  spaceId: string;
  checkingAccountId: string;
  expenseCategoryId: string;
}

const seed: Seed = {
  tenantId: "",
  userId: "",
  spaceId: "",
  checkingAccountId: "",
  expenseCategoryId: "",
};

function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  previousDbPath = process.env.PERSONAL_OS_DB_PATH;
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;

  const db = getDb();
  const tenant = db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get() as { id: string };
  const user = db.prepare("SELECT id FROM users WHERE tenant_id = ? LIMIT 1").get(tenant.id) as { id: string };
  const space = db.prepare("SELECT id FROM spaces WHERE tenant_id = ? LIMIT 1").get(tenant.id) as { id: string };
  const account = db
    .prepare("SELECT id FROM finance_accounts WHERE tenant_id = ? AND type = 'checking' LIMIT 1")
    .get(tenant.id) as { id: string } | undefined;
  const category = db
    .prepare("SELECT id FROM categories WHERE tenant_id = ? AND type = 'expense' LIMIT 1")
    .get(tenant.id) as { id: string };

  seed.tenantId = tenant.id;
  seed.userId = user.id;
  seed.spaceId = space.id;
  seed.checkingAccountId = account?.id ?? "";
  seed.expenseCategoryId = category.id;
});

afterAll(() => {
  // Close the handle before removing its directory: otherwise the next suite in
  // this worker inherits a handle whose files are gone.
  closeDb();
  if (previousDbPath === undefined) delete process.env.PERSONAL_OS_DB_PATH;
  else process.env.PERSONAL_OS_DB_PATH = previousDbPath;
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("POST /api/tasks", () => {
  it("rejects a numeric title with 400 instead of throwing a TypeError", async () => {
    const res = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: 123 }));
    expect(res.status).toBe(400);
    expect((await readJson<{ error: string }>(res)).error).toMatch(/title must be a string/);
  });

  it("rejects an impossible due date with 400", async () => {
    const res = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Probe", dueDate: "2026-02-31" }));
    expect(res.status).toBe(400);
  });

  it("creates a task and reports 201", async () => {
    const res = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Regression task", priority: "high" }));
    expect(res.status).toBe(201);
    const body = await readJson<{ task: { status: string; title: string } }>(res);
    expect(body.task.status).toBe("inbox");
    expect(body.task.title).toBe("Regression task");
  });
});

describe("DELETE /api/tasks", () => {
  it("soft-deletes an existing task (double-quoted datetime regression)", async () => {
    const created = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Delete me" }));
    const { task } = await readJson<{ task: { id: string } }>(created);

    const deleted = await tasksDelete(new Request(`http://localhost/api/tasks?id=${task.id}`, { method: "DELETE" }));
    expect(deleted.status).toBe(200);

    const list = await tasksGet(new Request("http://localhost/api/tasks?search=Delete%20me"));
    const tasks = (await readJson<{ tasks: Array<{ id: string }> }>(list)).tasks;
    expect(tasks.some(t => t.id === task.id)).toBe(false);
  });

  it("returns 404 for an unknown id instead of a false success", async () => {
    const res = await tasksDelete(new Request("http://localhost/api/tasks?id=does_not_exist", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/tasks", () => {
  it("clears the completion timestamp when a task leaves completed", async () => {
    const created = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Toggle me" }));
    const { task } = await readJson<{ task: { id: string } }>(created);

    const completed = await tasksPut(jsonRequest("http://localhost/api/tasks", { id: task.id, status: "completed" }, "PUT"));
    expect((await readJson<{ task: { completion_at: string | null } }>(completed)).task.completion_at).toBeTruthy();

    const reopened = await tasksPut(jsonRequest("http://localhost/api/tasks", { id: task.id, status: "next" }, "PUT"));
    expect((await readJson<{ task: { completion_at: string | null } }>(reopened)).task.completion_at).toBeNull();
  });

  it("ignores an empty space id instead of raising a foreign-key 500", async () => {
    const created = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Space probe" }));
    const { task } = await readJson<{ task: { id: string } }>(created);

    const res = await tasksPut(jsonRequest("http://localhost/api/tasks", { id: task.id, spaceId: "" }, "PUT"));
    expect(res.status).toBe(200);
    expect((await readJson<{ task: { space_id: string } }>(res)).task.space_id).toBeTruthy();
  });
});

describe("GET /api/search", () => {
  it("returns results instead of 500 (unaliased visibility clause regression)", async () => {
    await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Searchable regression item" }));

    const res = await searchGet(new Request("http://localhost/api/search?q=Searchable&scope=productivity"));
    expect(res.status).toBe(200);
    const body = await readJson<{ results: Array<{ title: string }> }>(res);
    expect(body.results.some(r => r.title === "Searchable regression item")).toBe(true);
  });

  it("does not leak voided transactions", async () => {
    const created = await txPost(
      jsonRequest("http://localhost/api/finance/transactions", {
        transactionType: "expense",
        amount: "10.00",
        accountId: seed.checkingAccountId,
        categoryId: seed.expenseCategoryId,
        description: "VoidedSearchProbe",
        date: "2026-11-01",
      })
    );
    const { transaction } = await readJson<{ transaction: { id: string } }>(created);
    await txDelete(new Request(`http://localhost/api/finance/transactions?id=${transaction.id}`, { method: "DELETE" }));

    const res = await searchGet(new Request("http://localhost/api/search?q=VoidedSearchProbe&scope=finance"));
    expect((await readJson<{ results: unknown[] }>(res)).results).toHaveLength(0);
  });
});

describe("PUT /api/settings", () => {
  it("persists preferences (prototype-chain guard regression)", async () => {
    const put = await settingsPut(jsonRequest("http://localhost/api/settings", { workStart: "08:15", maxDailyWorkloadHours: 5 }, "PUT"));
    expect(put.status).toBe(200);

    const body = await readJson<{ preferences: { workStart: string; maxDailyWorkloadHours: number } }>(await settingsGet(new Request("http://localhost/api/settings")));
    expect(body.preferences.workStart).toBe("08:15");
    expect(body.preferences.maxDailyWorkloadHours).toBe(5);
  });

  it("still rejects a real prototype-pollution payload", async () => {
    const res = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: '{"__proto__":{"polluted":true}}',
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("safe-to-spend settings", () => {
  it("rejects a non-numeric buffer with 400 instead of persisting NaN", async () => {
    const res = await stsPost(jsonRequest("http://localhost/api/finance/safe-to-spend", { safetyBuffer: "abc" }));
    expect(res.status).toBe(400);
  });

  it("keeps the computed amount numeric after a rejected write", async () => {
    const body = await readJson<{ safeToSpend: { safeToSpendAmount: string } }>(await stsGet(new Request("http://localhost/api/finance/safe-to-spend")));
    expect(body.safeToSpend.safeToSpendAmount).not.toBe("NaN");
    expect(Number.isFinite(Number(body.safeToSpend.safeToSpendAmount))).toBe(true);
  });

  it("accepts and applies a valid buffer", async () => {
    const res = await stsPost(jsonRequest("http://localhost/api/finance/safe-to-spend", { safetyBuffer: "750", daysHorizon: 45 }));
    expect(res.status).toBe(200);
    const body = await readJson<{ safeToSpend: { safetyBuffer: string; daysHorizon: number } }>(res);
    expect(body.safeToSpend.safetyBuffer).toBe("750.00");
    expect(body.safeToSpend.daysHorizon).toBe(45);
  });
});

describe("AI policy and approvals", () => {
  it("persists a tool being disabled (is_enabled regression)", async () => {
    const put = await policiesPut(
      jsonRequest("http://localhost/api/ai/policies", {
        toolName: "get_habit_summary",
        capabilityLevel: "read_and_recommend",
        allowAutoExecution: false,
      }, "PUT")
    );
    expect(put.status).toBe(200);

    const body = await readJson<{ policies: Array<{ tool_name: string; is_enabled: number }> }>(await policiesGet(new Request("http://localhost/api/ai/policies")));
    expect(body.policies.find(p => p.tool_name === "get_habit_summary")?.is_enabled).toBe(0);
  });

  it("rejects an unknown approval decision", async () => {
    const drafted = await chatPost(jsonRequest("http://localhost/api/ai/chat", { message: "create task: decision probe" }));
    const draft = await readJson<{ draftProposal: { draftId: string } }>(drafted);

    const res = await approvalsPost(
      jsonRequest("http://localhost/api/ai/approvals", { draftId: draft.draftProposal.draftId, decision: "banana" })
    );
    expect(res.status).toBe(400);
  });

  it("writes calendar events when a daily plan is approved", async () => {
    const drafted = await chatPost(jsonRequest("http://localhost/api/ai/chat", { message: "plan my day" }));
    const draft = await readJson<{ draftProposal: { draftId: string } }>(drafted);

    const calendarUrl = "http://localhost/api/calendar?startDate=2000-01-01&endDate=2100-01-01";
    const countPlanBlocks = async (): Promise<number> => {
      const body = await readJson<{ events: Array<{ event_type: string; start_time: string }> }>(
        await calendarGet(new Request(calendarUrl))
      );
      return body.events.filter(event => event.event_type === "daily_plan_block").length;
    };

    const before = await countPlanBlocks();
    const res = await approvalsPost(
      jsonRequest("http://localhost/api/ai/approvals", { draftId: draft.draftProposal.draftId, decision: "approved" })
    );
    expect(res.status).toBe(200);
    expect((await readJson<{ success: boolean }>(res)).success).toBe(true);

    // The applier read `timeBlocks` while the producer emits `proposedTimeBlocks`,
    // so approval used to insert nothing and still report success.
    const after = await countPlanBlocks();
    expect(after).toBeGreaterThan(before);

    // And every block must be a parseable timestamp — the date prefix used to be
    // applied twice, producing `2026-11-13T2026-11-13T09:00:00`.
    const body = await readJson<{ events: Array<{ event_type: string; start_time: string; end_time: string }> }>(
      await calendarGet(new Request(calendarUrl))
    );
    for (const event of body.events.filter(e => e.event_type === "daily_plan_block")) {
      expect(Number.isNaN(Date.parse(event.start_time))).toBe(false);
      expect(event.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    }
  });

  it("answers the daily-summary intent without a 500", async () => {
    const res = await chatPost(jsonRequest("http://localhost/api/ai/chat", { message: "daily summary" }));
    expect(res.status).toBe(200);
    expect(typeof (await readJson<{ reply: string }>(res)).reply).toBe("string");
  });
});

describe("dashboard layout", () => {
  it("rejects an unknown workspace", async () => {
    const res = await layoutPost(jsonRequest("http://localhost/api/dashboard/layout", { workspace: "nope", widgets: [] }));
    expect(res.status).toBe(400);
  });

  it("round-trips a valid layout", async () => {
    const put = await layoutPost(jsonRequest("http://localhost/api/dashboard/layout", {
      workspace: "overview",
      widgets: [{ id: "w1", type: "today_summary" }],
    }));
    expect(put.status).toBe(200);

    const body = await readJson<{ layout: { widgets: unknown[] } }>(
      await layoutGet(new Request("http://localhost/api/dashboard/layout?workspace=overview"))
    );
    expect(body.layout.widgets).toHaveLength(1);
  });
});

describe("backup export/restore symmetry", () => {
  it("exports a payload that restore accepts, preserving every domain", async () => {
    const exported = await exportGet(new Request("http://localhost/api/backup/export"));
    expect(exported.status).toBe(200);
    const payload = await readJson<{
      domains: {
        productivity: { tasks: unknown[]; habits: unknown[]; projects: unknown[]; goals: unknown[] };
        finance: { accounts: unknown[]; transactions: unknown[]; journalLines: unknown[] };
      };
    }>(exported);

    expect(payload.domains.productivity.tasks.length).toBeGreaterThan(0);
    expect(payload.domains.finance.accounts.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.domains.productivity.habits)).toBe(true);

    const res = await restorePost(jsonRequest("http://localhost/api/backup/restore", payload));
    expect(res.status).toBe(200);
    const body = await readJson<{ success: boolean; imported: Record<string, number> }>(res);
    expect(body.success).toBe(true);
    // Habits/projects/goals were exported and silently discarded before.
    expect(body.imported).toHaveProperty("habits");
    expect(body.imported).toHaveProperty("projects");
    expect(body.imported).toHaveProperty("goals");
  });

  it("rejects a payload without a domains object", async () => {
    const res = await restorePost(jsonRequest("http://localhost/api/backup/restore", { nope: true }));
    expect(res.status).toBe(400);
  });
});

describe("backup is a raw dump", () => {
  it("includes archived tasks so a restore can bring them back", async () => {
    const created = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Archived backup probe" }));
    const { task } = await readJson<{ task: { id: string } }>(created);
    await tasksDelete(new Request(`http://localhost/api/tasks?id=${task.id}`, { method: "DELETE" }));

    const exported = await exportGet(new Request("http://localhost/api/backup/export"));
    const payload = await readJson<{ domains: { productivity: { tasks: Array<{ id: string; is_deleted: number }> } } }>(exported);
    const archived = payload.domains.productivity.tasks.find(row => row.id === task.id);
    // Operational filtering belongs in the UI; a backup that drops archived rows
    // makes them unrecoverable.
    expect(archived).toBeDefined();
    expect(archived?.is_deleted).toBe(1);
  });

  it("restores an archived task as archived, not silently re-activated", async () => {
    const created = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: "Restore fidelity probe" }));
    const { task } = await readJson<{ task: { id: string } }>(created);
    await tasksDelete(new Request(`http://localhost/api/tasks?id=${task.id}`, { method: "DELETE" }));

    const payload = await readJson<{ domains: unknown }>(
      await exportGet(new Request("http://localhost/api/backup/export"))
    );
    // Clear the row entirely, then restore: it must come back archived, not live.
    const { getDb } = await import("@/lib/db");
    getDb().prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

    const restored = await restorePost(jsonRequest("http://localhost/api/backup/restore", payload));
    expect(restored.status).toBe(200);

    const row = getDb().prepare("SELECT is_deleted, status FROM tasks WHERE id = ?").get(task.id) as
      | { is_deleted: number; status: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.is_deleted).toBe(1);

    // And it must not appear in operational listings.
    const list = await tasksGet(new Request("http://localhost/api/tasks?search=Restore%20fidelity%20probe"));
    expect((await readJson<{ tasks: Array<{ id: string }> }>(list)).tasks).toHaveLength(0);
  });
});

describe("token gating", () => {
  it("rejects a non-string title with a field error, not a TypeError", async () => {
    const res = await tasksPost(jsonRequest("http://localhost/api/tasks", { title: [1, 2] }));
    expect(res.status).toBe(400);
  });

  it("keeps a numeric problem reference out of the ledger", async () => {
    const res = await txPost(
      jsonRequest("http://localhost/api/finance/transactions", {
        transactionType: "expense",
        amount: "5.00",
        accountId: 42,
        description: "numeric account id",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("credit limit", () => {
  it("persists a credit limit so includeCreditLines can matter", async () => {
    const { POST: createAccount, PUT: updateAccount } = await import("@/app/api/finance/accounts/route");
    const created = await createAccount(
      jsonRequest("http://localhost/api/finance/accounts", {
        name: "Sweep Credit Line",
        type: "credit_card",
        openingBalance: "0",
        creditLimit: "2000",
      })
    );
    expect(created.status).toBe(201);
    const { account } = await readJson<{ account: { accountId: string; creditLimit: string } }>(created);
    expect(account.creditLimit).toBe("2000.00");

    const updated = await updateAccount(
      jsonRequest("http://localhost/api/finance/accounts", { id: account.accountId, creditLimit: "3500" }, "PUT")
    );
    expect(updated.status).toBe(200);
    expect((await readJson<{ account: { creditLimit: string } }>(updated)).account.creditLimit).toBe("3500.00");
  });
});

describe("restore into a fresh database", () => {
  it("imports a full payload with references that do not exist yet", async () => {
    // Take a real snapshot, then restore it into a brand-new database. This is the
    // actual disaster-recovery path: tasks reference spaces/projects/goals that
    // the payload itself brings, and FK deferral is what makes it work.
    const payload = await readJson<Record<string, unknown>>(
      await exportGet(new Request("http://localhost/api/backup/export"))
    );

    const previous = process.env.PERSONAL_OS_DB_PATH;
    const freshRoot = path.join(os.tmpdir(), `personal-os-fresh-${randomUUID()}`);
    fs.mkdirSync(freshRoot, { recursive: true });
    const freshDb = path.join(freshRoot, "profile.db");
    process.env.PERSONAL_OS_DB_PATH = freshDb;
    closeDb();

    try {
      // Seeding a fresh DB happens through getDb()'s migration path.
      const db = getDb();
      const tenant = db.prepare("SELECT id FROM tenants LIMIT 1").get() as { id: string };
      expect(tenant.id).toBeTruthy();

      const res = await restorePost(jsonRequest("http://localhost/api/backup/restore", payload));
      expect(res.status, JSON.stringify(await res.clone().json()).slice(0, 300)).toBe(200);

      const body = await readJson<{ imported: Record<string, number> }>(res);
      expect(body.imported.tasks).toBeGreaterThan(0);
      expect(body.imported.accounts).toBeGreaterThan(0);
      expect(body.imported.transactions).toBeGreaterThan(0);

      // Every exported domain must survive the trip.
      for (const domain of ["habits", "projects", "goals", "categories", "recurringRules", "savingsGoals", "debts"]) {
        expect(body.imported, `${domain} missing from restore counts`).toHaveProperty(domain);
      }

      const counts = db.prepare(
        "SELECT (SELECT COUNT(*) FROM recurring_financial_rules) rr, (SELECT COUNT(*) FROM savings_goals) sg, (SELECT COUNT(*) FROM debts) d"
      ).get() as { rr: number; sg: number; d: number };
      expect(counts.rr).toBeGreaterThan(0);
      expect(counts.sg).toBeGreaterThan(0);
      expect(counts.d).toBeGreaterThan(0);
    } finally {
      closeDb();
      process.env.PERSONAL_OS_DB_PATH = previous;
      fs.rmSync(freshRoot, { recursive: true, force: true });
      // Re-open the shared profile for the remaining specs in this file.
      getDb();
    }
  });

  it("preserves credit_limit and fingerprints across a round trip", async () => {
    const { POST: createAccount } = await import("@/app/api/finance/accounts/route");
    const created = await createAccount(
      jsonRequest("http://localhost/api/finance/accounts", {
        name: "Round Trip Card",
        type: "credit_card",
        creditLimit: "4321",
      })
    );
    const { account } = await readJson<{ account: { accountId: string } }>(created);

    // A CSV-imported transaction must also carry a fingerprint so strict mode can
    // see it after a restore.
    const csvText = `Date,Amount,Description
2026-11-02,-12.34,Round trip coffee`;
    const previewResponse = await importPreview(jsonRequest("http://localhost/api/finance/import", {
      action: "preview",
      accountId: account.accountId,
      fileName: "roundtrip.csv",
      csvText,
    }));
    const preview = await readJson<{ preview: { rows: unknown[]; fileHash: string } }>(previewResponse);
    await importCommit(jsonRequest("http://localhost/api/finance/import", {
      action: "commit",
      accountId: account.accountId,
      fileName: "roundtrip.csv",
      fileHash: preview.preview.fileHash,
      rows: preview.preview.rows,
    }));

    const payload = await readJson<{ domains: { finance: { accounts: Array<{ id: string; credit_limit: string | null }> } } }>(
      await exportGet(new Request("http://localhost/api/backup/export"))
    );
    const exported = payload.domains.finance.accounts.find(row => row.id === account.accountId);
    expect(exported?.credit_limit).toBe("4321.00");

    const restored = await restorePost(jsonRequest("http://localhost/api/backup/restore", payload));
    expect(restored.status).toBe(200);

    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const after = db.prepare("SELECT credit_limit FROM finance_accounts WHERE id = ?").get(account.accountId) as
      | { credit_limit: string | null }
      | undefined;
    expect(after?.credit_limit).toBe("4321.00");

    const missing = db.prepare(
      "SELECT COUNT(*) AS c FROM journal_transactions WHERE tenant_id = ? AND dup_fingerprint IS NULL"
    ).get(seed.tenantId) as { c: number };
    expect(missing.c, "restored rows must be fingerprinted for ?strict=1").toBe(0);

    // And the imported row is now visible to strict duplicate rejection.
    const strict = await txPost(
      jsonRequest("http://localhost/api/finance/transactions?strict=1", {
        transactionType: "expense",
        amount: "12.34",
        accountId: account.accountId,
        description: "Round trip coffee",
        date: "2026-11-02",
      })
    );
    expect(strict.status).toBe(409);
  });
});

describe("CSV imports participate in duplicate detection", () => {
  it("fingerprints committed rows so ?strict=1 rejects an identical post", async () => {
    const accounts = await (await accountsGet(new Request("http://localhost/api/finance/accounts"))).json();
    const accountId = accounts.accounts[0].accountId;
    const csvText = `Date,Amount,Description\n2026-11-03,-44.44,Fingerprint probe`;

    const preview = await readJson<{ preview: { rows: unknown[]; fileHash: string } }>(
      await importPreview(jsonRequest("http://localhost/api/finance/import", {
        action: "preview",
        accountId,
        fileName: "fp.csv",
        csvText,
      }))
    );
    await importCommit(jsonRequest("http://localhost/api/finance/import", {
      action: "commit",
      accountId,
      fileName: "fp.csv",
      fileHash: preview.preview.fileHash,
      rows: preview.preview.rows,
    }));

    const strict = await txPost(
      jsonRequest("http://localhost/api/finance/transactions?strict=1", {
        transactionType: "expense",
        amount: "44.44",
        accountId,
        description: "Fingerprint probe",
        date: "2026-11-03",
      })
    );
    expect(strict.status).toBe(409);
  });
});

describe("idempotency scoping", () => {
  it("does not replay a key against a different method or path", async () => {
    const key = `idem_scope_${Date.now()}`;
    const post = await tasksPost(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Idempotency-Key": key },
        body: JSON.stringify({ title: "Scoped replay probe" }),
      })
    );
    expect(post.status).toBe(201);

    const created = await readJson<{ task: { id: string } }>(post);
    const put = await tasksPut(
      new Request("http://localhost/api/tasks", {
        method: "PUT",
        headers: { "content-type": "application/json", "X-Idempotency-Key": key },
        body: JSON.stringify({ id: created.task.id, status: "next" }),
      })
    );
    // Same key, different operation: it must execute, not replay the 201.
    expect(put.status).toBe(200);
    expect(put.headers.get("idempotent-replay")).toBeNull();
    expect((await readJson<{ task: { status: string } }>(put)).task.status).toBe("next");
  });
});

describe("request correlation", () => {
  it("logs the request id the proxy assigned so the header can be looked up", async () => {
    const requestId = `req_regression_${Date.now()}`;
    const res = await tasksGet(new Request("http://localhost/api/tasks", { headers: { "x-request-id": requestId } }));
    expect(res.status).toBe(200);

    const tail = readApiLogTail(20);
    expect(tail.some(entry => entry.requestId === requestId && entry.path === "/api/tasks")).toBe(true);
  });
});

describe("idempotent replay", () => {
  it("returns the original response for a repeated key instead of creating twice", async () => {
    const key = `idem_regression_${Date.now()}`;
    const makeRequest = (): Request =>
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Idempotency-Key": key },
        body: JSON.stringify({ title: "Idempotent probe" }),
      });

    const first = await tasksPost(makeRequest());
    expect(first.status).toBe(201);
    const second = await tasksPost(makeRequest());
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replay")).toBe("true");

    const body = await readJson<{ tasks: Array<{ title: string }> }>(
      await tasksGet(new Request("http://localhost/api/tasks?search=Idempotent%20probe"))
    );
    expect(body.tasks.filter(t => t.title === "Idempotent probe")).toHaveLength(1);
  });
});
