import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

// The no-restricted-syntax rule in eslint.config.mjs must catch a fetch of
// any submitted or discovered address, including the crawler's names. The
// fixture is linted as if it lived in src/ (tests/lint is ignored on purpose).
describe("ESLint: no fetch of URL-derived variables", () => {
  it("reports every fetch in the fixture, including pageUrl, imageUrl, findingUrl and finding.pageUrl", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const text = readFileSync(join(process.cwd(), "tests/lint/no-url-fetch.test.ts"), "utf8");
    const [result] = await eslint.lintText(text, { filePath: join(process.cwd(), "src/lib/__lint_fixture__.ts") });
    const hits = result.messages.filter((m) => m.ruleId === "no-restricted-syntax" && /string tokens only/.test(m.message));
    expect(hits.map((m) => m.line)).toEqual([10, 11, 12, 13, 14, 15]);
  }, 60_000);

  it("never shortens the list of names it protects", () => {
    const config = readFileSync(join(process.cwd(), "eslint.config.mjs"), "utf8");
    for (const name of ["url", "submittedUrl", "contentUrl", "urlString", "pageUrl", "imageUrl", "findingUrl"]) {
      expect(config).toMatch(new RegExp(`[(|]${name}[|)]`));
    }
  });
});
