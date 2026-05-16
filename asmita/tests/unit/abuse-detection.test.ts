import { describe, expect, it } from "vitest";
import { checkUrlSubmission } from "@/lib/abuse-detection";

describe("checkUrlSubmission", () => {
  it("flags known public domains", () => {
    expect(
      checkUrlSubmission({
        emailHash: "hash",
        urls: ["https://www.youtube.com/watch?v=abc"],
      })
    ).toMatchObject({ flagged: true });
  });

  it("does not flag a likely NCII platform only because it is adult", () => {
    expect(
      checkUrlSubmission({
        emailHash: "hash",
        urls: ["https://xvideos.com/video123"],
      })
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
      ])
    );
  });

  describe("threshold boundaries", () => {
    it("does not flag exactly 10 URLs (boundary)", () => {
      const urls = Array.from(
        { length: 10 },
        (_, i) => `https://platform${i}.example/${i}`
      );
      const result = checkUrlSubmission({ emailHash: "h", urls });
      expect(result.reasons).not.toContain("too_many_urls");
    });

    it("flags 11 URLs", () => {
      const urls = Array.from(
        { length: 11 },
        (_, i) => `https://platform${i}.example/${i}`
      );
      const result = checkUrlSubmission({ emailHash: "h", urls });
      expect(result.reasons).toContain("too_many_urls");
    });

    it("does not flag exactly 5 unique domains", () => {
      const result = checkUrlSubmission({
        emailHash: "h",
        urls: [
          "https://a.example/x",
          "https://b.example/x",
          "https://c.example/x",
          "https://d.example/x",
          "https://e.example/x",
        ],
      });
      expect(result.reasons).not.toContain("many_unrelated_domains");
    });

    it("flags 6 unique domains as many_unrelated_domains", () => {
      const result = checkUrlSubmission({
        emailHash: "h",
        urls: [
          "https://a.example/x",
          "https://b.example/x",
          "https://c.example/x",
          "https://d.example/x",
          "https://e.example/x",
          "https://f.example/x",
        ],
      });
      expect(result.reasons).toContain("many_unrelated_domains");
    });

    it("does not flag previousSubmissionCount=30 as high_volume_submitter (boundary)", () => {
      const result = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        previousSubmissionCount: 30,
      });
      expect(result.reasons).not.toContain("high_volume_submitter");
    });

    it("flags previousSubmissionCount=31", () => {
      const result = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        previousSubmissionCount: 31,
      });
      expect(result.reasons).toContain("high_volume_submitter");
    });

    it("new_account_burst needs both <1h account AND >=5 URLs", () => {
      const youngFewUrls = checkUrlSubmission({
        emailHash: "h",
        accountAgeHours: 0.5,
        urls: ["https://example.com/a"],
      });
      expect(youngFewUrls.reasons).not.toContain("new_account_burst");

      const oldManyUrls = checkUrlSubmission({
        emailHash: "h",
        accountAgeHours: 24,
        urls: [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
          "https://example.com/d",
          "https://example.com/e",
        ],
      });
      expect(oldManyUrls.reasons).not.toContain("new_account_burst");

      const youngManyUrls = checkUrlSubmission({
        emailHash: "h",
        accountAgeHours: 0.5,
        urls: [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
          "https://example.com/d",
          "https://example.com/e",
        ],
      });
      expect(youngManyUrls.reasons).toContain("new_account_burst");
    });

    it("rejected_profile_target trips at exactly 3 hits (boundary)", () => {
      const two = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        rejectedProfileTargetCounts: { "example.com/profile/x": 2 },
      });
      expect(two.reasons).not.toContain("repeated_rejected_profile_target");

      const three = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        rejectedProfileTargetCounts: { "example.com/profile/x": 3 },
      });
      expect(three.reasons).toContain("repeated_rejected_profile_target");
    });

    it("ip_target trips at exactly 3 hits against a submitted domain", () => {
      const two = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        ipTargetSubmissionCounts: { "example.com": 2 },
      });
      expect(two.reasons).not.toContain("same_ip_same_target");

      const three = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://example.com/a"],
        ipTargetSubmissionCounts: { "example.com": 3 },
      });
      expect(three.reasons).toContain("same_ip_same_target");
    });
  });

  describe("public URL pattern detection", () => {
    it("flags youtube.com submissions", () => {
      const r = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://youtube.com/watch?v=abc"],
      });
      expect(r.reasons).toContain("known_public_or_news_domain");
    });

    it("does not flag a non-public, non-news domain", () => {
      const r = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://piratebay.example/leaked/1"],
      });
      expect(r.reasons).not.toContain("known_public_or_news_domain");
    });

    it("pattern match is case-insensitive", () => {
      const r = checkUrlSubmission({
        emailHash: "h",
        urls: ["https://YouTube.COM/watch?v=abc"],
      });
      expect(r.reasons).toContain("known_public_or_news_domain");
    });
  });

  it("returns flagged=false and an empty reasons array when nothing trips", () => {
    const r = checkUrlSubmission({
      emailHash: "h",
      urls: ["https://piratebay.example/leaked/1"],
    });
    expect(r).toEqual({ flagged: false, reasons: [] });
  });

  it("counts an unparseable URL as the literal domain 'invalid' but still runs other rules", () => {
    const r = checkUrlSubmission({
      emailHash: "h",
      urls: ["not a url at all"],
    });
    // 'invalid' is one domain, no other flags trip → flagged=false
    expect(r.flagged).toBe(false);
  });
});
