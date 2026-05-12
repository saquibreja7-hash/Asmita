import { describe, expect, it } from "vitest";
import { importVerifiedPlatformSeeds, validateVerifiedPlatformSeed } from "@/lib/platform-import";
import { HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";

describe("platform import guards", () => {
  it("imports only contacts with verification date, verifier, and source URL", () => {
    const result = importVerifiedPlatformSeeds(
      [
        {
          slug: "verified",
          name: "Verified Platform",
          domainPatterns: ["verified.example"],
          tier: "TIER_2",
          grievanceEmail: "go@verified.example",
          templateType: "DMCA",
          lastVerifiedAt: "2026-05-01T00:00:00.000Z",
          verifiedBy: "human-reviewer",
          sourceUrl: "https://verified.example/help",
        },
        {
          slug: "placeholder",
          name: "Placeholder Platform",
          domainPatterns: ["placeholder.example"],
          tier: "TIER_2",
          grievanceEmail: HUMAN_VERIFICATION_REQUIRED,
          templateType: "DMCA",
        },
      ],
      new Date("2026-05-12T00:00:00.000Z"),
    );

    expect(result[0]).toMatchObject({ imported: true });
    expect(result[1]).toMatchObject({
      imported: false,
      errors: expect.arrayContaining(["last_verified_at_required", "verified_by_required", "source_url_required"]),
    });
  });

  it("blocks stale or expired production dispatch contacts", () => {
    const validation = validateVerifiedPlatformSeed(
      {
        slug: "old",
        name: "Old Platform",
        domainPatterns: ["old.example"],
        tier: "TIER_2",
        grievanceEmail: "go@old.example",
        templateType: "DMCA",
        lastVerifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedBy: "human-reviewer",
        sourceUrl: "https://old.example/help",
        staleFlag: true,
      },
      new Date("2026-05-12T00:00:00.000Z"),
    );

    expect(validation.errors).toEqual(expect.arrayContaining(["stale_contact_blocked", "verification_expired"]));
  });
});
