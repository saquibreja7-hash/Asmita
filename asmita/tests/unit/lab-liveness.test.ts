import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryAuditLog } from "@/lib/audit";
import { labMemory, resetLabMemory } from "@/lib/lab/lab-store";
import { createLabService } from "@/lib/lab/lab-services";
import { runLabLivenessCheck } from "@/lib/lab/lab-liveness";
import * as livenessRoute from "@/app/api/lab/cron/liveness/route";
import type { NextRequest } from "next/server";

// The E2 daily liveness check and its cron route (docs/lab/charter.md):
// every tracked URL gets one HEAD request; the route answers only with the
// CRON_SECRET and skips itself while ENABLE_LAB is off. Fetch is mocked
// throughout; invented hosts only (example.test).

const SECRET = "unit-test-cron-secret-32-chars-long!!";

function request(auth?: string): NextRequest {
  return new Request("https://asmita.test/api/lab/cron/liveness", {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as NextRequest;
}

async function seedService(name: string, urls: string[]) {
  const created = await createLabService({ name, kind: "WEBSITE", urls }, "admin-1");
  if (!created.ok) throw new Error("seed failed");
  return created.service;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_LAB", "true");
  vi.stubEnv("CRON_SECRET", SECRET);
  resetLabMemory();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the liveness cron route", () => {
  it("requires the CRON_SECRET: missing secret, missing and wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const unconfigured = await livenessRoute.GET(request(`Bearer ${SECRET}`));
    expect(unconfigured.status).toBe(503);

    vi.stubEnv("CRON_SECRET", SECRET);
    const noBearer = await livenessRoute.GET(request());
    expect(noBearer.status).toBe(401);
    const wrongBearer = await livenessRoute.GET(request("Bearer definitely-not-the-secret"));
    expect(wrongBearer.status).toBe(401);
    expect(await noBearer.json()).toEqual({ error: "unauthorized" });
  });

  it("skips itself while ENABLE_LAB is off, without touching fetch", async () => {
    vi.stubEnv("ENABLE_LAB", "false");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await seedService("Off service", ["https://off.example.test"]);
    const response = await livenessRoute.GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: "lab_disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks each URL up or down and audits one run entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("https://up.example.test")) return new Response(null, { status: 200 });
      if (url.startsWith("https://broken.example.test")) return new Response(null, { status: 503 });
      throw new Error("unreachable");
    }));
    const up = await seedService("Up service", ["https://up.example.test"]);
    const down = await seedService("Down service", ["https://broken.example.test", "https://gone.example.test"]);

    const response = await livenessRoute.GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ran: true, servicesChecked: 2, urlsChecked: 3, urlsUp: 1, urlsDown: 2 });

    expect(labMemory().services.get(up.id)?.status).toBe("ACTIVE");
    const downRow = labMemory().services.get(down.id);
    expect(downRow?.status).toBe("DOWN");
    expect(downRow?.downSince).toBeInstanceOf(Date);
    expect(downRow?.urlStatuses).toHaveLength(2);
    expect(downRow?.lastCheckedAt).toBeInstanceOf(Date);

    const run = inMemoryAuditLog.filter((entry) => entry.eventType === "LAB_LIVENESS_RUN");
    expect(run).toHaveLength(1);
    expect(run[0].data).toEqual({ servicesChecked: 2, urlsChecked: 3, urlsUp: 1, urlsDown: 2, servicesSkipped: 0 });
  });

  it("clears downSince when a down service answers again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    const service = await seedService("Back up service", ["https://back.example.test"]);
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 500 }) });
    expect(labMemory().services.get(service.id)?.downSince).not.toBeNull();
    await runLabLivenessCheck({ fetchImpl: async () => new Response(null, { status: 200 }) });
    const row = labMemory().services.get(service.id);
    expect(row?.status).toBe("ACTIVE");
    expect(row?.downSince).toBeNull();
  });

  it("never fetches a private or loopback address, and marks it down", async () => {
    const fetchSpy = vi.fn(async (input?: unknown) => {
      void input;
      return new Response(null, { status: 200 });
    });
    await seedService("Private host service", ["http://127.0.0.1:8080/", "http://10.0.0.5/", "https://public.example.test"]);
    const result = await runLabLivenessCheck({ fetchImpl: fetchSpy });
    expect(result).toMatchObject({ urlsChecked: 3, urlsUp: 1, urlsDown: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://public.example.test");
  });

  it("caps the run: services beyond the limit are skipped, not fetched", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    await seedService("One", ["https://one.example.test"]);
    await seedService("Two", ["https://two.example.test"]);
    const result = await runLabLivenessCheck({ fetchImpl: fetchSpy, maxServices: 1 });
    expect(result).toMatchObject({ servicesChecked: 1, servicesSkipped: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
