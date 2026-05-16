# Environment Provisioning Checklist

Status: engineering checklist ready; live provisioning still requires cloud, database, Redis, KMS, email, and monitoring owners.

Asmita uses three isolated environments. Never reuse production secrets in local or staging.

## Local

- Runtime: developer machine.
- Database: local PostgreSQL from `DATABASE_URL`.
- Queue: `QUEUE_DRIVER=memory` unless Redis is explicitly tested.
- Rate limit: `RATE_LIMIT_DRIVER=memory`.
- Email proof persistence: `EMAIL_PROOF_PERSISTENCE=memory`.
- Email: no real notice dispatch; dev OTP may be returned only outside production.
- Required checks: `npm run lint`, `npm run type-check`, `npm run test`, `npm run build`.

## Staging

- Region: India-region deployment, preferably Mumbai/BOM or `ap-south-1`.
- Database: staging PostgreSQL/RDS with encryption at rest, backups, restricted network access, and separate credentials.
- Redis: staging Redis or managed equivalent for BullMQ workers.
- KMS/secrets: staging keys and API tokens only.
- Email: verified staging sender or sandbox provider account; no notices to unverified GO contacts.
- Monitoring: health checks, worker logs, queue lag, API 5xx, bounce rate, and scheduler lag alerts.
- Required smoke checks: `/`, `/start`, `/api/health`, `/admin/cases`, `/admin/metrics`, `/admin/milestones`.
- Required command checks: `npm run test:e2e`, `npm run test:load` against staging only, and provider webhook tests.

## Production

- Region: India-region deployment approved by infrastructure owner.
- Database: production PostgreSQL/RDS with encryption at rest, point-in-time recovery, private networking, restricted access, and tested restore path.
- Redis: production queue backend with persistence and alerting.
- KMS/secrets: customer-managed key or approved managed secret store with rotation and audit logging.
- Email: production sender domains with SPF, DKIM, and DMARC verified before any real notice.
- Edge controls: WAF/rate limiting where the hosting provider supports it.
- Monitoring: on-call webhook, deployment alerts, API 5xx, queue backlog, scheduler lag, deletion backlog, delivery failures, bounce/complaint rates, and stale GO contact alerts.
- Launch gate: legal entity, legal review, POCSO protocol, GO verification, email DNS, security audit, accessibility sign-off, NGO beta readiness, and production smoke tests.

## Secret Rules

- Do not commit real `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, API tokens, webhook URLs, or TOTP secrets.
- Keep `ENABLE_HASH_UPLOAD=false` and `ENABLE_PLATFORM_API=false` until Phase 2 gates pass.
- Keep production notice sending disabled unless template, GO contact, and email-domain gates all pass.
- Rotate any secret suspected of exposure and record the rotation in the incident log.

## Smoke-Test Evidence

For staging and production, record:

- deployment id and git commit
- environment name and region
- database connectivity result from `/api/health`
- queue/Redis status from `/api/health`
- email provider configuration status from `/api/health`
- admin route smoke result
- victim-flow smoke result
- rollback target deployment id
- operator name and timestamp
