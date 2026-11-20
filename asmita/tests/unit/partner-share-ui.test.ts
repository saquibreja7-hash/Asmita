import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { PartnerShareConsent } from "@/app/(victim)/case/[caseId]/PartnerShareConsent";
import { agreeOutcome, parseShare, requestAgree, requestStop, shareView, type ShareState } from "@/app/(victim)/case/[caseId]/partner-share-logic";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const draft = { subject: "Agreement for case X", body: "Body of the agreement text", templateRef: "ref-1" };
const off: ShareState = { status: "none", available: true, draft };
const on: ShareState = { status: "agreed", available: true, draft: null };
const render = (initialShare: ShareState | null, eligibleCount = 2) =>
  renderToStaticMarkup(createElement(PartnerShareConsent, { caseId: "c1", locale: "en", eligibleCount, initialShare }));
const resp = (ok: boolean, body: unknown = {}) => ({ ok, json: async () => body }) as Response;

describe("PartnerShareConsent render", () => {
  it("shows nothing before the server has answered", () => {
    const html = render(null);
    expect(html).not.toContain("share my fingerprints");
    expect(html).toContain('aria-live="polite"');
  });

  it("shows nothing while it is off and cannot be switched on, or covers nothing", () => {
    expect(render({ status: "none", available: false, draft }, 2)).not.toContain("share my fingerprints");
    expect(render({ status: "none", available: true, draft: null }, 2)).not.toContain("share my fingerprints");
    expect(render(off, 0)).not.toContain("share my fingerprints");
  });

  it("stays visible once agreed, even when no fingerprint is eligible any more", () => {
    const html = render(on, 0);
    expect(html).toContain("Sharing is on");
    expect(html).toMatch(/<input[^>]*id="partner-share-tick"[^>]*checked/);
  });

  // WP31: one tick, no name, contact or signature. The full agreement stays
  // one click away in a disclosure she never has to open.
  it("offers one unticked box with one plain sentence, and no name or signature fields", () => {
    const html = render(off);
    expect(html).toContain("Also share my fingerprints with partner platforms");
    expect(html).toContain("never your images or your name");
    expect(html).not.toContain("checked");
    for (const id of ["partner-share-name", "partner-share-contact", "partner-share-signature"]) expect(html).not.toContain(id);
    expect(html).not.toMatch(/<button/);
    expect((html.match(/<input /g) ?? []).length).toBe(1);
  });

  it("lists the fingerprints it covers masked, never a hash value, digest or id", () => {
    const html = render(off);
    expect(html).toContain("Fingerprints this covers");
    expect(html).toContain("Image 1");
    expect(html).toContain("Image 2");
    expect(html).toContain("••••••••");
    expect(html).not.toMatch(/[0-9a-f]{40,}/i);
  });

  it("keeps the full agreement in an optional disclosure, with the English-only note", () => {
    const html = render(off);
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Read the full agreement<\/summary>/);
    const inside = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(inside).toContain("Body of the agreement text");
    expect(inside).toContain("This agreement is a legal document, so it is shown in English.");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("the on state shows the box ticked, so unticking is how she stops", () => {
    const html = render(on);
    expect(html).toContain("Sharing is on");
    expect(html).toContain("Asmita is sharing the approved fingerprints listed below");
    expect(html).toMatch(/<input[^>]*id="partner-share-tick"[^>]*checked/);
    expect(html).not.toContain("Read the full agreement");
    expect(html).not.toMatch(/<button/);
  });

  it("a withdrawn agreement says it was switched off and can be switched on again", () => {
    expect(render({ status: "withdrawn", available: true, draft }, 2)).toContain("Sharing was switched off. You can switch it on again below.");
  });

  // The confirm box opens on untick, so it is not in the static markup; its
  // copy is pinned here and its wiring checked in the component source.
  it("asks once before stopping, with what stopping does", () => {
    const E = en as Record<string, string>;
    expect(E["partnerShare.stop.title"]).toBe("Stop sharing your fingerprints?");
    expect(E["partnerShare.stop.1"]).toBe("Asmita stops sharing your fingerprints with partner platforms.");
    expect(E["partnerShare.stop.2"]).toBe("Asmita asks the platforms to delete the fingerprints they received.");
    expect(E["partnerShare.stop.3"]).toBe("Copies that platforms have already removed or blocked stay removed.");
    expect(E["partnerShare.stop.confirm"]).toBe("Yes, stop sharing");
    expect(E["partnerShare.stop.keep"]).toBe("Keep sharing");
    const source = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/PartnerShareConsent.tsx"), "utf8");
    for (const key of ["partnerShare.stop.title", "partnerShare.stop.1", "partnerShare.stop.2", "partnerShare.stop.3", "partnerShare.stop.confirm", "partnerShare.stop.working", "partnerShare.stop.keep"]) {
      expect(source).toContain(`"${key}"`);
    }
    expect(source).toMatch(/setConfirmingStop\(true\)/);
    expect(source).toContain('role="alert"');
  });
});

describe("partner share logic", () => {
  it("decides what to show", () => {
    expect(shareView(null, 2)).toBe("hidden");
    expect(shareView(off, 2)).toBe("off");
    expect(shareView({ ...off, status: "withdrawn" }, 2)).toBe("off");
    expect(shareView({ ...off, available: false }, 2)).toBe("hidden");
    expect(shareView({ ...off, draft: null }, 2)).toBe("hidden");
    expect(shareView(off, 0)).toBe("hidden");
    expect(shareView({ status: "agreed", available: false, draft: null }, 0)).toBe("on");
  });

  it("parses the server answer tolerantly", () => {
    expect(parseShare({})).toEqual({ status: "none", available: false, draft: null });
    expect(parseShare({ status: "agreed", available: true })).toEqual({ status: "agreed", available: true, draft: null });
    expect(parseShare({ status: "withdrawn", available: true, draft }).draft?.templateRef).toBe("ref-1");
  });

  it("maps server errors, including the changed-text path", () => {
    expect(agreeOutcome("notice_changed_since_preview")).toBe("changed");
    expect(agreeOutcome("already_agreed")).toBe("alreadyAgreed");
    for (const e of ["template_missing", "no_hashes", "not_found"]) expect(agreeOutcome(e)).toBe("unavailable");
    expect(agreeOutcome("anything_else")).toBe("generic");
    expect(agreeOutcome(undefined)).toBe("generic");
  });

  it("ticking posts only the agreement and the templateRef the page loaded, and reports the changed text", async () => {
    const fetcher = vi.fn().mockResolvedValue(resp(false, { error: "notice_changed_since_preview" }));
    expect(await requestAgree(fetcher, "c1", "ref-1")).toEqual({ ok: false, outcome: "changed" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/cases/c1/partner-share");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ agreed: true, templateRef: "ref-1" });
    expect(await requestAgree(vi.fn().mockResolvedValue(resp(true)), "c1", "ref-1")).toEqual({ ok: true });
  });

  it("withdrawing calls DELETE; an already-stopped case counts as stopped", async () => {
    const fetcher = vi.fn().mockResolvedValue(resp(true));
    expect(await requestStop(fetcher, "c1")).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/cases/c1/partner-share", { method: "DELETE" });
    expect(await requestStop(vi.fn().mockResolvedValue(resp(false, { error: "not_agreed" })), "c1")).toBe(true);
    expect(await requestStop(vi.fn().mockResolvedValue(resp(false, { error: "rate_limited" })), "c1")).toBe(false);
  });
});

describe("partner share copy", () => {
  const partnerKeys = (dict: Record<string, string>) => Object.keys(dict).filter((k) => k.startsWith("partnerShare."));
  const E = en as Record<string, string>;

  it("has every partnerShare key in both languages, none blank", () => {
    expect(partnerKeys(hi).sort()).toEqual(partnerKeys(E).sort());
    expect(partnerKeys(E).length).toBe(25);
    for (const key of partnerKeys(hi)) expect((hi as Record<string, string>)[key]).not.toBe("");
  });

  it("is recorded as machine translated and pending native review, with the agreement English-only", () => {
    expect(status.machineTranslated.keys).toContain("partnerShare.*");
    expect(status.pendingNativeReview.keys).toContain("partnerShare.*");
    expect(status.excludedFromTranslation.some((e) => e.includes("Partner-sharing agreement text"))).toBe(true);
  });

  it("promises only what Asmita can keep", () => {
    const text = partnerKeys(E).map((k) => E[k]).join(" ").toLowerCase();
    for (const phrase of ["never your images or your name", "asks the platforms to delete"]) {
      expect(text).toContain(phrase);
    }
    expect(text).toContain("at any time");
    expect(text).not.toMatch(/guarantee|will find|will remove/);
  });
});

describe("the case page", () => {
  it("draws the partner-sharing box under the crawl opt-in, covering the approved fingerprints", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(victim)/case/[caseId]/page.tsx"), "utf8");
    expect(page).toContain("const shareableHashes = hashSubmissions.filter((submission) => isPartnerShareableStatus(submission.status));");
    expect(page).toMatch(/<PartnerShareConsent caseId=\{record\.id\} locale=\{locale\} eligibleCount=\{shareableHashes\.length\} \/>/);
    expect(page.indexOf("<PartnerShareConsent")).toBeGreaterThan(page.indexOf("<CrawlConsent"));
  });
});
