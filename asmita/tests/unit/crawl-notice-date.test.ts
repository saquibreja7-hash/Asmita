import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { noticeDate } from "@/lib/notice-date";
import { noticeDate as crawlNoticeDate } from "@/lib/crawl-notice";

// The authorisation she signs and the representative notice that cites its
// date must print the same India date (R7).
describe("one India date for the authorisation and the notice", () => {
  it("prints the Asia/Kolkata date, also late in the UTC evening", () => {
    expect(noticeDate(new Date("2026-11-15T20:00:00Z"))).toBe("16 November 2026");
    expect(crawlNoticeDate).toBe(noticeDate);
  });

  it("the authorisation signing route uses the shared helper", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/cases/[caseId]/crawl-consent/route.ts"), "utf8");
    expect(source).toContain('from "@/lib/notice-date"');
    expect(source).not.toMatch(/toLocaleDateString\(/);
  });
});
