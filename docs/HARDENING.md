# Personal OS — Hardening Record

Baseline when this record started: 47 SQLite tables, 30 tests, `tsc` clean.
Current state: **53 tables, schema v7, 27 unit/route suites (251 tests), 103
Playwright specs across two projects (`open` + `authed`), zero lint problems,
`tsc` clean, zero axe violations with seeded overflow data, CI green, and
verified end to end as a deployed container behind a sign-in gate.**

This file is the durable record of *what was wrong and how it is now
prevented*. Every row names a verification that fails if the defect returns.

## Why this exists

The gap between this app and one you can trust with real money and real days is
**correctness, recovery and honesty**. Features built before those three are
built on sand. The rules that came out of the first hardening pass, and still
govern changes:

1. Never silently corrupt data. A tool that is sometimes wrong is worse than a
   tool that does less.
2. No dead controls. A toggle that persists nothing teaches the operator the app
   lies.
3. The daily loop must cost under a minute: capture → today → close the day.

## Defect ledger

Status is `FIXED` only where a test or spec now fails on regression.

| # | Defect | Root cause | Status / guard |
|---|--------|-----------|----------------|
| 1 | Calendar days computed in UTC | `toISOString()` used for local calendar math | **FIXED** — `src/lib/time` owns day math (`toISODate`/`todayISO`/`addDaysISO`); the calendar page no longer serializes local noon as UTC. |
| 2 | Money aggregated as SQL REAL | `CAST(amount AS REAL)` before any decimal library ran | **FIXED** — `sumDecimalAmounts` + `decimal.js` (precision 28, HALF_UP) everywhere; TEXT stored end to end. |
| 3 | Voiding deleted `journal_lines` | DELETE handler contradicted its own comment | **FIXED** — soft-void preserves lines; balances filter `status='posted'`. Guarded by `hardening.test.ts`. |
| 4 | No migration path | `CREATE TABLE IF NOT EXISTS` only | **FIXED** — versioned migrations on `PRAGMA user_version`, pre-upgrade `VACUUM INTO` snapshot. `LATEST_SCHEMA_VERSION` is the single source for test expectations. |
| 5 | No authentication | Anything on the port could read/write | **FIXED** — single-operator sign-in: `src/proxy.ts` + `src/lib/api/gate.ts` verify an HMAC-signed session cookie minted by `src/app/api/auth/session`; PBKDF2-HMAC-SHA256 over a per-deployment salt with a length-independent comparison. `e2e/auth-gate.spec.ts` and `src/tests/gate.test.ts` pin the contract. |
| 6 | No restore path | Export only, and it was assembled client-side from paginated endpoints | **FIXED** — `GET /api/backup/export` (server side, unpaginated, every domain) and a tenant-safe, idempotent `POST /api/backup/restore` with a pre-restore snapshot. |
| 7 | Dead surfaces that discarded input | Focus, settings, AI governance toggles had no working persistence | **FIXED** — routes exist and are exercised; `e2e/a11y-and-errors.spec.ts` asserts a settings save round-trips and a rejected save is visible. |
| 8 | Offline queue never replayed | Export without import | **FIXED** — `syncOfflineQueue` drains on reconnect, and replays reuse one `X-Idempotency-Key` whose response the server stores (migration v7). |
| 9 | PWA manifest pointed at missing icons | Assets were never generated | **FIXED** — 192/512 icons exist in `public/`. |

## Second audit: defects found after the "FIXED" claims

The table above was written before a full-codebase audit. That audit found the
first pass had fixed symptoms and left several contract-level breaks. Those are
recorded here with the guard that now prevents each one.

