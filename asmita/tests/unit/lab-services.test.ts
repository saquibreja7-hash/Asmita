import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService, listLabServices, updateLabService } from "@/lib/lab/lab-services";
import { createLabChokepoint, listLabChokepoints, updateLabChokepoint } from "@/lib/lab/lab-chokepoints";
import { draftLabReport, listLabReports, sendLabReport } from "@/lib/lab/lab-reports";
import { labDashboardStats, labPublicNumbers } from "@/lib/lab/lab-stats";
import { runLabLivenessCheck } from "@/lib/lab/lab-liveness";

// E2 on the memory path (docs/lab/charter.md): services, chokepoints,
// reports and the dashboard aggregates, with every mutation audited under
// its own event name. Audit data carries ids and counts only — never a
// service name or URL. Invented data throughout (example.test).

const DAY_MS = 24 * 60 * 60 * 1_000;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function audit(eventType: string) {
  return inMemoryAuditLog.filter((entry) => entry.eventType === eventType);
}

async function seedReportedService(name: string, domain: string, kind: "HOST" | "REGISTRAR", sentAtOverride?: Date) {
  const service = await createLabService({ name, kind: "WEBSITE", urls: [`https://${domain}`] }, "admin-1");
  if (!service.ok) throw new Error("service seed failed");
  const chokepoint = await createLabChokepoint(
    { serviceId: service.service.id, kind, provider: `${domain} provider`, abuseContact: `abuse@${domain}`, evidenceNotes: "seen offering an undress tool" },
    "admin-1",
  );
  if (!chokepoint.ok) throw new Error("chokepoint seed failed");
  const draft = await draftLabReport({ chokepointId: chokepoint.chokepoint.id }, "admin-1");
  if (!draft.ok) throw new Error("draft seed failed");
  const sent = await sendLabReport(draft.report.id, { channel: "WEB_FORM" }, "admin-2");
  if (!sent.ok) throw new Error("send seed failed");
  if (sentAtOverride) {
    const row = labMemory().reports.get(draft.report.id);
    if (row) row.sentAt = sentAtOverride;
  }
  return { service: service.service, chokepoint: chokepoint.chokepoint, report: sent.report };
}

describe("lab services, memory path", () => {
  it("creates a service, refuses bad URLs, dedupes, and audits ids and counts only", async () => {
    const created = await createLabService(
      { name: "Alpha nudify tool", kind: "WEBSITE", urls: ["https://alpha.example.test", "https://alpha.example.test"] },
      "admin-1",
    );
    expect(created).toMatchObject({ ok: true, service: { name: "Alpha nudify tool", status: "UNKNOWN", urls: ["https://alpha.example.test"] } });

    expect(await createLabService({ name: "Bad", kind: "APP", urls: ["javascript:alert(1)"] }, "admin-1")).toEqual({ ok: false, error: "invalid_payload" });
    expect(await createLabService({ name: "Bad", kind: "APP", urls: ["https://user:pass@alpha.example.test"] }, "admin-1")).toEqual({ ok: false, error: "invalid_payload" });

    const entries = audit("LAB_SERVICE_CREATED");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entityType: "LabService", actorId: "admin-1" });
    expect(entries[0].data).toEqual({ kind: "WEBSITE", urlCount: 1 });
    expect(JSON.stringify(entries[0].data)).not.toContain("alpha.example.test");
  });

  it("updates a service and audits the changed fields", async () => {
    const created = await createLabService({ name: "Beta tool", kind: "CHAT_BOT", urls: ["https://beta.example.test"] }, "admin-1");
    if (!created.ok) throw new Error("seed");
    const updated = await updateLabService(created.service.id, { status: "DOWN", notes: "Went dark" }, "admin-2");
    expect(updated).toMatchObject({ ok: true, service: { status: "DOWN", notes: "Went dark" } });
    expect(audit("LAB_SERVICE_UPDATED")[0].data).toEqual({ fields: ["status", "notes"] });
    expect(await updateLabService("missing", { status: "ACTIVE" }, "admin-1")).toEqual({ ok: false, error: "service_not_found" });
    const listed = await listLabServices();
    expect(listed.map((service) => service.name)).toEqual(["Beta tool"]);
  });
});

