import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: vi.fn(() => true) }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: vi.fn(async () => ({
  ok: true, session: { sub: "synthetic-user" },
})) }));
vi.mock("@/lib/dev-flags", () => ({ devFlagEnabled: vi.fn(() => false) }));
vi.mock("@/lib/db", () => ({ db: {
  submittedUrl: { findFirst: vi.fn(), update: vi.fn() },
  noticeTemplate: { findFirst: vi.fn() },
  case: { updateMany: vi.fn() },
} }));
vi.mock("@/lib/encryption", () => ({
  decryptField: vi.fn((value: string) => value.replace("enc:", "")),
  encryptField: vi.fn((value: string) => `enc:${value}`),
}));
vi.mock("@/lib/notice-generator", () => ({ renderNoticeTemplate: vi.fn(() => "Synthetic notice") }));
vi.mock("@/lib/case-hash-annex", () => ({ buildCaseHashAnnex: vi.fn(async () => "") }));
vi.mock("@/lib/notice-pdf", () => ({ generateNoticePdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

import { db } from "@/lib/db";
import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";

const firstSigned = {
  id: "url-1", status: "NOTICE_QUEUED", urlEncrypted: "enc:https://example.invalid/one",
  signedNoticePdf: "enc:existing-pdf", case: { referenceNumber: "ASMITA-TEST", declarationSignedAt: new Date() },
  platform: { id: "platform-1", name: "Synthetic platform", noticeBasis: "IT_RULES_2021",
    isActive: true, lastContactVerifiedByHuman: true },
};
const nextUnsigned = {
  ...firstSigned, id: "url-2", urlEncrypted: "enc:https://example.invalid/two", signedNoticePdf: null,
};

describe("signing a case with multiple URLs", () => {
  beforeEach(() => {
    vi.mocked(db.submittedUrl.findFirst).mockReset();
    vi.mocked(db.submittedUrl.update).mockReset();
    vi.mocked(db.case.updateMany).mockReset();
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue({
      subjectTemplate: "Synthetic subject", bodyTemplate: "Synthetic body",
    } as never);
    vi.mocked(db.submittedUrl.findFirst).mockImplementation((async (
      query: { where?: { signedNoticePdf?: unknown } } | undefined,
    ) => query?.where?.signedNoticePdf === null ? nextUnsigned : firstSigned) as never);
  });

  it("signs the next unsigned URL after another URL was already signed", async () => {
    const response = await signNotice(new Request("https://asmita.test/api/cases/case-1/sign-notice", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Synthetic person", contact: "person@example.invalid",
        signature: "Synthetic person" }),
    }), { params: Promise.resolve({ caseId: "case-1" }) });

    expect(response.status).toBe(200);
    expect(db.submittedUrl.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ signedNoticePdf: null }),
    }));
    expect(db.submittedUrl.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "url-2" },
    }));
    expect(db.case.updateMany).toHaveBeenCalled();
  });
});