| # | Defect | Impact | Guard |
|---|--------|--------|-------|
| 10 | `taskVisibleClause()` defaulted its alias to `t` and was interpolated into unaliased queries | `GET /api/search` and two AI tools always returned 500 | Alias is now **required**; `audit-regressions.test.ts` + `api-regressions.test.ts` exercise both call shapes |
| 11 | `DELETE /api/tasks` used `datetime("now")` | better-sqlite3 (DQS off) rejects it; every archive returned 500 while the row stayed undeleted | `api-regressions.test.ts` archives a task and asserts it is gone after reload |
| 12 | Settings PUT guarded with `'constructor' in body` | `in` walks the prototype chain, so **every** save returned 400 while the UI said "Rules Applied" | `Object.hasOwn` checks; regression test asserts a real save persists and a `__proto__` payload is still rejected |
| 13 | Plan approval read `payload.timeBlocks` | Producer emits `proposedTimeBlocks`, so approval wrote nothing and reported success | Applier reads the real field, fails loudly when empty, and normalizes timestamps once (`toEventTimestamp`); regression test counts `daily_plan_block` events and validates the ISO shape |
| 14 | AI approvals accepted any `decision` string | `"banana"` executed the action | `decision` validated against `approved`/`rejected` (aliases accepted) |
| 15 | AI policy PUT forced `is_enabled = 1` for non-auto tools | Governance toggles could never disable anything | `allowAutoExecution === false` → `is_enabled = 0`; regression test round-trips a disable |
| 16 | Safe-to-spend POST accepted non-numeric buffers | Persisted `"NaN"`, which then rendered as `$NaN` | `optionalMoney`/`optionalInt`/`optionalBoolean` validation, plus a defensive parse in the engine so an already-poisoned row degrades instead of propagating |
| 17 | `.trim()` before a typeof check on 7 routes | A numeric `title`/`name` produced a 500 | All bodies read through `src/lib/api/fields.ts`; numeric input is a 400 |
| 18 | `isISODateString` accepted `2026-02-31` | Impossible dates into tasks/calendar/recurring | Real calendar-date and clock-bounded validation in `validate.ts` **and** the field readers |
| 19 | Calendar GET ignored the `spaceId` the page sends | Every space's blocks mixed into one grid | `spaceId` honored; also capped at 2000 events |
| 20 | Analytics bound overdue params out of SQL order | Space-filtered overdue count silently became 0 | Params bound in SQL order; space filter made consistent across projects/habits/focus |
| 21 | Mutations returned `{success:true}` for missing rows | Deleting a nonexistent transaction looked successful | `changes === 0` → 404 across delete/void handlers |
| 22 | Backup export truncated at 100 transactions | Server-side export replaces client assembly; restore accepts the same shape | Round-trip test in `api-regressions.test.ts` (habits/projects/goals included) |
| 23 | Request logging covered 3 of 79 handlers and could not correlate | `withApiLogging` skipped the id the handler set | Every handler is wrapped; the proxy forwards `x-request-id` on the request; the wrapper reads it (and never mutates handler headers, which can be immutable) |
| 24 | Offline queue minted two different idempotency keys | A lost response became a duplicate on replay | One key per operation, shared by the live attempt and the replay; server stores and replays the response |
| 25 | `getInMemoryDb()` skipped migrations | Test DBs lacked `weekly_reviews`, `dup_fingerprint`, `idempotency_keys` | Runs the full migration chain; parity asserted in `audit-regressions.test.ts` |
| 26 | `snapshotDatabase()` derived its directory from the live path | Building or testing wrote snapshots into `data/backups/` | Directory follows the handle being snapshotted; in-memory DBs are skipped; asserted by a test that points the live path elsewhere |
| 27 | `next build` opened, migrated and snapshotted the live database | A plain `pnpm build` mutated real data and traced `data/` into the standalone output | Build-phase detection resolves to a temp profile; `outputFileTracingExcludes` drops `./data/**` |
| 28 | `.artifacts/` was committed, including 17 real DB snapshots | Personal ledger data in git history | Untracked + ignored; `.dockerignore` keeps it (and `data/`) out of images. **History rewrite is an operator decision, not automated** — see below |
| 29 | Dockerfile declared `VOLUME` before `chown` and copied build `node_modules` | Non-root first boot could fail; the image shipped a host-built binary tree | `mkdir`/`chown` before `VOLUME`; only traced standalone output is copied |
| 30 | Lint was defined but never gated | 399 errors accumulated invisibly | `pnpm lint` runs in CI; `eslint.config.mjs` ignores generated dirs so the signal is real |
| 31 | Ten scroll containers were mouse-only | Keyboard users could not scroll lists (axe `scrollable-region-focusable`), and the violation only appeared once content overflowed — so an empty test profile hid it | Every scroll container is focusable and labelled; `e2e/axe-sweep.spec.ts` **seeds overflow data** before auditing so the check can actually see the problem |
| 32 | Operator-supplied colors were used as text backgrounds with fixed white ink | Mid-tone hues (`#6366f1`) failed AA against both black and white | `src/lib/ui/contrast.ts` darkens the surface until the chosen ink passes 4.5:1, keeping the hue; unit-tested against six real hues |
| 33 | Visible label text was replaced, not extended, by `aria-label` | WCAG 2.5.3 failures on habit rows, calendar blocks and explainer buttons | Names contain the visible text (state moved to `aria-pressed`/`aria-describedby`/`sr-only`); the seeded axe sweep enforces it |
| 34 | Settings could silently discard an edit | A slow preferences GET resolved after the operator typed, re-applying stale values — and the following save persisted them | The form is disabled until preferences load and tracks edits, so a late response can never clobber input |
| 35 | A failed policy load rendered "everything enabled" | The AI governance page fell back to its permissive catalog defaults, asserting every consequential tool was on | Unknown state renders as `unknown` with the switch disabled; only a successful read produces an on/off state |
| 36 | `next build` pulled better-sqlite3 into the browser bundle | A client module imported a server-only constant, so every page failed to compile | The header constant lives in a dependency-free module; verified by a successful production build |
| 37 | PIN-mode E2E was skip-only | The spec called `test.skip(!PIN)` and nothing set `E2E_PIN`, so four tests reported coverage that never ran | Playwright now defines two projects: `open` (3457) and `authed` (3458, own dist dir + DB + operator credentials); the gate spec fails loudly if the server booted open, and CI sets the fixture credentials |
| 38 | Planner read a non-existent `bills` table | The "financial context in planning" opt-in returned `[]` forever, silently | Reads `recurring_financial_rules` (bill/subscription/loan_payment due within 7 days) |
| 39 | Planner fed the scheduler a fabricated `streak: 3` | Every habit looked identically consistent; reasoning was based on invented data | Streaks come from `calculateHabitStreak` over `habit_logs` |
| 40 | Plan proposals mangled block times and ignored the work day | An integer hour advanced while minutes were dropped (`09:00–10:45` for a 09:00 45-min task), and `workEnd` bound nothing | Minute-axis placement honoring both `workEnd` and `maxDailyWorkloadHours`; blocks that cannot fit are omitted instead of overflowing |
| 41 | Backup dropped archived and quarantined tasks | Restore could never recover the two categories a backup most needs | Export is a raw tenant dump; regression test archives a task and asserts it is present with `is_deleted = 1` |
| 42 | Export could silently do nothing | `revokeObjectURL` ran in the same tick as `click()` | Released on a timer instead |
| 43 | `credit_limit` had no writer | `includeCreditLines` was inert: every account's limit was `0.00` | `POST`/`PUT /api/finance/accounts` accept it; the account form exposes it for credit cards |
| 44 | Transaction list could show a pre-write snapshot | Concurrent loaders (search, data-changed, post-submit) had no sequencing, so an older GET could resolve last | Monotonic request generation; stale responses are dropped |
| 45 | Idempotency replay ignored method/path | A reused key could replay one operation's response for another and skip the write | Stored `method`/`path` are compared; a mismatch is a fresh request |
| 46 | CI shared one database across every step | Build, unit and E2E migrated the same file, so results depended on step order | Per-run, per-step scratch paths (`${{ github.run_id }}`) and distinct E2E/PIN databases |
| 47 | Restore re-activated archived tasks | `is_deleted`/`completion_at` were not in the insert, so a backup of archived work came back live | Restore passes `is_deleted`, `completion_at`, `due_time`, `start_date`; regression test deletes a row, restores, and asserts it returns archived and invisible to listings |
| 48 | The conversational planner ignored working hours | `buildIntelligentDailySchedule` read `operatingRules.dayStart`, which `getPlanningContext` never sets, so it always used 07:00–22:30 — the `/api/planning/chat` path, i.e. what the operator actually uses | Falls back through `workingHours.start/end`; capacity math uses the real day |
| 49 | Planner fixes were untested (how they rotted once) | `planner-intelligence.test.ts` only asserted enabled/quarantined, so deleting the whole bills query still passed | Tests pin real obligations (aliased `amount`/`dueDate`, ±7-day window), computed streaks (3 vs 0), minute-axis block placement, and the work-day/capacity ceiling |
| 50 | The axe sweep could not see two containers it was credited with guarding | Weekly reviews and the CSV preview are React state, so an API-only seed left both scroll containers absent from the DOM | The sweep seeds 12 reviews via the API and drives the real import file-input flow, asserting the preview table renders before auditing |
| 51 | The axe seed was non-deterministic | Soft-deleted rows accumulated across runs and changed the DOM (dense clusters appeared after run 2) | Cleanup deletes sweep rows directly in the isolated profile; verified two consecutive runs both 29/29 with zero residue |
| 52 | The PIN gate was a single shared secret with no account identity | A short numeric PIN compared as an unsalted digest, no username, no attempt limiting | Replaced by a single configured operator account: PBKDF2-HMAC-SHA256 (210k iterations) over a per-deployment salt, length-independent comparison, HMAC-signed session cookie whose expiry is inside the signature, and per-address throttling (5 failures → 1 min, doubling to 1 h). No registration route exists. `src/tests/gate.test.ts` (21 tests) + `e2e/auth-gate.spec.ts` (6 specs) |
| 53 | Restore dropped ten of the exported domains | The restore route was written before recurring rules, savings goals, debts, payees, calendar events, focus sessions, daily plans, plan items, import batches and safe-to-spend settings were added to the export | Every exported domain now has a restore step; `defer_foreign_keys` makes cross-referenced rows legal in any order; the tenant lookup map covers all tables. A test imports a real export into a genuinely fresh database |
| 54 | Restored rows broke FK ordering | Tasks reference spaces/projects/goals that are restored later in the payload | `db.pragma('defer_foreign_keys = ON')` inside the restore transaction, checked at COMMIT |
| 55 | `?strict=1` could not see CSV-imported rows | The CSV commit path omitted `dup_fingerprint`, so imported statements never matched the duplicate gate | `csv-import.ts` now writes `transactionFingerprint(...)` per row; a test commits a CSV then posts the same transaction and expects 409 |
| 56 | `pnpm install --frozen-lockfile` failed in Docker and CI | pnpm 12 reads build-script approvals from `pnpm-workspace.yaml` (`allowBuilds`), not the `pnpm` field in `package.json`; the Dockerfile did not copy the file | Settings live in `pnpm-workspace.yaml`; the Dockerfile copies it into the deps stage. Verified with a full image build |
| 57 | The production image had never been built | The Dockerfile and `.dockerignore` were written but never exercised | Built and run: `/login` 200, unauthenticated API 401, correct credentials 200, data survives `docker restart`, 44 MB RSS idle under a 384 MB limit |
| 58 | Coolify's build OOM'd at type-check | Coolify injects the runtime `NODE_OPTIONS=--max-old-space-size=256` into every stage; `next build` needs more | The build step sets `NODE_OPTIONS=--max-old-space-size=2048` inline and overrides the injected value for that RUN only |

