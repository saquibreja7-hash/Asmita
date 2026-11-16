import { describe, expect, it } from "vitest";
import { platformSeedCreateData, platformSeedUpdateData } from "../../prisma/platform-seed-data";

const seed = {
  domainPatterns: ["platform.example.invalid"],
  tier: "TIER_2",
  noticeBasis: "IT_RULES_2021",
  grievanceEmail: "go@platform.example.invalid",
  formUrl: "https://platform.example.invalid/form",
  apiEndpoint: null,
  lastContactVerifiedByHuman: true,
  lastContactVerifiedAt: new Date("2026-06-14"),
} as const;

describe("platform seed data", () => {
  it("never writes contact fields or verification on an existing platform", () => {
    const data = platformSeedUpdateData(seed);
    expect(Object.keys(data).sort()).toEqual(["domainPatterns", "noticeBasis", "tier"]);
    expect(data.domainPatterns).toEqual(["platform.example.invalid"]);
  });

  it("copies the seed's contact values only when creating a platform", () => {
    const data = platformSeedCreateData(seed);
    expect(data.grievanceEmail).toBe(seed.grievanceEmail);
    expect(data.formUrl).toBe(seed.formUrl);
  });
});
