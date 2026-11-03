# syntax=docker/dockerfile:1
# KeyCrypt: self-hosting image (Next.js standalone server + Prisma migrations).
#
#   docker compose up --build          (see docker-compose.yml and README → Self-hosting)
#
# Debian slim (glibc), not Alpine: @node-rs/argon2 and Prisma's engines ship
# glibc builds, and Prisma needs OpenSSL.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=11.9.0
ARG PRISMA_VERSION=6.19.3

# ── Base: Node 22, pnpm, OpenSSL (for Prisma) ────────────────────────────────
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "pnpm@${PNPM_VERSION}" \
  && npm cache clean --force
ENV NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0
WORKDIR /app

# ── Dependencies (cached until the lockfile changes) ─────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The workspace also has the browser extension; only its manifest is needed here.
COPY extension/package.json ./extension/package.json
RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
# Inlined into the build by Next.js (NEXT_PUBLIC_*): the public URL of the app.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/lib/env.ts validates these at build time; nothing connects to the database
# during the build. Placeholders only: the real values are runtime environment.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-not-a-secret-0123456789" \
    pnpm build

# ── Prisma CLI for `migrate deploy` at start-up (same version as the client) ─
FROM base AS prisma-cli
ARG PRISMA_VERSION
WORKDIR /opt/prisma
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
  && npm cache clean --force

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Non-root user (uid/gid 1001); it owns nothing it doesn't need to write.
RUN groupadd --system --gid 1001 keycrypt \
  && useradd --system --uid 1001 --gid keycrypt --no-create-home keycrypt

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=prisma-cli /opt/prisma /opt/prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/.next/cache \
  && chown -R keycrypt:keycrypt /app/.next/cache

USER keycrypt
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
