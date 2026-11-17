-- Crawler v2 tables follow the same rule as every other table (see
-- 20261031000000_least_privilege_and_rls): row-level security on, deny by
-- default, only asmita_app gets rows. Nothing reaches the Supabase Data API.
ALTER TABLE "CrawlBlockedHost" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlBlockedHost" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CrawlPage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlPage" FOR ALL TO asmita_app USING (true) WITH CHECK (true);

ALTER TABLE "CrawlSourceDay" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "CrawlSourceDay" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
