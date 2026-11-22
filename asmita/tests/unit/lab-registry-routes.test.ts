import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP115 (research-tools-spec.md): the registry's admin routes — the provider
// directory (create, edit, verify), promoting a finding to a chokepoint,
// confirming or dismissing a cluster link, and drafting one bulk report for
// several services. Every route requires lab:manage, CSRF on the mutation,
// Zod payloads and the shared rate limiter, and refuses changes with 503
// while ENABLE_LAB is off. Invented data only (example.test).

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { csrfCookieName } from "@/lib/cookie-names";
import { inMemoryAuditLog } from "@/lib/audit";
import { resetLabMemory, labMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { createLabChokepoint } from "@/lib/lab/lab-chokepoints";
import {
  createLabProvider,
  listLabProviders,
  listServiceLinks,
  recordInfraScan,
  recordScanFindings,
  updateLabProvider,
} from "@/lib/lab/infra/store";
import * as providersRoute from "@/app/api/lab/providers/route";
import * as providerItemRoute from "@//app/api/lab/providers/[id]/route";
import * as promoteRoute from "@//app/api/lab/infra-findings/[id]/promote/route";
import * as linkReviewRoute from "@//app/api/lab/service-links/[id]/review/route";
import * as bulkReportsRoute from "@//app/api/lab/reports/bulk/route";

function admin(sub: string) {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole: "SUPER_ADMIN", mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function request(path: string, method: "GET" | "POST" | "PATCH", body?: unknown, csrf = true) {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(csrf ? { cookie: `${csrfCookieName()}=${nonce}`, "x-csrf-token": token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const NOW = new Date("2026-11-22T10:00:00.000Z");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_LAB", "true");
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/lab/providers", () => {
  it("lists for an admin and refuses a session without lab:manage", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, error: "permission_denied", status: 403 } as never);
    expect((await providersRoute.GET()).status).toBe(403);

    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    const read = await providersRoute.GET();
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ providers: [], labEnabled: true });
  });

  it("creates a provider with CSRF only, and refuses duplicates and bad payloads", async () => {
    const payload = { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: null };

    vi.stubEnv("ENABLE_LAB", "false");
    expect((await providersRoute.POST(request("/api/lab/providers", "POST", payload))).status).toBe(503);
    vi.stubEnv("ENABLE_LAB", "true");
    expect((await providersRoute.POST(request("/api/lab/providers", "POST", payload, false))).status).toBe(403);
    expect((await providersRoute.POST(request("/api/lab/providers", "POST", { name: "", kind: "HOST", website: "nope" }))).status).toBe(400);

    const created = await providersRoute.POST(request("/api/lab/providers", "POST", payload));
    expect(created.status).toBe(201);
    const duplicate = await providersRoute.POST(request("/api/lab/providers", "POST", payload));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "provider_exists" });
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_PROVIDER_CREATED")).toHaveLength(1);
  });

  it("edits a provider and records who verified it and when", async () => {
    const seeded = await createLabProvider({ name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test" }, "admin-1");
    if (!seeded.ok) throw new Error("seed failed");

    expect((await providerItemRoute.PATCH(request(`/api/lab/providers/${seeded.provider.id}`, "PATCH", {}, false), params(seeded.provider.id))).status).toBe(403);
    expect((await providerItemRoute.PATCH(request(`/api/lab/providers/missing`, "PATCH", { verified: true }), params("missing"))).status).toBe(404);

    const verified = await providerItemRoute.PATCH(
      request(`/api/lab/providers/${seeded.provider.id}`, "PATCH", { verified: true, abuseEmail: "abuse@example-host.example.test" }),
      params(seeded.provider.id),
    );
    expect(verified.status).toBe(200);
    const body = (await verified.json()) as { provider: { verifiedById: string; verifiedAt: string } };
    expect(body.provider.verifiedById).toBe("admin-1");
    expect(body.provider.verifiedAt).toBeTruthy();
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_PROVIDER_UPDATED")).toHaveLength(1);
  });
});

