import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { createLabChokepoint, listLabChokepoints } from "@/lib/lab/lab-chokepoints";
import {
  createLabProvider,
  createServiceLink,
  listInfraFindingsForService,
  recordInfraScan,
  recordScanFindings,
  reviewServiceLink,
  listServiceLinks,
  updateLabProvider,
} from "@/lib/lab/infra/store";
import { CATEGORY_TO_CHOKEPOINT_KIND } from "@/lib/lab/infra/signatures";
import { promoteFindingToChokepoint, PROMOTABLE_CATEGORIES, promotableKindFor } from "@/lib/lab/infra/promote";
import { labRegistryData, labRegistryServiceDetail, labProviderDirectory } from "@/lib/lab/lab-registry";
import type { ExtractedFinding } from "@/lib/lab/infra/extract";

/*
 * WP115 (research-tools-spec.md): the registry console's core rules —
 * promoting a finding to a chokepoint (kind mapped from the category, the
 * verified-contact rule, one promotion per finding), confirming or
 * dismissing cluster links, and the data the registry pages render. Invented
 * data only (example.test hosts, made-up providers); the memory backend,
 * like every lab module's tests.
 */

const NOW = new Date("2026-11-22T10:00:00.000Z");
const LATER = new Date("2026-11-29T10:00:00.000Z");

function extracted(category: ExtractedFinding["category"], value: string, provider?: string): ExtractedFinding {
  return { category, value, evidence: `evidence for ${value}`, confidence: "HIGH", ...(provider ? { provider } : {}) };
}

async function seedScannedService(name: string, domain: string, findings: ExtractedFinding[]) {
  const service = await createLabService({ name, kind: "WEBSITE", urls: [`https://${domain}`] }, "admin-1");
  if (!service.ok) throw new Error("service seed failed");
  const scan = await recordInfraScan(
    { serviceId: service.service.id, url: `https://${domain}`, finalUrl: null, httpStatus: 200, error: null },
    "1",
    NOW,
  );
  const categories = new Set(findings.map((finding) => finding.category));
  await recordScanFindings(service.service.id, scan.id, findings, categories, NOW);
  return service.service;
}

async function seedFindingRow(
  serviceId: string,
  category: ExtractedFinding["category"],
  value: string,
  overrides: Partial<{ firstSeenAt: Date; lastSeenAt: Date; active: boolean; provider: string }> = {},
): Promise<string> {
  const scan = await recordInfraScan(
    { serviceId, url: `https://tool.example.test/`, finalUrl: null, httpStatus: 200, error: null },
    "1",
    overrides.firstSeenAt ?? NOW,
  );
  await recordScanFindings(
    serviceId,
    scan.id,
    [extracted(category, value, overrides.provider)],
    new Set([category]),
    overrides.firstSeenAt ?? NOW,
  );
  const rows = await listInfraFindingsForService(serviceId);
  const row = rows.find((entry) => entry.category === category && entry.value === value);
  if (!row) throw new Error("finding seed failed");
  const memory = labMemory().infraFindings.get(row.id);
  if (!memory) throw new Error("finding row missing");
  if (overrides.lastSeenAt) memory.lastSeenAt = overrides.lastSeenAt;
  if (overrides.active === false) {
    memory.active = false;
    memory.lastSeenAt = overrides.lastSeenAt ?? LATER;
  }
  return row.id;
}

