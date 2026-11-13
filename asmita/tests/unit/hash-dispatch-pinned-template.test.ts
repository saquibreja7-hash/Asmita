import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The hash advisory email is rendered from the template the survivor signed.

const mocks = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  caseUpdateMany: vi.fn(),
  templateFindFirst: vi.fn(),
  templateFindUnique: vi.fn(),
  platformFindUnique: vi.fn(),
  hashDispatchFindUnique: vi.fn(),
  hashDispatchCount: vi.fn(),
  sendNoticeDraft: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    case: { findUnique: mocks.caseFindUnique, updateMany: mocks.caseUpdateMany },
    noticeTemplate: { findFirst: mocks.templateFindFirst, findUnique: mocks.templateFindUnique },
    platform: { findUnique: mocks.platformFindUnique },
    hashDispatch: { findUnique: mocks.hashDispatchFindUnique, count: mocks.hashDispatchCount, createMany: vi.fn() },
    hashSubmission: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/encryption", () => ({ decryptField: () => Buffer.from("pdf").toString("base64") }));
vi.mock("@/lib/email", () => ({ sendNoticeDraft: mocks.sendNoticeDraft }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/notice-dispatch", () => ({ assertVerifiedNoticeRecipient: vi.fn() }));
vi.mock("@/lib/case-hash-annex", () => ({
  buildSignedHashAnnex: async () => ({ ok: true, annex: { text: "Fingerprint annex", hashSubmissionIds: ["hash-1"] } }),
  voidSignaturesWithRejectedFingerprints: vi.fn(),
}));

import { dispatchHashAdvisories } from "@/lib/hash-dispatch";
import { templateDigest } from "@/lib/signed-template";

const signedTemplate = {
  id: "advisory-v1",
  platformId: null,
  templateType: "HASH_ADVISORY",
  subjectTemplate: "Advisory {{caseReference}}",
  bodyTemplate: "Signed advisory v1 for {{platformName}}",
  reviewedByLegal: true,
  isActive: true,
  version: 1,
};
const newerTemplate = { ...signedTemplate, id: "advisory-v2", version: 2, bodyTemplate: "Newer advisory v2" };

const signedCase = {
  id: "case-1",
  referenceNumber: "ASMITA-2026-00001",
  signedHashAdvisoryPdf: "encrypted-advisory",
  hashAdvisorySignedHashIds: ["hash-1"],
  hashAdvisorySignedTemplateId: "advisory-v1",
  hashAdvisorySignedTemplateDigest: templateDigest(signedTemplate),
};

describe("dispatchHashAdvisories with a pinned template", () => {
  beforeEach(() => {
    mocks.caseFindUnique.mockReset().mockResolvedValue(signedCase);
    mocks.caseUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.templateFindFirst.mockReset().mockResolvedValue(newerTemplate);
    mocks.templateFindUnique.mockReset().mockResolvedValue(signedTemplate);
    mocks.platformFindUnique.mockReset().mockResolvedValue({
      id: "platform-1",
      name: "Example Platform",
      isActive: true,
      lastContactVerifiedByHuman: true,
      grievanceEmail: "go@example.com",
      formUrl: null,
    });
    mocks.hashDispatchFindUnique.mockReset().mockResolvedValue(null);
    mocks.hashDispatchCount.mockReset().mockResolvedValue(0);
    mocks.sendNoticeDraft.mockReset().mockResolvedValue({ id: "msg-1" });
  });
  afterEach(() => vi.clearAllMocks());

  it("emails the signed template's text even when a newer version is active", async () => {
    const results = await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });
    expect(results[0]).toMatchObject({ dispatched: true });
    const body = mocks.sendNoticeDraft.mock.calls[0][2] as string;
    expect(body).toContain("Signed advisory v1");
    expect(body).not.toContain("Newer advisory v2");
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
  });

  it("refuses without voiding when the signed template is no longer legally reviewed", async () => {
    mocks.templateFindUnique.mockResolvedValue({ ...signedTemplate, reviewedByLegal: false });
    await expect(dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] })).rejects.toThrow(
      "signed_template_not_dispatchable",
    );
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses and voids the unsent advisory when the signed text changed", async () => {
    mocks.templateFindUnique.mockResolvedValue({ ...signedTemplate, bodyTemplate: "Edited advisory" });
    await expect(dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] })).rejects.toThrow(
      "signed_template_changed",
    );
    expect(mocks.sendNoticeDraft).not.toHaveBeenCalled();
    expect(mocks.caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-1", signedHashAdvisoryPdf: "encrypted-advisory" },
        data: expect.objectContaining({ signedHashAdvisoryPdf: null, hashAdvisorySignedTemplateId: null }),
      }),
    );
  });

  it("keeps an advisory already sent to a platform as the record, refusing the rest", async () => {
    mocks.templateFindUnique.mockResolvedValue({ ...signedTemplate, bodyTemplate: "Edited advisory" });
    mocks.hashDispatchCount.mockResolvedValue(1);
    await expect(dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] })).rejects.toThrow(
      "signed_template_changed",
    );
    expect(mocks.caseUpdateMany).not.toHaveBeenCalled();
  });

  it("keeps today's selection for an advisory signed before templates were pinned", async () => {
    mocks.caseFindUnique.mockResolvedValue({ ...signedCase, hashAdvisorySignedTemplateId: null, hashAdvisorySignedTemplateDigest: null });
    await dispatchHashAdvisories({ caseId: "case-1", platformIds: ["platform-1"] });
    expect(mocks.templateFindUnique).not.toHaveBeenCalled();
    expect(mocks.sendNoticeDraft.mock.calls[0][2]).toContain("Newer advisory v2");
  });
});