describe("/api/lab/infra-findings/[id]/promote", () => {
  async function seedPromotableFinding() {
    const provider = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const verified = await updateLabProvider(provider.provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");
    const service = await createLabService({ name: "Invented tool", kind: "WEBSITE", urls: ["https://tool.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("service seed failed");
    const scan = await recordInfraScan(
      { serviceId: service.service.id, url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null },
      "1",
      NOW,
    );
    await recordScanFindings(
      service.service.id,
      scan.id,
      [{ category: "HOSTING_ASN", value: "203.0.113.9", evidence: "A/AAAA tool.example.test → Example network", confidence: "HIGH", provider: "Example Host Ltd" }],
      new Set(["HOSTING_ASN"]),
      NOW,
    );
    const row = [...labMemory().infraFindings.values()][0]!;
    return row.id;
  }

  it("promotes with the directory contact and refuses without CSRF or permission", async () => {
    const findingId = await seedPromotableFinding();

    const noCsrf = await promoteRoute.POST(request(`/api/lab/infra-findings/${findingId}/promote`, "POST", {}, false), params(findingId));
    expect(noCsrf.status).toBe(403);
    vi.stubEnv("ENABLE_LAB", "false");
    expect((await promoteRoute.POST(request(`/api/lab/infra-findings/${findingId}/promote`, "POST", {}), params(findingId))).status).toBe(503);
    vi.stubEnv("ENABLE_LAB", "true");
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, error: "permission_denied", status: 403 } as never);
    expect((await promoteRoute.POST(request(`/api/lab/infra-findings/${findingId}/promote`, "POST", {}), params(findingId))).status).toBe(403);
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);

    expect((await promoteRoute.POST(request(`/api/lab/infra-findings/missing/promote`, "POST", {}), params("missing"))).status).toBe(404);

    const promoted = await promoteRoute.POST(request(`/api/lab/infra-findings/${findingId}/promote`, "POST", {}), params(findingId));
    expect(promoted.status).toBe(201);
    const body = (await promoted.json()) as { chokepoint: { abuseContact: string; kind: string } };
    expect(body.chokepoint).toMatchObject({ kind: "HOST", abuseContact: "abuse@example-host.example.test" });
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_FINDING_PROMOTED")).toHaveLength(1);

    // Twice is refused with 409.
    const again = await promoteRoute.POST(request(`/api/lab/infra-findings/${findingId}/promote`, "POST", {}), params(findingId));
    expect(again.status).toBe(409);
  });

  it("answers 422 when the analyst must enter the contact themselves", async () => {
    const provider = await createLabProvider(
      { name: "Example Pay Ltd", kind: "PAYMENT_PROCESSOR", website: "https://example-pay.example.test", abuseEmail: "abuse@example-pay.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const service = await createLabService({ name: "Invented tool", kind: "WEBSITE", urls: ["https://tool.example.test"] }, "admin-1");
    if (!service.ok) throw new Error("service seed failed");
    const scan = await recordInfraScan(
      { serviceId: service.service.id, url: "https://tool.example.test/", finalUrl: null, httpStatus: 200, error: null },
      "1",
      NOW,
    );
    await recordScanFindings(
      service.service.id,
      scan.id,
      [{ category: "PAYMENT", value: "js.example-pay.example.test", evidence: "script src host js.example-pay.example.test", confidence: "HIGH", provider: "Example Pay Ltd" }],
      new Set(["PAYMENT"]),
      NOW,
    );
    const row = [...labMemory().infraFindings.values()][0]!;

    // Unverified provider: no auto-fill, the analyst must type the contact.
    const refused = await promoteRoute.POST(request(`/api/lab/infra-findings/${row.id}/promote`, "POST", {}), params(row.id));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: "abuse_contact_required" });

    const manual = await promoteRoute.POST(
      request(`/api/lab/infra-findings/${row.id}/promote`, "POST", { abuseContact: "trust@example-pay.example.test" }),
      params(row.id),
    );
    expect(manual.status).toBe(201);
  });
});

describe("/api/lab/service-links/[id]/review", () => {
  it("confirms and dismisses with CSRF, and refuses anything else", async () => {
    const a = await createLabService({ name: "Tool A", kind: "WEBSITE", urls: ["https://a.example.test"] }, "admin-1");
    const b = await createLabService({ name: "Tool B", kind: "WEBSITE", urls: ["https://b.example.test"] }, "admin-1");
    if (!a.ok || !b.ok) throw new Error("seed failed");
    const memory = labMemory();
    memory.serviceLinks.set("link-1", {
      id: "link-1", serviceAId: a.service.id, serviceBId: b.service.id, reason: "SHARED_IP", value: "203.0.113.9",
      createdAt: NOW, status: "CANDIDATE", reviewedById: null, reviewedAt: null,
    });

    expect((await linkReviewRoute.POST(request("/api/lab/service-links/link-1/review", "POST", { status: "CONFIRMED" }, false), params("link-1"))).status).toBe(403);
    expect((await linkReviewRoute.POST(request("/api/lab/service-links/link-1/review", "POST", { status: "MAYBE" }), params("link-1"))).status).toBe(400);
    expect((await linkReviewRoute.POST(request("/api/lab/service-links/missing/review", "POST", { status: "CONFIRMED" }), params("missing"))).status).toBe(404);

    const confirmed = await linkReviewRoute.POST(request("/api/lab/service-links/link-1/review", "POST", { status: "CONFIRMED" }), params("link-1"));
    expect(confirmed.status).toBe(200);
    const links = await listServiceLinks();
    expect(links[0]).toMatchObject({ status: "CONFIRMED", reviewedById: "admin-1" });
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_SERVICE_LINK_REVIEWED")).toHaveLength(1);
  });
});

describe("/api/lab/reports/bulk", () => {
  it("drafts one report for several services with CSRF and the verified contact", async () => {
    const provider = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const verified = await updateLabProvider(provider.provider.id, { verified: true }, "admin-9");
    if (!verified.ok) throw new Error("verify failed");
    const alpha = await createLabService({ name: "Alpha tool", kind: "WEBSITE", urls: ["https://alpha.example.test"] }, "admin-1");
    const beta = await createLabService({ name: "Beta tool", kind: "WEBSITE", urls: ["https://beta.example.test"] }, "admin-1");
    if (!alpha.ok || !beta.ok) throw new Error("seed failed");
    for (const service of [alpha.service, beta.service]) {
      const chokepoint = await createLabChokepoint(
        { serviceId: service.id, kind: "HOST", provider: "Example Host Ltd", abuseContact: "abuse@example-host.example.test", evidenceNotes: null },
        "admin-1",
      );
      if (!chokepoint.ok) throw new Error("chokepoint seed failed");
    }

    const noCsrf = await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id, beta.service.id] }, false));
    expect(noCsrf.status).toBe(403);
    vi.stubEnv("ENABLE_LAB", "false");
    expect((await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id, beta.service.id] }))).status).toBe(503);
    vi.stubEnv("ENABLE_LAB", "true");
    expect((await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id] }))).status).toBe(400);
    expect((await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: "missing", serviceIds: [alpha.service.id, beta.service.id] }))).status).toBe(404);

    const drafted = await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id, beta.service.id] }));
    expect(drafted.status).toBe(201);
    const body = (await drafted.json()) as { report: { bulkServiceIds: string[]; subject: string } };
    expect(body.report.bulkServiceIds).toHaveLength(2);
    expect(body.report.subject).toBe("Abuse report: 2 services hosted on your infrastructure");
    expect(inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_REPORT_DRAFTED")).toHaveLength(1);
  });

  it("answers 422 when an unverified provider has no analyst contact", async () => {
    const provider = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const alpha = await createLabService({ name: "Alpha tool", kind: "WEBSITE", urls: ["https://alpha.example.test"] }, "admin-1");
    const beta = await createLabService({ name: "Beta tool", kind: "WEBSITE", urls: ["https://beta.example.test"] }, "admin-1");
    if (!alpha.ok || !beta.ok) throw new Error("seed failed");
    for (const service of [alpha.service, beta.service]) {
      const chokepoint = await createLabChokepoint(
        { serviceId: service.id, kind: "HOST", provider: "Example Host Ltd", abuseContact: "abuse@example-host.example.test", evidenceNotes: null },
        "admin-1",
      );
      if (!chokepoint.ok) throw new Error("chokepoint seed failed");
    }

    const refused = await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id, beta.service.id] }));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: "abuse_contact_required" });
    expect(await listLabProviders()).toHaveLength(1);
  });

  it("answers 422 service_not_dependent for a service not recorded against the provider", async () => {
    const provider = await createLabProvider(
      { name: "Example Host Ltd", kind: "HOST", website: "https://example-host.example.test", abuseEmail: "abuse@example-host.example.test" },
      "admin-1",
    );
    if (!provider.ok) throw new Error("provider seed failed");
    const alpha = await createLabService({ name: "Alpha tool", kind: "WEBSITE", urls: ["https://alpha.example.test"] }, "admin-1");
    const beta = await createLabService({ name: "Beta tool", kind: "WEBSITE", urls: ["https://beta.example.test"] }, "admin-1");
    if (!alpha.ok || !beta.ok) throw new Error("seed failed");
    const refused = await bulkReportsRoute.POST(request("/api/lab/reports/bulk", "POST", { providerId: provider.provider.id, serviceIds: [alpha.service.id, beta.service.id], abuseContact: "abuse@example-host.example.test" }));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: "service_not_dependent" });
  });
});
