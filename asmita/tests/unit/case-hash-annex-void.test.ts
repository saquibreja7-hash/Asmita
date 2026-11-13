import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: { findMany: vi.fn() },
    submittedUrl: { findMany: vi.fn(), updateMany: vi.fn() },
    case: { findUnique: vi.fn(), update: vi.fn() },
    hashDispatch: { count: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

import { db } from "@/lib/db";
import { voidSignaturesWithRejectedFingerprints } from "@/lib/case-hash-annex";

type Mock = ReturnType<typeof vi.fn>;
const mocked = db as unknown as Record<string, Record<string, Mock>>;

describe("voidSignaturesWithRejectedFingerprints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.hashSubmission.findMany.mockResolvedValue([{ id: "good" }]);
    mocked.hashDispatch.count.mockResolvedValue(0);
  });

  it("clears the template pin together with the signed PDF and fingerprint ids", async () => {
    mocked.submittedUrl.findMany.mockResolvedValue([{ id: "u1", signedHashSubmissionIds: ["rejected"] }]);
    mocked.case.findUnique.mockResolvedValue({ hashAdvisorySignedHashIds: ["rejected"] });

    await voidSignaturesWithRejectedFingerprints("c1", { trigger: "rejection" });

    expect(mocked.submittedUrl.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1"] } },
      data: { signedNoticePdf: null, signedHashSubmissionIds: [], signedTemplateId: null, signedTemplateDigest: null },
    });
    expect(mocked.case.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        signedHashAdvisoryPdf: null,
        hashAdvisorySignedHashIds: [],
        hashAdvisorySignedTemplateId: null,
        hashAdvisorySignedTemplateDigest: null,
      },
    });
  });

  it("leaves a signature that lists only usable fingerprints alone", async () => {
    mocked.submittedUrl.findMany.mockResolvedValue([{ id: "u1", signedHashSubmissionIds: ["good"] }]);
    mocked.case.findUnique.mockResolvedValue({ hashAdvisorySignedHashIds: ["good"] });

    await voidSignaturesWithRejectedFingerprints("c1", { trigger: "rejection" });

    expect(mocked.submittedUrl.updateMany).not.toHaveBeenCalled();
    expect(mocked.case.update).not.toHaveBeenCalled();
  });
});
