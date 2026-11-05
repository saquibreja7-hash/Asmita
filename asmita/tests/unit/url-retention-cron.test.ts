import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/url-retention", () => ({ purgeExpiredUrls: vi.fn() }));
vi.mock("@/lib/alerts", () => ({ sendOnCallAlertFireAndForget: vi.fn() }));
import { purgeExpiredUrls } from "@/lib/url-retention";
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
    const response = await GET(request("Bearer test-secret"));
    expect(await response.json()).toEqual({ expiredUrlsPurged: 2 });
  });
  it("alerts and reports a failure without exposing the database error", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(purgeExpiredUrls).mockRejectedValue(new Error("database failure"));
    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "url_cleanup_failed" });
    expect(sendOnCallAlertFireAndForget).toHaveBeenCalled();
  });
});
