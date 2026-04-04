#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  ENCODED_PASS=$(printf '%s' "$DB_PASSWORD" | node -e "process.stdout.write(encodeURIComponent(require('fs').readFileSync('/dev/stdin','utf8')))")
  export DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?schema=${DB_SCHEMA:-public}"
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting server..."
exec node server.js
