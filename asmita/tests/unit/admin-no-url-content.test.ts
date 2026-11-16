import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adminFiles = [
  "src/app/(admin)/cases/page.tsx",
  "src/app/(admin)/cases/[reference]/page.tsx",
  "src/app/(admin)/cases/[reference]/SendNoticeButton.tsx",
  "src/app/(admin)/flagged/page.tsx",
  "src/app/(admin)/platforms/page.tsx",
  "src/app/(admin)/templates/page.tsx",
  "src/app/(admin)/response-rates/page.tsx",
  "src/app/(admin)/audit/page.tsx",
  "src/lib/admin-dashboard.ts",
];

// The crawler's admin pages. Some of them show a revealed page or image
// address, or a notice preview that contains them, so they cannot avoid the
// words: what they must never do is fetch anything directly, read an
// encrypted column, or turn an address into a link, image, frame or source.
const crawlerAdminFiles = [
  "src/app/(admin)/findings/page.tsx",
  "src/app/(admin)/findings/[id]/page.tsx",
  "src/app/(admin)/findings/AddressDisplay.tsx",
  "src/app/(admin)/findings/RevealAddress.tsx",
  "src/app/(admin)/findings/ReviewControls.tsx",
  "src/app/(admin)/findings/NoticeStep.tsx",
  "src/app/(admin)/findings/CrawlerOffBanner.tsx",
  "src/app/(admin)/findings/SafetyNote.tsx",
  "src/app/(admin)/findings/finding-view.ts",
  "src/app/(admin)/findings/findings-client.ts",
  "src/app/(admin)/crawl-sources/page.tsx",
  "src/app/(admin)/crawl-sources/SourcesManager.tsx",
  "src/app/(admin)/crawl-sources/source-validation.ts",
];

// Links on these pages may only go to the console itself.
const INTERNAL_HREF = /href=(?:"\/admin[^"]*"|\{`\/admin\/[^`]*`\}|\{href\()/;

describe("admin URL content boundaries", () => {
  it("does not render or fetch submitted URL content in admin views", () => {
    for (const file of adminFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/\b(urlEncrypted|rawUrl|contentUrl|submittedUrl|fetch\s*\()/);
    }
  });

  it("crawler admin pages never fetch, read encrypted addresses, or link, embed or load an address", () => {
    for (const file of crawlerAdminFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/\b(urlEncrypted|pageUrlEncrypted|imageUrlEncrypted|rawUrl|contentUrl|fetch\s*\()/);
      // Lower-case HTML tags only: <Link> is the console's own navigation.
      expect(source, file).not.toMatch(/<(img|iframe|embed|object|video|audio|source|link|script)[\s>]/);
      expect(source, file).not.toMatch(/<(Image|Script)[\s>]/);
      expect(source, file).not.toMatch(/\b(src|srcSet|poster|formAction|action)=\{/);
      for (const match of source.matchAll(/href=[^\s>]+/g)) {
        expect(match[0], `${file}: ${match[0]}`).toMatch(INTERNAL_HREF);
      }
      // The only programmatic link is the PDF download, built from bytes the
      // preview already returned (a blob: URL), never from an address.
      for (const match of source.matchAll(/\.href\s*=\s*([^;]+);/g)) {
        expect(match[1].trim(), file).toBe("objectUrl");
        expect(source, file).toMatch(/const objectUrl = URL\.createObjectURL\(blob\)/);
      }
    }
  });
});
