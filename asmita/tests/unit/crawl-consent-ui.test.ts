import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { CrawlConsent } from "@/app/(victim)/case/[caseId]/CrawlConsent";
import { FoundByAsmita } from "@/app/(victim)/case/[caseId]/FoundByAsmita";
import { consentView, foundLinkView, isCrawlerFound, requestSign, requestStop, showFindingsToSurvivor, signOutcome, splitUrls, type ConsentState } from "@/app/(victim)/case/[caseId]/crawl-consent-logic";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const draft = { subject: "Authorisation for case X", body: "Body of the authorisation text", templateRef: "ref-1" };
const off: ConsentState = { status: "none", available: true, draft };
const on: ConsentState = { status: "signed", available: true, draft: null };
const render = (initialConsent: ConsentState | null, initialTicked = false) =>
  renderToStaticMarkup(createElement(CrawlConsent, { caseId: "c1", locale: "en", initialConsent, initialTicked }));
const resp = (ok: boolean, body: unknown = {}) => ({ ok, json: async () => body }) as Response;
const person = { templateRef: "ref-1", name: "A", contact: "a@example.com", signature: "A" };

describe("CrawlConsent render", () => {
  it("shows nothing before the server has answered", () => {
    const html = render(null);
    expect(html).not.toContain("Search the internet");
    expect(html).toContain('aria-live="polite"');
  });

  it("shows nothing when signing is unavailable and she has not signed", () => {
    expect(render({ status: "none", available: false, draft: null })).not.toContain("Search the internet");
    expect(render({ status: "none", available: true, draft: null })).not.toContain("Search the internet");
  });

  it("offers an unticked box with the explanation, and no sign form", () => {
    const html = render(off);
    expect(html).toContain("Search the internet for more copies of my images");
    expect(html).toContain("limited list of public websites");
    expect(html).not.toContain("checked");
    expect(html).not.toContain("Body of the authorisation text");
    expect(html).not.toContain("crawl-signature");
  });

  it("ticking reveals the authorisation text and the sign fields", () => {
    const html = render(off, true);
    expect(html).toContain("Body of the authorisation text");
    for (const id of ["crawl-name", "crawl-contact", "crawl-signature"]) expect(html).toContain(id);
    expect(html).toContain("Sign and switch on");
    expect(html).toContain("disabled");
  });

  it("the signed state offers Stop searching and no tick box", () => {
    const html = render(on);
    expect(html).toContain("Searching is on");
    expect(html).toContain("Stop searching");
    expect(html).not.toContain("Search the internet for more copies");
  });

  it("withdraw is still offered when the crawler is switched off", () => {
    expect(render({ status: "signed", available: false, draft: null })).toContain("Stop searching");
  });
});

