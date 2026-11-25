-- Admins added from the console (/admin/admins). The environment allowlist
-- (ADMIN_EMAILS / ADMIN_ROLES) stays the owners' source and always wins;
-- these rows are the admins a SUPER_ADMIN added later. Address encrypted,
-- keyed by email hash like every other admin table.

CREATE TABLE "ConsoleAdmin" (
    "emailHash" TEXT NOT NULL,
    "emailEncrypted" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsoleAdmin_pkey" PRIMARY KEY ("emailHash")
);

-- Same rules as every table (migration 20261031000000): deny by default,
-- only asmita_app gets rows.
ALTER TABLE "ConsoleAdmin" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "ConsoleAdmin" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
