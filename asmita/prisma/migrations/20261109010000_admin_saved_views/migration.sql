-- Admin console Phase 3 (docs/product/admin-console-redesign.md): an admin's
-- own named filters of the case list. Holds a query string, never case data.
CREATE TABLE "AdminSavedView" (
    "id" TEXT NOT NULL,
    "ownerEmailHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminSavedView_ownerEmailHash_idx" ON "AdminSavedView"("ownerEmailHash");

CREATE UNIQUE INDEX "AdminSavedView_ownerEmailHash_name_key" ON "AdminSavedView"("ownerEmailHash", "name");
