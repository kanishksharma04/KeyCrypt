#!/bin/sh
# Apply pending database migrations, then start the server (or run CMD).
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "Applying database migrations (prisma migrate deploy)..."
  node /opt/prisma/node_modules/prisma/build/index.js migrate deploy \
    --schema /app/prisma/schema.prisma
fi

exec "$@"
