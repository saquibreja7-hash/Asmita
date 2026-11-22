-- Video fingerprints (video-fingerprints spec WP17). Additive only:
-- the new VPDQ algorithm value, and three nullable columns on HashSubmission
-- (a video row's encrypted frame list, its kept frame count and the video's
-- duration in seconds). Existing PDQ image rows are untouched.

-- AlterEnum
ALTER TYPE "HashAlgorithm" ADD VALUE IF NOT EXISTS 'VPDQ';

-- AlterTable
ALTER TABLE "HashSubmission" ADD COLUMN     "videoFramesEncrypted" TEXT;
ALTER TABLE "HashSubmission" ADD COLUMN     "videoFrameCount" INTEGER;
ALTER TABLE "HashSubmission" ADD COLUMN     "videoDurationSec" INTEGER;
