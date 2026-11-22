#!/bin/bash
# Postgres init for the HMA e2e stack: the container's own POSTGRES_DB
# (media_match, HMA's) is created by the image; this adds the Asmita dev
# server's throwaway database on the same server.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE DATABASE asmita_hma_e2e;
SQL
