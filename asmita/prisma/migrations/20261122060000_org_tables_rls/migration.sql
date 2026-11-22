-- Row-level security for the WP56 organization tables (docs/org/spec.md,
-- 56.1/56.2/56.5/56.6/56.7). WP56 created them without the rule every other
-- table follows; tests/e2e/database-hardening.spec.ts enforces it ("Every new
-- table must do the same", 20261031000000_least_privilege_and_rls). Additive
-- only: deny by default, only asmita_app gets rows, exactly like the OrgPartner
-- migration before this one.

ALTER TABLE "OrgPost" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OrgPost" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "OrgSubmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OrgSubmission" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "OrgJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OrgJob" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "OrgEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "OrgEvent" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "NewsletterSubscriber" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
