import { afterEach, describe, expect, it } from "vitest";
import {
  getTier1ApiConfigFromEnv,
  recordTier1ApiAttempt,
  routeTier1OrFallback,
  tier1ApiAttempts,
} from "@/lib/tier1-api-client";
import type { PlatformDirectoryEntry } from "@/lib/platforms";

const platform: PlatformDirectoryEntry = {
  id: "youtube",
  name: "YouTube",
  domainPatterns: ["youtube.com"],
  tier: "TIER_1",
  noticeBasis: "IT_RULES_2021",
  grievanceEmail: "verified@example.com",
  apiEndpoint: "https://api.example.com/removals",
  lastContactVerifiedByHuman: true,
};

describe("routeTier1OrFallback", () => {
  afterEach(() => {
    tier1ApiAttempts.length = 0;
  });

  it("routes to a Tier 1 API only when partnership config is present", () => {
    expect(
      routeTier1OrFallback(platform, {
        enabledPlatformIds: ["youtube"],
        accessToken: "token",
      }),
    ).toMatchObject({ method: "API", tier: 1, endpoint: "https://api.example.com/removals" });
  });

  it("falls back to Tier 2 email when API access is not configured", () => {
    expect(routeTier1OrFallback(platform, { enabledPlatformIds: [] })).toMatchObject({
      method: "EMAIL",
      tier: 2,
      recipient: "verified@example.com",
      reason: "api_not_configured",
    });
  });

  it("records Tier 1 API status, platform reference, timestamp, and fallback reason", () => {
    const attempt = recordTier1ApiAttempt({
      platformId: "youtube",
      status: 202,
      platformReferenceId: "yt-123",
      fallbackReason: "none",
    });

    expect(attempt).toMatchObject({
      platformId: "youtube",
      status: 202,
      platformReferenceId: "yt-123",
      fallbackReason: "none",
    });
    expect(attempt.timestamp).toMatch(/^\d{4}-/);
    expect(tier1ApiAttempts).toHaveLength(1);
  });

  it("loads Tier 1 credentials only from environment-backed secrets", () => {
    const originalPlatforms = process.env.TIER1_API_ENABLED_PLATFORMS;
    const originalToken = process.env.TIER1_API_ACCESS_TOKEN;
    process.env.TIER1_API_ENABLED_PLATFORMS = "youtube,instagram";
    process.env.TIER1_API_ACCESS_TOKEN = "secret-from-env";

    expect(getTier1ApiConfigFromEnv()).toEqual({
      enabledPlatformIds: ["youtube", "instagram"],
      accessToken: "secret-from-env",
    });

    process.env.TIER1_API_ENABLED_PLATFORMS = originalPlatforms;
    process.env.TIER1_API_ACCESS_TOKEN = originalToken;
  });
});
