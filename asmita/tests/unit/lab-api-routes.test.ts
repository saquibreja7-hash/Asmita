import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/lab admin routes (docs/lab/charter.md): every one requires an
// admin session with lab:manage, CSRF on mutations, Zod payloads and the
// shared rate limiter, and refuses changes with 503 while ENABLE_LAB is
// off. Reads keep working, like the crawler's routes. Invented data only.

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { resetLabMemory } from "@/lib/lab/lab-store";
import * as servicesRoute from "@/app/api/lab/services/route";
import * as serviceItemRoute from "@/app/api/lab/services/[id]/route";
import * as chokepointsRoute from "@/app/api/lab/chokepoints/route";
import * as chokepointItemRoute from "@/app/api/lab/chokepoints/[id]/route";
import * as reportsRoute from "@/app/api/lab/reports/route";
import * as reportItemRoute from "@/app/api/lab/reports/[id]/route";
import * as reportSendRoute from "@/app/api/lab/reports/[id]/send/route";
import * as reportOutcomeRoute from "@/app/api/lab/reports/[id]/outcome/route";
import * as lookupRoute from "@/app/api/lab/lookup/route";

function admin(sub: string) {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole: "SUPER_ADMIN", mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function request(path: string, method: "GET" | "POST" | "PATCH", body?: unknown, csrf = true) {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(csrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_LAB", "true");
  vi.stubEnv("LAB_RDAP_BASE_URL", "https://rdap.example.test");
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/lab/services", () => {
  it("refuses a mutation without CSRF or without the lab:manage permission", async () => {
    const noCsrf = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "X", kind: "WEBSITE", urls: ["https://x.example.test"] }, false));
    expect(noCsrf.status).toBe(403);
    expect(await noCsrf.json()).toEqual({ error: "csrf_failed" });

    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const noPermission = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "X", kind: "WEBSITE", urls: ["https://x.example.test"] }));
    expect(noPermission.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("lab:manage");
  });

  it("refuses every mutation with 503 while the Lab is off, but reads still answer", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const refused = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "X", kind: "WEBSITE", urls: ["https://x.example.test"] }));
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: "lab_disabled" });

    const read = await servicesRoute.GET();
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ services: [], labEnabled: false });
  });

  it("validates the payload and creates, updates and lists a service", async () => {
    const invalid = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "X", kind: "WEBSITE", urls: ["javascript:alert(1)"] }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid_payload" });

    const created = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "Alpha tool", kind: "WEBSITE", urls: ["https://alpha.example.test"], notes: "first seen in a channel listing" }));
    expect(created.status).toBe(201);
    const { service } = (await created.json()) as { service: { id: string } };

    const patched = await serviceItemRoute.PATCH(request(`/api/lab/services/${service.id}`, "PATCH", { status: "DOWN" }), params(service.id));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ service: { status: "DOWN" } });

    const missing = await serviceItemRoute.PATCH(request("/api/lab/services/nope", "PATCH", { status: "DOWN" }), params("nope"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "service_not_found" });

    const listed = await servicesRoute.GET();
    expect(await listed.json()).toMatchObject({ services: [{ name: "Alpha tool", status: "DOWN" }], labEnabled: true });
  });
});

