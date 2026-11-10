# Personal OS — local-first container build.
#
# Multi-stage: deps → build → runtime on node:22-alpine. The SQLite database
# lives in a VOLUME at /app/data so personal data survives upgrades:
#   docker run -v personal-os-data:/app/data -p 3000:3000 personal-os
#
# Optional hardening for exposed deployments:
#   docker run -e PERSONAL_OS_PIN=1234 ... personal-os
# When PERSONAL_OS_PIN is set, every /api/* call requires the PIN or an
# unlocked session cookie (POST /api/auth/session from the /unlock page).

# ---- deps ----------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build with a throwaway DB path so nothing writes into the image layers.
ENV NEXT_OUTPUT_STANDALONE=1 \
    PERSONAL_OS_DB_PATH=/tmp/personal-os-build/profile.db
RUN pnpm build && rm -rf /tmp/personal-os-build

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && apk add --no-cache sqlite

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./standalone
COPY --from=build /app/.next/static ./standalone/.next/static
COPY --from=build /app/public ./standalone/public

# Persistent local-first data directory; the runtime resolves the default DB
# here via PERSONAL_OS_DB_PATH (the standalone server's cwd is /app/standalone).
ENV PERSONAL_OS_DB_PATH=/app/data/personal_os.db
VOLUME /app/data

# Run as non-root; /app/data must be writable by this user.
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown -R app:app /app/standalone /app/data
USER app

EXPOSE 3000
WORKDIR /app/standalone
CMD ["node", "server.js"]
