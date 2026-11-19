/**
 * The frontier report contract, crawler side (crawler v3 WP11): the client
 * validates every report locally with the server's rules before sending
 * (a malformed report is our bug and must never leave the process), so the
 * new optional link fields — the pagination flag and the sitemap <lastmod>
 * as a strict ISO date — must pass `ReportedPageSchema`, and anything the
 * app's strict Zod would refuse must fail here too. The app-side mirror of
 * this test is in asmita/tests/unit/crawl-frontier.test.ts ("accepts the
 * crawler's WP11 link fields"); together they are the WP11 contract.
 */
import { describe, expect, it } from "vitest";
import { FrontierReportRequestSchema, ReportedPageSchema } from "../../src/asmita/client.ts";

const SOURCE_ID = "src-contract";
const RUN_ID = "run-11";

const report = (links: unknown[]) => ({
  sourceId: SOURCE_ID,
  runId: RUN_ID,
  pages: [{ id: "page-1", status: "fetched", links }],
});

describe("frontier report contract (WP11)", () => {
  it("accepts the pagination flag and the strict-ISO lastmod on a link", () => {
    const body = report([
      { url: "https://k.example/list?page=2", kind: "page", pagination: true },
      { url: "https://k.example/changed", kind: "page", lastmod: "2026-11-19T12:00:00.000Z" },
      { url: "https://k.example/sitemap-child.xml", kind: "sitemap", lastmod: "2026-11-19T12:00:00+05:30" },
      { url: "https://k.example/plain", kind: "page" },
    ]);
    expect(FrontierReportRequestSchema.safeParse(body).success).toBe(true);
    expect(ReportedPageSchema.safeParse(body.pages[0]).success).toBe(true);
  });

  it("keeps the fields optional: a report without them is exactly what WP10 sent", () => {
    const body = report([{ url: "https://k.example/plain", kind: "page" }]);
    const parsed = FrontierReportRequestSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("pagination" in parsed.data.pages[0]!.links[0]!).toBe(false);
      expect("lastmod" in parsed.data.pages[0]!.links[0]!).toBe(false);
    }
  });

  it("refuses what the app's strict schema refuses", () => {
    for (const links of [
      [{ url: "https://k.example/x", kind: "page", pagination: "yes" }], // not a boolean
      [{ url: "https://k.example/x", kind: "page", lastmod: "17 Nov 2026" }], // not ISO
      [{ url: "https://k.example/x", kind: "page", lastmod: "2026-11-19T10:00:00" }], // no offset or Z
      [{ url: "https://k.example/x", kind: "page", lastmod: null }], // null is not a date
      [{ url: "https://k.example/x", kind: "page", priority: 10 }], // the priority is the app's, never sent
      [{ url: "https://k.example/x", kind: "page", urgent: true }], // unknown field
    ]) {
      expect(FrontierReportRequestSchema.safeParse(report(links)).success, JSON.stringify(links)).toBe(false);
      expect(ReportedPageSchema.safeParse(report(links).pages[0]).success).toBe(false);
    }
  });
});
