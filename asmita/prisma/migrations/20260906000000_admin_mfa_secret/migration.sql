-- CreateTable
CREATE TABLE "AdminMfaSecret" (
    "emailHash" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AdminMfaSecret_pkey" PRIMARY KEY ("emailHash")
);
