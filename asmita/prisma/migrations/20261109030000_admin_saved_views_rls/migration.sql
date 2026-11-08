-- 20261109010000_admin_saved_views created AdminSavedView without the rule
-- every table follows (migration 20261031000000): row-level security on,
-- deny by default, only asmita_app gets rows. Default privileges already
-- grant asmita_app and nothing to anon or authenticated.
ALTER TABLE "AdminSavedView" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "AdminSavedView" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
