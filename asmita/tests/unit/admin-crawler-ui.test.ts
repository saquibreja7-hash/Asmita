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
import { NoticeStep, PreviewView } from "@/app/(admin)/findings/NoticeStep";
import { SafetyNote } from "@/app/(admin)/findings/SafetyNote";
import { messageFor, NOTICE_ERRORS, REVIEW_ERRORS, type NoticePreview, type SendResult } from "@/app/(admin)/findings/findings-client";
import { noticeGate, noticeLabel, platformLabel, reviewLabel, sortFindings, type NoticeGateInput } from "@/app/(admin)/findings/finding-view";
import { checkBudget, checkDelay, checkDomain } from "@/app/(admin)/crawl-sources/source-validation";
import { IMPORT_STATUS_LABELS, ImportResults, originLabel, discoveryStateLabel, SourcesManager } from "@/app/(admin)/crawl-sources/SourcesManager";
import { BlockedHostsManager } from "@/app/(admin)/crawl-sources/BlockedHostsManager";
import { CrawlerSitesTabs } from "@/app/(admin)/crawl-sources/CrawlerSitesTabs";
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
    "crawl-sources/CrawlerSitesTabs.tsx",
    "crawl-sources/BlockedHostsManager.tsx",
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
  it("tells the first reviewer, from the server flag, that someone else must give the second review", () => {
    const html = render({ needsSecondReview: true, awaitingSecondReview: true, distance: 30, currentAdminGaveFirstReview: true });
    expect(html).toContain("You gave the first approval");
    expect(html).not.toContain("<button");
  });
  it("offers no review while the crawler is off", () => {
    expect(render({ crawlerEnabled: false })).not.toContain("<button");
  });
  it("shows a decided finding without buttons", () => {
    expect(render({ reviewStatus: "APPROVED" })).not.toContain("<button");
  });
  it("maps the second-reviewer error to a sentence", () => {
    expect(REVIEW_ERRORS.second_reviewer_required).toMatch(/different/);
  });
});

