# Deployment And Migration Rollback

This runbook is for staging and production rollback. Do not roll back legal notices, audit logs, or deletion jobs by editing database rows directly.

## Deployment rollback

1. Freeze new production deploys and announce the incident owner in the operations channel.
2. Confirm whether the issue is application-only, migration-related, or external-provider-related.
3. If the database schema is compatible, promote the last known-good deployment from the hosting provider dashboard or CLI.
4. Confirm environment variables and secrets still point to the intended India-region services.
5. Run smoke checks for `/`, `/start`, `/api/health`, `/admin/cases`, `/admin/metrics`, and `/admin/milestones`.
6. Keep notice dispatch paused until CSRF, auth, template gating, GO-contact gating, and no-fetch checks pass.
7. Record rollback time, deployment id, owner, commands, smoke-test result, and remaining risk in the incident log.

## Database migration rollback

1. Prefer forward fixes for migrations that have already reached production.
2. Before any destructive migration, verify the latest backup and point-in-time recovery window.
3. If rollback is required, stop workers first so notice, escalation, deletion, and webhook jobs cannot write during the rollback.
4. Restore staging from the production snapshot and rehearse the rollback command there.
5. Run Prisma validation, schema privacy tests, audit hash-chain tests, and API smoke tests against staging.
6. Apply the approved rollback or forward-fix migration in production only after the incident owner and database owner both approve.
7. Restart workers gradually and watch queue backlog, scheduler lag, email bounces, API 5xx rate, and deletion backlog for at least one hour.

## Rollback blockers

- Do not delete or rewrite append-only audit events.
- Do not expose raw submitted URL strings outside notice/PDF surfaces already designed for victim evidence.
- Do not enable Phase 2 hash fields or content storage as part of a rollback workaround.
- Do not resume production notice sending if platform contacts, templates, or sender domains are unverified.
