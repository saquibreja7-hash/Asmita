import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      "CRAWL_AUTHORISATION",
      "CRAWL_REPRESENTATIVE_NOTICE",
      "PARTNER_SHARING_CONSENT",
      "WATCH_AUTHORISATION",
    ]);
  });

  it("the crawler templates rest on Rule 3(2)(b), the basis the other notices use, and cite nothing else", () => {
    for (const type of ["CRAWL_AUTHORISATION", "CRAWL_REPRESENTATIVE_NOTICE"]) {
      const template = seed(type);
      expect(template.bodyTemplate).toMatch(/Rule 3\(2\)\(b\)/);
      expect(template.bodyTemplate).toMatch(/or any person on his behalf/);
      // No other rule, section or Act is asserted.
      const others = template.bodyTemplate.replace(/Rule 3\(2\)\(b\)/g, "").replace(/Rules, 2021/g, "");
      expect(others).not.toMatch(/\bRule \d|\bsection \d|\bAct, \d{4}/i);
      expect(template.legalCitations).toEqual(["IT Rules 2021, Rule 3(2)(b) - complaint by any person on her behalf; removal within 2 hours"]);
    }
    expect(seed("CRAWL_REPRESENTATIVE_NOTICE").bodyTemplate).toContain(
      // WP26 (owner decision, 19 November 2026): the notice asks the platform
      // to act within twenty-four hours, phrased as Asmita's request, and
      // still states the Rule's two-hour period as law, so nothing the notice
      // says misstates Rule 3(2)(b).
      "within twenty-four (24) hours of receipt of this notice, as Asmita requests",
    );
    expect(seed("CRAWL_REPRESENTATIVE_NOTICE").bodyTemplate).toContain(
      "requires removal within two (2) hours",
    );
    expect(seed("CRAWL_AUTHORISATION").bodyTemplate).not.toContain("{{url}}");
  });

  it("the crawl authorisation says what the survivor is agreeing to", () => {
    const body = seed("CRAWL_AUTHORISATION").bodyTemplate;
    expect(body).toMatch(/compare the fingerprints/);
    expect(body).toMatch(/on my behalf and as my authorised representative/);
    expect(body).toMatch(/withdraw this authorisation at any time/);
  });

  it("the watch-only authorisation promises comparison and alerting, never a notice (WP22)", () => {
    const body = seed("WATCH_AUTHORISATION").bodyTemplate;
    expect(body).toMatch(/compare the fingerprints/);
    expect(body).toMatch(/Asmita tells me, and I choose what happens next/);
    expect(body).toMatch(/Nothing is sent to any website or platform under this authorisation/);
    expect(body).toMatch(/my fingerprints are deleted from Asmita/);
    // The same declaration of intimacy the full authorisation rests on, so the
    // two agree about what her fingerprints are.
    expect(body).toMatch(/intimate images of me/);
    expect(body).toMatch(/did not consent to any copy of them being shared or published/);
    expect(seed("WATCH_AUTHORISATION").bodyTemplate).not.toContain("{{url}}");
  });

  it("the crawl authorisation covers the numerical description of a confirmed copy (WP28, ADR 008)", () => {
    const body = seed("CRAWL_AUTHORISATION").bodyTemplate;
    // The exact sentence, as its own sentence at the end of item 2.
    expect(body).toContain(
      "Where a person at Asmita has confirmed that a copy matches, Asmita may also keep a numerical description of that confirmed copy — never the image itself — so that altered versions of it can be found too.",
    );
    expect(body).toMatch(/records only the address of the page and of the image, never the image\. Where a person at Asmita has confirmed that a copy matches/);
    // Nothing else in the template changed: item 2 still opens as before.
    expect(body).toMatch(/2\.  I understand how the search works\./);
  });

  it("the changed authorisation text seeds unreviewed: seed.ts resets reviewedByLegal on a text change and never sets it true", () => {
    const seedSource = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
    // The change detector: a differing subject, body or citations resets the
    // human reviewer's decision to unreviewed on the update path...
    expect(seedSource).toMatch(/textChanged \? \{ \.\.\.data, reviewedByLegal: false \} : data/);
    // ...a fresh template is created unreviewed...
    expect(seedSource).toMatch(/create\(\{[\s\S]{0,200}reviewedByLegal: false/);
    // ...and nothing anywhere sets it true (only a human reviewer records it).
    expect(seedSource).not.toMatch(/reviewedByLegal:\s*true/);
  });

  it("the crawler templates render into a signable PDF", async () => {
    const { generateNoticePdf } = await import("@/lib/notice-pdf");
    for (const type of ["CRAWL_AUTHORISATION", "CRAWL_REPRESENTATIVE_NOTICE", "WATCH_AUTHORISATION"]) {
      const template = seed(type);
      const pdf = await generateNoticePdf({
        platformName: "Asmita",
        caseReference: sampleVariables.caseReference,
        noticeSubject: renderNoticeTemplate(template.subjectTemplate, sampleVariables),
        noticeBody: renderNoticeTemplate(template.bodyTemplate, sampleVariables),
        date: "16 November 2026",
        survivorName: "Test Person",
        survivorContact: "person@example.org",
        signature: "Test Person",
      });
      expect(pdf.length).toBeGreaterThan(1000);
    }
  });

  // WP26 (owner decision, 19 November 2026): every sentence that asks the
  // platform to act now asks for twenty-four hours, phrased as Asmita's
  // request and never attributed to the Rule. Every sentence that states what
  // Rule 3(2)(b) requires keeps the amended two-hour period, so the notices
  // never misstate the law.
  it("Indian templates state the Rule's two hours and ask for twenty-four (WP26)", () => {
    for (const type of ["IT_RULES_2021", "IT_RULES_AND_DMCA", "HASH_ADVISORY", "ESCALATION_L1"]) {
      const body = seed(type).bodyTemplate;
      // What the amended Rule 3(2)(b) requires: kept at two hours.
      expect(body).toContain("TWO (2) HOURS");
      expect(body).toContain("Rule 3(2)(b)");
    }
    for (const type of ["IT_RULES_2021", "IT_RULES_AND_DMCA"]) {
      const body = seed(type).bodyTemplate;
      // The demand asks for 24 hours as Asmita's request.
      expect(body).toContain("within TWENTY-FOUR (24) HOURS of receipt of this complaint, as Asmita requests");
      // The 24 hours are never attributed to the Rule.
      expect(body).not.toMatch(/TWENTY-FOUR \(24\) HOURS[^;.]*as Rule 3\(2\)\(b\)/);
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
        // The crawl authorisations and the partner-sharing agreement are
        // addressed to Asmita, not to a platform.
        if (template.templateType !== "CRAWL_AUTHORISATION" && template.templateType !== "PARTNER_SHARING_CONSENT" && template.templateType !== "WATCH_AUTHORISATION") {
          expect(rendered).toContain(sampleVariables.platformName);
        }
        if (template.bodyTemplate.includes("{{url}}")) {
          expect(rendered).toContain(sampleVariables.url);
        }
      });

      it("ships a non-empty legalCitations array", () => {
        expect(template.legalCitations.length).toBeGreaterThan(0);
      });

      it("carries no draft banner or citation placeholder (legal review 2026-11-17)", () => {
        const rendered = renderNoticeTemplate(template.subjectTemplate + "\n" + template.bodyTemplate, sampleVariables);
        expect(rendered).not.toMatch(/DRAFT|PENDING LEGAL REVIEW|DO NOT DISPATCH|CITATION REQUIRED|TO_BE_VERIFIED/i);
        expect(JSON.stringify(template.legalCitations)).not.toMatch(/CITATION REQUIRED/i);
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

describe("crawler drafts agree with each other (R6)", () => {
  it("the notice's consent statement rests on a declaration the authorisation actually contains", async () => {
    const { templateSeeds } = await import("../../prisma/template-seeds");
    const body = (type: string) => templateSeeds.find((t) => t.templateType === type)!.bodyTemplate;
    const authorisation = body("CRAWL_AUTHORISATION");
    const notice = body("CRAWL_REPRESENTATIVE_NOTICE");
    expect(authorisation).toMatch(/intimate images of me/);
    expect(authorisation).toMatch(/did not consent to any copy of them being shared or published/);
    expect(notice).toMatch(/In the authorisation referred to above, the Complainant has declared/);
    // The authorisation is agreed by a tick, never signed: the notice must not say otherwise.
    expect(notice).not.toMatch(/signed authori[sz]ation/i);
    expect(notice).toMatch(/did not consent to any copy of them being shared or published/);
    for (const text of [authorisation, notice]) expect(text).not.toMatch(/DRAFT/);
  });
});

describe("the partner-sharing agreement (WP31)", () => {
  it("keeps the spec's three plain promises and adds no URL or platform addressee", () => {
    const template = seed("PARTNER_SHARING_CONSENT");
    const rendered = renderNoticeTemplate(template.bodyTemplate, sampleVariables);
    // Only the fingerprints, never the images or her name.
    expect(rendered).toContain("never my images or my name");
    // Revocable at any time, and Asmita asks the platforms to delete them.
    expect(rendered).toContain("withdraw this agreement at any time");
    expect(rendered).toContain("Asmita will ask the platforms to delete them");
    // Partners use the fingerprints to stop reuploads too.
    expect(rendered).toContain("stop them being uploaded again");
    // The agreement carries no URL and is not addressed to a platform.
    expect(template.bodyTemplate).not.toContain("{{url}}");
    expect(template.bodyTemplate).not.toContain("{{platformName}}");
    expect(template.legalCitations.length).toBeGreaterThan(0);
  });

  it("renders a subject that passes subject safety, like every other template", () => {
    const template = seed("PARTNER_SHARING_CONSENT");
    const rendered = renderNoticeTemplate(template.subjectTemplate, sampleVariables);
    expect(() => assertNoticeSubjectSafe(rendered)).not.toThrow();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThanOrEqual(998);
    expect(rendered).toContain(sampleVariables.caseReference);
  });
});

