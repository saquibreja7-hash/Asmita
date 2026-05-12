import { HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";

export type Tier1ApiConfig = {
  enabledPlatformIds: string[];
  accessToken?: string;
};

export type Tier1RoutingResult =
  | { method: "API"; tier: 1; platformId: string; endpoint: string }
  | { method: "EMAIL"; tier: 2; recipient: string; reason: "api_not_configured" | "not_tier_1" }
  | { method: "FORM_HANDOFF"; tier: 3; reason: "human_verification_required" | "api_not_configured" };

export type Tier1ApiAttempt = {
  platformId: string;
  status: number | "not_sent";
  platformReferenceId?: string;
  fallbackReason?: string;
  timestamp: string;
};

export const tier1ApiAttempts: Tier1ApiAttempt[] = [];

export function getTier1ApiConfigFromEnv(): Tier1ApiConfig {
  return {
    enabledPlatformIds: (process.env.TIER1_API_ENABLED_PLATFORMS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    accessToken: process.env.TIER1_API_ACCESS_TOKEN,
  };
}

export function routeTier1OrFallback(platform: PlatformDirectoryEntry | null, config: Tier1ApiConfig): Tier1RoutingResult {
  if (!platform) {
    return { method: "FORM_HANDOFF", tier: 3, reason: "human_verification_required" };
  }

  const endpoint = platform.apiEndpoint;
  const apiConfigured =
    platform.tier === "TIER_1" &&
    endpoint &&
    config.accessToken &&
    config.enabledPlatformIds.includes(platform.id);

  if (apiConfigured) {
    return { method: "API", tier: 1, platformId: platform.id, endpoint };
  }

  if (platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED) {
    return {
      method: "EMAIL",
      tier: 2,
      recipient: platform.grievanceEmail,
      reason: platform.tier === "TIER_1" ? "api_not_configured" : "not_tier_1",
    };
  }

  return { method: "FORM_HANDOFF", tier: 3, reason: "api_not_configured" };
}

export function recordTier1ApiAttempt(input: Omit<Tier1ApiAttempt, "timestamp">) {
  const attempt = { ...input, timestamp: new Date().toISOString() };
  tier1ApiAttempts.push(attempt);
  return attempt;
}
