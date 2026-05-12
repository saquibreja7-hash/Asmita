import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/url-parser-fixtures.json";
import { parseSubmittedUrl } from "@/lib/url-parser";

describe("parseSubmittedUrl", () => {
  it("parses and rejects URL fixtures without fetching content", () => {
    for (const [rawUrl, ok, expected] of fixtures as Array<[string, boolean, string]>) {
      const result = parseSubmittedUrl(rawUrl);
      expect(result.ok).toBe(ok);
      if (result.ok) {
        expect(result.domain).toBe(expected);
      } else {
        expect(result.error).toBe(expected);
      }
    }
  });
});
