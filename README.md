# Personal OS

A local-first, single-user operating system for your life's work —
productivity (tasks, projects, goals, habits, focus), a real double-entry
financial ledger, and an AI planning layer, all on one SQLite database you
own outright.

> **Product philosophy:** one operator, one machine, one source of truth.
> Data lives in `data/personal_os.db`. Nothing leaves the machine unless
> you export it. See [docs/adr/0001-deployment-strategy.md](docs/adr/0001-deployment-strategy.md)
> for the deployment direction (local-first now, optional encrypted sync relay later).

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

First boot creates and migrates `data/personal_os.db` automatically
(current schema version 5) and seeds a starter workspace.

### Optional hardening: PIN gate

By default the app assumes a single trusted operator on loopback (open mode).
Set `PERSONAL_OS_PIN` to lock every `/api/*` route:

```bash
PERSONAL_OS_PIN=1234 pnpm dev
```

- Locked mode: unauthenticated API calls get `401` + `WWW-Authenticate`.
  Unlock via the `/unlock` page or `POST /api/auth/session` with the PIN —
  this sets an httpOnly session cookie (a SHA-256 digest of the pin; the raw
  pin is never stored).
- The gate lives in the Next 16 `proxy` convention: `src/proxy.ts` +
  `src/lib/api/gate.ts` (edge-safe constant-time digest compare).

## Data & operations

| Concern | Where | Notes |
| --- | --- | --- |
| Live database | `data/personal_os.db` | SQLite, WAL mode. Overridable with `PERSONAL_OS_DB_PATH` (used by tests, backups, E2E, CI). |
| Auto snapshots | `data/backups/auto/` | Maintenance job (`src/lib/db/maintenance.ts`) runs once per process; 24h staleness window, newest 10 retained, `quick_check` verified. Also `POST /api/backup/maintenance?force=1` (GET for status). |
| Pre-upgrade snapshot | `data/backups/` | `snapshotDatabase()` runs a `VACUUM INTO` before every migration. |
| Full JSON export | `/overview/backup` | Zero-lock-in export (all entities, exact decimal strings), plus restore. |
| Access logs | `data/logs/` | JSON-lines, one file per day, correlated by `x-request-id` (assigned in `src/proxy.ts`). Tail via `GET /api/observability/logs?tail=50`. |
| Net-worth history | `net_worth_snapshots` table | Daily job (`src/lib/jobs/netWorth.ts`), idempotent `UNIQUE(tenant_id, snapshot_date)` upsert. |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PERSONAL_OS_PIN` | *(unset → open mode)* | Enables the API gate. |
| `PERSONAL_OS_DB_PATH` | `data/personal_os.db` | Database file override (sandboxed tests/E2E/CI, containers). |
| `E2E_CHROMIUM_PATH` | *(Playwright default)* | Distribution chromium for E2E (e.g. `/usr/bin/chromium`). |

## Testing

```bash
pnpm test             # vitest unit + route-handler suites (180 tests)
pnpm test:e2e         # Playwright: 26 workflows on port 3457
pnpm exec tsc --noEmit
pnpm build
```

The E2E suite never touches your data: it boots its own server on port 3457
with an isolated profile DB (`/tmp/opencode/personal-os-e2e/profile.db`) and
build directory (`.next-e2e/`), so your running dev server and live DB stay
untouched during test runs.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the same
pipeline: install → typecheck → unit → build → E2E (chromium).

## Docker

```bash
docker build -t personal-os .
docker run -p 3000:3000 -v personal-os-data:/app/data personal-os
# exposed deployments:
docker run -p 3000:3000 -v personal-os-data:/app/data -e PERSONAL_OS_PIN=1234 personal-os
```

The container is a node:22-alpine multi-stage build (standalone output,
non-root user). SQLite data persists in `/app/data` (auto snapshots log
there too). Orchestration tools like Hostinger EasyPanel map the volume; see
`docs/adr/0001-deployment-strategy.md`.

## API surface

~35 routes under `/api/*` (tasks, habits, projects, goals, calendar, focus,
journal/transactions, budgets, recurring rules, net worth, backup, weekly
review, observability, AI planning). Highlights:

- `GET /api/tasks?limit=&offset=` → bounded windows with `total`/`hasMore`.
- `POST /api/finance/transactions?strict=1` → hard-rejects posted
  byte-identical duplicates with `409 {duplicateOf}` (persisted
  `dup_fingerprint`, migration v5). Default stays advisory (`duplicateWarning`).
- `POST /api/auth/session` → unlock round-trip (gate-exempt, PIN mode only).

## Architecture map

```
src/
  app/            # Next.js App Router pages + API routes
  components/     # UI (layout shell, modals, design-system primitives)
  lib/
    db/           # SQLite bootstrap, migrations (v1..v5), maintenance job
    finance/      # double-entry engine: balances, budgets, net worth, debt
    offline/      # localStorage mutation queue + guardOffline()
    api/          # request gate, logging, pagination helpers
    jobs/         # scheduled jobs (net worth daily snapshot)
  proxy.ts        # Next 16 API gate (replaces deprecated middleware.ts)
  tests/          # vitest suites incl. direct route-handler contracts
e2e/              # Playwright workflows
docs/adr/         # architecture decision records
```
