import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { LAB_CHOKEPOINT_KINDS, labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { createLabChokepoint } from "@/lib/lab/lab-chokepoints";
import { draftLabReport, sendLabReport } from "@/lib/lab/lab-reports";
import { labPublicNumbers, LAB_PUBLIC_DEPENDENCY_CATEGORIES } from "@/lib/lab/lab-stats";
import { runLabLivenessCheck } from "@/lib/lab/lab-liveness";
import { recordInfraScan, recordScanFindings, listInfraFindingsForService } from "@/lib/lab/infra/store";
import type { ExtractedFinding } from "@/lib/lab/infra/extract";

// The public service tracker (docs/lab/beta-spec.md WP92, extended by WP115
// of research-tools-spec.md): labPublicNumbers() feeds /lab/tracker, so its
// answer may carry counts and medians only — never a service name, URL,
// provider or abuse contact, exactly as the spec demands. WP115's counts are
// k-anonymity masked: anything under five reads as null and never reaches
// the page. Invented data throughout (example.test); the liveness check
// runs with an injected fetch, so nothing here reaches the network.

const DAY_MS = 24 * 60 * 60 * 1_000;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedReportedService(
  name: string,
  domain: string,
  kind: (typeof LAB_CHOKEPOINT_KINDS)[number],
  sentAtOverride?: Date,
) {
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

/** Every string anywhere in the value, so a leaked name cannot hide in a nested field. */
function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, into);
  return into;
}

// The only strings the public numbers may carry: the kind and status enum
// names, which are categories, never identifiers.
const ALLOWED_STRINGS = new Set<string>([...LAB_CHOKEPOINT_KINDS, "ACTIVE", "DOWN", "UNKNOWN"]);

