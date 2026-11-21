import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { createLabProvider, updateLabProvider } from "@/lib/lab/infra/store";
import {
  draftBulkLabReport,
  draftLabReport,
  editLabReportDraft,
  getLabReport,
  listLabReports,
  recordLabReportOutcome,
  sendLabReport,
} from "@/lib/lab/lab-reports";
import { createLabChokepoint } from "@/lib/lab/lab-chokepoints";
import { labPublicNumbers } from "@/lib/lab/lab-stats";
import { runLabLivenessCheck } from "@/lib/lab/lab-liveness";
import { fillLabBulkReportTemplate } from "@/lib/lab/report-templates";

/*
 * WP115 (research-tools-spec.md): the bulk report — ONE report to one
 * provider listing several services that depend on it. Drafted from the new
 * multi-service template, reviewed and sent exactly like a single report
 * (a sent report never changes), and counted for every service it lists.
 * Invented data only (example.test).
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

beforeEach(() => {
  process.env.DATABASE_URL = "";
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

async function seedService(name: string, domain: string, kind: "WEBSITE" | "APP" = "WEBSITE") {
  const service = await createLabService({ name, kind, urls: [`https://${domain}`] }, "admin-1");
  if (!service.ok) throw new Error("service seed failed");
  return service.service;
}

async function seedProvider(name: string, kind: "HOST" | "CDN" | "REGISTRAR", email: string | null) {
  const created = await createLabProvider(
    { name, kind, website: `https://${name.toLowerCase().replace(/ /g, "-")}.example.test`, abuseEmail: email },
    "admin-1",
  );
  if (!created.ok) throw new Error("provider seed failed");
  return created.provider;
}

describe("the bulk template", () => {
  it("lists every service with its kind and addresses, and asks the provider kind's ask", () => {
    const filled = fillLabBulkReportTemplate("HOST", {
      provider: "Example Host Ltd",
      services: [
        { name: "Alpha tool", kind: "WEBSITE", urls: ["https://alpha.example.test"] },
        { name: "Beta tool", kind: "APP", urls: ["https://beta.example.test", "https://app.beta.example.test"] },
      ],
      reportDate: "2026-11-22",
    });
    expect(filled.subject).toBe("Abuse report: 2 services hosted on your infrastructure");
    expect(filled.body).toContain("To the abuse team at Example Host Ltd");
    expect(filled.body).toContain("you host the service's website");
    expect(filled.body).toContain('"Alpha tool" (website)');
    expect(filled.body).toContain('"Beta tool" (mobile app)');
    expect(filled.body).toContain("https://app.beta.example.test");
    expect(filled.body).toContain("not a grievance under the IT Rules");
    expect(filled.body).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("marks empty addresses for a human instead of inventing them", () => {
    const filled = fillLabBulkReportTemplate("CDN", {
      provider: "Example CDN",
      services: [{ name: "Gamma tool", kind: "CHANNEL", urls: [] }],
      reportDate: "2026-11-22",
    });
    expect(filled.body).toContain("<TO_BE_VERIFIED_BY_HUMAN>");
  });
});

describe("drafting one report for several services", () => {
  it("drafts a single report row that lists every selected service", async () => {
    const provider = await seedProvider("Example Host Ltd", "HOST", "abuse@example-host.example.test");
    const verified = await updateLabProvider(provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");
    const alpha = await seedService("Alpha tool", "alpha.example.test");
    const beta = await seedService("Beta tool", "beta.example.test");

    const drafted = await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, beta.id] }, "admin-2");
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) throw new Error("draft failed");
    expect(drafted.report.chokepointId).toBeNull();
    expect(drafted.report.templateKind).toBe("HOST");
    expect(drafted.report.bulkServiceIds.sort()).toEqual([alpha.id, beta.id].sort());
    expect(drafted.report.bulkProviderName).toBe("Example Host Ltd");
    expect(drafted.report.subject).toBe("Abuse report: 2 services hosted on your infrastructure");
    expect(drafted.report.body).toContain('"Alpha tool"');
    expect(drafted.report.body).toContain('"Beta tool"');

    const audit = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_REPORT_DRAFTED");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.data).toMatchObject({ bulk: true, providerId: provider.id, serviceCount: 2, templateKind: "HOST" });

    const listed = await listLabReports();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      provider: "Example Host Ltd",
      serviceName: "2 services",
      serviceId: null,
      status: "DRAFT",
    });
  });

  it("needs two distinct services, an existing provider and existing services", async () => {
    const provider = await seedProvider("Example Host Ltd", "HOST", "abuse@example-host.example.test");
    const alpha = await seedService("Alpha tool", "alpha.example.test");

    expect(await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id] }, "admin-2")).toMatchObject({
      ok: false,
      error: "invalid_payload",
    });
    expect(await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, alpha.id] }, "admin-2")).toMatchObject({
      ok: false,
      error: "invalid_payload",
    });
    expect(await draftBulkLabReport({ providerId: "missing", serviceIds: [alpha.id, "also-missing"] }, "admin-2")).toMatchObject({
      ok: false,
      error: "provider_not_found",
    });
    expect(await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, "missing"] }, "admin-2")).toMatchObject({
      ok: false,
      error: "service_not_found",
    });
  });

  it("never auto-fills the contact from an unverified provider", async () => {
    const provider = await seedProvider("Example Pay Ltd", "HOST", "abuse@example-pay.example.test");
    const alpha = await seedService("Alpha tool", "alpha.example.test");
    const beta = await seedService("Beta tool", "beta.example.test");

    // The row has an email but no verification: the analyst must enter it.
    expect(await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, beta.id] }, "admin-2")).toMatchObject({
      ok: false,
      error: "abuse_contact_required",
    });
    const drafted = await draftBulkLabReport(
      { providerId: provider.id, serviceIds: [alpha.id, beta.id], abuseContact: "trust@example-pay.example.test" },
      "admin-2",
    );
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) throw new Error("draft failed");
    expect(drafted.report.bulkAbuseContact).toBe("trust@example-pay.example.test");

    // Once verified, the directory email fills it in — and the analyst may still override.
    const verified = await updateLabProvider(provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");
    const auto = await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, beta.id] }, "admin-2");
    expect(auto.ok).toBe(true);
    if (!auto.ok) throw new Error("draft failed");
    expect(auto.report.bulkAbuseContact).toBe("abuse@example-pay.example.test");
    const override = await draftBulkLabReport(
      { providerId: provider.id, serviceIds: [alpha.id, beta.id], abuseContact: "new-trust@example-pay.example.test" },
      "admin-2",
    );
    expect(override.ok).toBe(true);
    if (!override.ok) throw new Error("draft failed");
    expect(override.report.bulkAbuseContact).toBe("new-trust@example-pay.example.test");
  });
});

describe("review, send and outcome: exactly like a single report", () => {
  it("edits the draft, refuses the edit after the send, and records the outcome", async () => {
    const provider = await seedProvider("Example Host Ltd", "HOST", "abuse@example-host.example.test");
    const verified = await updateLabProvider(provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");
    const alpha = await seedService("Alpha tool", "alpha.example.test");
    const beta = await seedService("Beta tool", "beta.example.test");

    const drafted = await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, beta.id] }, "admin-2");
    if (!drafted.ok) throw new Error("draft failed");

    const edited = await editLabReportDraft(drafted.report.id, { subject: "Edited subject", body: "Edited body" }, "admin-2");
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error("edit failed");

    const sent = await sendLabReport(drafted.report.id, { channel: "WEB_FORM" }, "admin-3");
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("send failed");
    expect(sent.report.status).toBe("SENT");

    const afterSend = await editLabReportDraft(drafted.report.id, { subject: "Too late", body: "Too late" }, "admin-2");
    expect(afterSend).toMatchObject({ ok: false, error: "report_already_sent" });

    const outcome = await recordLabReportOutcome(drafted.report.id, { outcome: "ACTIONED" }, "admin-3");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("outcome failed");
    expect(outcome.report.outcome).toBe("ACTIONED");

    const fresh = await getLabReport(drafted.report.id);
    expect(fresh).toMatchObject({ subject: "Edited subject", body: "Edited body", outcome: "ACTIONED" });
  });
});

describe("a bulk report counts for every service it lists", () => {
  it("feeds the public numbers for each listed service, like a single report does", async () => {
    const provider = await seedProvider("Example Host Ltd", "HOST", "abuse@example-host.example.test");
    const verified = await updateLabProvider(provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");

    const alpha = await seedService("Alpha tool", "alpha.example.test");
    const beta = await seedService("Beta tool", "beta.example.test");
    // The third service is tracked but never reported.
    await seedService("Unreported tool", "unreported.example.test");

    // Alpha also has a single chokepoint report, dated EARLIER than the bulk one.
    const chokepoint = await createLabChokepoint(
      { serviceId: alpha.id, kind: "CDN", provider: "Example CDN", abuseContact: "abuse@cdn.example.test", evidenceNotes: null },
      "admin-1",
    );
    if (!chokepoint.ok) throw new Error("chokepoint seed failed");
    const single = await draftLabReport({ chokepointId: chokepoint.chokepoint.id }, "admin-1");
    if (!single.ok) throw new Error("single draft failed");
    const singleSent = await sendLabReport(single.report.id, { channel: "WEB_FORM" }, "admin-2");
    if (!singleSent.ok) throw new Error("single send failed");
    // Backdate the single report five days.
    const singleRow = labMemory().reports.get(single.report.id);
    if (singleRow) singleRow.sentAt = new Date(Date.now() - 5 * DAY_MS);

    const bulk = await draftBulkLabReport({ providerId: provider.id, serviceIds: [alpha.id, beta.id] }, "admin-2");
    if (!bulk.ok) throw new Error("bulk draft failed");
    const bulkSent = await sendLabReport(bulk.report.id, { channel: "WEB_FORM" }, "admin-3");
    if (!bulkSent.ok) throw new Error("bulk send failed");

    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const numbers = await labPublicNumbers();
    // All three services are tracked and down; Alpha and Beta are reported
    // (Beta only through the bulk report), the third is not.
    expect(numbers.servicesTracked).toBe(3);
    expect(numbers.downWithin30Days).toMatchObject({ reported: 2, downWithin: 2 });
    // Alpha's FIRST report is the backdated single CDN one, so the bulk
    // HOST report must not steal that attribution.
    expect(numbers.byKind.CDN).toMatchObject({ reported: 1, down: 1 });
    expect(numbers.byKind.HOST).toMatchObject({ reported: 1, down: 1 });
  });
});
