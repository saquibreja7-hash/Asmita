import { describe, expect, it } from "vitest";
import {
  assertNoticeBodySafe,
  assertNoticeSubjectSafe,
  renderNoticeTemplate,
} from "@/lib/notice-generator";
import { templateSeeds } from "../../prisma/template-seeds";

// Every notice template in prisma/template-seeds.ts must round-trip through
// the renderer + safety asserters cleanly with the variable set callers
// supply. This catches drift between the renderer's hard rules (no PII words,
// no control chars, no SMTP header injection) and the human-edited template
// bodies. It is intentionally lightweight — if you add a new template, add it
// to the seed file and this test loops over it automatically.

const sampleVariables = {
  caseReference: "ASMITA-2026-00042",
  platformName: "ExamplePlatform Inc.",
  url: "https://example.com/abc/xyz",
  declarationReference: "DECL-2026-00042-XYZ",
};

describe("notice template seeds", () => {
  it("ships exactly four templates (IT_RULES_2021, DMCA, IT_RULES_AND_DMCA, HASH_ADVISORY)", () => {
    expect(templateSeeds.map((t) => t.templateType)).toEqual([
      "IT_RULES_2021",
      "DMCA",
      "IT_RULES_AND_DMCA",
      "HASH_ADVISORY",
    ]);
  });

  for (const template of templateSeeds) {
    describe(template.templateType, () => {
      it("renders subject without throwing and passes subject safety", () => {
        const rendered = renderNoticeTemplate(template.subjectTemplate, sampleVariables);
        expect(() => assertNoticeSubjectSafe(rendered)).not.toThrow();
        expect(rendered.length).toBeGreaterThan(0);
        expect(rendered.length).toBeLessThanOrEqual(998);
        expect(rendered).toContain(sampleVariables.caseReference);
      });

      it("renders body without throwing and passes body safety", () => {
        const rendered = renderNoticeTemplate(template.bodyTemplate, sampleVariables);
        expect(() => assertNoticeBodySafe(rendered)).not.toThrow();
        expect(rendered).toContain(sampleVariables.caseReference);
        expect(rendered).toContain(sampleVariables.platformName);
        if (template.bodyTemplate.includes("{{url}}")) {
          expect(rendered).toContain(sampleVariables.url);
        }
      });

      it("ships a non-empty legalCitations array", () => {
        expect(template.legalCitations.length).toBeGreaterThan(0);
      });

      it("body carries a visible PENDING-LEGAL-REVIEW marker until a human flips reviewedByLegal", () => {
        const rendered = renderNoticeTemplate(template.bodyTemplate, sampleVariables);
        expect(rendered).toMatch(/DRAFT - PENDING LEGAL REVIEW/);
      });

      it("body does not contain the literal forbidden PII words (case-insensitive)", () => {
        // assertNoticeBodySafe already checks this, but the explicit assertion
        // here makes a future template-editor's mistake obvious in CI rather
        // than buried in a generic "forbidden_pii_in_notice_body" message.
        const rendered = renderNoticeTemplate(template.bodyTemplate, sampleVariables).toLowerCase();
        expect(rendered).not.toMatch(/\baadhaar\b/);
        expect(rendered).not.toMatch(/\bphone\b/);
        expect(rendered).not.toMatch(/\bmobile\b/);
      });
    });
  }

  it("DMCA template references the six 17 U.S.C. 512(c)(3) elements somewhere in the body", () => {
    const dmca = templateSeeds.find((t) => t.templateType === "DMCA");
    expect(dmca).toBeDefined();
    const rendered = renderNoticeTemplate(dmca!.bodyTemplate, sampleVariables).toLowerCase();
    expect(rendered).toContain("identification");
    expect(rendered).toContain("good-faith");
    expect(rendered).toContain("accuracy");
    expect(rendered).toContain("contact");
    expect(rendered).toContain("signature");
    expect(rendered).toContain("17 u.s.c.");
  });

  it("IT Rules template cites the 2026 amendment in addition to IT Rules 2021", () => {
    const it = templateSeeds.find((t) => t.templateType === "IT_RULES_2021");
    expect(it).toBeDefined();
    const rendered = renderNoticeTemplate(it!.bodyTemplate, sampleVariables);
    expect(rendered).toContain("2021");
    expect(rendered).toContain("2026");
    expect(it!.legalCitations.some((c) => c.includes("Amendment Rules, 2026"))).toBe(true);
  });

  it("HASH_ADVISORY template explains hashes, requests blocking, and never references a URL", () => {
    const advisory = templateSeeds.find((t) => t.templateType === "HASH_ADVISORY");
    expect(advisory).toBeDefined();
    const rendered = renderNoticeTemplate(advisory!.bodyTemplate, sampleVariables);
    expect(rendered).toContain("PDQ");
    expect(rendered.toLowerCase()).toContain("perceptual hash");
    expect(rendered.toLowerCase()).toContain("cannot be reversed");
    expect(rendered.toLowerCase()).toContain("annex");
    expect(advisory!.bodyTemplate).not.toContain("{{url}}");
    expect(advisory!.legalCitations.some((c) => c.includes("Rule 3(1)(b)"))).toBe(true);
  });

  it("DMCA template cites both DMCA and the TAKE IT DOWN Act", () => {
    const dmca = templateSeeds.find((t) => t.templateType === "DMCA");
    expect(dmca).toBeDefined();
    expect(dmca!.legalCitations.some((c) => c.includes("512"))).toBe(true);
    expect(dmca!.legalCitations.some((c) => c.includes("6851"))).toBe(true);
  });
});
