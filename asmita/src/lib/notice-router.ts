import { HUMAN_VERIFICATION_REQUIRED, type PlatformDirectoryEntry } from "@/lib/platforms";

export function routeNotice(platform: PlatformDirectoryEntry | null) {
  if (!platform) {
    return { tier: 3, method: "FORM_HANDOFF" as const, reason: "unknown_platform" };
  }
  if (platform.tier === "TIER_1" && platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED) {
    return { tier: 1, method: "EMAIL" as const, recipient: platform.grievanceEmail };
  }
  if (platform.tier === "TIER_2" && platform.grievanceEmail !== HUMAN_VERIFICATION_REQUIRED) {
    return { tier: 2, method: "EMAIL" as const, recipient: platform.grievanceEmail };
  }
  return { tier: 3, method: "FORM_HANDOFF" as const, reason: "human_verification_required" };
}
