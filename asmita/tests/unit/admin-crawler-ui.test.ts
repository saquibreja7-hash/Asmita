import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ADMIN_NAV } from "@/app/(admin)/admin-nav";
import { hasAdminPermission } from "@/lib/auth/admin-permissions";
import { AddressDisplay } from "@/app/(admin)/findings/AddressDisplay";
import { ReviewControls } from "@/app/(admin)/findings/ReviewControls";
import { NoticeStep } from "@/app/(admin)/findings/NoticeStep";
import { SafetyNote } from "@/app/(admin)/findings/SafetyNote";
import { messageFor, NOTICE_ERRORS, REVIEW_ERRORS } from "@/app/(admin)/findings/findings-client";
import { reviewLabel, sortFindings } from "@/app/(admin)/findings/finding-view";
import { checkBudget, checkDelay, checkDomain } from "@/app/(admin)/crawl-sources/source-validation";
import { validateCrawlDomain } from "@/lib/crawl-sources";
import type { CrawlFindingListRow } from "@/lib/crawl-findings";

const PAGE = "https://pages.example.invalid/gallery/item-1";
const IMAGE = "https://img.example.invalid/files/item-1.jpg";

describe("revealed address display", () => {
  const html = renderToStaticMarkup(
    createElement(AddressDisplay, { pageUrl: PAGE, imageUrl: IMAGE, secondsLeft: 30, copied: null, onCopy: () => {}, onHide: () => {} }),
  );

  it("shows the addresses as plain text", () => {
    expect(html).toContain(PAGE);
    expect(html).toContain(IMAGE);
    expect(html).toContain("Copy page address");
    expect(html).toContain("Copy image address");
  });

  it("never links, embeds or loads them", () => {
    expect(html).not.toMatch(/<a[\s>]/i);
    expect(html).not.toMatch(/<(img|iframe|embed|object|video|audio|source|link|script)[\s>]/i);
    expect(html).not.toMatch(/\b(href|src|srcset|poster|data)\s*=/i);
  });
});

describe("crawler admin sources never fetch or embed addresses", () => {
  const files = [
    "findings/AddressDisplay.tsx",
    "findings/RevealAddress.tsx",
    "findings/ReviewControls.tsx",
    "findings/NoticeStep.tsx",
    "findings/page.tsx",
    "findings/[id]/page.tsx",
    "crawl-sources/page.tsx",
    "crawl-sources/SourcesManager.tsx",
  ];
  it("has no img, iframe or direct fetch call in these files", () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), "src/app/(admin)", file), "utf8");
      expect(source, file).not.toMatch(/<(img|iframe|embed|object)[\s>]/i);
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toMatch(/href=\{[^}]*(pageUrl|imageUrl|revealed)/);
    }
  });
  it("gates nav links by permission", () => {
    const find = (href: string) => ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === href);
    expect(find("/admin/findings")?.permission).toBe("findings:review");
    expect(find("/admin/crawl-sources")?.permission).toBe("crawler:manage");
    expect(hasAdminPermission("SUPER_ADMIN", "crawler:manage")).toBe(true);
    expect(hasAdminPermission("CASE_REVIEWER", "crawler:manage")).toBe(false);
  });
});

describe("review controls", () => {
  const base: Parameters<typeof ReviewControls>[0] = { findingId: "f1", reviewStatus: "CANDIDATE", needsSecondReview: false, awaitingSecondReview: false, distance: 5 };
  const render = (props: Partial<typeof base>) => renderToStaticMarkup(createElement(ReviewControls, { ...base, ...props }));

  it("offers approve and dismiss, with no second-review note for a close match", () => {
    const html = render({});
    expect(html).toContain("Approve");
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("second-review-note");
  });
  it("explains the two-reviewer rule and the already-first-reviewed case", () => {
    expect(render({ needsSecondReview: true, distance: 30 })).toContain("you give the first, someone else the second");
    const waiting = render({ needsSecondReview: true, awaitingSecondReview: true, distance: 30 });
    expect(waiting).toContain("If you gave the first review, you cannot give the second");
    expect(waiting).toContain("Give second approval");
  });
  it("shows a decided finding without buttons", () => {
    expect(render({ reviewStatus: "APPROVED" })).not.toContain("<button");
  });
  it("maps the second-reviewer error to a sentence", () => {
    expect(REVIEW_ERRORS.second_reviewer_required).toMatch(/different/);
  });
});

