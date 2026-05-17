import { describe, expect, it } from "vitest";
import { NoticeBasis, PlatformTier } from "@prisma/client";
import {
  nullOrTrim,
  parseCsv,
  parseDomainPatterns,
  parseNoticeBasis,
  parseTier,
  splitCsvLine,
} from "../../scripts/import-platforms-csv";

describe("import-platforms-csv helpers", () => {
  describe("splitCsvLine", () => {
    it("splits a simple line", () => {
      expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
    });

    it("respects quoted commas", () => {
      expect(splitCsvLine('"a,b",c,"d,e,f"')).toEqual(["a,b", "c", "d,e,f"]);
    });

    it("preserves empty cells", () => {
      expect(splitCsvLine("a,,c,")).toEqual(["a", "", "c", ""]);
    });
  });

  describe("parseCsv", () => {
    it("returns an empty array for blank input", () => {
      expect(parseCsv("")).toEqual([]);
      expect(parseCsv("\n\n  \n")).toEqual([]);
    });

    it("maps header columns to row keys", () => {
      const csv = ["name,tier", "Meta,TIER_1", "Telegram,TIER_3"].join("\n");
      const rows = parseCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ name: "Meta", tier: "TIER_1" });
      expect(rows[1]).toMatchObject({ name: "Telegram", tier: "TIER_3" });
    });

    it("handles quoted domain bundles in cells", () => {
      const csv = [
        "name,domain_patterns,tier",
        'Meta,"facebook.com;instagram.com",TIER_1',
      ].join("\n");
      const rows = parseCsv(csv);
      expect(rows[0].domain_patterns).toBe("facebook.com;instagram.com");
    });
  });

  describe("nullOrTrim", () => {
    it("returns null for empty or whitespace-only values", () => {
      expect(nullOrTrim("")).toBeNull();
      expect(nullOrTrim("   ")).toBeNull();
      expect(nullOrTrim(undefined)).toBeNull();
    });

    it("returns null for the human-verify placeholder marker", () => {
      expect(nullOrTrim("<TO_BE_VERIFIED_BY_HUMAN>")).toBeNull();
    });

    it("trims real values", () => {
      expect(nullOrTrim("  go@platform.com  ")).toBe("go@platform.com");
    });
  });

  describe("parseTier", () => {
    it("accepts each PlatformTier", () => {
      expect(parseTier("TIER_1")).toBe(PlatformTier.TIER_1);
      expect(parseTier(" tier_2 ")).toBe(PlatformTier.TIER_2);
      expect(parseTier("Tier_3")).toBe(PlatformTier.TIER_3);
    });

    it("throws on invalid tier strings", () => {
      expect(() => parseTier("TIER_99")).toThrow(/invalid_tier/);
      expect(() => parseTier("")).toThrow(/invalid_tier/);
    });
  });

  describe("parseNoticeBasis", () => {
    it("accepts each NoticeBasis", () => {
      expect(parseNoticeBasis("IT_RULES_2021")).toBe(NoticeBasis.IT_RULES_2021);
      expect(parseNoticeBasis("dmca")).toBe(NoticeBasis.DMCA);
      expect(parseNoticeBasis("form-only")).toBe(NoticeBasis.FORM_ONLY);
    });

    it("throws on invalid basis", () => {
      expect(() => parseNoticeBasis("HANDWAVE")).toThrow(/invalid_notice_basis/);
    });
  });

  describe("parseDomainPatterns", () => {
    it("splits on semicolons, commas, and pipes", () => {
      expect(parseDomainPatterns("a.com;b.com")).toEqual(["a.com", "b.com"]);
      expect(parseDomainPatterns("a.com,b.com,c.com")).toEqual(["a.com", "b.com", "c.com"]);
      expect(parseDomainPatterns("a.com | b.com")).toEqual(["a.com", "b.com"]);
    });

    it("drops empty segments", () => {
      expect(parseDomainPatterns(";a.com;;;b.com;")).toEqual(["a.com", "b.com"]);
    });
  });
});