describe("/api/lab/chokepoints and /api/lab/reports", () => {
  async function seedService() {
    const created = await servicesRoute.POST(request("/api/lab/services", "POST", { name: "Beta tool", kind: "APP", urls: ["https://beta.example.test"] }));
    const { service } = (await created.json()) as { service: { id: string } };
    return service.id;
  }

  it("creates a chokepoint for a known service only", async () => {
    const serviceId = await seedService();
    const bad = await chokepointsRoute.POST(request("/api/lab/chokepoints", "POST", { serviceId: "nope", kind: "HOST", provider: "Example Hosting", abuseContact: "abuse@example.test" }));
    expect(bad.status).toBe(404);

    const good = await chokepointsRoute.POST(request("/api/lab/chokepoints", "POST", { serviceId, kind: "HOST", provider: "Example Hosting", abuseContact: "abuse@example.test" }));
    expect(good.status).toBe(201);
    const { chokepoint } = (await good.json()) as { chokepoint: { id: string } };

    const listed = await chokepointsRoute.GET();
    expect(await listed.json()).toMatchObject({ chokepoints: [{ serviceName: "Beta tool", kind: "HOST" }] });

    const patched = await chokepointItemRoute.PATCH(request(`/api/lab/chokepoints/${chokepoint.id}`, "PATCH", { provider: "Example Hosting II" }), params(chokepoint.id));
    expect(await patched.json()).toMatchObject({ chokepoint: { provider: "Example Hosting II" } });
  });

  it("drafts from the template, reviews, sends and records the outcome", async () => {
    const serviceId = await seedService();
    const chokepointResponse = await chokepointsRoute.POST(request("/api/lab/chokepoints", "POST", { serviceId, kind: "REGISTRAR", provider: "Example Registrar", abuseContact: "abuse@example.test", evidenceNotes: "domain registered for the tool" }));
    const { chokepoint } = (await chokepointResponse.json()) as { chokepoint: { id: string } };

    const drafted = await reportsRoute.POST(request("/api/lab/reports", "POST", { chokepointId: chokepoint.id }));
    expect(drafted.status).toBe(201);
    const draft = (await drafted.json()) as { report: { id: string; subject: string; body: string; status: string } };
    expect(draft.report.subject).toContain("domain registered through you");
    expect(draft.report.body).toContain("beta.example.test");
    expect(draft.report.status).toBe("DRAFT");

    // The draft the analyst reviewed is what gets sent.
    const edited = await reportItemRoute.PATCH(request(`/api/lab/reports/${draft.report.id}`, "PATCH", { subject: "Reviewed subject", body: "Reviewed body." }), params(draft.report.id));
    expect(await edited.json()).toMatchObject({ report: { subject: "Reviewed subject", body: "Reviewed body." } });

    // EMAIL without an address is invalid; with one, the send is recorded.
    const noAddress = await reportSendRoute.POST(request(`/api/lab/reports/${draft.report.id}/send`, "POST", { channel: "EMAIL" }), params(draft.report.id));
    expect(noAddress.status).toBe(400);
    const sent = await reportSendRoute.POST(request(`/api/lab/reports/${draft.report.id}/send`, "POST", { channel: "EMAIL", to: "abuse@example.test" }), params(draft.report.id));
    expect(await sent.json()).toMatchObject({ report: { status: "SENT", channel: "EMAIL", toAddress: "abuse@example.test" } });

    const again = await reportSendRoute.POST(request(`/api/lab/reports/${draft.report.id}/send`, "POST", { channel: "WEB_FORM" }), params(draft.report.id));
    expect(again.status).toBe(409);

    const outcome = await reportOutcomeRoute.POST(request(`/api/lab/reports/${draft.report.id}/outcome`, "POST", { outcome: "ACTIONED", providerReference: "ref-1" }), params(draft.report.id));
    expect(await outcome.json()).toMatchObject({ report: { outcome: "ACTIONED", providerReference: "ref-1" } });

    const listed = await reportsRoute.GET();
    expect(await listed.json()).toMatchObject({ reports: [{ status: "SENT", outcome: "ACTIONED" }] });
  });

  it("refuses the outcome on a draft and the edit after the send", async () => {
    const serviceId = await seedService();
    const chokepointResponse = await chokepointsRoute.POST(request("/api/lab/chokepoints", "POST", { serviceId, kind: "HOST", provider: "Example Hosting", abuseContact: "abuse@example.test" }));
    const { chokepoint } = (await chokepointResponse.json()) as { chokepoint: { id: string } };
    const drafted = await reportsRoute.POST(request("/api/lab/reports", "POST", { chokepointId: chokepoint.id }));
    const { report } = (await drafted.json()) as { report: { id: string } };

    const tooEarly = await reportOutcomeRoute.POST(request(`/api/lab/reports/${report.id}/outcome`, "POST", { outcome: "NO_REPLY" }), params(report.id));
    expect(tooEarly.status).toBe(409);
    expect(await tooEarly.json()).toEqual({ error: "report_not_sent" });

    await reportSendRoute.POST(request(`/api/lab/reports/${report.id}/send`, "POST", { channel: "WEB_FORM" }), params(report.id));
    const tooLate = await reportItemRoute.PATCH(request(`/api/lab/reports/${report.id}`, "PATCH", { subject: "x", body: "y" }), params(report.id));
    expect(tooLate.status).toBe(409);
    expect(await tooLate.json()).toEqual({ error: "report_already_sent" });
  });

  it("audits the whole flow under the Lab's own event names, with ids and counts only", async () => {
    const serviceId = await seedService();
    const chokepointResponse = await chokepointsRoute.POST(request("/api/lab/chokepoints", "POST", { serviceId, kind: "CDN", provider: "Example CDN", abuseContact: "abuse@example.test" }));
    const { chokepoint } = (await chokepointResponse.json()) as { chokepoint: { id: string } };
    const drafted = await reportsRoute.POST(request("/api/lab/reports", "POST", { chokepointId: chokepoint.id }));
    const { report } = (await drafted.json()) as { report: { id: string } };
    await reportSendRoute.POST(request(`/api/lab/reports/${report.id}/send`, "POST", { channel: "WEB_FORM" }), params(report.id));

    const eventTypes = inMemoryAuditLog.map((entry) => entry.eventType);
    expect(eventTypes).toEqual(["LAB_SERVICE_CREATED", "LAB_CHOKEPOINT_CREATED", "LAB_REPORT_DRAFTED", "LAB_REPORT_SENT"]);
    const serialized = JSON.stringify(inMemoryAuditLog.map((entry) => ({ ...entry, entityId: null })));
    expect(serialized).not.toContain("beta.example.test");
    expect(serialized).not.toContain("Beta tool");
  });
});

describe("/api/lab/lookup", () => {
  it("answers with host suggestions for a public http(s) URL and rejects the rest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Registrar House Ltd"]]] }],
    }), { status: 200 })));

    const bad = await lookupRoute.POST(request("/api/lab/lookup", "POST", { url: "javascript:alert(1)" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_url" });

    const good = await lookupRoute.POST(request("/api/lab/lookup", "POST", { url: "https://gamma.example.test/app" }));
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({
      hints: { host: "gamma.example.test", registrar: "Registrar House Ltd", rdapChecked: true },
      rdapConfigured: true,
    });
    vi.unstubAllGlobals();
  });
});
