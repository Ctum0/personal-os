# Deployment

Personal OS runs as a single Node process with an in-process SQLite file. That
shape is deliberate: one container, one volume, ~45 MB RSS idle, no database
server to administer. This document covers the Coolify deployment on the VPS, the
resource envelope, and the two operational procedures that matter (credential
rotation and backup).

Live instance: `https://<your-domain>`

## What runs where

| Piece | Location |
| --- | --- |
| Image | Built by Coolify from `Dockerfile` on the VPS (multi-stage, `node:22-alpine`) |
| Container | Coolify application `personal-os` |
| Data | Docker named volume mounted at `/app/data` (`PERSONAL_OS_DB_PATH=/app/data/personal_os.db`) |
| Container port | `3000`, published to `127.0.0.1:3011` on the host |
| Ingress | A reverse proxy on the host (`:80`/`:443`) forwards the domain to `127.0.0.1:3011` |

Coolify's own Traefik proxy is **not** the ingress on this host — Caddy owns
`:80`/`:443`. That is why the application sets `ports_mappings` rather than
relying on Coolify's proxy, and why the hostname needs a Caddy route.

## Resource envelope

| Limit | Value | Rationale |
| --- | --- | --- |
| `limits_memory` | `384m` | The server idles at ~45 MB; 384 MB leaves room for bursts without inviting a leak to take the host down. |
| `limits_memory_swap` | `512m` | A little swap absorbs a cold start; not enough to hide a real problem. |
| `limits_cpus` | `1.0` | Single-operator workload; one core is generous. |
| `NODE_OPTIONS` | `--max-old-space-size=256` | Keeps V8 honest under the container ceiling. |

The **build** needs far more than the runtime: `next build` compiles and then
type-checks the whole project. Coolify injects the runtime `NODE_OPTIONS` into
every stage, so the Dockerfile's build step sets its own ceiling inline:

```dockerfile
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm build && rm -rf /tmp/personal-os-build
```

Without that line the build dies with `Reached heap limit Allocation failed` at
the type-check step — a 256 MB heap is enough to *run* the app and not enough to
*compile* it.

## Environment

All nine values are set on the Coolify application (`PERSONAL_OS_*`). None are
baked into the image.

| Key | Value |
| --- | --- |
| `PERSONAL_OS_USERNAME` | the operator account name |
| `PERSONAL_OS_PASSWORD_SALT` | deployment salt (hex) |
| `PERSONAL_OS_PASSWORD_ITERATIONS` | `210000` |
| `PERSONAL_OS_PASSWORD_HASH` | PBKDF2-HMAC-SHA256 digest (hex) |
| `PERSONAL_OS_SESSION_SECRET` | 32 random bytes (hex) — **deployment-specific** |
| `PERSONAL_OS_DB_PATH` | `/app/data/personal_os.db` |
| `PERSONAL_OS_TZ` | `Asia/Colombo` |
| `NODE_OPTIONS` | `--max-old-space-size=256` |
| `NEXT_TELEMETRY_DISABLED` | `1` |

If **none** of the four credential variables are set, the app runs in open mode
(every request allowed). A partially-set group is treated as unconfigured and
also runs open — set all four or none. Any internet-facing deployment must set
all four.

## Generate a fresh credential set

```bash
node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');\
console.log('PERSONAL_OS_PASSWORD_SALT='+s);\
console.log('PERSONAL_OS_PASSWORD_HASH='+c.pbkdf2Sync(process.argv[1],s,210000,32,'sha256').toString('hex'));\
console.log('PERSONAL_OS_SESSION_SECRET='+c.randomBytes(32).toString('hex'))" 'your-password'
```

Rotate the password by replacing `SALT` + `HASH`; rotate the signing key by
replacing `SESSION_SECRET` (this signs every existing session out immediately,
which is the intended effect of a rotation).

## Operations

### Sign-in

`POST /api/auth/session` with `{ username, password }` sets
`personal_os_session` — `httpOnly`, `SameSite=Lax`, `Secure` when
`NODE_ENV=production`, 7-day expiry. The cookie is
`v1.<expiresAt>.<HMAC-SHA256(secret, "v1.<username>.<expiresAt>")>`; there is no
session table and no per-request query. Five failed attempts from one address
lock that address out for a minute, doubling to an hour.

### Backup

The operator's own backup page (`/overview/backup`) exports a complete JSON
payload and restores it. The restore path is the disaster-recovery path and is
covered by a test that imports into a genuinely empty database, so a backup taken
from this deployment can rebuild it.

For the raw file, back up the volume directory:

```bash
docker run --rm -v <volume>:/data -v "$PWD":/backup alpine \
  tar czf /backup/personal-os-$(date +%F).tar.gz -C /data .
```

### Restore

Stop the app, unpack the archive into the volume, start the app. Migrations run
on first boot and are forward-only.

## Coolify notes

- The application builds from this repository on a branch using a deploy-key
  source, and auto-deploys on push via a GitHub webhook pointed at
  `https://<coolify-host>/webhooks/source/github/events/manual` (the target must
  be the *manual* webhook route; `/api/v1/webhooks/deploy/...` does not exist and
  returns 404).
- Deploys are triggered with `POST /api/v1/deploy?uuid=<app-uuid>`.
- `health_check_path` is `/login` — it is unauthenticated, so it distinguishes
  "app is up" from "proxy can reach it" without depending on data.
- The Docker build publishes the image only locally; nothing is pushed to a
  registry, so no registry credential is stored in the deployment.

## Known gaps

- **The Caddy route is not yet in `/etc/caddy/Caddyfile`.** It was added through
  Caddy's admin API, which survives `caddy reload` but not a restart of the
  `caddy` service. `/etc/caddy/Caddyfile` is root-owned and there is no
  passwordless sudo for the deploy account, so the block must be added by an
  operator with sudo (see the block below).
- **No automated off-host backup schedule.** The in-app export and the volume
  archive are both manual.
- **Throttle state is in-process.** A container restart clears lockouts; that is
  an accepted tradeoff for a single-operator deployment with no Redis.

### Caddy block to append to `/etc/caddy/Caddyfile`

```caddy
your-domain.example {
	reverse_proxy localhost:3011
}
```

Then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Once that is in place the admin-API route is redundant but harmless; the file is
the source of truth after any restart.
