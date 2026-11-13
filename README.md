# Personal OS

A local-first, single-operator operating system for your life's work —
productivity (tasks, projects, goals, habits, focus), a decimal-exact financial
ledger, and a permissioned planning assistant, all on one SQLite database you
own outright.

> **Product philosophy:** one operator, one machine, one source of truth.
> Data lives in `data/personal_os.db`. Nothing leaves the machine unless you
> export it. See [docs/adr/0001-deployment-strategy.md](docs/adr/0001-deployment-strategy.md)
> for the deployment direction (local-first now, optional encrypted sync relay later).

## Try it in one command

```bash
git clone https://github.com/Ctum0/personal-os.git
cd personal-os
cp .env.example .env      # then fill in the four credential values
docker compose up -d      # http://localhost:3000
```

The app is one Node process with SQLite on a named volume: no database server, no
cache, no external services. It idles at roughly 45 MB of memory.

### Local development

```bash
pnpm install
pnpm dev            # http://localhost:3000, open mode (no sign-in)
```

First boot creates and migrates `data/personal_os.db` automatically (current
schema version **7**, 53 tables — 52 domain tables plus `idempotency_keys`) and
seeds a starter workspace.

### Authentication

By default the app assumes a single trusted operator on loopback (open mode).
Set the four operator variables to require sign-in:

```bash
PERSONAL_OS_USERNAME=<your-username>
PERSONAL_OS_PASSWORD_SALT=<hex salt>
PERSONAL_OS_PASSWORD_HASH=<pbkdf2 hex digest>
PERSONAL_OS_PASSWORD_ITERATIONS=210000
PERSONAL_OS_SESSION_SECRET=<32 random bytes, hex>
pnpm dev
```

- **One account, no registration.** The credential exists only in configuration.
  There is no signup route, no password reset, and no user table to insert into,
  so a second account cannot be created through the app even by an authenticated
  operator.
- **Locked mode**: unauthenticated page requests are redirected to
  `/login?next=<path>` before anything renders, and `/api/*` calls get `401`. The
  application shell is not rendered for a signed-out visitor at all.
- **An incomplete credential set fails closed.** If some but not all of the four
  variables are present — a typo in a key name, a forgotten session secret —
  every request returns `503` naming the missing variables. It is never treated
  as "not configured", because that would silently publish an unauthenticated
  instance. Unset all four to get open mode.
- **Passwords are never stored.** `PERSONAL_OS_PASSWORD_HASH` is PBKDF2-HMAC-SHA256
  (210k iterations by default, 256-bit) over `PERSONAL_OS_PASSWORD_SALT`. The
  comparison is length-independent and does not short-circuit on the username.
- **Sessions are signed, not stored.** The cookie is
  `v1.<expiresAt>.<HMAC-SHA256>` over `v1.<username>.<expiresAt>`, `httpOnly`,
  `SameSite=Lax`, `Secure` in production, 7-day expiry. The expiry is inside the
  signature, so it cannot be extended by editing the cookie. No session table, no
  per-request database read.
- **Failed sign-ins are throttled** per client address: 5 failures in 10 minutes
  locks the address out for a minute, doubling per repeated lockout up to an hour.
- The gate lives in the Next 16 `proxy` convention: `src/proxy.ts` +
  `src/lib/api/gate.ts` (Edge runtime, WebCrypto only). The credential primitives
  are in `src/lib/auth/credentials.ts`; throttling is in
  `src/lib/auth/throttle.ts`.

Generate a credential set with:

```bash
node -e "const c=require('crypto');const salt=c.randomBytes(16).toString('hex');console.log('PERSONAL_OS_PASSWORD_SALT='+salt);console.log('PERSONAL_OS_PASSWORD_HASH='+c.pbkdf2Sync(process.argv[1],salt,210000,32,'sha256').toString('hex'));console.log('PERSONAL_OS_SESSION_SECRET='+c.randomBytes(32).toString('hex'))" 'your-password'
```

directory, and `next.config.ts` excludes `./data/**` from output file tracing.
A plain `pnpm build` therefore cannot migrate, snapshot, or ship your database.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PERSONAL_OS_USERNAME` | *(unset → open mode)* | The single operator account. |
| `PERSONAL_OS_PASSWORD_SALT` | *(unset → open mode)* | PBKDF2 salt for the operator password. |
| `PERSONAL_OS_PASSWORD_HASH` | *(unset → open mode)* | PBKDF2-HMAC-SHA256 digest of the operator password (hex). |
| `PERSONAL_OS_PASSWORD_ITERATIONS` | `210000` | PBKDF2 work factor; must match the digest. |
| `PERSONAL_OS_SESSION_SECRET` | *(unset → open mode)* | HMAC key for session cookies. Rotating it signs everyone out. |
| `PERSONAL_OS_DB_PATH` | `data/personal_os.db` | Database file override (sandboxed tests/E2E/CI, containers). |
| `PERSONAL_OS_TZ` | `Asia/Colombo` | Timezone used for calendar-day formatting (`src/lib/time`). |
| `E2E_CHROMIUM_PATH` | *(Playwright default)* | Distribution chromium for E2E (e.g. `/usr/bin/chromium`). |
| `E2E_USERNAME` / `E2E_PASSWORD` | fixture values | Credentials the `authed` E2E project signs in with. |
| `E2E_PASSWORD_SALT` / `E2E_PASSWORD_HASH` / `E2E_SESSION_SECRET` | fixed test values | Deterministic test-only auth config for the `authed` E2E project. |

## Testing

```bash
pnpm verify           # lint + typecheck + unit + build (the CI gate)
pnpm test             # vitest: 27 files / 251 tests
pnpm test:e2e         # Playwright: 103 specs on ports 3457 (open) + 3458 (authed)
```

The E2E suite runs with `workers: 1`: every spec mutates the same isolated
single-operator profile, so parallel workers would race each other. It covers:

- a **seeded whole-app axe sweep** (`e2e/axe-sweep.spec.ts`): all 29 routes with
  overflow data pre-seeded, so scroll containers and dense layouts are audited at
  a realistic volume rather than an empty profile;
- the accessibility baseline (one `h1`, labelled controls, named buttons, no
  horizontal overflow, text contrast computed from rendered colors);
- keyboard and dialog semantics (skip link, palette arrows/Enter, focus traps,
  Escape, mobile drawer);
- the write surfaces (settings save/reject, task archive persistence, AI
  governance toggle persistence);
- the backup export→restore round trip;
- the sign-in gate: pages redirect to `/login` before rendering, the API returns
  401, wrong credentials are rejected, and a deep link survives the round trip.

The suites are isolated by construction: every test database is either
in-memory or a temp file via `PERSONAL_OS_DB_PATH`, and the E2E server always
boots its own instance on port 3457 with `PERSONAL_OS_DB_PATH` pointed at a temp
profile — `reuseExistingServer` is off so a stray dev server can never be
adopted, and your live database is never opened.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs: install → lint →
typecheck → unit → build → E2E (chromium), with a throwaway database for every
step.

## Docker

```bash
docker build -t personal-os .
docker run -p 3000:3000 -v personal-os-data:/app/data personal-os
# exposed deployments:
docker run -p 3000:3000 -v personal-os-data:/app/data \
  -e PERSONAL_OS_USERNAME=<your-username> \
  -e PERSONAL_OS_PASSWORD_SALT=... -e PERSONAL_OS_PASSWORD_HASH=... \
  -e PERSONAL_OS_SESSION_SECRET=... \
  personal-os
