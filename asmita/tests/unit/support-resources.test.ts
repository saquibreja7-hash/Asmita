import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { directory, directoryLastVerified } from "@/lib/resources-content";

function findByTel(tel: string) {
  return directory.flatMap((g) => g.items).find((i) => i.tel === tel);
}

describe("support resources directory", () => {
  it("includes verified helplines and the NALSA directory", () => {
    const items = directory.flatMap((g) => g.items);
    expect(findByTel("112")).toBeDefined();
    expect(findByTel("1098")).toBeDefined();
    expect(items.some((i) => i.href === "https://nalsa.gov.in/directory/")).toBe(true);
  });

  it("attributes the iCall helpline to TISS, not another organisation", () => {
    const icall = findByTel("9152987821");
    expect(icall).toBeDefined();
    expect(icall!.name).toMatch(/iCall/i);
    expect(icall!.name).toMatch(/TISS/);
  });

  it("shows the verification date on the directory page", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src", "app", "(public)", "resources", "directory", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("Last verified against public source pages");
    expect(directoryLastVerified).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });
});
