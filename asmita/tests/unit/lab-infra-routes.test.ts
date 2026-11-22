import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP114 (research-tools-spec.md): the infrastructure-scan routes — the
// admin "scan now" action (CSRF, lab:manage, 20 scans/hour per admin) and
// the weekly cron (CRON_SECRET only, skips itself while ENABLE_LAB is off).
// Fetch is mocked throughout; invented example.test hosts only, so nothing
// here reaches any real site.

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));
// The scan's DNS lookups are mocked too, so the route tests never send a
// real DNS packet; every host is invented and resolves to nothing.
vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn(async () => []),
  resolve6: vi.fn(async () => []),
  resolveNs: vi.fn(async () => []),
  resolveMx: vi.fn(async () => []),
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { listInfraScansForService } from "@/lib/lab/infra/store";
import * as scanRoute from "@/app/api/lab/services/[id]/infra-scan/route";
import * as cronRoute from "@/app/api/lab/cron/infra-scan/route";
import type { NextRequest } from "next/server";

const SECRET = "unit-test-cron-secret-32-chars-long!!";

function admin(sub: string) {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole: "SUPER_ADMIN", mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function post(path: string, csrf = true): Request {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
    method: "POST",
    headers: {
      ...(csrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}),
    },
  });
}

function cronRequest(auth?: string): NextRequest {
  return new Request("https://asmita.test/api/lab/cron/infra-scan", {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as NextRequest;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_LAB", "true");
  vi.stubEnv("CRON_SECRET", SECRET);
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/lab/services/[id]/infra-scan", () => {
  it("refuses a missing service, missing CSRF and a disabled lab", async () => {
    const missing = await scanRoute.POST(post("/api/lab/services/none/infra-scan"), params("none"));
    expect(missing.status).toBe(404);

    const service = await createLabService({ name: "Invented service", kind: "WEBSITE", urls: ["https://tool.example.test/"] }, "admin-1");
    if (!service.ok) throw new Error("seed failed");

    vi.stubEnv("ENABLE_LAB", "false");
    const disabled = await scanRoute.POST(post(`/api/lab/services/${service.service.id}/infra-scan`), params(service.service.id));
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: "lab_disabled" });

    vi.stubEnv("ENABLE_LAB", "true");
    const noCsrf = await scanRoute.POST(post(`/api/lab/services/${service.service.id}/infra-scan`, false), params(service.service.id));
    expect(noCsrf.status).toBe(403);
    expect(await noCsrf.json()).toEqual({ error: "csrf_failed" });
  });

  it("refuses an admin without lab:manage", async () => {
    const service = await createLabService({ name: "Invented service", kind: "WEBSITE", urls: ["https://tool.example.test/"] }, "admin-1");
    if (!service.ok) throw new Error("seed failed");
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, error: "forbidden", status: 403 } as never);
    const response = await scanRoute.POST(post(`/api/lab/services/${service.service.id}/infra-scan`), params(service.service.id));
    expect(response.status).toBe(403);
  });

  it("scans the service, records the failed scan rows and audits one run", async () => {
    const service = await createLabService({ name: "Invented service", kind: "WEBSITE", urls: ["https://tool.example.test/"] }, "admin-1");
    if (!service.ok) throw new Error("seed failed");
    // The invented host does not resolve here: the scan records the failure
    // and still audits the run. Nothing real is fetched.
    vi.stubGlobal("fetch", vi.fn());

    const response = await scanRoute.POST(post(`/api/lab/services/${service.service.id}/infra-scan`), params(service.service.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ran: true, servicesScanned: 1, urlsScanned: 1, urlsFetched: 0 });

    const scans = await listInfraScansForService(service.service.id);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ url: "https://tool.example.test/", error: "fetch_failed" });

    const run = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_INFRA_SCAN_RUN");
    expect(run).toHaveLength(1);
    expect(run[0]!.data).toMatchObject({ trigger: "admin", servicesScanned: 1, urlsScanned: 1 });
  });

  it("rate-limits an admin to 20 scans per hour", async () => {
    const service = await createLabService({ name: "Invented service", kind: "WEBSITE", urls: ["https://tool.example.test/"] }, "admin-1");
    if (!service.ok) throw new Error("seed failed");
    vi.stubGlobal("fetch", vi.fn());
    let sawLimit = false;
    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await scanRoute.POST(post(`/api/lab/services/${service.service.id}/infra-scan`), params(service.service.id));
      if (response.status === 429) {
        sawLimit = true;
        expect(await response.json()).toEqual({ error: "rate_limited" });
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(sawLimit).toBe(true);
  });
});

describe("GET /api/lab/cron/infra-scan", () => {
  it("requires the CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const unconfigured = await cronRoute.GET(cronRequest(`Bearer ${SECRET}`));
    expect(unconfigured.status).toBe(503);

    vi.stubEnv("CRON_SECRET", SECRET);
    const noBearer = await cronRoute.GET(cronRequest());
    expect(noBearer.status).toBe(401);
    const wrong = await cronRoute.GET(cronRequest("Bearer definitely-not-the-secret"));
    expect(wrong.status).toBe(401);
    expect(await noBearer.json()).toEqual({ error: "unauthorized" });
  });

  it("skips itself while ENABLE_LAB is off, without fetching anything", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await cronRoute.GET(cronRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: "lab_disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("runs the capped weekly scan over every tracked service", async () => {
    await createLabService({ name: "One", kind: "WEBSITE", urls: ["https://one.example.test/"] }, "admin-1");
    await createLabService({ name: "Two", kind: "WEBSITE", urls: ["https://two.example.test/"] }, "admin-1");
    vi.stubGlobal("fetch", vi.fn());

    const response = await cronRoute.GET(cronRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ran: true, servicesScanned: 2, urlsScanned: 2, urlsFetched: 0 });
    const run = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_INFRA_SCAN_RUN");
    expect(run).toHaveLength(1);
    expect(run[0]!.data).toMatchObject({ trigger: "cron", servicesScanned: 2 });
  });

  it("caps the run at the configured service and URL budgets", async () => {
    await createLabService({ name: "One", kind: "WEBSITE", urls: ["https://one.example.test/"] }, "admin-1");
    await createLabService({ name: "Two", kind: "WEBSITE", urls: ["https://two.example.test/"] }, "admin-1");
    vi.stubGlobal("fetch", vi.fn());
    const { runInfraScanRun, MAX_SERVICES_PER_RUN, MAX_URLS_PER_RUN } = await import("@/lib/lab/infra/run");

    // One service per run: the second is skipped, not scanned.
    const capped = await runInfraScanRun("test", { maxServices: 1 });
    expect(capped).toMatchObject({ servicesScanned: 1, servicesSkipped: 1, urlsScanned: 1 });

    // The spec's hard caps are the defaults and the ceiling: no caller can
    // raise them past 100 services / 300 URLs.
    expect(MAX_SERVICES_PER_RUN).toBe(100);
    expect(MAX_URLS_PER_RUN).toBe(300);
    const raised = await runInfraScanRun("test", { maxServices: 10_000, maxUrls: 100_000 });
    expect(raised.servicesScanned).toBe(2);
    expect(raised.servicesSkipped).toBe(0);
  });
});
