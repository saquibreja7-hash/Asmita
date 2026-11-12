import { afterEach, describe, expect, it } from "vitest";
import {
  getTier1ApiConfigFromEnv,
  platformApiTokenFor,
  recordTier1ApiAttempt,
  routeTier1OrFallback,
  tier1ApiAttempts,
} from "@/lib/tier1-api-client";

// Both shapes route through one function: the static directory entry and the
// Prisma Platform row (nullable email / endpoint).
const directoryPlatform = {
  id: "youtube",
  tier: "TIER_1",
  grievanceEmail: "verified@example.com",
  apiEndpoint: "https://api.example.com/removals",
};

const dbPlatformRow = {
  id: "x-twitter",
  tier: "TIER_1",
  grievanceEmail: null,
  apiEndpoint: "https://api.partner.example/takedown",
};

const enabled = { enabled: true, enabledPlatformIds: ["youtube", "x-twitter"], accessToken: "token" };

describe("routeTier1OrFallback", () => {
  afterEach(() => {
    tier1ApiAttempts.length = 0;
  });

  it("routes to a Tier 1 API only when the master switch and partnership config are present", () => {
    expect(routeTier1OrFallback(directoryPlatform, enabled)).toMatchObject({
      method: "API",
      tier: 1,
      endpoint: "https://api.example.com/removals",
    });
  });

  it("never routes to the API when ENABLE_PLATFORM_API is false", () => {
    const result = routeTier1OrFallback(directoryPlatform, { ...enabled, enabled: false });
    expect(result.method).not.toBe("API");
    if (result.method === "EMAIL") {
      expect(result.reason).toBe("platform_api_disabled");
    }
  });

  it("routes a database platform row with no email to the API when configured", () => {
    expect(routeTier1OrFallback(dbPlatformRow, enabled)).toMatchObject({
      method: "API",
      endpoint: "https://api.partner.example/takedown",
    });
  });

  it("falls back to Tier 2 email when API access is not configured", () => {
    expect(routeTier1OrFallback(directoryPlatform, { enabled: true, enabledPlatformIds: [] })).toMatchObject({
      method: "EMAIL",
      tier: 2,
      recipient: "verified@example.com",
      reason: "api_not_configured",
    });
  });

  it("falls back to form handoff when neither API nor a verified email exists", () => {
    expect(routeTier1OrFallback(dbPlatformRow, { enabled: true, enabledPlatformIds: [] })).toMatchObject({
      method: "FORM_HANDOFF",
      tier: 3,
    });
  });

  it("treats an unverified placeholder email as no email", () => {
    expect(
      routeTier1OrFallback(
        { ...dbPlatformRow, grievanceEmail: "<TO_BE_VERIFIED_BY_HUMAN>" },
        { enabled: true, enabledPlatformIds: [] },
      ),
    ).toMatchObject({ method: "FORM_HANDOFF", tier: 3 });
  });

  it("does not route non-Tier-1 platforms to the API", () => {
    expect(
      routeTier1OrFallback(
        { ...directoryPlatform, tier: "TIER_2" },
        { enabled: true, enabledPlatformIds: ["youtube"] },
      ),
    ).toMatchObject({ method: "EMAIL", tier: 2, reason: "not_tier_1" });
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
    const originalSwitch = process.env.ENABLE_PLATFORM_API;
    process.env.TIER1_API_ENABLED_PLATFORMS = "youtube,instagram";
    process.env.TIER1_API_ACCESS_TOKEN = "secret-from-env";
    process.env.ENABLE_PLATFORM_API = "true";

    expect(getTier1ApiConfigFromEnv()).toEqual({
      enabled: true,
      enabledPlatformIds: ["youtube", "instagram"],
      accessToken: "secret-from-env",
    });

    process.env.TIER1_API_ENABLED_PLATFORMS = originalPlatforms;
    process.env.TIER1_API_ACCESS_TOKEN = originalToken;
    process.env.ENABLE_PLATFORM_API = originalSwitch;
  });

  it("prefers a per-platform token over the shared fallback token", () => {
    const originalShared = process.env.TIER1_API_ACCESS_TOKEN;
    const originalPerPlatform = process.env.TIER1_API_TOKEN_X_TWITTER;
    process.env.TIER1_API_ACCESS_TOKEN = "shared";
    process.env.TIER1_API_TOKEN_X_TWITTER = "x-specific";

    const config = { enabled: true, enabledPlatformIds: ["x-twitter"], accessToken: "shared" };
    expect(platformApiTokenFor(config, "x-twitter")).toBe("x-specific");
    expect(platformApiTokenFor(config, "youtube")).toBe("shared");

    process.env.TIER1_API_ACCESS_TOKEN = originalShared;
    process.env.TIER1_API_TOKEN_X_TWITTER = originalPerPlatform;
  });
});