```

The container is a node:22-alpine multi-stage build (standalone output, non-root
user). `.dockerignore` keeps `data/`, `.artifacts/`, `.next/` and `node_modules/`
out of the build context, and only the traced standalone output is copied into
the runtime image — the build-time `node_modules` tree and your database never
ship. SQLite data persists in `/app/data`; see
`docs/adr/0001-deployment-strategy.md`. Production deployment (Coolify, Caddy
ingress, resource limits, credential rotation, backup/restore) is documented in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## API surface

37 route files under `/api/*`. Conventions worth knowing:

- **Validation**: every body is read with typed field readers
  (`src/lib/api/fields.ts`); bad input is always `400 { error }`, never a 500.
  Calendar dates must be real (`2026-02-31` is rejected), datetimes are
  clock-bounded, and money is normalized to 2dp.
- **Errors**: `src/lib/api/http.ts` maps `FieldError` → its status, FK
  violations → 400, `UNIQUE` violations → 409, anything else → 500. Deleting or
  voiding a missing row returns 404, not a false success.
- **Tenancy**: every query is scoped by `tenant_id` from `getCurrentSession()`;
  cross-tenant ids are rejected with 404 rather than written.
- **Idempotency**: mutations accept `X-Idempotency-Key` and replay the stored
  response (`idempotent-replay: true`). The offline queue reuses one key across
  the live attempt and its replay.
- **Bounded reads**: list endpoints clamp `limit`/`offset` and report
  `total`/`hasMore`; calendar reads are capped at 2000 events.

Highlights:

- `GET /api/tasks?limit=&offset=` → bounded windows with `total`/`hasMore`;
  quarantined records are excluded unless `includeQuarantined=1`.
- `POST /api/finance/transactions?strict=1` → hard-rejects posted byte-identical
  duplicates with `409 {duplicateOf}` (persisted `dup_fingerprint`, migration
  v5). Default stays advisory (`duplicateWarning`).
- `GET /api/search?q=&scope=` → cross-domain search (tasks, projects, goals,
  accounts, **posted** transactions only).
- `POST /api/ai/approvals` → applies a draft (`decision` must be
  `approved`/`rejected`); `apply_daily_plan` writes `daily_plan_block` events
  with full ISO timestamps.
- `GET /api/backup/export` / `POST /api/backup/restore` → symmetric,
  tenant-safe round trip across every domain.

## Architecture map

```
src/
  app/            # Next.js App Router pages + 37 API route files
  components/     # UI (layout shell, modals, design-system primitives)
  lib/
    db/           # SQLite bootstrap, migrations (v1..v7), maintenance, validation
    finance/      # decimal-exact ledger engine: balances, budgets, net worth, debt
    productivity/ # progress/streak engines + the planning scheduler
    ai/           # tool registry, permission policy, draft/approval machinery
    api/          # gate, typed field readers, HTTP contract, logging, idempotency, client
    offline/      # localStorage mutation queue + guardOffline()
    jobs/         # scheduled jobs (net worth daily snapshot)
    time/         # calendar-day helpers in the configured timezone
    ui/           # contrast helpers for operator-supplied colors
  proxy.ts        # Next 16 gate for pages and /api/* (replaces middleware.ts)
  tests/          # vitest suites incl. direct route-handler contracts
e2e/              # Playwright workflows (incl. sign-in gate + a11y)
docs/adr/         # architecture decision records
```

### Financial model, precisely

Money is stored as TEXT and computed with `decimal.js` (precision 28,
`ROUND_HALF_UP`). Account balances derive from posted journal transactions;
`journal_lines` is the audit record written alongside each transaction (and
preserved when a transaction is voided). Budgets are computed at read time, so a
month-end budget auto-rolls into the current month without rewriting the
persisted period. Safe-to-spend subtracts pending expenses, recurring
obligations (including overdue ones), earmarked savings capped at their linked
ledger balance, overdrafts, and the configured safety buffer; available credit
counts only when `include_credit_lines` is enabled and the account has a
`credit_limit`.
