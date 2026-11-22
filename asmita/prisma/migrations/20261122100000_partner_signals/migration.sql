-- Research-grounded tools WP110 (HMA-friendly signal feed): additive only.
--
-- 1. Key scopes: a partner key says what it may do on the partner API.
--    "feed" covers GET /api/partner/v1/fingerprints and the new
--    GET /api/partner/v1/signals; "outcomes" covers POST /outcomes.
--    Existing keys keep both scopes (the column default), so no key changes
--    behaviour; a narrower key gets 403 insufficient_scope elsewhere.
-- 2. PartnerFeedEvent composite indexes: the /signals feed pages by
--    (createdAt, seq) — the checkpoint is the last served event's pair —
--    and the Kysely latest-event and erasure lookups are per fingerprint in
--    seq order (they used to scan the whole table). The existing
--    single-column indexes stay.

-- AddColumn with a default fills every existing row without a rewrite
-- (TEXT[] holds the default inline).
ALTER TABLE "PlatformPartnerKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['feed','outcomes']::TEXT[];

-- CreateIndex
CREATE INDEX "PartnerFeedEvent_fingerprintId_seq_idx" ON "PartnerFeedEvent"("fingerprintId", "seq");
CREATE INDEX "PartnerFeedEvent_createdAt_seq_idx" ON "PartnerFeedEvent"("createdAt", "seq");
