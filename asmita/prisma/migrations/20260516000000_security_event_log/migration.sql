-- Security event log for persisting security incidents (CSRF failures, rate limits, auth failures, etc.)
-- Written fire-and-forget from security-log.ts when SECURITY_LOG_PERSISTENCE=database.

CREATE TABLE "SecurityEventLog" (
    "id"        TEXT         NOT NULL,
    "event"     TEXT         NOT NULL,
    "actorHash" TEXT,
    "route"     TEXT,
    "reason"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEventLog_event_idx"     ON "SecurityEventLog"("event");
CREATE INDEX "SecurityEventLog_createdAt_idx" ON "SecurityEventLog"("createdAt");