describe("crawl consent logic", () => {
  it("decides what to show", () => {
    expect(consentView(null)).toBe("hidden");
    expect(consentView(off)).toBe("off");
    expect(consentView({ ...off, status: "withdrawn" })).toBe("off");
    expect(consentView({ status: "signed", available: false, draft: null })).toBe("on");
  });

  it("maps server errors, including the changed-text path", () => {
    expect(signOutcome("notice_changed_since_preview")).toBe("changed");
    expect(signOutcome("already_signed")).toBe("alreadySigned");
    expect(signOutcome("name_script_unsupported")).toBe("nameScript");
    for (const e of ["crawler_disabled", "template_missing", "no_hashes", "not_found"]) expect(signOutcome(e)).toBe("unavailable");
    expect(signOutcome("anything_else")).toBe("generic");
    expect(signOutcome(undefined)).toBe("generic");
  });

  it("signing posts the templateRef she saw and reports the changed text", async () => {
    const fetcher = vi.fn().mockResolvedValue(resp(false, { error: "notice_changed_since_preview" }));
    expect(await requestSign(fetcher, "c1", person)).toEqual({ ok: false, outcome: "changed" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/cases/c1/crawl-consent");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).templateRef).toBe("ref-1");
    expect(await requestSign(vi.fn().mockResolvedValue(resp(true)), "c1", person)).toEqual({ ok: true });
  });

  it("withdrawing calls DELETE; an already-stopped case counts as stopped", async () => {
    const fetcher = vi.fn().mockResolvedValue(resp(true));
    expect(await requestStop(fetcher, "c1")).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/cases/c1/crawl-consent", { method: "DELETE" });
    expect(await requestStop(vi.fn().mockResolvedValue(resp(false, { error: "not_signed" })), "c1")).toBe(true);
    expect(await requestStop(vi.fn().mockResolvedValue(resp(false, { error: "rate_limited" })), "c1")).toBe(false);
  });

  it("splits found links from submitted ones by source", () => {
    const { own, found } = splitUrls([{ id: "1" }, { id: "2", source: "CRAWLER" }, { id: "3", source: "SURVIVOR" }]);
    expect(own.map((u) => u.id)).toEqual(["1", "3"]);
    expect(found.map((u) => u.id)).toEqual(["2"]);
  });
});

describe("FoundByAsmita", () => {
  const urls = [{ id: "u1", domain: "example.test", platformName: "Unknown - under review", status: "PENDING_REVIEW" }];
  const draw = (list = urls) =>
    renderToStaticMarkup(createElement(FoundByAsmita, { urls: list, locale: "en", badge: (s: string) => createElement("span", null, `status:${s}`) }));

  it("shows the site as plain text with its status, no link, image or preview", () => {
    const html = draw();
    expect(html).toContain("Found by Asmita");
    expect(html).toContain("example.test");
    expect(html).toContain("status:PENDING_REVIEW");
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toMatch(/href=|<img|<iframe|<button/);
  });

  it("shows nothing when there are none", () => {
    expect(draw([])).toBe("");
  });

  it("a withdrawn link says it was stopped, not that a notice is coming", () => {
    const html = draw([{ id: "u2", domain: "example.test", platformName: "X", status: "NOTICE_QUEUED", crawlConsentWithdrawn: true, representativeNoticeSentAt: null }]);
    expect(html).toContain("Stopped: you withdrew permission");
    expect(html).not.toContain("status:NOTICE_QUEUED");
  });

  it("a sent link shows the date Asmita sent its notice, and no escalation ladder", () => {
    const html = draw([{ id: "u3", domain: "example.test", platformName: "X", status: "NOTICE_SENT", crawlConsentWithdrawn: false, representativeNoticeSentAt: "2026-11-15T20:00:00.000Z" }]);
    expect(html).toContain("Asmita sent the takedown notice on");
    expect(html).toContain("16 Nov 2026");
    expect(html).toContain("status:NOTICE_SENT");
    expect(html).not.toMatch(/ladder|deadline|follow/i);
  });
});

describe("found links: typed source, status and the survivor switch", () => {
  it("uses the typed DisplayUrl.source, with no cast", () => {
    expect(isCrawlerFound({ source: "CRAWLER" })).toBe(true);
    expect(isCrawlerFound({ source: "SURVIVOR" })).toBe(false);
    expect(isCrawlerFound({})).toBe(false);
    const source = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/crawl-consent-logic.ts"), "utf8");
    expect(source).not.toMatch(/ as \{ source/);
  });

  it("chooses a true badge for each state", () => {
    expect(foundLinkView({ status: "NOTICE_QUEUED", crawlConsentWithdrawn: true, representativeNoticeSentAt: null })).toEqual({ kind: "withdrawn" });
    expect(foundLinkView({ status: "NOTICE_SENT", crawlConsentWithdrawn: false, representativeNoticeSentAt: "2026-11-16T00:00:00.000Z" }))
      .toEqual({ kind: "sent", sentAt: "2026-11-16T00:00:00.000Z", status: "NOTICE_SENT" });
    expect(foundLinkView({ status: "NOTICE_QUEUED", crawlConsentWithdrawn: false, representativeNoticeSentAt: null })).toEqual({ kind: "status", status: "NOTICE_QUEUED" });
    expect(foundLinkView({ status: "REMOVED", crawlConsentWithdrawn: true, representativeNoticeSentAt: null })).toEqual({ kind: "status", status: "REMOVED" });
  });

  it("the status words a found link can get make no promise of a follow-up", () => {
    const E = en as Record<string, string>;
    for (const key of ["case.urlStatus.queued", "case.urlStatus.sent", "case.urlStatus.pendingReview", "case.urlStatus.resolved"]) {
      expect(E[key]).not.toMatch(/follow|deadline|hours/i);
    }
  });

  it("the case page draws no ladder for found links and keeps them out of where-things-stand", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/page.tsx"), "utf8");
    expect(page).toContain("standingOf(ownUrls,");
    expect(page).toMatch(/showFound && <FoundByAsmita/);
    const found = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/FoundByAsmita.tsx"), "utf8");
    expect(found).not.toContain("EscalationLadder");
  });

  it("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR is on unless set to false", () => {
    expect(showFindingsToSurvivor({})).toBe(true);
    expect(showFindingsToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "true" })).toBe(true);
    expect(showFindingsToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "false" })).toBe(false);
  });
});

describe("crawl copy", () => {
  const crawlKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => k.startsWith("crawl.") || k.startsWith("case.found."));
  const E = en as Record<string, string>;

  it("has every crawl key in both languages, none blank", () => {
    expect(crawlKeys(hi).sort()).toEqual(crawlKeys(E).sort());
    for (const key of crawlKeys(hi)) expect((hi as Record<string, string>)[key]).not.toBe("");
  });

  it("is recorded as pending native review, with the authorisation English-only", () => {
    expect(status.pendingNativeReview.keys).toEqual(expect.arrayContaining(["crawl.*", "case.found.*"]));
    expect(status.excludedFromTranslation.some((e) => e.includes("Crawl authorisation"))).toBe(true);
  });

  it("says what the owner asked and promises nothing it cannot keep", () => {
    const text = crawlKeys(E).map((k) => E[k]).join(" ").toLowerCase();
    for (const phrase of ["limited list of public websites", "never keeps the images", "trained asmita reviewer", "private groups", "login", "cropped or edited", "at any time", "within about an hour", "cannot be recalled"]) {
      expect(text).toContain(phrase);
    }
    expect(text).not.toMatch(/cannot be reversed|guarantee|will find|will remove/);
  });
});
