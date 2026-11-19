import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

// The watch-facing pieces of WP22, rendered like the other survivor UI
// tests: the tick in its watch-only wording, the found copies with her two
// choices ("Not now" sends nothing), and the admin labels and gates that say
// what a watch is. No browser, no network: the fetchers are fakes.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { CrawlConsent } from "@/app/(victim)/case/[caseId]/CrawlConsent";
import { WatchFoundList } from "@/app/(victim)/case/[caseId]/WatchFoundList";
import { AddMoreImages } from "@/app/(victim)/case/[caseId]/AddMoreImages";
import { noticeGate, noticeLabel } from "@/app/(admin)/findings/finding-view";
import { NOTICE_ERRORS } from "@/app/(admin)/findings/findings-client";
import { NEXT_ACTION_FILTER_LABELS, nextActionLabel } from "@/app/(admin)/cases/case-format";
import { CaseTable } from "@/app/(admin)/cases/CaseTable";
import { deriveCaseWork, NEXT_ACTIONS, type CaseFacts, type Gates } from "@/lib/admin-cases";
import type { ConsentState } from "@/app/(victim)/case/[caseId]/crawl-consent-logic";

const draft = { subject: "Watch authorisation for case X", body: "Body of the watch authorisation", templateRef: "ref-1" };
const off: ConsentState = { status: "none", available: true, draft, watchUntil: null };
const on: ConsentState = { status: "signed", available: true, draft: null, watchUntil: null };

describe("the watch tick (CrawlConsent, watch variant)", () => {
  const render = (initialConsent: ConsentState | null) =>
    renderToStaticMarkup(createElement(CrawlConsent, { caseId: "c1", locale: "en", initialConsent, watch: true }));

  it("asks exactly what the spec says, and promises nothing it cannot keep", () => {
    const html = render(off);
    expect(html).toContain("Search the web for copies of these images and alert me. Nothing is sent to any platform unless I choose.");
    expect(html).toContain("alerts you when a reviewer confirms a possible copy");
    expect(html).toContain("Nothing is sent to any platform unless you choose.");
    expect(html).not.toContain("takedown notice on your behalf");
    expect(html).not.toContain("Also search the web");
  });

  it("shows the watch state and the watch-only withdrawal wording", () => {
    const html = render(on);
    expect(html).toContain("Watching is on");
    expect(html).not.toContain("Searching is on");
    // After stop-watching the draft is rebuilt while the search is off, so the
    // withdrawn note with the watch-only wording shows under the tick.
    const withdrawn = render({ status: "withdrawn", available: true, draft, watchUntil: null });
    expect(withdrawn).toContain("Watching was stopped and your fingerprints were deleted.");
    expect(withdrawn).not.toContain("Searching was switched off");
    // The stop confirmation carries the watch wording with the fingerprint
    // deletion the route performs.
    const source = readFileSync("src/app/(victim)/case/[caseId]/CrawlConsent.tsx", "utf8");
    expect(source).toContain('"watch.stop.title"');
    expect(source).toContain('"watch.stop.fingerprints"');
    expect(source).toContain('"watch.stop.record"');
  });

  it("the watch explain list never promises a notice", () => {
    const html = render(off);
    const inside = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(inside).toContain("Asmita compares your image fingerprints with images on a limited list of public websites");
    expect(inside).toContain("alerts you when a reviewer confirms a possible copy");
    expect(inside).not.toContain("sends a takedown notice");
  });
});

describe("the found copies on her watch page", () => {
  type FoundUrl = Parameters<typeof WatchFoundList>[0]["urls"][number];
  const stopped: FoundUrl = { id: "u1", domain: "forum.example.test", platformName: "Example Forum", status: "NOTICE_QUEUED", crawlConsentWithdrawn: true, representativeNoticeSentAt: null };
  const sent: FoundUrl = { id: "u2", domain: "other.example.test", platformName: "Other Site", status: "NOTICE_SENT", crawlConsentWithdrawn: false, representativeNoticeSentAt: "2026-11-18T20:00:00.000Z" };
  const urls: FoundUrl[] = [
    { id: "u1", domain: "forum.example.test", platformName: "Example Forum", status: "NOTICE_QUEUED", crawlConsentWithdrawn: false, representativeNoticeSentAt: null },
    { id: "u2", domain: "other.example.test", platformName: "Other Site", status: "PENDING_REVIEW", crawlConsentWithdrawn: false, representativeNoticeSentAt: null },
  ];
  const draw = (list = urls) =>
    renderToStaticMarkup(createElement(WatchFoundList, {
      caseId: "c1",
      urls: list,
      locale: "en",
      badge: (s: string) => createElement("span", null, `status:${s}`),
    }));

  it("shows the site name only, with her two choices and no link", () => {
    const html = draw();
    expect(html).toContain("Possible copies");
    expect(html).toContain("forum.example.test");
    expect(html).toContain("Take it down");
    expect(html).toContain("Not now");
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toMatch(/href=|<img|<iframe/);
    expect(html).toContain("Nothing is sent to any platform until you choose.");
  });

  it("a sent copy shows its truth instead of the choices; a stopped one can still be taken down", () => {
    const html = draw([stopped, sent]);
    expect(html).toContain("Stopped: you withdrew permission");
    expect(html).toContain("Asmita sent the takedown notice on");
    // The stopped copy keeps her choices: she stopped watching, but she can
    // still decide to take that copy down.
    expect(html).toContain("Take it down");
    // The sent one is history: no notice is ever sent twice for it.
    const sentOnly = draw([sent]);
    expect(sentOnly).not.toContain("Take it down");
    expect(sentOnly).not.toContain("Not now");
  });
});

