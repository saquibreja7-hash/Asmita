-- Capture the victim's preferred UI locale so transactional emails sent by
-- the cron (which has no browser cookie) can be localized. Nullable; when
-- unset, callers fall back to English.

ALTER TABLE "User" ADD COLUMN "preferredLocale" TEXT;
