import { describe, expect, it } from "vitest";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
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

  it("renders Devanagari variables correctly", () => {
    expect(
      renderNoticeTemplate("नमस्ते {{name}}", { name: "अस्मिता" }),
    ).toBe("नमस्ते अस्मिता");
  });

  it("rejects variable values containing control characters", () => {
    expect(() =>
      renderNoticeTemplate("Hi {{name}}", { name: "evil\x00user" }),
    ).toThrow("notice_variable_control_chars:name");
  });

  it("rejects variable values longer than 2000 characters", () => {
    expect(() =>
      renderNoticeTemplate("Hi {{name}}", { name: "a".repeat(2001) }),
    ).toThrow("notice_variable_too_long:name");
  });

  it("rejects templates longer than 20000 characters", () => {
    expect(() =>
      renderNoticeTemplate("a".repeat(20001), {}),
    ).toThrow("notice_template_too_long");
  });

  it("rejects subjects with newline (CRLF injection)", () => {
    expect(() => assertNoticeSubjectSafe("OK\nBCC: attacker@evil")).toThrow(
      "notice_subject_control_chars",
    );
    expect(() => assertNoticeSubjectSafe("OK\rBCC: attacker@evil")).toThrow(
      "notice_subject_control_chars",
    );
  });

  it("rejects empty and excessively long subjects", () => {
    expect(() => assertNoticeSubjectSafe("")).toThrow("notice_subject_length");
    expect(() => assertNoticeSubjectSafe("x".repeat(999))).toThrow(
      "notice_subject_length",
    );
  });

  it("accepts a normal subject line", () => {
    expect(() =>
      assertNoticeSubjectSafe("Asmita case ASMITA-2026-00001"),
    ).not.toThrow();
  });

  it("rejects body text containing NUL bytes", () => {
    expect(() => assertNoticeBodySafe("clean text\x00sneaky")).toThrow(
      "forbidden_control_chars_in_notice_body",
    );
  });
});