describe("lab chokepoints and reports, memory path", () => {
  it("creates a chokepoint only for a known service and audits it", async () => {
    const service = await createLabService({ name: "Gamma app", kind: "APP", urls: ["https://gamma.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("seed");
    expect(await createLabChokepoint({ serviceId: "nope", kind: "HOST", provider: "p", abuseContact: "a@example.test" }, "admin-1"))
      .toEqual({ ok: false, error: "service_not_found" });

    const chokepoint = await createLabChokepoint(
      { serviceId: service.service.id, kind: "HOST", provider: "Example Hosting", abuseContact: "abuse@example.test", evidenceNotes: "hosts the app's site" },
      "admin-1",
    );
    expect(chokepoint).toMatchObject({ ok: true, chokepoint: { serviceName: "Gamma app", kind: "HOST" } });
    if (!chokepoint.ok) throw new Error("chokepoint seed");
    expect(audit("LAB_CHOKEPOINT_CREATED")[0].data).toEqual({ kind: "HOST", serviceId: service.service.id });

    const updated = await updateLabChokepoint(chokepoint.chokepoint.id, { abuseContact: "trust@example.test" }, "admin-2");
    expect(updated).toMatchObject({ ok: true, chokepoint: { abuseContact: "trust@example.test" } });
    expect(await listLabChokepoints()).toHaveLength(1);
  });

  it("drafts from the per-kind template, edits the draft, sends once, and records the outcome", async () => {
    const { chokepoint } = await seedReportedService("Delta tool", "delta.example.test", "REGISTRAR");
    const draft = await draftLabReport({ chokepointId: chokepoint.id }, "admin-3");
    expect(draft).toMatchObject({ ok: true });
    if (!draft.ok) throw new Error("unreachable");
    expect(draft.report.subject).toContain("domain registered through you");
    expect(draft.report.body).toContain("delta.example.test");
    expect(draft.report.status).toBe("DRAFT");
    expect(draft.report.templateKind).toBe("REGISTRAR");
    // One from the seed helper, one from this draft.
    expect(audit("LAB_REPORT_DRAFTED")).toHaveLength(2);

    const { editLabReportDraft, recordLabReportOutcome } = await import("@/lib/lab/lab-reports");
    const edited = await editLabReportDraft(draft.report.id, { subject: "Abuse report (updated)", body: "Hand-checked text." }, "admin-3");
    expect(edited).toMatchObject({ ok: true, report: { subject: "Abuse report (updated)", body: "Hand-checked text." } });
    expect(audit("LAB_REPORT_UPDATED")).toHaveLength(1);

    const sent = await sendLabReport(draft.report.id, { channel: "EMAIL", to: "abuse@delta.example.test" }, "admin-3");
    expect(sent).toMatchObject({ ok: true, report: { status: "SENT", channel: "EMAIL", toAddress: "abuse@delta.example.test", sentById: "admin-3" } });
    // The sent text is the record: editing and re-sending are both refused.
    expect(await editLabReportDraft(draft.report.id, { subject: "x", body: "y" }, "admin-3")).toEqual({ ok: false, error: "report_already_sent" });
    expect(await sendLabReport(draft.report.id, { channel: "WEB_FORM" }, "admin-3")).toEqual({ ok: false, error: "report_already_sent" });

    const outcome = await recordLabReportOutcome(draft.report.id, { outcome: "ACTIONED", providerReference: "provider-ticket-9" }, "admin-4");
    expect(outcome).toMatchObject({ ok: true, report: { outcome: "ACTIONED", providerReference: "provider-ticket-9" } });
    const sentAudits = audit("LAB_REPORT_SENT");
    expect(sentAudits).toHaveLength(2);
    expect(sentAudits.find((entry) => entry.entityId === draft.report.id)?.data).toEqual({ channel: "EMAIL", chokepointId: chokepoint.id });
    expect(audit("LAB_REPORT_OUTCOME_RECORDED").find((entry) => entry.entityId === draft.report.id)?.data).toEqual({ outcome: "ACTIONED", chokepointId: chokepoint.id });

    // The seed helper's report plus this one.
    const reports = await listLabReports();
    expect(reports).toHaveLength(2);
  });
});

describe("the E2 dashboard and public aggregates", () => {
  it("counts services by status, reports outstanding, and the 30-day metric", async () => {
    const within = await seedReportedService("Within tool", "within.example.test", "HOST");
    const outside = await seedReportedService("Outside tool", "outside.example.test", "REGISTRAR", new Date(Date.now() - 40 * DAY_MS));
    const neverReported = await createLabService({ name: "Never reported", kind: "WEBSITE", urls: ["https://never.example.test"] }, "admin-1");

    // Both reported services go down now; "Within" 0 days after its report,
    // "Outside" 40 days after its backdated one. The never-reported service
    // goes down too — the liveness check does not care about reports.
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const stats = await labDashboardStats();
    expect(stats.servicesTotal).toBe(3);
    expect(stats.servicesByStatus).toEqual({ ACTIVE: 0, DOWN: 3, UNKNOWN: 0 });
    expect(stats.reports).toMatchObject({ drafts: 0, awaitingOutcome: 2, sent: 2, actioned: 0 });
    expect(stats.downWithin30Days).toEqual({ reported: 2, downWithin: 1 });
    expect(stats.medianDaysByKind.HOST).toBeCloseTo(0, 5);
    expect(stats.medianDaysByKind.REGISTRAR).toBeCloseTo(40, 5);
    expect(stats.medianDaysOverall).toBeCloseTo(20, 5);

    // The public page gets counts and the median only — never a name or URL.
    const publicNumbers = await labPublicNumbers();
    expect(publicNumbers.servicesTracked).toBe(3);
    expect(publicNumbers.servicesTakenDown).toBe(3);
    expect(publicNumbers.medianDaysToDown).toBeCloseTo(20, 5);
    const serialized = JSON.stringify(publicNumbers) + JSON.stringify(stats);
    for (const name of ["Within tool", "Outside tool", "Never reported", "within.example.test", "outside.example.test"]) {
      expect(serialized).not.toContain(name);
    }
    void within;
    void outside;
    void neverReported;
  });
});
