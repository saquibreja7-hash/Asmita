import type { PlatformDirectoryEntry } from "@/lib/platforms";
import { stalePlatforms } from "@/lib/webhook-events";

const REVERIFY_INTERVAL_DAYS = 30;

export type ReverificationItem = {
  platformId: string;
  platformName: string;
  reason: "unverified" | "stale_delivery" | "expired";
  dueAt: string;
};

export function createReverificationQueue(platforms: PlatformDirectoryEntry[], now = new Date()): ReverificationItem[] {
  return platforms.flatMap((platform) => {
    if (!platform.lastContactVerifiedByHuman || !platform.lastContactVerifiedAt) {
      return [queueItem(platform, "unverified", now)];
    }
    if (stalePlatforms.has(platform.id)) {
      return [queueItem(platform, "stale_delivery", now)];
    }
    const verifiedAt = new Date(platform.lastContactVerifiedAt);
    const expiresAt = new Date(verifiedAt.getTime() + REVERIFY_INTERVAL_DAYS * 24 * 60 * 60_000);
    if (expiresAt.getTime() <= now.getTime()) {
      return [queueItem(platform, "expired", expiresAt)];
    }
    return [];
  });
}

function queueItem(platform: PlatformDirectoryEntry, reason: ReverificationItem["reason"], dueAt: Date): ReverificationItem {
  return {
    platformId: platform.id,
    platformName: platform.name,
    reason,
    dueAt: dueAt.toISOString(),
  };
}
