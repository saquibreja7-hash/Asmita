import { describe, expect, it } from "vitest";
import { calculateCaseMilestone } from "@/lib/milestones";
import type { CaseRecord } from "@/lib/store";

function caseRecord(status: CaseRecord["status"]): CaseRecord {
  return {
    id: crypto.randomUUID(),
    referenceNumber: "ASMITA-2026-00001",
    userId: "user-1",
    createdAt: "2026-05-12T00:00:00.000Z",
    status,
    urls: [],
  };
}

describe("calculateCaseMilestone", () => {
  it("tracks progress toward the 100-case milestone", () => {
    const stats = calculateCaseMilestone([caseRecord("OPEN"), caseRecord("RESOLVED")]);

    expect(stats).toMatchObject({
      target: 100,
      totalCases: 2,
      resolvedCases: 1,
      openCases: 1,
      remaining: 98,
      progressPercent: 2,
    });
  });
});
