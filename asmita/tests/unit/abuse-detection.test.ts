import { describe, expect, it } from "vitest";
import { checkUrlSubmission } from "@/lib/abuse-detection";

describe("checkUrlSubmission", () => {
  it("flags known public domains", () => {
    expect(
      checkUrlSubmission({
        emailHash: "hash",
        urls: ["https://www.youtube.com/watch?v=abc"],
      }),
    ).toMatchObject({ flagged: true });
  });

  it("does not flag a likely NCII platform only because it is adult", () => {
    expect(
      checkUrlSubmission({
        emailHash: "hash",
        urls: ["https://xvideos.com/video123"],
      }),
    ).toMatchObject({ flagged: false });
  });

  it("flags high-volume and repeated-target abuse signals for human review", () => {
    const result = checkUrlSubmission({
      emailHash: "hash",
      accountAgeHours: 0.5,
      previousSubmissionCount: 31,
      rejectedProfileTargetCounts: { "example.com/profile/alice": 3 },
      ipTargetSubmissionCounts: { "example.com": 3 },
      urls: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
        "https://example.com/d",
        "https://example.com/e",
      ],
    });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "high_volume_submitter",
        "new_account_burst",
        "repeated_rejected_profile_target",
        "same_ip_same_target",
      ]),
    );
  });
});
