import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";

/**
 * Tier 1 platform API routing and configuration.
 *
 * A platform gets an API channel only when EVERY one of these holds — each is a
 * deliberate human act, which is what "verified integration" means here:
 *   1. ENABLE_PLATFORM_API=true (deployment switch, false in every shipped env)
 *   2. the platform is TIER_1 and has an apiEndpoint set by an admin
 *   3. the platform id is listed in TIER1_API_ENABLED_PLATFORMS
 *   4. an access token exists (per-platform TIER1_API_TOKEN_<ID>, or the
 *      shared TIER1_API_ACCESS_TOKEN fallback)
 *
 * No partner endpoints are configured in the seed directory: PRD Feature 2.2
 * gates live integrations on signed partner agreements. Until one exists this
 * routes everything to the email/form channels exactly as before.
 */

export type Tier1ApiConfig = {
  /** Master switch (ENABLE_PLATFORM_API). API dispatch is impossible when false. */
  enabled: boolean;
  enabledPlatformIds: string[];
  accessToken?: string;
};

/**
 * Structural input so both the static directory entries and Prisma Platform
 * rows (nullable grievanceEmail / apiEndpoint) route through one function.
 */
export type Tier1RoutingPlatform = {
  id: string;
  tier: string;
  apiEndpoint?: string | null;
  grievanceEmail?: string | null;
};

export type Tier1RoutingResult =
  | { method: "API"; tier: 1; platformId: string; endpoint: string }
  | { method: "EMAIL"; tier: 2; recipient: string; reason: "api_not_configured" | "not_tier_1" | "platform_api_disabled" }
  | { method: "FORM_HANDOFF"; tier: 3; reason: "human_verification_required" | "api_not_configured" | "platform_api_disabled" };

export type Tier1ApiAttempt = {
  platformId: string;
  status: number | "not_sent" | "network_error" | "timeout";
  platformReferenceId?: string;
  fallbackReason?: string;
  timestamp: string;
};

export const tier1ApiAttempts: Tier1ApiAttempt[] = [];

export function getTier1ApiConfigFromEnv(): Tier1ApiConfig {
  return {
    enabled: process.env.ENABLE_PLATFORM_API === "true",
    enabledPlatformIds: (process.env.TIER1_API_ENABLED_PLATFORMS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    accessToken: process.env.TIER1_API_ACCESS_TOKEN,
  };
}

/** Per-platform token wins over the shared fallback token. */
export function platformApiTokenFor(config: Tier1ApiConfig, platformId: string): string | undefined {
  const suffix = platformId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return process.env[`TIER1_API_TOKEN_${suffix}`] || config.accessToken;
}

export function routeTier1OrFallback(
  platform: Tier1RoutingPlatform | null,
  config: Tier1ApiConfig,
): Tier1RoutingResult {
  if (!platform) {
    return { method: "FORM_HANDOFF", tier: 3, reason: "human_verification_required" };
  }

  const endpoint = platform.apiEndpoint ?? undefined;
  const token = platformApiTokenFor(config, platform.id);
  const apiConfigured =
    config.enabled &&
    platform.tier === "TIER_1" &&
    endpoint &&
    token &&
    config.enabledPlatformIds.includes(platform.id);

  if (apiConfigured) {
    return { method: "API", tier: 1, platformId: platform.id, endpoint };
  }

  const hasVerifiedEmail =
    Boolean(platform.grievanceEmail) && platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED;

  if (hasVerifiedEmail) {
    return {
      method: "EMAIL",
      tier: 2,
      recipient: platform.grievanceEmail as string,
      reason: !config.enabled
        ? "platform_api_disabled"
        : platform.tier === "TIER_1"
          ? "api_not_configured"
          : "not_tier_1",
    };
  }

  return {
    method: "FORM_HANDOFF",
    tier: 3,
    reason: !config.enabled ? "platform_api_disabled" : "api_not_configured",
  };
}

export function recordTier1ApiAttempt(input: Omit<Tier1ApiAttempt, "timestamp">) {
  const attempt = { ...input, timestamp: new Date().toISOString() };
  tier1ApiAttempts.push(attempt);
  return attempt;
}
