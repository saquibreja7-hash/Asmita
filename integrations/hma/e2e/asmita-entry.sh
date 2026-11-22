#!/bin/sh
# Container entry for the Asmita dev server in the HMA e2e stack: wait for
# Postgres, run the migrations with the admin URL, give the app its own
# least-privilege login role (the shape the Playwright e2e harness gives
# the dev server: a member of asmita_app, which the migrations created),
# seed, then start the dev server.
#
# Everything here runs against the throwaway container database only.

set -e

ADMIN_URL="postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@postgresql:5432/asmita_hma_e2e"
APP_URL="postgresql://asmita_hma_e2e:hma-e2e@postgresql:5432/asmita_hma_e2e"

echo "waiting for postgres..."
# A plain connectivity probe (pg is in the app's dependencies). Not
# `prisma migrate status`: that exits non-zero while migrations are still
# unapplied, which is exactly the state we are waiting out.
pg_ready() {
  DATABASE_URL="$ADMIN_URL" node -e '
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.connect().then(() => client.end()).then(() => process.exit(0)).catch(() => process.exit(1));
  ' >/dev/null 2>&1
}
until pg_ready; do
  sleep 2
done

echo "running migrations..."
DATABASE_URL="$ADMIN_URL" DIRECT_URL="$ADMIN_URL" npx prisma migrate deploy

echo "creating the app's login role..."
DATABASE_URL="$ADMIN_URL" npx prisma db execute --stdin <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asmita_hma_e2e') THEN
    CREATE ROLE asmita_hma_e2e LOGIN PASSWORD 'hma-e2e' IN ROLE asmita_app;
  END IF;
END
$$;
SQL

echo "seeding..."
DATABASE_URL="$APP_URL" DIRECT_URL="$APP_URL" npx prisma db seed

echo "starting the dev server..."
export DATABASE_URL="$APP_URL"
export DIRECT_URL="$APP_URL"
exec npm run dev
