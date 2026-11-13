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

Each value is shape-checked at startup, not just presence-checked. A value that
is present but could never work (a placeholder, or the wrong shape) puts the
service into `incomplete`, which answers `503` to everything and names the
offending variable in the response body.

| Key | Required shape | Value |
| --- | --- | --- |
| `PERSONAL_OS_USERNAME` | non-empty, not a placeholder | the operator account name |
| `PERSONAL_OS_PASSWORD_SALT` | **≥16 lowercase hex chars** | deployment salt |
| `PERSONAL_OS_PASSWORD_ITERATIONS` | integer ≥ 10000, default `210000` | PBKDF2 work factor |
| `PERSONAL_OS_PASSWORD_HASH` | **exactly 64 hex chars** | PBKDF2-HMAC-SHA256 digest |
| `PERSONAL_OS_SESSION_SECRET` | **≥32 chars** | 32 random bytes (hex) — deployment-specific |
| `PERSONAL_OS_DB_PATH` | `/app/data/personal_os.db` |
| `PERSONAL_OS_TZ` | `Asia/Colombo` |
| `NODE_OPTIONS` | `--max-old-space-size=256` |
| `NEXT_TELEMETRY_DISABLED` | `1` |

If **none** of the four credential variables are set, the app runs in open mode
(every request allowed). If **some** are set, the app refuses every request with
`503` naming the missing variables — a misconfiguration must never be mistaken
for open mode. Any internet-facing deployment must set all four.

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

### Sign-out is client-side only

Sessions are stateless HMAC tokens — `v1.<expiresAt>.<HMAC>` with no session table
and no denylist. Signing out deletes the cookie in the browser, so the device no
longer sends it. A token that was already copied off the device stays valid until
it expires (7 days), because there is nothing server-side to revoke.

If that matters — shared machines, a suspected stolen cookie — rotate
`PERSONAL_OS_SESSION_SECRET` and redeploy. That invalidates every issued token at
once, which is also why rotation is the documented answer rather than a per-session
revoke.

### Sign-in

`POST /api/auth/session` with `{ username, password }` sets
`personal_os_session` — `httpOnly`, `SameSite=Lax`, `Secure` when
`NODE_ENV=production`, 7-day expiry. The cookie is
`v1.<expiresAt>.<HMAC-SHA256(secret, "v1.<username>.<expiresAt>")>`; there is no
session table and no per-request query. Five failed attempts from one address
lock that address out for a minute, doubling to an hour.

### If the instance suddenly answers 503 everywhere

The credential set is present but unusable. The response body lists the
offending variables (`missing` / `invalid`) — for example a salt that is not hex,
a digest that is not 64 characters, or a secret shorter than 32. This is
deliberate: a locked door with no key must not report itself as healthy. Fix the
named variable, or unset all four to deliberately run in open mode.

### Reverse-proxy requirement: real client addresses

Failed sign-ins are limited per client address, and the address comes from
`X-Forwarded-For`. That value is only meaningful if the edge sets it:

- If your proxy appends to a client-supplied header, the first entry is
  attacker-controlled.
- If your proxy rewrites it to its own peer address (Cloudflare in front of
  Caddy does this by default), every request collapses into one bucket.

For Caddy, trust the CDN ranges so the header carries the true client:

```caddy
{
	servers {
		trusted_proxies static 173.245.48.0/20 103.21.244.0/22 2400:cb00::/32 …
	}
}
```

If you cannot maintain that list, it does not matter: a **global** limiter
(20 failures per 15 minutes across all clients) bounds total guessing regardless,
so the system stays non-brute-forceable.

The limiter applies to failed attempts only. The sign-in route verifies the
credential *before* consulting it, so:

- a correct password always issues a session, even while the address or the
  whole instance is throttled — a stranger cannot deny you your own account;
- throttled failures answer `429` after an added 500 ms, so guessing stays
  expensive;
- a successful sign-in clears both the per-client and the global counters.

The remaining tradeoff is narrow: sustained failed attempts from anywhere can
make *wrong* passwords slower for everyone for up to 15 minutes. It cannot stop a
correct one.

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

- The application builds from this public repository over HTTPS; no deploy key is
  required or held.
- Deploys are triggered by CI, not by a provider webhook: the `deploy` job in
  `.github/workflows/ci.yml` runs only after `verify` passes on `main` and calls
  `POST /api/v1/deploy?uuid=<app-uuid>` with `COOLIFY_TOKEN` /
  `COOLIFY_APP_UUID` repository secrets. A URL-matching webhook was removed
  because it silently stopped deploying when the app's git URL changed form
  (ssh → https) while still answering 200.
- The health check probes `/api/auth/session`, which returns 200 whenever the app
  is up (open mode or configured) and 503 when the credential set is unusable —
  so "app is down" and "app is misconfigured" stay distinguishable. Do not point
  it at `/login`: in open mode that route redirects, so a healthy container would
  report unhealthy.
- SQLite has a single writer. Run exactly one replica, mount `/app/data` as a
  named volume, and let Coolify replace the container rather than scale it —
  two containers against one database file is corruption, not redundancy.
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
