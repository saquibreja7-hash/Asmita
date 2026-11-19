import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/url-retention", () => ({ purgeExpiredUrls: vi.fn(), purgeExpiredCrawlFindings: vi.fn(), purgeExpiredCrawlPages: vi.fn() }));
vi.mock("@/lib/crawl-discoveries", () => ({ sweepDiscoveredCrawlSources: vi.fn() }));
vi.mock("@/lib/crawl-sources", () => ({ createReportedSourcesFromSubmittedUrls: vi.fn() }));
vi.mock("@/lib/link-verification", () => ({ sweepDueLinkVerifications: vi.fn() }));
vi.mock("@/lib/alerts", () => ({ sendOnCallAlertFireAndForget: vi.fn() }));
import { purgeExpiredCrawlFindings, purgeExpiredCrawlPages, purgeExpiredUrls } from "@/lib/url-retention";
import { sweepDiscoveredCrawlSources } from "@/lib/crawl-discoveries";
import { createReportedSourcesFromSubmittedUrls } from "@/lib/crawl-sources";
import { sweepDueLinkVerifications } from "@/lib/link-verification";
import { sendOnCallAlertFireAndForget } from "@/lib/alerts";
import { GET } from "@/app/api/cron/purge-expired-urls/route";
import type { NextRequest } from "next/server";

const request = (authorization?: string) => new Request("https://asmita.test/api/cron/purge-expired-urls", {
  headers: authorization ? { authorization } : {},
}) as NextRequest;
const originalSecret = process.env.CRON_SECRET;
afterEach(() => { process.env.CRON_SECRET = originalSecret; vi.clearAllMocks(); });

describe("URL retention cron", () => {
  it("requires the cron secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await GET(request())).status).toBe(401);
    expect(purgeExpiredUrls).not.toHaveBeenCalled();
  });
  it("runs cleanup for an authorized request", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(purgeExpiredUrls).mockResolvedValue(2);
    vi.mocked(purgeExpiredCrawlFindings).mockResolvedValue(3);
    vi.mocked(purgeExpiredCrawlPages).mockResolvedValue(5);
    vi.mocked(sweepDiscoveredCrawlSources).mockResolvedValue({ paused: 1, resumed: 0 });
    vi.mocked(createReportedSourcesFromSubmittedUrls).mockResolvedValue({ checked: 6, created: 4 });
    vi.mocked(sweepDueLinkVerifications).mockResolvedValue({ enqueued: 2, resolved: 1, stillOnline: 1 });
    const response = await GET(request("Bearer test-secret"));
    expect(await response.json()).toEqual({
      expiredUrlsPurged: 2, expiredFindingsPurged: 3, expiredCrawlPagesPurged: 5,
      discoveredSourcesPaused: 1, discoveredSourcesResumed: 0, reportedSourcesCreated: 4,
      verificationsEnqueued: 2, verificationsResolved: 1, verificationsStillOnline: 1,
    });
    expect(createReportedSourcesFromSubmittedUrls).toHaveBeenCalledTimes(1);
    expect(sweepDueLinkVerifications).toHaveBeenCalledTimes(1);
  });
  it("alerts and reports a failure without exposing the database error", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(purgeExpiredUrls).mockRejectedValue(new Error("database failure"));
    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "url_cleanup_failed" });
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalled();
  });
  it("still purges crawler findings and frontier pages when the link purge fails", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(purgeExpiredUrls).mockRejectedValue(new Error("database failure"));
    vi.mocked(purgeExpiredCrawlFindings).mockResolvedValue(1);
    vi.mocked(purgeExpiredCrawlPages).mockResolvedValue(4);
    vi.mocked(sweepDiscoveredCrawlSources).mockResolvedValue({ paused: 0, resumed: 0 });
    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(purgeExpiredCrawlFindings).toHaveBeenCalled();
    expect(purgeExpiredCrawlPages).toHaveBeenCalled();
    expect(sweepDiscoveredCrawlSources).toHaveBeenCalled();
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalled();
  });
});