describe("the public tracker numbers, memory path (WP92)", () => {
  it("answers an honest empty state before any data exists", async () => {
    const numbers = await labPublicNumbers();
    expect(numbers).toEqual({
      servicesTracked: 0,
      servicesTakenDown: 0,
      medianDaysToDown: null,
      servicesByStatus: { ACTIVE: 0, DOWN: 0, UNKNOWN: 0 },
      downWithin30Days: { reported: 0, downWithin: 0 },
      byKind: Object.fromEntries(LAB_CHOKEPOINT_KINDS.map((kind) => [kind, { reported: 0, down: 0, medianDays: null }])),
      byCategory: { payment: null, crypto: null, cdn: null, telegram: null },
      dependencyEvidenceSeen: false,
      changedProviderAfterReport: { reported: 0, changed: null },
    });
  });

  it("carries exactly the fixed shape — no field a name or URL could ride in on", async () => {
    await seedReportedService("Shape probe tool", "shape.example.test", "HOST");
    const numbers = await labPublicNumbers();
    expect(Object.keys(numbers).sort()).toEqual([
      "byCategory",
      "byKind",
      "changedProviderAfterReport",
      "dependencyEvidenceSeen",
      "downWithin30Days",
      "medianDaysToDown",
      "servicesByStatus",
      "servicesTakenDown",
      "servicesTracked",
    ]);
    expect(Object.keys(numbers.byKind).sort()).toEqual([...LAB_CHOKEPOINT_KINDS].sort());
    expect(Object.keys(numbers.byCategory).sort()).toEqual(LAB_PUBLIC_DEPENDENCY_CATEGORIES.map((entry) => entry.key).sort());
    expect(Object.keys(numbers.servicesByStatus).sort()).toEqual(["ACTIVE", "DOWN", "UNKNOWN"]);
  });

  it("counts tracked, taken down, statuses, medians and the 30-day metric", async () => {
    // "Within" goes down immediately after its report; "Outside" 40 days
    // after its backdated one; "Never reported" is tracked but unreported.
    await seedReportedService("Within tool", "within.example.test", "HOST");
    await seedReportedService("Outside tool", "outside.example.test", "REGISTRAR", new Date(Date.now() - 40 * DAY_MS));
    await createLabService({ name: "Never reported", kind: "WEBSITE", urls: ["https://never.example.test"] }, "admin-1");
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const numbers = await labPublicNumbers();
    expect(numbers.servicesTracked).toBe(3);
    expect(numbers.servicesTakenDown).toBe(3);
    expect(numbers.servicesByStatus).toEqual({ ACTIVE: 0, DOWN: 3, UNKNOWN: 0 });
    expect(numbers.medianDaysToDown).toBeCloseTo(20, 5); // 0 and 40 days: middle value.
    expect(numbers.downWithin30Days).toEqual({ reported: 2, downWithin: 1 });
    expect(numbers.byKind.HOST).toMatchObject({ reported: 1, down: 1 });
    expect(numbers.byKind.HOST?.medianDays).toBeCloseTo(0, 5);
    expect(numbers.byKind.REGISTRAR).toMatchObject({ reported: 1, down: 1 });
    expect(numbers.byKind.REGISTRAR?.medianDays).toBeCloseTo(40, 5);
    expect(numbers.byKind.APP_STORE).toEqual({ reported: 0, down: 0, medianDays: null });
  });

  it("attributes a service to the kind of its FIRST report only", async () => {
    const service = await createLabService({ name: "Two chokepoints tool", kind: "APP", urls: ["https://two.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("service seed failed");
    const registrar = await createLabChokepoint(
      { serviceId: service.service.id, kind: "REGISTRAR", provider: "Two Registrar", abuseContact: "abuse@two.example.test", evidenceNotes: null },
      "admin-1",
    );
    if (!registrar.ok) throw new Error("chokepoint seed failed");
    const host = await createLabChokepoint(
      { serviceId: service.service.id, kind: "HOST", provider: "Two Host", abuseContact: "trust@two.example.test", evidenceNotes: null },
      "admin-1",
    );
    if (!host.ok) throw new Error("chokepoint seed failed");

    // The registrar report is sent first (backdated), the host report later.
    const firstDraft = await draftLabReport({ chokepointId: registrar.chokepoint.id }, "admin-1");
    if (!firstDraft.ok) throw new Error("draft seed failed");
    const firstSent = await sendLabReport(firstDraft.report.id, { channel: "WEB_FORM" }, "admin-2");
    if (!firstSent.ok) throw new Error("send seed failed");
    const firstRow = labMemory().reports.get(firstDraft.report.id);
    if (firstRow) firstRow.sentAt = new Date(Date.now() - 5 * DAY_MS);

    const secondDraft = await draftLabReport({ chokepointId: host.chokepoint.id }, "admin-1");
    if (!secondDraft.ok) throw new Error("draft seed failed");
    const secondSent = await sendLabReport(secondDraft.report.id, { channel: "WEB_FORM" }, "admin-2");
    if (!secondSent.ok) throw new Error("send seed failed");

    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const numbers = await labPublicNumbers();
    expect(numbers.byKind.REGISTRAR).toMatchObject({ reported: 1, down: 1 });
    expect(numbers.byKind.REGISTRAR?.medianDays).toBeCloseTo(5, 5);
    expect(numbers.byKind.HOST).toEqual({ reported: 0, down: 0, medianDays: null });
    expect(numbers.medianDaysToDown).toBeCloseTo(5, 5);
    expect(numbers.downWithin30Days).toEqual({ reported: 1, downWithin: 1 });
  });

  it("does not count a service that went down before its first report", async () => {
    // The service is down now; its only report is dated 5 days in the
    // future, so the takedown cannot be credited to the report.
    await seedReportedService("Future tool", "future.example.test", "PAYMENT_PROCESSOR", new Date(Date.now() + 5 * DAY_MS));
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const numbers = await labPublicNumbers();
    expect(numbers.servicesTakenDown).toBe(1);
    expect(numbers.downWithin30Days).toEqual({ reported: 1, downWithin: 0 });
    expect(numbers.byKind.PAYMENT_PROCESSOR).toEqual({ reported: 1, down: 0, medianDays: null });
    expect(numbers.medianDaysToDown).toBeNull();
  });

  it("never contains a service name, URL, provider or abuse contact", async () => {
    await seedReportedService("Zeta nudify tool", "zeta.example.test", "HOST");
    await seedReportedService("Eta deepfake app", "eta.example.test", "APP_STORE");
    await createLabService({ name: "Unreported watcher tool", kind: "CHANNEL", urls: ["https://unreported.example.test"] }, "admin-1");
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });

    const numbers = await labPublicNumbers();
    const serialized = JSON.stringify(numbers);
    const secrets = [
      "Zeta nudify tool",
      "Eta deepfake app",
      "Unreported watcher tool",
      "zeta.example.test",
      "eta.example.test",
      "unreported.example.test",
      "zeta.example.test provider",
      "eta.example.test provider",
      "abuse@zeta.example.test",
      "abuse@eta.example.test",
      "example.test",
    ];
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }

    // Structural: the only strings anywhere in the object are the category
    // enum names, so no future field can smuggle a name or URL out.
    for (const value of collectStrings(numbers)) {
      expect(ALLOWED_STRINGS.has(value), `unexpected string in public numbers: ${value}`).toBe(true);
    }
  });
});