describe("notice step and error messages", () => {
  const state: NoticeGateInput = {
    reviewStatus: "APPROVED", representativeNoticeSentAt: null, noticeAttemptUnconfirmed: false,
    crawlConsentWithdrawn: false, urlsPurged: false, linkStatus: "NOTICE_QUEUED", crawlerEnabled: true,
  };
  const render = (over: Partial<typeof state> = {}) =>
    renderToStaticMarkup(createElement(NoticeStep, { findingId: "f1", caseId: "c1", state: { ...state, ...over } }));

  it("never previews by itself: the reveal is explained and must be acknowledged first; Send waits for a preview", () => {
    const html = render();
    expect(html).toContain("recorded against my name as an");
    expect(html).toContain("20 previews an hour");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Preview notice/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send notice/);
    expect(html).not.toContain("notice-preview");
  });

  it("shows sent state, consent withdrawn, the crawler switch and an unconfirmed attempt", () => {
    const sent = render({ representativeNoticeSentAt: "2026-11-16T05:30:00.000Z" });
    expect(sent).toContain("Representative notice sent on 2026-11-16 05:30 UTC");
    expect(sent).not.toContain("<button");
    const withdrawn = render({ crawlConsentWithdrawn: true });
    expect(withdrawn).toContain("Consent withdrawn");
    expect(withdrawn).not.toContain("<button");
    expect(render({ crawlerEnabled: false })).toContain("switched off");
    expect(render({ crawlerEnabled: false })).not.toContain("<button");
    expect(render({ noticeAttemptUnconfirmed: true })).toContain("not recorded as sent");
    expect(render({ linkStatus: null })).not.toContain("<button");
  });

  it("renders the PDF text and the email body as text, offers the PDF download, and never links an address", () => {
    const preview: NoticePreview = {
      findingId: "f1", caseId: "c1", caseReference: "ASMITA-2026-00001", urlId: "u1", platformName: "Example Forum",
      recipientEmail: "grievance@example.org", transport: "email", subject: "Subject line",
      body: `Page address: ${PAGE}\nImage address: ${IMAGE}`, emailBody: "Page address: [Page address is in the attached notice]",
      noticeDate: "16 November 2026", signedAs: "ASMITA-REVIEWER-ABCDEF1234", consent: { id: "consent-1", signedAt: "2026-11-10T06:00:00.000Z" },
      templateId: "t", fingerprintIds: ["h1"], approvedById: "a", secondApprovedById: null, pdfBase64: "JVBERg==", contentDigest: "0".repeat(64),
    };
    const html = renderToStaticMarkup(createElement(PreviewView, { preview }));
    expect(html).toContain(PAGE);
    expect(html).toContain("[Page address is in the attached notice]");
    expect(html).toContain("Download the PDF");
    expect(html).toContain("ASMITA-REVIEWER-ABCDEF1234");
    expect(html).not.toMatch(/<a[\s>]/i);
    expect(html).not.toMatch(/<(img|iframe|embed|object)[\s>]/i);
  });

  it("gives a sentence for known codes, and a generic one for unknown codes and 503", () => {
    for (const code of ["consent_withdrawn", "template_not_reviewed", "verified_platform_contact_required", "notice_changed", "email_already_sent"]) {
      expect(messageFor(NOTICE_ERRORS, 409, code)).not.toContain(code);
    }
    expect(messageFor(NOTICE_ERRORS, 503, undefined)).toMatch(/switched off/);
    expect(messageFor(NOTICE_ERRORS, 409, "brand_new_code")).toContain("brand_new_code");
  });

  it("every refusal code in docs/product/crawler-notice-flow.md has its own sentence", () => {
    const doc = readFileSync(join(process.cwd(), "docs/product/crawler-notice-flow.md"), "utf8");
    const tables = doc.slice(doc.indexOf("## Gates and codes"), doc.indexOf("## Sending and retries"));
    const codes = new Set<string>();
    for (const line of tables.split("\n")) {
      const cell = line.match(/^\|\s*(`[^|]+)\|/);
      if (!cell) continue;
      for (const code of cell[1].matchAll(/`([a-z_]+)`/g)) codes.add(code[1]);
    }
    expect(codes.size).toBeGreaterThan(25);
    for (const code of codes) {
      expect(NOTICE_ERRORS[code], code).toBeTruthy();
      expect(NOTICE_ERRORS[code], code).not.toContain(code);
    }
  });

  it("explains an unconfirmed earlier attempt and points to the runbook", () => {
    expect(NOTICE_ERRORS.earlier_attempt_unconfirmed).toContain("crawler-runbook.md");
    expect(NOTICE_ERRORS.dispatch_in_progress).toMatch(/Nothing was sent/);
  });

  it("matches the real preview and dispatch shapes the routes return", () => {
    const preview = readFileSync(join(process.cwd(), "src/app/api/admin/findings/[id]/notice/preview/route.ts"), "utf8");
    for (const key of ["findingId", "caseId", "caseReference", "urlId", "platformName", "recipientEmail", "transport", "subject", "body", "emailBody", "noticeDate", "signedAs", "consent", "templateId", "fingerprintIds", "approvedById", "secondApprovedById", "pdfBase64", "contentDigest"] satisfies Array<keyof NoticePreview>) {
      expect(preview, key).toMatch(new RegExp(`\\b${key}:`));
    }
    const dispatch = readFileSync(join(process.cwd(), "src/app/api/admin/findings/[id]/notice/dispatch/route.ts"), "utf8");
    for (const key of ["dispatched", "transport", "messageId", "sentAt", "contentDigest"] satisfies Array<keyof SendResult>) {
      expect(dispatch, key).toMatch(new RegExp(`\\b${key}:`));
    }
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
  it("labels platform and notice state", () => {
    expect(platformLabel(null)).toBe("Unknown platform");
    expect(platformLabel({ name: "X", formOnly: true, contactVerified: false })).toContain("own form only");
    expect(platformLabel({ name: "Y", formOnly: false, contactVerified: false })).toContain("not verified");
    expect(noticeLabel(row({ reviewStatus: "APPROVED", representativeNoticeSentAt: "2026-11-16T05:30:00.000Z" }))).toBe("Sent 2026-11-16 05:30");
    expect(noticeLabel(row({ reviewStatus: "APPROVED", crawlConsentWithdrawn: true }))).toBe("Consent withdrawn");
    expect(noticeLabel(row({ reviewStatus: "APPROVED", noticeAttemptUnconfirmed: true }))).toBe("Attempt unconfirmed");
    expect(noticeGate({ ...row({ reviewStatus: "APPROVED", linkStatus: "NOTICE_QUEUED" }), crawlerEnabled: true })).toEqual({ kind: "open", warning: null });
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

describe("sources manager", () => {
  const source = { id: "s1", kind: "site" as const, domain: "news.example-site.org", pageBudget: 200, delayMs: 2000, enabled: false, approvedBy: "super-1", origin: "ADMIN" as const, hops: 0, discoveredFromId: null, discoveredFromDomain: null, render: "HTTP" as const, pagesCrawled: 0, lastCrawledAt: null, pausedUntil: null, pauseReason: null, disabledReason: null, createdAt: "2026-11-16T00:00:00.000Z" };
  it("offers to edit a host's page budget and delay, and speaks of hosts", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [source] }));
    expect(html).toContain("Edit page budget and delay for news.example-site.org");
    expect(html).toContain("Add a host");
    expect(html).toContain("its subdomains");
  });
  it("disables every change while the crawler is off", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [source], crawlerEnabled: false }));
    for (const label of ["Edit page budget", "Switch on crawling"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="${label}`));
    }
  });
});

