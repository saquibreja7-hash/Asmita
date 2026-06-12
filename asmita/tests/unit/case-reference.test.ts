import { describe, expect, it } from "vitest";
import { generateCaseReference } from "@/lib/case-reference";

describe("generateCaseReference", () => {
  it("matches ASMITA-YYYY-XXXXXX with unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const ref = generateCaseReference(new Date("2026-06-13"));
      expect(ref).toMatch(/^ASMITA-2026-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    }
  });

  it("never contains ambiguous characters (0, O, 1, I, L, U)", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCaseReference().split("-")[2];
      expect(code).not.toMatch(/[01OILU]/);
    }
  });

  it("is non-sequential (two consecutive references differ)", () => {
    expect(generateCaseReference()).not.toBe(generateCaseReference());
  });
});
