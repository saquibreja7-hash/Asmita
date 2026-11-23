import { describe, expect, it } from "vitest";
import { isSafeLink } from "@/lib/safe-link";
import { orgEventSchema } from "@/lib/org-events";
import { orgPartnerSchema } from "@/lib/org-partners";
import { orgPostSchema } from "@/lib/org-posts";

// Admin-entered links on org content render as public hrefs: only http(s)
// URLs and single-slash site paths are allowed.

describe("isSafeLink", () => {
  it("accepts http(s) URLs and site paths", () => {
    expect(isSafeLink("https://example.org/report.pdf")).toBe(true);
    expect(isSafeLink("http://example.org")).toBe(true);
    expect(isSafeLink("/get-involved")).toBe(true);
    expect(isSafeLink("/")).toBe(true);
  });

  it("refuses other schemes and protocol-relative links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,hi",
      "//evil.example",
      "/\\evil.example",
      "mailto:a@example.org",
      "example.org",
      "https://",
      "https://exa mple.org",
    ]) {
      expect(isSafeLink(bad), bad).toBe(false);
    }
  });
});

describe("org schemas use the link rule", () => {
  const post = {
    kind: "NEWS",
    titleEn: "A new tool for survivors",
    summaryEn: "We shipped a small thing that helps.",
    bodyEn: "Body.",
    authorDisplayName: "Meri Asmita",
  };

  it("post attachment and call-to-action links", () => {
    expect(orgPostSchema.safeParse({ ...post, attachmentUrl: "/reports/a.pdf" }).success).toBe(true);
    expect(orgPostSchema.safeParse({ ...post, attachmentUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(orgPostSchema.safeParse({ ...post, ctaLabel: "Read", ctaUrl: "https://example.org" }).success).toBe(true);
    expect(orgPostSchema.safeParse({ ...post, ctaLabel: "Read", ctaUrl: "//evil.example" }).success).toBe(false);
  });

  it("event registration and partner links", () => {
    const event = { titleEn: "A workshop", startsAt: "2026-12-01T10:00:00.000Z", mode: "ONLINE", descriptionMd: "Details." };
    expect(orgEventSchema.safeParse({ ...event, registrationUrl: "https://example.org/register" }).success).toBe(true);
    expect(orgEventSchema.safeParse({ ...event, registrationUrl: "data:text/html,hi" }).success).toBe(false);
    const partner = { name: "A partner", type: "NGO", blurbEn: "Works with us." };
    expect(orgPartnerSchema.safeParse({ ...partner, url: "https://example.org" }).success).toBe(true);
    expect(orgPartnerSchema.safeParse({ ...partner, url: "javascript:alert(1)" }).success).toBe(false);
  });
});
