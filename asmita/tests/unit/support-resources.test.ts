import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("support resources page", () => {
  it("includes verified helplines and the NALSA directory", () => {
    const page = readFileSync(path.join(process.cwd(), "src", "app", "(public)", "resources", "page.tsx"), "utf8");

    expect(page).toContain("112");
    expect(page).toContain("1098");
    expect(page).toContain("9152987821");
    expect(page).toContain("https://nalsa.gov.in/directory/");
    expect(page).toContain("Last verified against public source pages: 12 May 2026.");
  });
});
