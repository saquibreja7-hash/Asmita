import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/store";
import { ADDED_AFTER_MS, countUnseen, listAddedLinks, parseSeenCookie } from "@/lib/admin-new-links";

// Memory backend (no DATABASE_URL).
describe("admin New links", () => {
  afterEach(() => vi.useRealTimers());

  it("lists links added after filing, not those filed with the case or found by the crawler", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T08:00:00.000Z") });
    const record = await store.createCase("new-links-user");
    await store.addUrlsToCase(record.id, ["https://example.invalid/post/filed-with-case"]);
    vi.setSystemTime(new Date(Date.now() + ADDED_AFTER_MS + 60_000));
    await store.addUrlsToCase(record.id, ["https://example.invalid/post/added-later"]);
    // A crawler link on the same case is the Findings page's business.
    record.urls.push({ id: "crawler-url", domain: "example.invalid", platformName: "x", status: "NOTICE_QUEUED", urlHash: "h", platformId: null, source: "CRAWLER", submittedAt: new Date().toISOString() });

    const rows = (await listAddedLinks()).filter((row) => row.caseId === record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ referenceNumber: record.referenceNumber, domain: "example.invalid" });
    // Never the link itself.
    expect(JSON.stringify(rows)).not.toContain("added-later");
  });

  it("counts only links added after the admin last looked", () => {
    const at = (iso: string) => ({ urlId: iso, caseId: "c", referenceNumber: "R", platformName: "P", domain: "d", status: "PENDING_REVIEW", addedAt: new Date(iso) });
    const rows = [at("2026-11-18T10:00:00.000Z"), at("2026-11-17T10:00:00.000Z")];
    expect(countUnseen(rows, null)).toBe(2);
    expect(countUnseen(rows, new Date("2026-11-18T00:00:00.000Z"))).toBe(1);
    expect(countUnseen(rows, new Date("2026-11-19T00:00:00.000Z"))).toBe(0);
  });

  it("treats a missing or malformed seen marker as never seen", () => {
    expect(parseSeenCookie(undefined)).toBeNull();
    expect(parseSeenCookie("not-a-date")).toBeNull();
    expect(parseSeenCookie("2026-11-18T00:00:00.000Z")?.toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });
});
