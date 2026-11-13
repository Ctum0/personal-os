# Personal OS — local-first container build.
#
# Multi-stage: deps → build → runtime on node:22-alpine. The SQLite database
# lives in a VOLUME at /app/data so personal data survives upgrades:
#   docker run -v personal-os-data:/app/data -p 3000:3000 personal-os
#
# Operator credentials are REQUIRED for any exposed deployment:
#   docker run -e PERSONAL_OS_USERNAME=... -e PERSONAL_OS_PASSWORD_SALT=... \
#              -e PERSONAL_OS_PASSWORD_HASH=... -e PERSONAL_OS_SESSION_SECRET=... \
#              ... personal-os
# With all four set, every /api/* call requires a signed session cookie obtained
# from POST /api/auth/session (the /login page). With none set the app runs open,
# which is only appropriate on loopback. There is no registration route.

# ---- deps ----------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && apk add --no-cache python3 make g++
# pnpm-workspace.yaml carries the build-script allowlist (pnpm 12 reads settings
# there, not from the "pnpm" field in package.json), so the install below would
# fail with ERR_PNPM_IGNORED_BUILDS without it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore keeps data/, .artifacts/ and local build state out of the image.
COPY . .
# Standalone output only. The DB path is a throwaway profile: no migration, no
# maintenance snapshot and no net-worth row is written anywhere durable, and
# output file tracing is configured to skip ./data entirely (next.config.ts).
ENV NEXT_OUTPUT_STANDALONE=1 \
    PERSONAL_OS_DB_PATH=/tmp/personal-os-build/profile.db
# `next build` compiles and then type-checks the whole project, which needs far
# more headroom than the running server. Coolify injects the runtime
# NODE_OPTIONS (--max-old-space-size=256) into every stage, so the build sets its
# own ceiling inline rather than inheriting the server's tight heap.
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm build && rm -rf /tmp/personal-os-build

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PERSONAL_OS_DB_PATH=/app/data/personal_os.db

# Standalone output traces its own runtime dependencies; the build-time
# node_modules tree is not needed and must not be copied (it doubles the image
# and can shadow the musl prebuilt better-sqlite3 binding with a host build).
COPY --from=build /app/.next/standalone ./standalone
COPY --from=build /app/.next/static ./standalone/.next/static
COPY --from=build /app/public ./standalone/public

# Run as non-root. /app/data must be writable by this user, so it is created and
# chowned BEFORE the VOLUME declaration — writes to a path that is already a
# declared volume are discarded by some builders, which would leave root-owned
# storage and break first boot.
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown -R app:app /app/data
VOLUME /app/data
USER app

EXPOSE 3000
WORKDIR /app/standalone
CMD ["node", "server.js"]
