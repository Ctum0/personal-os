# Contributing

## Setup

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Without credentials in the environment the app runs in open mode, which is the
right default for local development.

## The one gate

```bash
pnpm verify     # lint + typecheck + unit tests + build
```

A change is not done until `pnpm verify` passes and `pnpm test:e2e` passes for
anything that touches the UI. The E2E suite runs two projects: `open` (no
credentials) and `authed` (credentials configured, to exercise the sign-in gate).

## Rules that this codebase actually enforces

- **No `any`.** Use `unknown` plus the typed readers in `src/lib/api/fields.ts`.
  Tests and E2E are exempt because fixtures are deliberately loose.
- **No inline `import("pkg").Type`.** Use a top-level `import type`.
- **Every API route goes through `withApiLogging`** and the helpers in
  `src/lib/api/http.ts`. Do not hand-roll response shapes.
- **Tests seed the state they assert.** A test that passes on an empty database
  proves nothing about the bug it names.
- **Never commit a database, a backup, or a credential.** `data/` is ignored;
  credentials live only in the environment.

## Architecture in one paragraph

Next.js App Router. Authenticated pages live in the `(app)` route group, which
owns the shell (navbar, sidebar, modals); `/login` sits outside it. `src/proxy.ts`
gates both pages and `/api/*` before anything renders. Data access is SQLite
through `better-sqlite3` with migrations under `src/lib/db`. Money is
`decimal.js` end to end — never a float.
