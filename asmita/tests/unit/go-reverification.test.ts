import { afterEach, describe, expect, it } from "vitest";
import { createReverificationQueue } from "@/lib/go-reverification";
import type { PlatformDirectoryEntry } from "@/lib/platforms";
import { stalePlatforms } from "@/lib/webhook-events";

const basePlatform: PlatformDirectoryEntry = {
  id: "platform-1",
  name: "Platform One",
  domainPatterns: ["example.com"],
  tier: "TIER_2",
  noticeBasis: "DMCA",
  grievanceEmail: "verified@example.com",
  lastContactVerifiedByHuman: true,
  lastContactVerifiedAt: "2026-04-01T00:00:00.000Z",
};

describe("createReverificationQueue", () => {
  afterEach(() => stalePlatforms.clear());

  it("queues contacts that are older than the monthly verification interval", () => {
    const queue = createReverificationQueue([basePlatform], new Date("2026-05-12T00:00:00.000Z"));

    expect(queue).toEqual([
      {
        platformId: "platform-1",
        platformName: "Platform One",
        reason: "expired",
        dueAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
  });

  it("queues stale delivery contacts immediately", () => {
    stalePlatforms.add("platform-1");
    const queue = createReverificationQueue(
      [{ ...basePlatform, lastContactVerifiedAt: "2026-05-01T00:00:00.000Z" }],
      new Date("2026-05-12T00:00:00.000Z"),
    );

    expect(queue[0]).toMatchObject({ reason: "stale_delivery" });
  });
});
