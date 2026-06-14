import { afterEach, describe, expect, it, vi } from "vitest";
import { getInternalAnalytics } from "@/lib/admin-dashboard";
import type { DisplayCase } from "@/lib/case-ops";

vi.mock("@/lib/case-ops", () => ({
  listAllCases: vi.fn(),
}));

import * as caseOps from "@/lib/case-ops";

const mockCases: DisplayCase[] = [
  {
    id: "demo-case",
    referenceNumber: `ASMITA-${new Date().getFullYear()}-00001`,
    userId: "demo-user",
    createdAt: new Date().toISOString(),
    status: "OPEN",
    urls: [
      {
        id: "demo-url-1",
        domain: "instagram.com",
        platformName: "Instagram / Meta",
        status: "NOTICE_QUEUED",
        urlHash: "abc123",
        platformId: null,
        flaggedForReview: false,
        flagReason: null,
      },
      {
        id: "demo-url-2",
        domain: "pornhub.com",
        platformName: "Pornhub",
        status: "PENDING_REVIEW",
        urlHash: "def456",
        platformId: null,
        flaggedForReview: true,
        flagReason: "needs_review",
      },
    ],
  },
];

describe("getInternalAnalytics", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregate operational analytics without URL strings or PII", async () => {
    vi.mocked(caseOps.listAllCases).mockResolvedValue(mockCases);

    const analytics = await getInternalAnalytics();

    expect(analytics.totalCases).toBe(1);
    expect(analytics.urlRecordCount).toBe(2);
    expect(analytics.urlStatusCounts).toEqual(
      expect.arrayContaining([
        { status: "NOTICE_QUEUED", count: 1 },
        { status: "PENDING_REVIEW", count: 1 },
      ]),
    );
    expect(JSON.stringify(analytics)).not.toContain("https://");
    expect(analytics.privacyNote).toContain("no submitted URL strings");
  });
});