describe("bulk import box and results table (WP2)", () => {
  it("offers the paste-a-list import box", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [] }));
    expect(html).toContain("Import a list of hosts");
    expect(html).toMatch(/<textarea[^>]*aria-label="Hosts to import"/);
    expect(html).toContain("Up to 1000 entries");
    expect(html).toMatch(/<button[^>]*type="submit">Import hosts<\/button>/);
  });
  it("reports each entry with a sentence, and shows addresses only as text", () => {
    const html = renderToStaticMarkup(createElement(ImportResults, { results: [
      { input: "forum.example.org", status: "created", host: "forum.example.org" },
      { input: "https://shop.example.org/x", status: "exists", host: "shop.example.org" },
      { input: "facebook.com", status: "blocked", host: "facebook.com" },
      { input: "10.0.0.1", status: "invalid", reason: "invalid_domain" },
      { input: "db.internal", status: "invalid", reason: "private_domain" },
    ] }));
    expect(IMPORT_STATUS_LABELS).toEqual({ created: "Added", exists: "Already listed", blocked: "Never crawl", invalid: "Invalid" });
    expect(html).toContain("Added");
    expect(html).toContain("Already listed");
    expect(html).toContain("Never crawl");
    expect(html).toContain("Invalid (not a public host name)");
    expect(html).toContain("Invalid (private or reserved name)");
    expect(html).toContain("https://shop.example.org/x");
    expect(html).not.toMatch(/<a[\s>]/i);
    expect(html).not.toMatch(/\b(href|src|srcset)\s*=/i);
  });
  it("disables the import while the crawler is off", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [], crawlerEnabled: false }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import hosts</);
  });
});

describe("origin, hops and crawl progress columns (WP2)", () => {
  const sourceWith = (over: Partial<Parameters<typeof SourcesManager>[0]["sources"][number]>) => ({
    id: "s1", kind: "site" as const, domain: "news.example-site.org", pageBudget: 200, delayMs: 2000, enabled: false,
    approvedBy: "super-1", origin: "ADMIN" as const, hops: 0, discoveredFromId: null, discoveredFromDomain: null, render: "HTTP" as const,
    pagesCrawled: 0, lastCrawledAt: null, pausedUntil: null, pauseReason: null, disabledReason: null,
    createdAt: "2026-11-16T00:00:00.000Z", ...over,
  });
  it("shows origin, hops, pages crawled and last crawled for every site, with an origin filter", () => {
    expect(originLabel("ADMIN")).toBe("Admin");
    expect(originLabel("REPORTED")).toBe("Reported");
    expect(originLabel("DISCOVERED")).toBe("Discovered");
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [
      sourceWith({ origin: "REPORTED", pagesCrawled: 42, lastCrawledAt: "2026-11-16T05:30:00.000Z" }),
      sourceWith({ id: "s2", domain: "far.example-site.org", origin: "DISCOVERED", hops: 2, pagesCrawled: 5 }),
    ] }));
    for (const heading of ["Origin", "Hops", "Pages crawled", "Last crawled"]) expect(html).toContain(heading);
    expect(html).toContain("Admin");
    expect(html).toContain("Reported");
    expect(html).toContain("Discovered");
    expect(html).toContain("42");
    expect(html).toContain("2026-11-16 05:30");
    expect(html).toContain("Never");
    expect(html).toMatch(/<select[^>]*aria-label="Filter sites by origin"/);
    expect(html).toContain("All origins");
  });
});

