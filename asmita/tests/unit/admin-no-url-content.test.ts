import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adminFiles = [
  "src/app/(admin)/cases/page.tsx",
  "src/app/(admin)/flagged/page.tsx",
  "src/app/(admin)/platforms/page.tsx",
  "src/app/(admin)/templates/page.tsx",
  "src/app/(admin)/response-rates/page.tsx",
  "src/app/(admin)/audit/page.tsx",
  "src/lib/admin-dashboard.ts",
];

describe("admin URL content boundaries", () => {
  it("does not render or fetch submitted URL content in admin views", () => {
    for (const file of adminFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/\b(urlEncrypted|rawUrl|contentUrl|submittedUrl|fetch\s*\()/);
    }
  });
});
