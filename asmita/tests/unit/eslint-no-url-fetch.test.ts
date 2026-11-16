import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

// The no-restricted-syntax rule in eslint.config.mjs must catch a fetch of
// any submitted or discovered address, including the crawler's names. The
// fixture is linted as if it lived in src/ (tests/lint is ignored on purpose).
describe("ESLint: no fetch of URL-derived variables", () => {
  it("reports every fetch in the fixture's first block exactly once, and nothing in the second", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const text = readFileSync(join(process.cwd(), "tests/lint/no-url-fetch.test.ts"), "utf8");
    const [result] = await eslint.lintText(text, { filePath: join(process.cwd(), "src/lib/__lint_fixture__.ts") });
    const hits = result.messages.filter((m) => m.ruleId === "no-restricted-syntax" && /string tokens only/.test(m.message));
    // Lines 10-25: plain names, properties, new URL(), template strings,
    // finding["pageUrl"], globalThis/window/self.fetch, .href, String(), .trim().
    // From line 26 on: our own API paths, a URL in a POST body, other fetch methods.
    expect(hits.map((m) => m.line)).toEqual(Array.from({ length: 16 }, (_, i) => 10 + i));
  }, 60_000);

  it("never shortens the list of names it protects", () => {
    const config = readFileSync(join(process.cwd(), "eslint.config.mjs"), "utf8");
    for (const name of ["url", "submittedUrl", "contentUrl", "urlString", "pageUrl", "imageUrl", "findingUrl"]) {
      expect(config).toMatch(new RegExp(`[(|]${name}[|)]`));
    }
  });
});