describe("Add more images", () => {
  it("renders the button and the no-promises hint", () => {
    const html = renderToStaticMarkup(createElement(AddMoreImages, { caseId: "c1", locale: "en" }));
    expect(html).toContain("Add more images");
    expect(html).not.toMatch(/<a[\s>]|href=/);
  });
});

describe("the admin side of watches", () => {
  it("deriveCaseWork excludes a watch from Needs action unless a finding awaits review", () => {
    const gates: Gates = { platforms: new Map(), hasReviewedTemplate: () => true };
    const now = new Date("2026-11-19T12:00:00Z");
    const watch: CaseFacts = {
      id: "w1", referenceNumber: "ASMITA-2026-WATCH1", status: "OPEN",
      createdAt: new Date("2026-11-19T08:00:00Z"), updatedAt: new Date("2026-11-19T08:00:00Z"),
      declarationSignedAt: null, links: [], notices: [],
      // Her fingerprints wait for review too: that is the Fingerprints queue,
      // not Needs action, for a watch.
      pendingFingerprints: 3, oldestPendingFingerprint: new Date("2026-11-19T08:00:00Z"),
      mode: "WATCH", pendingFindings: 0, oldestPendingFinding: null,
    };
    expect(deriveCaseWork(watch, gates, now).nextAction).toBe("none");

    const withFinding = { ...watch, pendingFindings: 2, oldestPendingFinding: new Date("2026-11-19T09:00:00Z") };
    const work = deriveCaseWork(withFinding, gates, now);
    expect(work).toMatchObject({ nextAction: "review_findings", actionCount: 2 });
    expect(work.dueAt).toEqual(new Date("2026-11-19T13:00:00Z"));
  });

  it("the queue labels and the Needs action page name the new queue", () => {
    expect(NEXT_ACTIONS).toContain("review_findings");
    expect(NEXT_ACTION_FILTER_LABELS.review_findings).toBe("Review found copies");
    expect(nextActionLabel("review_findings", 2)).toBe("Review 2 found copies");
    expect(nextActionLabel("review_findings", 1)).toBe("Review 1 found copy");
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain('caseTile("Found copies to review", queue("review_findings"), "review_findings", now)');
  });

  it("the cases list shows a Watch label on watch rows", () => {
    const rows = [
      { caseId: "c1", referenceNumber: "ASMITA-2026-AAAAAA", action: "Nothing to do", due: "-", overdue: false, links: 0, step: "-", platforms: "", age: "1d", ageTitle: "x", watch: true },
      { caseId: "c2", referenceNumber: "ASMITA-2026-BBBBBB", action: "Nothing to do", due: "-", overdue: false, links: 0, step: "-", platforms: "", age: "1d", ageTitle: "x", watch: false },
    ];
    const html = renderToStaticMarkup(createElement(CaseTable, { rows, caption: "Cases", sortedBy: null, initialPeek: null }));
    expect(html).toContain("Watch");
    expect(html.match(/Watch</g)?.length).toBe(2); // the table row and the mobile row
  });

  it("the findings console says watch only, before and during a preview attempt", () => {
    expect(NOTICE_ERRORS.watch_only_consent).toContain("Watch only: she has not asked for removal yet");
    expect(NOTICE_ERRORS.watch_only_consent).not.toContain("watch_only_consent");
    expect(noticeLabel({ reviewStatus: "APPROVED", representativeNoticeSentAt: null, noticeAttemptUnconfirmed: false, crawlConsentWithdrawn: false, watchOnly: true })).toBe("Watch only");
    const gate = noticeGate({
      reviewStatus: "APPROVED", representativeNoticeSentAt: null, noticeAttemptUnconfirmed: false,
      crawlConsentWithdrawn: false, watchOnly: true, urlsPurged: false, linkStatus: "NOTICE_QUEUED", crawlerEnabled: true,
    });
    expect(gate).toMatchObject({ kind: "blocked", code: "watch_only_consent" });
    expect((gate as { message: string }).message).toContain("Watch only: she has not asked for removal yet");
  });
});

describe("watch copy in both languages", () => {
  const watchKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => k.startsWith("watch.") || k.startsWith("case.watch.") || k.startsWith("start.watch."));

  it("has every watch key in both languages, none blank", () => {
    expect(watchKeys(hi).sort()).toEqual(watchKeys(en).sort());
    for (const key of watchKeys(hi)) expect((hi as Record<string, string>)[key]).not.toBe("");
  });

  it("is recorded as machine translated", () => {
    for (const prefix of ["watch.*", "case.watch.*", "start.watch.*"]) {
      expect(status.machineTranslated.keys).toContain(prefix);
    }
  });
});