describe("never crawl tab (WP2)", () => {
  const blockedHost = { id: "bh-1", host: "forum.example.org", reason: "owner request", addedBy: "super-1", createdAt: "2026-11-16T05:30:00.000Z" };
  it("offers both tabs, with the sites view shown first", () => {
    const html = renderToStaticMarkup(createElement(CrawlerSitesTabs, { sources: [], blockedHosts: [blockedHost] }));
    expect(html).toContain("Sites");
    expect(html).toContain("Never crawl");
    expect(html).toContain("Add a host");
    expect(html).not.toContain("Never crawl a host");
  });
  it("lists blocked hosts as text with reason, adder, date and a remove button, never as links", () => {
    const html = renderToStaticMarkup(createElement(BlockedHostsManager, { blockedHosts: [blockedHost] }));
    expect(html).toContain("forum.example.org");
    expect(html).toContain("owner request");
    expect(html).toContain("super-1");
    expect(html).toContain("2026-11-16 05:30");
    expect(html).toMatch(new RegExp(`<button[^>]*aria-label="Remove forum.example.org from the never-crawl list"`));
    expect(html).toContain("Never crawl a host");
    expect(html).not.toMatch(/<a[\s>]/i);
    expect(html).not.toMatch(/\b(href|src|srcset)\s*=/i);
  });
  it("disables every change while the crawler is off", () => {
    const html = renderToStaticMarkup(createElement(BlockedHostsManager, { blockedHosts: [blockedHost], crawlerEnabled: false }));
    expect(html).toMatch(new RegExp(`<button[^>]*aria-label="Remove forum.example.org from the never-crawl list"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="Remove forum.example.org from the never-crawl list"`));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Never crawl this host</);
  });
});

describe("discovered sites: parent and pause state (WP5)", () => {
  const sourceWith = (over: Partial<Parameters<typeof SourcesManager>[0]["sources"][number]>) => ({
    id: "s1", kind: "site" as const, domain: "news.example-site.org", pageBudget: 200, delayMs: 2000, enabled: false,
    approvedBy: "super-1", origin: "ADMIN" as const, hops: 0, discoveredFromId: null, discoveredFromDomain: null, render: "HTTP" as const,
    pagesCrawled: 0, lastCrawledAt: null, pausedUntil: null, pauseReason: null, disabledReason: null,
    createdAt: "2026-11-16T00:00:00.000Z", ...over,
  });
  it("shows a discovered site's parent domain, never as a link", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [
      sourceWith({ id: "parent", domain: "seed.example-site.org", enabled: true }),
      sourceWith({ id: "child", domain: "found.example-site.org", origin: "DISCOVERED", hops: 2, enabled: true, discoveredFromId: "parent", discoveredFromDomain: "seed.example-site.org" }),
      sourceWith({ id: "orphan", domain: "gone-parent.example-site.org", origin: "DISCOVERED", hops: 1, discoveredFromId: "missing", discoveredFromDomain: null }),
    ] }));
    for (const heading of ["Found via", "State"]) expect(html).toContain(heading);
    expect(html).toContain("seed.example-site.org");
    expect(html).toContain("a source that is gone");
    expect(html).not.toMatch(/<a[\s>]/i);
  });
  it("says why a discovered site is paused or stored disabled", () => {
    const html = renderToStaticMarkup(createElement(SourcesManager, { sources: [
      sourceWith({ id: "p1", domain: "paused.example-site.org", origin: "DISCOVERED", hops: 1, enabled: false, pausedUntil: "2026-12-17T09:30:00.000Z", pauseReason: "no_match_budget_spent" }),
      sourceWith({ id: "p2", domain: "deep.example-site.org", origin: "DISCOVERED", hops: 3, enabled: false, disabledReason: "max_hops" }),
      sourceWith({ id: "p3", domain: "capped.example-site.org", origin: "DISCOVERED", hops: 1, enabled: false, disabledReason: "daily_cap" }),
      sourceWith({ id: "p4", domain: "admin-off.example-site.org", enabled: false }),
    ] }));
    expect(html).toContain("Paused until 2026-12-17 — no match with its budget spent 3 days running");
    expect(html).toContain("Off — beyond the discovery-hop limit");
    expect(html).toContain("Off — the daily new-site cap was reached");
  });
  it("labels an enabled discovered site with no state note", () => {
    expect(discoveryStateLabel({ enabled: true, pausedUntil: null, pauseReason: null, disabledReason: null })).toBeNull();
    expect(discoveryStateLabel({ enabled: true, pausedUntil: "2026-12-17T09:30:00.000Z", pauseReason: "no_match_budget_spent", disabledReason: null })).toContain("Paused until 2026-12-17");
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
