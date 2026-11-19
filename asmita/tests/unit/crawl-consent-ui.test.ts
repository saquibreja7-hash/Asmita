import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { CrawlConsent } from "@/app/(victim)/case/[caseId]/CrawlConsent";
import { FoundByAsmita } from "@/app/(victim)/case/[caseId]/FoundByAsmita";
import { consentView, foundLinkView, isCrawlerFound, reuploadWatchView, requestConsent, requestStop, signOutcome, splitUrls, type ConsentState } from "@/app/(victim)/case/[caseId]/crawl-consent-logic";
import { crawlerFindingsVisibleToSurvivor } from "@/lib/crawler-flags";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const draft = { subject: "Authorisation for case X", body: "Body of the authorisation text", templateRef: "ref-1" };
const off: ConsentState = { status: "none", available: true, draft, watchUntil: null };
const on: ConsentState = { status: "signed", available: true, draft: null, watchUntil: null };
const watching: ConsentState = { status: "signed", available: true, draft: null, watchUntil: "2027-11-19T09:00:00.000Z" };
const render = (initialConsent: ConsentState | null, caseOpen = true) =>
  renderToStaticMarkup(createElement(CrawlConsent, { caseId: "c1", locale: "en", caseOpen, initialConsent }));
const resp = (ok: boolean, body: unknown = {}) => ({ ok, json: async () => body }) as Response;

describe("CrawlConsent render", () => {
  it("shows nothing before the server has answered", () => {
    const html = render(null);
    expect(html).not.toContain("search the web");
    expect(html).toContain('aria-live="polite"');
  });

  it("shows nothing when signing is unavailable and she has not signed", () => {
    expect(render({ status: "none", available: false, draft: null, watchUntil: null })).not.toContain("search the web");
    expect(render({ status: "none", available: true, draft: null, watchUntil: null })).not.toContain("search the web");
  });

  // Owner decision 2026-11-18: one tick, no name, signature or "Sign and
  // switch on" step. The authorisation and how the search works stay one
  // click away in a disclosure she never has to open.
  it("offers one unticked box with one plain sentence, and no name or signature fields", () => {
    const html = render(off);
    expect(html).toContain("Also search the web for more copies of my images");
    expect(html).toContain("compares your approved image fingerprints with images on public websites");
    expect(html).toContain("switch this off at any time");
    expect(html).not.toContain("checked");
    for (const id of ["crawl-name", "crawl-contact", "crawl-signature"]) expect(html).not.toContain(id);
    expect(html).not.toMatch(/Sign and switch on|<button/);
  });

  it("keeps the full authorisation and the explanation in an optional disclosure", () => {
    const html = render(off);
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Read the full authorisation<\/summary>/);
    const inside = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(inside).toContain("Body of the authorisation text");
    expect(inside).toContain("limited list of public websites");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("the on state shows the box ticked, so unticking is how she stops", () => {
    const html = render(on);
    expect(html).toContain("Searching is on");
    expect(html).toMatch(/<input[^>]*id="crawl-tick"[^>]*checked/);
    expect(html).not.toContain("Read the full authorisation");
  });

  it("withdraw is still offered when the crawler is switched off", () => {
    expect(render({ status: "signed", available: false, draft: null, watchUntil: null })).toMatch(/<input[^>]*id="crawl-tick"[^>]*checked/);
  });

  // Watch-and-verify WP24: once the case is closed and the re-upload window
  // is running, the section says what it is really doing and offers "Stop
  // watching" instead of the open-case search copy.
  it("shows the re-upload watch with its end date and a Stop watching button on a closed case", () => {
    const html = render(watching, false);
    expect(html).toContain("Watching for re-uploads until");
    expect(html).toContain("2027");
    expect(html).toContain("Stop watching");
    expect(html).toContain("keeps comparing your image fingerprints");
    expect(html).toMatch(/<input[^>]*id="crawl-tick"[^>]*checked/);
    expect(html).not.toContain("Searching is on");
  });

  it("keeps the ordinary search copy on an open case even when a window is set", () => {
    const html = render(watching, true);
    expect(html).toContain("Searching is on");
    expect(html).not.toContain("Watching for re-uploads");
    expect(html).not.toContain("Stop watching");
  });

  it("never shows the watch view on an open case, without a window, or without a live authorisation", () => {
    expect(reuploadWatchView(null, false)).toBeNull();
    expect(reuploadWatchView(on, false)).toBeNull();
    expect(reuploadWatchView(watching, true)).toBeNull();
    expect(reuploadWatchView({ ...on, status: "withdrawn" }, false)).toBeNull();
    expect(reuploadWatchView(watching, false)).toEqual({ until: "2027-11-19T09:00:00.000Z" });
  });
});

describe("crawl consent logic", () => {
  it("decides what to show", () => {
    expect(consentView(null)).toBe("hidden");
    expect(consentView(off)).toBe("off");
    expect(consentView({ ...off, status: "withdrawn" })).toBe("off");
    expect(consentView({ status: "signed", available: false, draft: null, watchUntil: null })).toBe("on");
  });

  it("maps server errors, including the changed-text path", () => {
    expect(signOutcome("notice_changed_since_preview")).toBe("changed");
    expect(signOutcome("already_signed")).toBe("alreadySigned");
    for (const e of ["crawler_disabled", "template_missing", "no_hashes", "not_found"]) expect(signOutcome(e)).toBe("unavailable");
    expect(signOutcome("anything_else")).toBe("generic");
    expect(signOutcome(undefined)).toBe("generic");
  });

  it("ticking posts only the agreement and the templateRef the page loaded, and reports the changed text", async () => {
    const fetcher = vi.fn().mockResolvedValue(resp(false, { error: "notice_changed_since_preview" }));
    expect(await requestConsent(fetcher, "c1", "ref-1")).toEqual({ ok: false, outcome: "changed" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/cases/c1/crawl-consent");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ agreed: true, templateRef: "ref-1" });
    expect(await requestConsent(vi.fn().mockResolvedValue(resp(true)), "c1", "ref-1")).toEqual({ ok: true });
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
  type FoundUrl = Parameters<typeof FoundByAsmita>[0]["urls"][number];
  const urls: FoundUrl[] = [{ id: "u1", domain: "example.test", platformName: "Unknown - under review", status: "PENDING_REVIEW" }];
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
    expect(page).toMatch(/showFound && \(\s*<FoundByAsmita/);
    const found = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/FoundByAsmita.tsx"), "utf8");
    expect(found).not.toContain("EscalationLadder");
  });

  it("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR is on unless set to false", () => {
    expect(crawlerFindingsVisibleToSurvivor({})).toBe(true);
    expect(crawlerFindingsVisibleToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "true" })).toBe(true);
    expect(crawlerFindingsVisibleToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "false" })).toBe(false);
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
