-- Least-privilege app role and row-level security (ADR 004, M1 + M2).
--
-- The app keeps working while it still connects as the table owner, because
-- owners bypass row-level security. Production then switches Hyperdrive to a
-- login role that is a member of asmita_app (docs/infra/database-roles.md).

-- App role ---------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asmita_app') THEN
    CREATE ROLE asmita_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO asmita_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO asmita_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO asmita_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asmita_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO asmita_app;

REVOKE ALL ON "_prisma_migrations" FROM asmita_app;

-- audit_log is append-only. src/lib/audit.ts takes LOCK TABLE ... IN EXCLUSIVE
-- MODE, which needs MAINTAIN (Postgres 17+) or UPDATE/DELETE/TRUNCATE. Prefer
-- MAINTAIN; on older servers grant UPDATE, which the append-only trigger still
-- blocks.
REVOKE UPDATE, DELETE ON "audit_log" FROM asmita_app;
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON "audit_log" TO asmita_app';
  ELSE
    EXECUTE 'GRANT UPDATE ON "audit_log" TO asmita_app';
  END IF;
END
$$;

-- Supabase Data API roles -----------------------------------------------
-- The app never uses the Data API. Remove every grant Supabase gives its
-- public roles, now and for future tables. Skipped where the roles don't exist.

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- Row-level security -------------------------------------------------------
-- Every table denies by default; only asmita_app gets rows. Every new table
-- must do the same (enforced by tests/unit/migrations-rls.test.ts).

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "User" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "Case" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "HashSubmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "HashSubmission" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "HashDispatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "HashDispatch" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "Platform" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "Platform" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "PlatformGoHistory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "PlatformGoHistory" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "SubmittedUrl" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "SubmittedUrl" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "UrlPortalToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "UrlPortalToken" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "NoticeTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "NoticeTemplate" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "Notice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "Notice" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "EmailDeliveryProof" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "EmailDeliveryProof" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "Escalation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "Escalation" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "audit_log" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "OtpToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OtpToken" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "SessionToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "SessionToken" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "AdminProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "AdminProfile" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "AdminMfaSecret" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "AdminMfaSecret" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "AdminAccessLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "AdminAccessLog" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "NgoApiKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "NgoApiKey" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "Feedback" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "DeletionJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "DeletionJob" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "SecurityEventLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "SecurityEventLog" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
