import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const reviewSubmittedUrl = vi.fn();
vi.mock("@/lib/case-ops", () => ({ reviewSubmittedUrl: (...args: unknown[]) => reviewSubmittedUrl(...args) }));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: async () => ({ ok: true, session: { sub: "admin-1" } }),
}));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import {
  REJECTION_PRESETS,
  REJECTION_REASON_MAX,
  localizeRejectionReason,
  presetText,
  rejectionReasonText,
} from "@/lib/rejection-reasons";
import { RejectReasonPicker } from "@/app/(admin)/flagged/ReviewActions";
import { POST as rejectRoute } from "@/app/api/admin/review-queue/[caseId]/[urlId]/reject/route";
import { addUrlsToCase, cases, createCase, reviewSubmittedUrl as storeReview } from "@/lib/store";
import { FAIR_QUALITY, joinNames, linkPlatformName, numbered, qualityLevel } from "@/app/(victim)/review-sign/review-summary";
import { LOW_QUALITY_THRESHOLD } from "@/lib/hash-submission";
import { ReferenceCard, referenceGroups } from "@/app/(victim)/case/[caseId]/confirmation/ReferenceCard";

const strip = (html: string) => html.replace(/<[^>]+>/g, "");

describe("rejection reasons", () => {
  it("has five presets with English and Hindi text within the server limit", () => {
    expect(REJECTION_PRESETS).toHaveLength(5);
    for (const preset of REJECTION_PRESETS) {
      const english = (en as Record<string, string>)[preset.key];
      const hindi = (hi as Record<string, string>)[preset.key];
      expect(english.length).toBeGreaterThan(10);
      expect(english.length).toBeLessThanOrEqual(REJECTION_REASON_MAX);
      expect(hindi).toBeTruthy();
      expect(hindi).not.toBe(english);
    }
    expect(status.machineTranslated.keys).toEqual(expect.arrayContaining(["rejectReason.*", "case.rejectedReason.label"]));
  });

  it("needs a choice, and Other needs at least three characters", () => {
    expect(rejectionReasonText(null, "")).toBeNull();
    expect(rejectionReasonText("other", "  ")).toBeNull();
    expect(rejectionReasonText("other", "ab")).toBeNull();
    expect(rejectionReasonText("other", "x".repeat(REJECTION_REASON_MAX + 1))).toBeNull();
    expect(rejectionReasonText("other", "  Written by hand.  ")).toBe("Written by hand.");
  });

  it("sends a preset's exact English text, whatever the admin's language", () => {
    expect(rejectionReasonText("duplicate", "ignored")).toBe(en["rejectReason.duplicate"]);
  });

  it("shows a stored preset in her language and anything else as written", () => {
    const stored = presetText("already_removed")!;
    expect(localizeRejectionReason(stored, "en")).toBe(en["rejectReason.alreadyRemoved"]);
    expect(localizeRejectionReason(stored, "hi")).toBe(hi["rejectReason.alreadyRemoved"]);
    expect(localizeRejectionReason("A note in the admin's own words.", "hi")).toBe("A note in the admin's own words.");
    expect(localizeRejectionReason(null, "en")).toBeNull();
    expect(localizeRejectionReason("   ", "en")).toBeNull();
  });

  it("renders one radio per preset plus Other, and the text box only for Other", () => {
    const props = { name: "r", other: "", onChoice: () => {}, onOther: () => {} };
    const closed = renderToStaticMarkup(createElement(RejectReasonPicker, { ...props, choice: "duplicate" }));
    expect(closed.match(/type="radio"/g)).toHaveLength(6);
    expect(closed).toContain("<legend");
    expect(closed).not.toContain("<textarea");
    const open = renderToStaticMarkup(createElement(RejectReasonPicker, { ...props, choice: "other" }));
    expect(open).toContain("<textarea");
    expect(open).toContain(`maxLength="${REJECTION_REASON_MAX}"`);
  });
});

describe("reject route and storage", () => {
  afterEach(() => {
    reviewSubmittedUrl.mockReset();
    cases.clear();
  });

  const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
  const params = { params: Promise.resolve({ caseId: "c1", urlId: "u1" }) };

  it("passes the chosen reason to the case unchanged", async () => {
    reviewSubmittedUrl.mockResolvedValue({ id: "u1" });
    const reason = presetText("not_specific")!;
    const res = await rejectRoute(request({ reason }), params);
    expect(res.status).toBe(200);
    expect(reviewSubmittedUrl).toHaveBeenCalledWith(expect.objectContaining({ decision: "reject", reason }));
  });

  it("still refuses a reason over the length limit", async () => {
    const res = await rejectRoute(request({ reason: "x".repeat(REJECTION_REASON_MAX + 1) }), params);
    expect(res.status).toBe(400);
    expect(reviewSubmittedUrl).not.toHaveBeenCalled();
  });

  it("stores the reason the survivor then reads", async () => {
    const record = await createCase("user-1");
    const [result] = await addUrlsToCase(record.id, ["https://instagram.com/p/abc"], { flagReasons: ["known_public_or_news_domain"] });
    if (!result.ok) throw new Error("expected accepted URL");
    const reason = presetText("out_of_scope")!;
    const reviewed = await storeReview({ caseId: record.id, urlId: result.url.id, decision: "reject", reason });
    expect(localizeRejectionReason(reviewed.flagReason, "en")).toBe(reason);
  });
});

describe("review summary words", () => {
  it("turns quality into a word, with the same low line as the server", () => {
    expect(FAIR_QUALITY).toBe(LOW_QUALITY_THRESHOLD);
    expect(qualityLevel(100)).toBe("good");
    expect(qualityLevel(70)).toBe("good");
    expect(qualityLevel(55)).toBe("fair");
    expect(qualityLevel(49)).toBe("low");
  });

  it("names the platform and numbers items", () => {
    expect(linkPlatformName("https://www.youtube.com/watch?v=abc")).toBe("YouTube");
    expect(linkPlatformName("not a link")).toBeNull();
    expect(numbered("en", "review.fingerprints.item", 0)).toBe("Image 1");
    expect(numbered("hi", "review.links.item", 1)).toBe("लिंक 2");
    expect(joinNames(["A", "B", "C"], "en")).toBe("A, B and C");
    expect(joinNames(["A", "A"], "en")).toBe("A");
  });
});

describe("case reference card", () => {
  it("groups the reference without changing its text", () => {
    const reference = "ASMITA-2026-7K3M9Q";
    expect(referenceGroups(reference).map((g) => g.text)).toEqual(["ASMITA", "2026", "7K3", "M9Q"]);
    const html = renderToStaticMarkup(createElement(ReferenceCard, { reference, locale: "en" }));
    expect(strip(html)).toContain(reference);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Copy");
    expect(html).toContain(en["confirm.ref.reassure"]);
  });

  it("speaks Hindi", () => {
    const html = renderToStaticMarkup(createElement(ReferenceCard, { reference: "ASMITA-2026-7K3M9Q", locale: "hi" }));
    expect(html).toContain(hi["confirm.ref.copy"]);
  });
});