beforeEach(() => {
  process.env.DATABASE_URL = "";
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("category to chokepoint-kind mapping", () => {
  it("promotes only the mapped categories, to their mapped kinds", () => {
    expect(PROMOTABLE_CATEGORIES.sort()).toEqual([...Object.keys(CATEGORY_TO_CHOKEPOINT_KIND)].sort());
    expect(promotableKindFor("HOSTING_ASN")).toBe("HOST");
    expect(promotableKindFor("PAYMENT")).toBe("PAYMENT_PROCESSOR");
    expect(promotableKindFor("AUTH_SSO")).toBe("PLATFORM_ACCOUNT");
    // Purely descriptive categories have no chokepoint kind to promote to.
    expect(promotableKindFor("TELEGRAM_LINK")).toBeNull();
    expect(promotableKindFor("CRYPTO_ADDRESS")).toBeNull();
    expect(promotableKindFor("NAMESERVER")).toBeNull();
  });
});

describe("promote a finding to a chokepoint", () => {
  it("creates the chokepoint from a verified provider with its directory contact", async () => {
    const created = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!created.ok) throw new Error("provider seed failed");
    const verified = await updateLabProvider(created.provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("provider verify failed");

    const service = await seedScannedService("Invented tool", "tool.example.test", [
      extracted("HOSTING_ASN", "203.0.113.9", "Example Host Ltd"),
    ]);
    const findings = await listInfraFindingsForService(service.id);
    const finding = findings[0]!;

    const promoted = await promoteFindingToChokepoint(finding.id, {}, "admin-2");
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) throw new Error("promote failed");
    expect(promoted.chokepoint).toMatchObject({
      serviceId: service.id,
      kind: "HOST",
      provider: "Example Host Ltd",
      abuseContact: "abuse@example-host.example.test",
    });
    expect(promoted.contactFromDirectory).toBe(true);
    // Evidence notes carry the finding's own evidence and value.
    expect(promoted.chokepoint.evidenceNotes).toContain(finding.evidence);
    expect(promoted.chokepoint.evidenceNotes).toContain(finding.value);
    expect(promoted.chokepoint.evidenceNotes).toContain("Confidence HIGH");

    const chokepoints = await listLabChokepoints();
    expect(chokepoints).toHaveLength(1);
    const audit = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_FINDING_PROMOTED");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.data).toMatchObject({ chokepointId: promoted.chokepoint.id, kind: "HOST", contactFromDirectory: true });
    expect(audit[0]!.entityId).toBe(finding.id);

    // The finding is marked promoted, once, and never promotes again.
    const after = (await listInfraFindingsForService(service.id))[0]!;
    expect(after.promotedAt).not.toBeNull();
    expect(after.promotedChokepointId).toBe(promoted.chokepoint.id);
    const again = await promoteFindingToChokepoint(finding.id, {}, "admin-2");
    expect(again).toMatchObject({ ok: false, error: "finding_already_promoted" });
  });

  it("makes one chokepoint when the same finding is promoted twice at once", async () => {
    const created = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!created.ok) throw new Error("provider seed failed");
    const verified = await updateLabProvider(created.provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("provider verify failed");
    const service = await seedScannedService("Invented tool", "tool.example.test", [
      extracted("HOSTING_ASN", "203.0.113.9", "Example Host Ltd"),
    ]);
    const finding = (await listInfraFindingsForService(service.id))[0]!;

    const results = await Promise.all([
      promoteFindingToChokepoint(finding.id, {}, "admin-2"),
      promoteFindingToChokepoint(finding.id, {}, "admin-3"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "finding_already_promoted" }]);
    expect(await listLabChokepoints()).toHaveLength(1);
  });

  it("never auto-fills the contact from an unverified provider", async () => {
    const provider = await createLabProvider(
      { name: "Example Pay Ltd", kind: "PAYMENT_PROCESSOR", website: "https://example-pay.example.test", abuseEmail: "abuse@example-pay.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const service = await seedScannedService("Invented tool", "tool.example.test", [
      extracted("PAYMENT", "js.example-pay.example.test", "Example Pay Ltd"),
    ]);
    const finding = (await listInfraFindingsForService(service.id))[0]!;

    // Unverified row with an email: still never auto-filled.
    const refused = await promoteFindingToChokepoint(finding.id, {}, "admin-2");
    expect(refused).toMatchObject({ ok: false, error: "abuse_contact_required" });

    // The analyst enters it themselves: allowed, that is the human path.
    const promoted = await promoteFindingToChokepoint(
      finding.id,
      { abuseContact: "trust@example-pay.example.test" },
      "admin-2",
    );
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) throw new Error("promote failed");
    expect(promoted.chokepoint.abuseContact).toBe("trust@example-pay.example.test");
    expect(promoted.contactFromDirectory).toBe(false);
  });

  it("requires a provider, refuses the wrong kind and a missing finding", async () => {
    const service = await seedScannedService("Invented tool", "tool.example.test", [
      extracted("CRYPTO_ADDRESS", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"),
      extracted("CDN", "cdn.example-cdn.example.test"),
    ]);
    const findings = await listInfraFindingsForService(service.id);
    const crypto = findings.find((entry) => entry.category === "CRYPTO_ADDRESS")!;
    const cdn = findings.find((entry) => entry.category === "CDN")!;

    // No signature provider matched, and none was picked: refused.
    expect(await promoteFindingToChokepoint(cdn.id, {}, "admin-2")).toMatchObject({ ok: false, error: "provider_required" });
    // A category with no chokepoint kind mapping is refused.
    expect(await promoteFindingToChokepoint(crypto.id, { abuseContact: "abuse@example.test" }, "admin-2")).toMatchObject({
      ok: false,
      error: "category_not_promotable",
    });
    // A provider of the wrong kind is refused.
    const registrar = await createLabProvider(
      { name: "Example Registrar Ltd", kind: "REGISTRAR", website: "https://reg.example.test" },
      "admin-1",
    );
    if (!registrar.ok) throw new Error("provider seed failed");
    expect(
      await promoteFindingToChokepoint(cdn.id, { providerId: registrar.provider.id, abuseContact: "abuse@example.test" }, "admin-2"),
    ).toMatchObject({ ok: false, error: "provider_kind_mismatch" });
    expect(await promoteFindingToChokepoint("missing", {}, "admin-2")).toMatchObject({ ok: false, error: "finding_not_found" });
  });

  it("refuses an inactive finding: history is not a live dependency", async () => {
    const created = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!created.ok) throw new Error("provider seed failed");
    const verified = await updateLabProvider(created.provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");

    const service = await createLabService({ name: "Invented tool", kind: "WEBSITE", urls: ["https://tool.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("service seed failed");
    const findingId = await seedFindingRow(service.service.id, "HOSTING_ASN", "203.0.113.9", { active: false, provider: "Example Host Ltd", lastSeenAt: LATER });

    expect(await promoteFindingToChokepoint(findingId, {}, "admin-2")).toMatchObject({ ok: false, error: "finding_inactive" });
  });
});

describe("confirming and dismissing cluster links", () => {
  it("starts as a candidate and records who reviewed it", async () => {
    const a = await createLabService({ name: "Tool A", kind: "WEBSITE", urls: ["https://a.example.test"] }, "admin-1");
    const b = await createLabService({ name: "Tool B", kind: "WEBSITE", urls: ["https://b.example.test"] }, "admin-1");
    if (!a.ok || !b.ok) throw new Error("seed failed");
    expect(await createServiceLink(a.service.id, b.service.id, "SHARED_CRYPTO_ADDRESS", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", NOW)).toBe(true);

    const links = await listServiceLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ status: "CANDIDATE", reviewedById: null, reviewedAt: null });

    const confirmed = await reviewServiceLink(links[0]!.id, "CONFIRMED", "admin-2");
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.link.status).toBe("CONFIRMED");
      expect(confirmed.link.reviewedById).toBe("admin-2");
      expect(confirmed.link.reviewedAt).not.toBeNull();
    }
    const dismissed = await reviewServiceLink(links[0]!.id, "DISMISSED", "admin-3");
    expect(dismissed.ok).toBe(true);
    expect(await reviewServiceLink("missing", "CONFIRMED", "admin-2")).toMatchObject({ ok: false, error: "link_not_found" });

    const audit = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_SERVICE_LINK_REVIEWED");
    expect(audit).toHaveLength(2);
    expect(audit[0]!.data).toMatchObject({ status: "CONFIRMED", reason: "SHARED_CRYPTO_ADDRESS" });
  });
});

describe("the registry table data", () => {
  it("gathers last scan, chokepoint counts, cluster badges and filter options", async () => {
    const host = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test" },
      "admin-1",
    );
    if (!host.ok) throw new Error("provider seed failed");
    // The directory rows the findings' signature providers link to.
    await createLabProvider({ name: "Example Pay Ltd", kind: "PAYMENT_PROCESSOR", website: "https://example-pay.example.test" }, "admin-1");
    await createLabProvider({ name: "Example CDN", kind: "CDN", website: "https://example-cdn.example.test" }, "admin-1");

    const first = await seedScannedService("Alpha tool", "alpha.example.test", [
      extracted("PAYMENT", "js.example-pay.example.test", "Example Pay Ltd"),
    ]);
    const second = await seedScannedService("Beta tool", "beta.example.test", [
      extracted("CDN", "cdn.example-cdn.example.test", "Example CDN"),
    ]);
    await seedScannedService("Gamma tool", "gamma.example.test", []);

    await createLabChokepoint(
      { serviceId: first.id, kind: "HOST", provider: "Example Host Ltd", abuseContact: "abuse@example-host.example.test", evidenceNotes: "seen hosting the tool" },
      "admin-1",
    );
    expect(await createServiceLink(first.id, second.id, "SHARED_TLS_SAN", "alpha.example.test", NOW)).toBe(true);

    const data = await labRegistryData();
    expect(data.rows.map((row) => row.service.name)).toEqual(["Alpha tool", "Beta tool", "Gamma tool"]);

    const alpha = data.rows.find((row) => row.service.id === first.id)!;
    expect(alpha.chokepointsByKind).toEqual({ HOST: 1 });
    expect(alpha.chokepointTotal).toBe(1);
    expect(alpha.confirmedLinks).toBe(0);
    expect(alpha.candidateLinks).toBe(1);
    expect(alpha.activeCategories).toEqual(["PAYMENT"]);
    expect(alpha.providers).toContain("Example Host Ltd");
    expect(alpha.lastScanAt).toBe(NOW.toISOString());
    expect(data.providerNames).toContain("Example Pay Ltd");
    expect(data.providerNames).toContain("Example CDN");
    expect(data.providerNames).toContain("Example Host Ltd");
    expect(data.categories).toEqual(["CDN", "PAYMENT"]);

    // Filters: status, category and provider, each narrowing the table.
    expect((await labRegistryData({ category: "PAYMENT" })).rows.map((row) => row.service.name)).toEqual(["Alpha tool"]);
    expect((await labRegistryData({ category: "CDN" })).rows.map((row) => row.service.name)).toEqual(["Beta tool"]);
    expect((await labRegistryData({ provider: "Example CDN" })).rows.map((row) => row.service.name)).toEqual(["Beta tool"]);
    expect((await labRegistryData({ status: "UNKNOWN" })).rows).toHaveLength(3);
  });
});

describe("one service's registry page data", () => {
  it("groups findings by category with the switched-from history", async () => {
    const service = await createLabService({ name: "Invented tool", kind: "WEBSITE", urls: ["https://tool.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("seed failed");

    await seedFindingRow(service.service.id, "PAYMENT", "js.old-pay.example.test", {
      firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-11-10T00:00:00.000Z"),
      active: false,
    });
    await seedFindingRow(service.service.id, "PAYMENT", "js.new-pay.example.test", {
      firstSeenAt: LATER,
      lastSeenAt: LATER,
    });

    const detail = await labRegistryServiceDetail(service.service.id);
    if (!detail) throw new Error("detail missing");
    expect(detail.categoryGroups).toHaveLength(1);
    const payment = detail.categoryGroups[0]!;
    expect(payment.category).toBe("PAYMENT");
    expect(payment.active.map((entry) => entry.value)).toEqual(["js.new-pay.example.test"]);
    expect(payment.inactive.map((entry) => entry.value)).toEqual(["js.old-pay.example.test"]);
    expect(detail.scans.length).toBe(2);
    expect(detail.promotableCategories).toContain("PAYMENT");

    expect(await labRegistryServiceDetail("missing")).toBeNull();
  });

  it("carries the service's links, chokepoints and reports", async () => {
    const first = await seedScannedService("Alpha tool", "alpha.example.test", []);
    const second = await seedScannedService("Beta tool", "beta.example.test", []);
    expect(await createServiceLink(second.id, first.id, "SHARED_IP", "203.0.113.9", NOW)).toBe(true);
    const chokepoint = await createLabChokepoint(
      { serviceId: first.id, kind: "REGISTRAR", provider: "Example Registrar Ltd", abuseContact: "abuse@reg.example.test", evidenceNotes: null },
      "admin-1",
    );
    if (!chokepoint.ok) throw new Error("chokepoint seed failed");
    const { draftLabReport, sendLabReport } = await import("@/lib/lab/lab-reports");
    const draft = await draftLabReport({ chokepointId: chokepoint.chokepoint.id }, "admin-1");
    if (!draft.ok) throw new Error("draft seed failed");
    const sent = await sendLabReport(draft.report.id, { channel: "WEB_FORM" }, "admin-2");
    if (!sent.ok) throw new Error("send seed failed");

    const detail = await labRegistryServiceDetail(first.id);
    if (!detail) throw new Error("detail missing");
    expect(detail.links).toHaveLength(1);
    expect(detail.links[0]).toMatchObject({ otherServiceName: "Beta tool" });
    expect(detail.chokepoints.map((entry) => entry.provider)).toEqual(["Example Registrar Ltd"]);
    expect(detail.reports.map((report) => report.status)).toEqual(["SENT"]);
  });
});

describe("the provider directory", () => {
  it("counts dependents from chokepoints and findings, and the report outcomes", async () => {
    const provider = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");

    const viaChokepoint = await seedScannedService("Alpha tool", "alpha.example.test", []);
    await seedScannedService("Beta tool", "beta.example.test", [
      extracted("HOSTING_ASN", "203.0.113.9", "Example Host Ltd"),
    ]);
    await seedScannedService("Unrelated tool", "unrelated.example.test", []);

    await createLabChokepoint(
      { serviceId: viaChokepoint.id, kind: "HOST", provider: "Example Host Ltd", abuseContact: "abuse@example-host.example.test", evidenceNotes: null },
      "admin-1",
    );

    const directory = await labProviderDirectory();
    const entry = directory.find((item) => item.provider.id === provider.provider.id)!;
    expect(entry.dependents.map((dependent) => dependent.name)).toEqual(["Alpha tool", "Beta tool"]);
    expect(entry.dependents.find((dependent) => dependent.name === "Alpha tool")).toMatchObject({ viaChokepoint: true, viaFinding: false });
    expect(entry.dependents.find((dependent) => dependent.name === "Beta tool")).toMatchObject({ viaChokepoint: false, viaFinding: true });
    expect(entry.reports).toMatchObject({ sent: 0, awaiting: 0, actioned: 0, refused: 0, noReply: 0, medianDaysToOutcome: null });
  });

  it("sums the outcomes of that provider's reports and the median days", async () => {
    const provider = await createLabProvider(
      { name: "Example Registrar Ltd", kind: "REGISTRAR", website: "https://reg.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const first = await seedScannedService("Alpha tool", "alpha.example.test", []);
    const second = await seedScannedService("Beta tool", "beta.example.test", []);

    const { createLabChokepoint } = await import("@/lib/lab/lab-chokepoints");
    const { draftLabReport, sendLabReport, recordLabReportOutcome } = await import("@/lib/lab/lab-reports");
    for (const service of [first, second]) {
      const chokepoint = await createLabChokepoint(
        { serviceId: service.id, kind: "REGISTRAR", provider: "Example Registrar Ltd", abuseContact: "abuse@reg.example.test", evidenceNotes: null },
        "admin-1",
      );
      if (!chokepoint.ok) throw new Error("chokepoint seed failed");
      const draft = await draftLabReport({ chokepointId: chokepoint.chokepoint.id }, "admin-1");
      if (!draft.ok) throw new Error("draft seed failed");
      const sent = await sendLabReport(draft.report.id, { channel: "WEB_FORM" }, "admin-2");
      if (!sent.ok) throw new Error("send seed failed");
    }

    const directory = await labProviderDirectory();
    const entry = directory.find((item) => item.provider.id === provider.provider.id)!;
    expect(entry.reports.sent).toBe(2);
    expect(entry.reports.awaiting).toBe(2);

    // One provider reply after 4 days, one after 10: median 7.
    const reports = await (await import("@/lib/lab/lab-reports")).listLabReports();
    const sentReports = reports.filter((report) => report.status === "SENT");
    const fourDays = 4 * 24 * 60 * 60 * 1_000;
    await recordLabReportOutcome(sentReports[0]!.id, { outcome: "ACTIONED", outcomeAt: new Date(new Date(sentReports[0]!.sentAt!).getTime() + fourDays) }, "admin-3");
    await recordLabReportOutcome(sentReports[1]!.id, { outcome: "REFUSED", outcomeAt: new Date(new Date(sentReports[1]!.sentAt!).getTime() + 10 * 24 * 60 * 60 * 1_000) }, "admin-3");

    const refreshed = (await labProviderDirectory()).find((item) => item.provider.id === provider.provider.id)!;
    expect(refreshed.reports).toMatchObject({ sent: 2, actioned: 1, refused: 1, awaiting: 0 });
    expect(refreshed.reports.medianDaysToOutcome).toBeCloseTo(7, 5);
  });
});