describe("notice step and error messages", () => {
  it("starts with Preview offered and Send disabled", () => {
    const html = renderToStaticMarkup(createElement(NoticeStep, { findingId: "f1" }));
    expect(html).toContain("Preview notice");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send notice/);
  });
  it("gives a sentence for known codes, and a generic one for unknown codes and 503", () => {
    for (const code of ["consent_withdrawn", "template_not_reviewed", "verified_platform_contact_required", "notice_changed", "email_already_sent"]) {
      expect(messageFor(NOTICE_ERRORS, 409, code)).not.toContain(code);
    }
    expect(messageFor(NOTICE_ERRORS, 503, undefined)).toMatch(/switched off/);
    expect(messageFor(NOTICE_ERRORS, 409, "brand_new_code")).toContain("brand_new_code");
  });
});

describe("safety note and list helpers", () => {
  it("covers the interim child guidance", () => {
    const html = renderToStaticMarkup(createElement(SafetyNote));
    expect(html).toContain("lead, not proof");
    expect(html).toContain("personal device");
    expect(html).toContain("a child");
    expect(html).toContain("SUPER_ADMIN");
    expect(html).toContain("pending the written procedure");
  });
  const row = (over: Partial<CrawlFindingListRow>): CrawlFindingListRow => ({
    id: "x",
    caseId: "c",
    caseReference: "ASMITA-2026-00001",
    distance: 3,
    quality: 80,
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    lastSeenAt: "2026-11-01T00:00:00.000Z",
    reviewStatus: "CANDIDATE",
    sourceDomain: "a.example",
    fingerprintRef: "0123456789abcdef",
    platform: null,
    needsSecondReview: false,
    secondReviewRequired: false,
    awaitingSecondReview: false,
    firstReviewedAt: null,
    currentAdminGaveFirstReview: false,
    urlsPurged: false,
    linkStatus: null,
    representativeNoticeSentAt: null,
    noticeAttemptUnconfirmed: false,
    crawlConsentWithdrawn: false,
    ...over,
  });
  it("sorts unreviewed first, second-review waiting ahead of them", () => {
    const sorted = sortFindings([
      row({ id: "done", reviewStatus: "APPROVED", firstSeenAt: "2026-10-01T00:00:00.000Z" }),
      row({ id: "new" }),
      row({ id: "wait", needsSecondReview: true, awaitingSecondReview: true, firstSeenAt: "2026-11-05T00:00:00.000Z" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["wait", "new", "done"]);
    expect(reviewLabel(sorted[0])).toBe("Waiting for second reviewer");
  });
});

describe("site form validation mirrors the server", () => {
  it("agrees with validateCrawlDomain", () => {
    for (const input of ["example-news.org", "WWW.Site.in", "localhost", "a.local", "10.0.0.1", "nodots", "bad_name.com", "-x.com", "https://x.com", "foo.test", ""]) {
      expect(checkDomain(input).ok, input).toBe(validateCrawlDomain(input).ok);
    }
  });
  it("checks budget and delay ranges", () => {
    expect(checkBudget("0").ok).toBe(false);
    expect(checkBudget("10001").ok).toBe(false);
    expect(checkBudget("200").ok).toBe(true);
    expect(checkDelay("499").ok).toBe(false);
    expect(checkDelay("60001").ok).toBe(false);
    expect(checkDelay("2000").ok).toBe(true);
    expect(checkDelay("1.5").ok).toBe(false);
  });
});