describe("the WP115 registry aggregates on the public tracker", () => {
  /** One finding row with exact dates and state, via the real record path. */
  async function seedFinding(
    serviceId: string,
    category: ExtractedFinding["category"],
    value: string,
    seen: { first: Date; last: Date; active: boolean },
  ) {
    const scan = await recordInfraScan(
      { serviceId, url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null },
      "1",
      seen.first,
    );
    await recordScanFindings(
      serviceId,
      scan.id,
      [{ category, value, evidence: `evidence for ${value}`, confidence: "HIGH" }],
      new Set([category]),
      seen.first,
    );
    const rows = await listInfraFindingsForService(serviceId);
    const row = rows.find((entry) => entry.category === category && entry.value === value);
    const memory = labMemory().infraFindings.get(row?.id ?? "");
    if (!memory) throw new Error("finding seed failed");
    memory.firstSeenAt = seen.first;
    memory.lastSeenAt = seen.last;
    memory.active = seen.active;
  }

  it("counts services per dependency category and masks anything under five", async () => {
    // Six services pay by card, four sit behind a CDN, one runs a Telegram
    // channel. Only the count of six is publishable; four and one read as
    // "fewer than 5" and the raw number never leaves the function.
    for (let index = 0; index < 6; index++) {
      const service = await createLabService({ name: `Card tool ${index}`, kind: "WEBSITE", urls: [`https://card-${index}.example.test`] }, "admin-1");
      if (!service.ok) throw new Error("seed failed");
      await seedFinding(service.service.id, "PAYMENT", `js.pay-${index}.example.test`, { first: new Date(), last: new Date(), active: true });
    }
    for (let index = 0; index < 4; index++) {
      const service = await createLabService({ name: `Cdn tool ${index}`, kind: "WEBSITE", urls: [`https://cdn-${index}.example.test`] }, "admin-1");
      if (!service.ok) throw new Error("seed failed");
      await seedFinding(service.service.id, "CDN", `cdn-${index}.example-cdn.example.test`, { first: new Date(), last: new Date(), active: true });
    }
    const telegram = await createLabService({ name: "Telegram tool", kind: "CHAT_BOT", urls: ["https://t.example.test"] }, "admin-1");
    if (!telegram.ok) throw new Error("seed failed");
    await seedFinding(telegram.service.id, "TELEGRAM_LINK", "t.me/example_bot", { first: new Date(), last: new Date(), active: true });

    const numbers = await labPublicNumbers();
    expect(numbers.byCategory.payment).toBe(6);
    expect(numbers.byCategory.cdn).toBeNull();
    expect(numbers.byCategory.telegram).toBeNull();
    expect(numbers.byCategory.crypto).toBeNull();
    expect(numbers.dependencyEvidenceSeen).toBe(true);
    // The masked raw counts never appear in what the page would serialize.
    const serialized = JSON.stringify(numbers.byCategory);
    expect(serialized).not.toContain("4");
    expect(serialized).not.toContain("1");
    expect(serialized).toContain("6");
  });

  it("counts a provider change only after a report, only in reportable categories, masked below five", async () => {
    const now = Date.now();
    const before = (days: number) => new Date(now - days * DAY_MS);
    const after = (days: number) => new Date(now + days * DAY_MS);

    // Two switchers: reported, then they changed host after the report.
    for (const domain of ["switch-one", "switch-two"]) {
      const reported = await seedReportedService(`${domain} tool`, `${domain}.example.test`, "HOST", before(10));
      await seedFinding(reported.service.id, "HOSTING_ASN", "192.0.2.10", { first: before(30), last: after(2), active: false });
      await seedFinding(reported.service.id, "HOSTING_ASN", "198.51.100.20", { first: after(3), last: after(3), active: true });
    }

    // A switch that happened BEFORE the report is not "after a report".
    const early = await seedReportedService("Early switch tool", "early.example.test", "HOST", before(2));
    await seedFinding(early.service.id, "HOSTING_ASN", "192.0.2.30", { first: before(30), last: before(12), active: false });
    await seedFinding(early.service.id, "HOSTING_ASN", "198.51.100.40", { first: before(11), last: before(3), active: true });

    // An analytics-tag change after a report is not a provider change.
    const tag = await seedReportedService("Tag tool", "tag.example.test", "HOST", before(10));
    await seedFinding(tag.service.id, "ANALYTICS_ID", "G-OLDESTONE1", { first: before(30), last: after(2), active: false });
    await seedFinding(tag.service.id, "ANALYTICS_ID", "G-NEWESTONE1", { first: after(3), last: after(3), active: true });

    const numbers = await labPublicNumbers();
    expect(numbers.changedProviderAfterReport.reported).toBe(4);
    // Two switchers is under k=5: the count never leaves the function.
    expect(numbers.changedProviderAfterReport.changed).toBeNull();

    // Three more switchers bring the count to five and unmask it.
    for (const domain of ["switch-three", "switch-four", "switch-five"]) {
      const reported = await seedReportedService(`${domain} tool`, `${domain}.example.test`, "HOST", before(10));
      await seedFinding(reported.service.id, "HOSTING_ASN", "192.0.2.50", { first: before(30), last: after(2), active: false });
      await seedFinding(reported.service.id, "HOSTING_ASN", "198.51.100.60", { first: after(3), last: after(3), active: true });
    }
    const unmasked = await labPublicNumbers();
    expect(unmasked.changedProviderAfterReport).toEqual({ reported: 7, changed: 5 });
  });
});
