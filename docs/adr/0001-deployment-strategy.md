# ADR 0001: Deployment Strategy for Personal OS

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** Product owner + engineering

## Context

Personal OS is a local-first, single-user system: one SQLite database
(`data/personal_os.db`), one assumed primary user, and API/UI surfaces that
trust the local operator. The market context pulls in three directions at
once:

1. **Local workstation (current)** — where the product lives today; data
   sovereignty is the selling point.
2. **Hosted multi-tenant SaaS** — the default commercial gravity; recurring
   revenue, but a fundamentally different trust and compliance model.
3. **Sync-enriched local-first** — keep local authority, add encrypted
   replication to a relay for backup + device continuity (Obsidian Sync /
   Superhuman-style hybrid).

The audit sprint (ACCEPTANCE-REPORT §7) made the auth posture explicit: there
is now a real API gate (`src/proxy.ts` + `PERSONAL_OS_PIN`, httpOnly session
cookie, `/unlock` page) plus scheduled auto-backup maintenance — i.e. the
app can already protect and recover a deployed database. This ADR decides
how far toward hosting this codebase goes, because that choice drives a
large share of remaining work (offline queue semantics, multi-tenancy depth,
observability retention).

## Options considered

### A. Pure local-first workstation (current default)

Run Node locally; `PERSONAL_OS_PIN` set for machines that leave the desk.

- ✅ Data sovereignty; SQLite single-file portability (`data/backups`,
  JSON export, Docker `VOLUME /app/data`).
- ✅ Zero marginal infra cost. No per-tenant isolation attack surface.
- ✅ The gate only needs the single-PIN model it already implements.
- ❌ No phone/away access without VPN/tunnel.
- ❌ Upgrades are the operator's job.

### B. Hosted multi-tenant SaaS

Fork the app into a hosted product; CRDs become per-user tenants (the schema
already carries `tenant_id`, which would help).

- ✅ Recurring revenue; ubiquitous access.
- ❌ This redirect is *not* what the current auth model is built for: the
  gate's single-PIN/open-mode design has no per-user identity, no RBAC, no
  rate limiting, no tenant-scoped enforcement beyond `getCurrentSession()`
  trusting "first user in DB". Hosting this code as a genuine multi-tenant
  product means replacing auth wholesale (sessions, RBAC, tenant scoping
  verification on every route).
- ❌ Regulatory floors that do not exist locally (PCI posture for financial
  ledger data, data residency, audit retention policies).
- ❌ Fundamentally walks away from the local-first product philosophy that
  defines the codebase.

### C. Sync-enriched local-first (chosen direction)

Local stays the authority. Add: (1) authenticated remote sync relay that
receives encrypted snapshot streams, (2) device id in backup metadata so a
windowed auto-backup per device stays coherent, (3) the already-planned
offline queue (`guardOffline()`) extends naturally to sync instead of
requiring cloud semantics.

- ✅ Keeps every A-advantage (sovereignty, portability, cost).
- ✅ Reuses shipped foundations: the maintenance job already writes device-
  local snapshots on a 24h window; the gate/session cookie pattern is an
  appropriate remote *relay* credential; Docker + `PERSONAL_OS_DB_PATH`
  already simulate the deployment topology.
- ✅ Money features stay local; Financial-data privacy is a product promise.
- ❌ Sync itself is a significant later build (CRDT or monotonic LWW on top
  of journal tables + tombstoned soft-delete, which the schema already has
  via `is_deleted`).

## Decision

**Adopt A as the support commitment, with C as the strategic direction.**

Concretely:

- The container image (`Dockerfile`, `VOLUME /app/data`) and the CI pipeline
  are the official deployment story — self-hosted, single operator.
- Any hosting consideration must be reached through C (local authority +
  encrypted relay), never through a direct multi-tenant fork of this
  codebase (option B is rejected for this repository).
- The `PERSONAL_OS_PIN` gate and `/unlock` flow are the correct minimum
  viable protection for that topology; a future C relay adds remote
  authentication, not in-app per-tenant auth.
- The schema stays single-tenant in practice (`tenant_default`); multi-tenant
  isolation is explicitly out of scope and must not be faked by `tenant_id`
  scaffolding alone.

## Consequences

- Offline-first work (P2) is scoped to local-first durability (localStorage
  queue for flaky local environments), not cloud conflict resolution.
- Backup strategy is the maintenance job's 24h window + retention cap, and
  remains authoritative for C's future relay (sync snapshots, not strays).
- Observability (P2) targets local JSON-lines logging; no hosted SaaS-style
  telemetry requirement.
- If hosting pressure rises, the first step is an ADR-0002 for C (relay
  protocol + auth), not a service-ification of `src/app`.
