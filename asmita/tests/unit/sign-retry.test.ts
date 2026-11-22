import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signAnswer } from "@/lib/sign-retry";

// WP131: a sign retry can be answered 409 already_signed — the earlier
// attempt landed and only its HTTP answer was lost (the dropped-exchange
// class behind the full-suite e2e stalls of WP101 and this WP). For the
// signing screens that answer means the document IS signed, and the journey
// must continue; the pure decision is tested here, the wiring of the three
// handlers (the review screen's notice and advisory, the case sign page's
// notice and advisory) is pinned on the source it lives in, and the real
// browser recovery is proven by the new journey in
// tests/e2e/notice-integrity.spec.ts.

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("signAnswer (WP131)", () => {
  it("counts a refused sign as signed when the earlier attempt landed", () => {
    // A 409 already_signed is the successful sign of a moment ago whose
    // response never arrived, not a refusal to recover from.
    expect(signAnswer(false, "already_signed")).toEqual({ kind: "signed" });
  });

  it("treats an ok answer as signed", () => {
    expect(signAnswer(true, undefined)).toEqual({ kind: "signed" });
    // A 200 body is never inspected; ok wins whatever the body carries.
    expect(signAnswer(true, "already_signed")).toEqual({ kind: "signed" });
  });

  it("passes every other refusal through as an error with its code", () => {
    expect(signAnswer(false, "notice_changed_since_preview")).toEqual({ kind: "error", code: "notice_changed_since_preview" });
    expect(signAnswer(false, "name_script_unsupported")).toEqual({ kind: "error", code: "name_script_unsupported" });
    expect(signAnswer(false, "notice_pdf_failed")).toEqual({ kind: "error", code: "notice_pdf_failed" });
    expect(signAnswer(false, "url_not_ready")).toEqual({ kind: "error", code: "url_not_ready" });
  });

  it("names a body-less refusal unknown, so the screens fall back to their generic message", () => {
    expect(signAnswer(false, undefined)).toEqual({ kind: "error", code: "unknown" });
    expect(signAnswer(false, "")).toEqual({ kind: "error", code: "unknown" });
  });
});

describe("the signing screens recover a lost sign answer (WP131)", () => {
  it("the review screen decides both its sign requests through signAnswer", () => {
    const src = source("src/app/(victim)/review-sign/ReviewSignForm.tsx");
    expect(src).toContain('import { signAnswer } from "@/lib/sign-retry";');
    // The notice and the advisory handler each decide through signAnswer…
    expect(src.match(/signAnswer\(false, data\.error\)/g)).toHaveLength(2);
    // …and only a real refusal reaches the error path, so a retry answered
    // already_signed falls through to the next-notice advance instead of
    // erroring.
    expect(src.match(/answer\.kind === "error"/g)).toHaveLength(2);
    expect(src).not.toContain('"review.sign.error.alreadySigned"');
  });

  it("the case sign page decides its sign request through signAnswer", () => {
    const src = source("src/app/(victim)/case/[caseId]/sign/SignNoticeForm.tsx");
    expect(src).toContain('import { signAnswer } from "@/lib/sign-retry";');
    expect(src).toContain("signAnswer(false, data.error)");
    expect(src).toContain('answer.kind === "error"');
    expect(src).not.toContain('"sign.error.alreadySigned"');
    // The recovery continues to the confirmation like a successful sign:
    // the acknowledge call and the push must sit outside the error branch.
    expect(src).toContain("await csrfFetch(`/api/cases/${caseId}/acknowledge`");
    expect(src).toContain("router.push(confirmationUrl)");
  });

  it("the crawl-consent tick keeps its own existing recovery for the same refusal", () => {
    // The tick box was already correct (WP34): an alreadySigned outcome
    // reloads the consent state and refreshes, never showing a dead end.
    const src = source("src/app/(victim)/case/[caseId]/CrawlConsent.tsx");
    expect(src).toContain('result.outcome === "alreadySigned"');
    expect(src.match(/router\.refresh\(\)/g)?.length).toBeGreaterThan(0);
  });
});
