import { describe, expect, it } from "vitest";
import {
  assertNoticeBodySafe,
  generateNoticeDraft,
  renderNoticeTemplate,
  verifyNoticePayload,
} from "@/lib/notice-generator";
import { routeNotice } from "@/lib/notice-router";
import { platformDirectory } from "@/lib/platforms";

describe("notice safety", () => {
  it("marks generated notice text as pending legal review", () => {
    const draft = generateNoticeDraft({
      referenceNumber: "ASMITA-2026-00001",
      platformName: "Demo",
      domain: "example.com",
      submittedAt: new Date().toISOString(),
    });
    expect(draft.reviewedByLegal).toBe(false);
    expect(verifyNoticePayload(draft.body, draft.payloadHash)).toBe(true);
  });

  it("routes unverified contacts to form handoff", () => {
    expect(routeNotice(platformDirectory[0])).toMatchObject({
      tier: 3,
      method: "FORM_HANDOFF",
    });
  });

  it("renders notice templates and rejects missing required variables", () => {
    expect(
      renderNoticeTemplate("Case {{caseReference}} for {{platformName}}", {
        caseReference: "ASMITA-2026-00001",
        platformName: "Demo",
      }),
    ).toBe("Case ASMITA-2026-00001 for Demo");

    expect(() => renderNoticeTemplate("Case {{caseReference}}", {})).toThrow(
      "missing_notice_variables:caseReference",
    );
  });

  it("blocks forbidden victim PII variables and notice body text", () => {
    expect(() => renderNoticeTemplate("Phone {{phone}}", { phone: "9999999999" })).toThrow(
      "forbidden_notice_variable:phone",
    );
    expect(() => assertNoticeBodySafe("Aadhaar: 1234")).toThrow("forbidden_pii_in_notice_body");
  });
});
