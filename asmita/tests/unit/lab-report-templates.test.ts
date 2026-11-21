import { describe, expect, it } from "vitest";
import {
  fillLabReportTemplate,
  LAB_SERVICE_KIND_LABELS,
  LAB_TEMPLATE_PLACEHOLDERS,
} from "@/lib/lab/report-templates";
import { LAB_CHOKEPOINT_KINDS } from "@/lib/lab/lab-store";

// The E2 per-kind report templates (docs/lab/charter.md): one per chokepoint
// kind, English, filled from the stored service data. Placeholders are
// invented tokens; the tests use invented data only (example.test).

const DATA = {
  serviceName: "Alpha nudify tool",
  serviceKind: "WEBSITE" as const,
  serviceUrls: ["https://alpha.example.test", "https://www.alpha.example.test/app"],
  provider: "Example Hosting Ltd",
  evidenceNotes: "Front page offers an 'undress' generator; sample gallery of clothed women.",
  reportDate: "2026-11-20",
};

describe("E2 report templates", () => {
  it("has a template for every chokepoint kind, and every placeholder is invented", () => {
    for (const kind of LAB_CHOKEPOINT_KINDS) {
      const filled = fillLabReportTemplate(kind, DATA);
      expect(filled.subject.length).toBeGreaterThan(10);
      expect(filled.body.length).toBeGreaterThan(100);
    }
    // No real service, provider, person or URL is named in a template.
    const all = LAB_TEMPLATE_PLACEHOLDERS.join(" ");
    expect(all).not.toMatch(/https?:\/\//);
    for (const placeholder of LAB_TEMPLATE_PLACEHOLDERS) {
      expect(placeholder).toMatch(/^\{\{[A-Z_]+\}\}$/);
    }
  });

  it("fills the service data in and leaves no placeholder behind", () => {
    const filled = fillLabReportTemplate("HOST", DATA);
    expect(filled.subject).toContain("Alpha nudify tool");
    expect(filled.body).toContain("Alpha nudify tool");
    expect(filled.body).toContain("Example Hosting Ltd");
    expect(filled.body).toContain("https://alpha.example.test");
    expect(filled.body).toContain("https://www.alpha.example.test/app");
    expect(filled.body).toContain(DATA.evidenceNotes);
    expect(filled.body).toContain("2026-11-20");
    expect(filled.body).toContain(LAB_SERVICE_KIND_LABELS.WEBSITE);
    expect(filled.body).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(filled.subject).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("asks each provider kind for its own action and keeps the evidence honest", () => {
    const host = fillLabReportTemplate("HOST", DATA);
    const registrar = fillLabReportTemplate("REGISTRAR", DATA);
    const payments = fillLabReportTemplate("PAYMENT_PROCESSOR", DATA);

    expect(host.body).toContain("you host the service's website");
    expect(registrar.body).toContain("you registered the service's domain name");
    expect(payments.body).toContain("you process the service's payments");

    // A policy complaint to a chokepoint, not a grievance under the IT Rules.
    for (const filled of [host, registrar, payments]) {
      expect(filled.body).toContain("not a grievance under the IT Rules");
    }
  });

  it("marks unverified facts for a human instead of inventing them", () => {
    const filled = fillLabReportTemplate("CDN", { ...DATA, evidenceNotes: null, serviceUrls: [] });
    expect(filled.body).toContain("<TO_BE_VERIFIED_BY_HUMAN>");
    expect(filled.body).not.toContain(DATA.evidenceNotes);
  });
});
