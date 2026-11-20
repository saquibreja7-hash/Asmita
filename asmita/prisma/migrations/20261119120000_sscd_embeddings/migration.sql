-- SSCD as a second matching layer, seeded from confirmed copies (ADR 008,
-- WP28). Additive only, with one documented widening: an SSCD finding has no
-- PDQ distance, so "CrawlFinding"."distance" becomes nullable. Old rows and
-- old code always wrote a distance, so no existing row is affected and
-- nothing narrows later; every other change is an addition.

-- AlterEnum
CREATE TYPE "CrawlFindingMethod" AS ENUM ('PDQ','VPDQ','SSCD');

-- AlterTable
ALTER TABLE "CrawlFinding" ADD COLUMN     "method" "CrawlFindingMethod" NOT NULL DEFAULT 'PDQ';
ALTER TABLE "CrawlFinding" ADD COLUMN     "sscdSimilarity" DOUBLE PRECISION;
-- Widening (the one allowed here): an SSCD finding matched by the second
-- layer's descriptor has no PDQ Hamming distance. Rows written before this
-- migration always carry a distance, and no later migration narrows the
-- column again.
ALTER TABLE "CrawlFinding" ALTER COLUMN "distance" DROP NOT NULL;

-- Data backfill: relabel pre-existing video findings as VPDQ. They matched a
-- VPDQ fingerprint; the method column did not exist when they were written.
UPDATE "CrawlFinding" SET "method"='VPDQ' WHERE "hashSubmissionId" IN (SELECT "id" FROM "HashSubmission" WHERE "algorithm"='VPDQ');

-- CreateTable
CREATE TABLE "FindingEmbedding" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "hashSubmissionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "vectorEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FindingEmbedding_findingId_key" ON "FindingEmbedding"("findingId");
CREATE INDEX "FindingEmbedding_hashSubmissionId_idx" ON "FindingEmbedding"("hashSubmissionId");
CREATE INDEX "FindingEmbedding_caseId_idx" ON "FindingEmbedding"("caseId");

-- AddForeignKey
ALTER TABLE "FindingEmbedding" ADD CONSTRAINT "FindingEmbedding_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CrawlFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The same rule as every crawler table (see 20261117050000_crawler_v2_rls):
-- row-level security on, deny by default, only asmita_app gets rows. Nothing
-- reaches the Supabase Data API.
ALTER TABLE "FindingEmbedding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asmita_app_all ON "FindingEmbedding" FOR ALL TO asmita_app USING (true) WITH CHECK (true);
