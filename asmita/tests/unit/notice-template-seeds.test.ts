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
  originalSentAt: "8 November 2026 at 10:00 am IST",
};

const seed = (type: string) => {
  const template = templateSeeds.find((t) => t.templateType === type);
  if (!template) throw new Error(`missing seed ${type}`);
  return template;
};

describe("notice template seeds", () => {
  it("ships the four notices plus the follow-up cover and the police complaint", () => {
    expect(templateSeeds.map((t) => t.templateType)).toEqual([
      "IT_RULES_2021",
      "DMCA",
      "IT_RULES_AND_DMCA",
      "HASH_ADVISORY",
      "ESCALATION_L1",
      "FIR_PACKAGE",
    ]);
  });

  it("Indian templates demand removal within two hours under Rule 3(2)(b), as amended in 2026", () => {
    for (const type of ["IT_RULES_2021", "IT_RULES_AND_DMCA", "HASH_ADVISORY", "ESCALATION_L1"]) {
      const body = seed(type).bodyTemplate;
      expect(body).toContain("TWO (2) HOURS");
      expect(body).toContain("Rule 3(2)(b)");
      expect(body).not.toContain("TWENTY-FOUR (24) HOURS of receipt of this Notice");
    }
  });

  it("never repeats citations the source check found wrong", () => {
    for (const template of templateSeeds) {
      // 3(1)(b)(iv) is the IP clause; Rule 4(4) has no 72-hour period; acknowledgement is Rule 3(2)(a)(i), not 4(1)(c).
      expect(template.bodyTemplate).not.toContain("3(1)(b)(iv)");
      expect(template.bodyTemplate).not.toContain("SEVENTY-TWO");
      expect(template.bodyTemplate).not.toContain("Rule 4(1)(c)");
    }
  });

  it("Indian complaints claim only what Asmita knows about the survivor", () => {
    for (const type of ["IT_RULES_2021", "IT_RULES_AND_DMCA", "HASH_ADVISORY"]) {
      const body = seed(type).bodyTemplate;
      // Asmita holds a verified email and a self-declared age: no name, age proof or residency.
      expect(body).not.toMatch(/verified adult/i);
      expect(body).toContain("has declared that she is an adult");
    }
  });

  it("the hash advisory asks for a search under the SOP and never says Rule 3(2)(b) requires one", () => {
    const body = seed("HASH_ADVISORY").bodyTemplate;
    expect(body).toContain("SEARCH its service for content matching the hashes in the Annex, as the MeitY NCII SOP asks");
    expect(body).not.toMatch(/SEARCH[^\n]*as Rule 3\(2\)\(b\) requires/);
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
    // PDQ hashes can be partly inverted, so the advisory must not call them irreversible.
    expect(rendered.toLowerCase()).not.toContain("cannot be reversed");
    expect(rendered.toLowerCase()).toContain("sensitive personal data");
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