| 59 | The application shell rendered for signed-out visitors | The gate only matched `/api/*`, and the root layout rendered the navbar and sidebar for every route, so a visitor could browse the navigation while every data call failed | Routes moved into the `(app)` group so the root layout is document-only; `src/proxy.ts` now redirects signed-out page requests to `/login?next=` before rendering. `e2e/auth-gate.spec.ts` asserts the sign-in page has no navigation landmark |
| 60 | The proxy rejected the sign-in route itself | The `/api/*` branch returned 401 without consulting the gate's answer, so the one exempt path was unreachable — sign-in was impossible on any credentialed deployment | The branch honours `gateRequest`'s answer; pinned by a unit test |
| 61 | A partial credential set failed open | `readAuthConfig` returned `null` for both "nothing configured" and "some variables missing", and `null` means allow-everything | Auth configuration is three-way (`open` / `incomplete` / `configured`); `incomplete` returns 503 naming the missing variables from pages, API and the sign-in route alike |
| 62 | The Docker image had never been built or scanned for size | The Dockerfile and pnpm settings were written but unexercised | Built and run repeatedly; `pnpm-workspace.yaml` carries the pnpm 12 `allowBuilds` setting (the `pnpm` field in package.json is ignored by pnpm 12), and the build stage sets its own heap ceiling because the runtime `NODE_OPTIONS` is too small to type-check |
| 63 | The documented install did not work | `.env.example` was gitignored, its values were empty (so compose's `:?` guards failed on the template), and the healthcheck probed `/login`, which redirects 307 in open mode | The template is tracked with `REPLACE_ME` placeholders, and the healthcheck probes `/api/auth/session`, which answers 200 in both modes. Verified with a real `docker compose up`: healthy |
| 64 | CI never ran | `pnpm/action-setup` declared `version: 12` while package.json declared `pnpm@12.11.2`; the action refuses to choose and fails before any step | The workflow specifies no version and lets the action read `packageManager`. First green run: 43443459568 |
| 65 | Real ledger snapshots and credentials were in repository history | `data/backups/` (20 SQLite snapshots with operator data), `.agents/`, and a committed PBKDF2 digest | History rewritten: no `.db`, no `.agents/`, no credential value in any reachable commit; verified by scanning every commit before the repository was made public |

| 66 | PWA icons redirected to the sign-in page | The gate's static-asset check enumerated filenames (`/icon.svg`, `/icon.png`), and the manifest also ships `/icon-512.png` — signed out, that request was redirected to `/login`, silently breaking installability | The check is now an asset-extension test, so any icon added later stays public. `e2e/auth-gate.spec.ts` asserts every manifest asset returns 200 unauthenticated |
| 67 | A contributor's `.env` could be baked into the image | `.dockerignore` had no `.env` rule, `COPY . .` sent it into the build, and Next loads `.env` during `next build` | `.dockerignore` excludes `.env*` but keeps `.env.example`; verified with a canary value present in a real `.env` |

| 68 | Auto-deploy silently stopped while reporting success | The GitHub webhook answers 200 and matches applications by repository URL form; after the app's source moved from `git@github.com:…` to `https://github.com/…`, the hook still answered 200 but matched nothing, so five commits sat undeployed | Deployment moved into CI: a `deploy` job with `needs: verify` calls `POST /api/v1/deploy?uuid=<app-uuid>` using repository secrets. UUID addressing cannot break when the git URL form changes, and a failing gate now blocks the deploy instead of racing it |

## Known open (not fixed, not covered by a gate)

Each item is reproducible and none is a regression of the fixes above. They are
listed so "all gates green" is not read as "no defects":

| Item | Where | Impact |
|---|---|---|
| Routines tab is a local-only preview | `src/app/productivity/habits/page.tsx` | Step checkboxes are labelled as a preview and are not persisted; the `routines`/`routine_steps` tables have no write path yet. |
| Multi-currency amounts are summed as one currency | `src/lib/finance/engine.ts` | `base_amount`/`exchange_rate` exist but no calculation reads them, so mixed-currency ledgers add units. |
| AI approval drafts are single-operator | `src/lib/ai/tools.ts` | `applyAiActionDraft` requires the draft's owner, so a second operator cannot approve. Acceptable for the single-operator product, wrong for multi-user. |
| Multi-tenant isolation is enforced per query, not by the engine | `src/lib/db/*` | Every query filters `tenant_id` explicitly; a new query that forgets the filter would leak across tenants. Single-operator today, so no data exists to leak. |

## Git history note (operator decision required)

`.artifacts/` contained 17 tracked SQLite snapshots (≈88 MB) including real
ledger rows and the operator identity. They are now untracked and ignored, but
they remain in **history**. Rewriting published history is irreversible and
breaks every existing clone, so it is intentionally not performed by tooling:

```bash
# Review first — this rewrites every commit and requires a force-push.
git filter-repo --path .artifacts --invert-paths
```

If this repository has never been pushed anywhere, rewriting is safe. If it has,
treat the snapshots as already disclosed and rotate anything they could contain.

## Non-goals

- No multi-tenant SaaS polish. The `tenants`/`users`/`spaces` tables exist; they
  are not the product. The single-operator path must be airtight first.
- No new features before correctness. Anything built on a wrong ledger gets
  rewritten.

## Verification

```bash
pnpm verify     # lint + typecheck + unit + build (what CI gates)
pnpm test:e2e   # Playwright: workflows, PIN gate, a11y/contrast, error surfaces
```

Both must be green before a change is considered done. A "FIXED" claim without a
test in this repository is not a claim, it is a hope.
