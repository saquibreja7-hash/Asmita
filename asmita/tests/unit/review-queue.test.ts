import { afterEach, describe, expect, it } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase, cases, createCase, reviewSubmittedUrl } from "@/lib/store";

describe("reviewSubmittedUrl", () => {
  afterEach(() => {
    cases.clear();
    inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  });

  it("approves a flagged URL and queues it for notice dispatch", async () => {
    const record = await createCase("user-1");
    const [result] = await addUrlsToCase(record.id, ["https://instagram.com/p/abc"], {
      flagReasons: ["many_unrelated_domains"],
    });
    if (!result.ok) throw new Error("expected accepted URL");

    const reviewed = await reviewSubmittedUrl({
      caseId: record.id,
      urlId: result.url.id,
      decision: "approve",
      reviewerId: "admin-1",
    });

    expect(reviewed.status).toBe("NOTICE_QUEUED");
    expect(reviewed.flaggedForReview).toBe(false);
    expect(inMemoryAuditLog.some((event) => event.eventType === "URL_APPROVED")).toBe(true);
  });

  it("rejects a flagged URL and prevents dispatch", async () => {
    const record = await createCase("user-1");
    const [result] = await addUrlsToCase(record.id, ["https://instagram.com/p/abc"], {
      flagReasons: ["known_public_or_news_domain"],
    });
    if (!result.ok) throw new Error("expected accepted URL");

    const reviewed = await reviewSubmittedUrl({
      caseId: record.id,
      urlId: result.url.id,
      decision: "reject",
      reviewerId: "admin-1",
      reason: "not_ncii",
    });

    expect(reviewed.status).toBe("REJECTED");
    expect(reviewed.flagReason).toBe("not_ncii");
    expect(inMemoryAuditLog.some((event) => event.eventType === "URL_REJECTED")).toBe(true);
  });
});
