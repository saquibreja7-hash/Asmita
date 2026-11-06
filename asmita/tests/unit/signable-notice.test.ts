import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: { submittedUrl: { findMany: vi.fn() }, noticeTemplate: { findFirst: vi.fn() } } }));
import { db } from "@/lib/db";
import { findSignableNotice } from "@/lib/signable-notice";

describe("finding an actionable notice", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not offer a notice when no eligible URL exists", async () => {
    vi.mocked(db.submittedUrl.findMany).mockResolvedValue([] as never);
    expect(await findSignableNotice("case-1", false)).toBeNull();
    expect(db.submittedUrl.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ platform: expect.objectContaining({ lastContactVerifiedByHuman: true }) }) }));
  });
  it("requires a valid grievance email and a reviewed usable template", async () => {
    const url = { id: "url-1", platform: { id: "youtube", name: "YouTube", noticeBasis: "IT_RULES_2021", grievanceEmail: "support@example.invalid" } };
    vi.mocked(db.submittedUrl.findMany).mockResolvedValue([url] as never);
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue(null);
    expect(await findSignableNotice("case-1", false)).toBeNull();
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue({ bodyTemplate: "Secure Content Locator: {{url}}" } as never);
    expect(await findSignableNotice("case-1", false)).toBeNull();
    vi.mocked(db.noticeTemplate.findFirst).mockResolvedValue({ bodyTemplate: "Reported URL: {{url}}" } as never);
    expect(await findSignableNotice("case-1", false)).toEqual(url);
  });
});
