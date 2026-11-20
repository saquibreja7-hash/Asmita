import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP30 admin partner routes over the memory path: CSRF, the platforms:edit
// permission, strict payloads, the right status codes, one audit entry per
// action, and the per-admin rate limit. Synthetic data only.

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { partnerMemory, resetPartnerMemory } from "@/lib/partner-store";
import { partnerApplications, recordPartnerApplication } from "@/lib/platform-partners";
import { hashPartnerKey } from "@/lib/partner-auth";
import type { PartnerInterest } from "@/lib/platform-partners-shared";

import { POST as applicationAction } from "@/app/api/admin/partners/applications/[applicationId]/route";
import { PATCH as editPartner } from "@/app/api/admin/partners/[partnerId]/route";
import { POST as partnerStatus } from "@/app/api/admin/partners/[partnerId]/status/route";
import { POST as issueKey } from "@/app/api/admin/partners/[partnerId]/keys/route";
import { POST as revokeKey } from "@/app/api/admin/partners/[partnerId]/keys/[keyId]/revoke/route";
import { POST as crawlPermission } from "@/app/api/admin/partners/[partnerId]/crawl-permission/route";

let adminCounter = 0;
function adminSession() {
  // A distinct admin per test so the shared per-admin rate bucket never leaks
  // between tests.
  adminCounter += 1;
  return {
    ok: true as const,
    session: {
      sub: `admin-routes-${adminCounter}`,
      role: "ADMIN" as const,
      ageOver18: true,
      emailHash: `hash-${adminCounter}`,
      namespace: "admin" as const,
      adminRole: "SUPER_ADMIN" as const,
    },
  };
}

function request(method: string, path: string, body?: unknown, csrf = true) {
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

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function seedApplication(domain = "example-tube.example") {
  const suffix = Math.random().toString(36).slice(2, 8);
  await recordPartnerApplication({
    organisationName: "Example Media Pvt Ltd",
    platformName: `ExampleTube-${suffix}`,
    websiteDomain: domain,
    platformType: "VIDEO",
    userBase: "LAKH_10L",
    contactName: "Test Officer",
    contactRole: "Grievance Officer",
    contactEmail: `grievance-${suffix}@example.invalid`,
    interests: ["TAKEDOWN_CHANNEL"] as PartnerInterest[],
  });
  return partnerApplications[partnerApplications.length - 1]!;
}

function seedPartner(overrides: Record<string, unknown> = {}) {
  const id = `partner-${Math.random().toString(36).slice(2, 10)}`;
  partnerMemory().partners.set(id, {
    id,
    name: "ExampleForum",
    primaryDomain: `${id}.example`,
    extraDomains: [],
    status: "ACTIVE",
    channelEmailEncrypted: null,
    createdFromApplicationId: null,
    crawlPermissionRecordedAt: null,
    crawlPermissionRecordedById: null,
    crawlPermissionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
  return id;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPartnerMemory();
  partnerApplications.splice(0, partnerApplications.length);
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/admin/partners/applications/[applicationId]", () => {
  const path = (id: string) => `/api/admin/partners/applications/${id}`;

  it("refuses a request without CSRF and writes nothing", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const application = await seedApplication();
    const response = await applicationAction(request("POST", path(application.id), { action: "contacted" }, false), params({ applicationId: application.id }));
    expect(response.status).toBe(403);
    expect(application.status).toBe("NEW");
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("refuses an admin without platforms:edit", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    const application = await seedApplication();
    const response = await applicationAction(request("POST", path(application.id), { action: "contacted" }), params({ applicationId: application.id }));
    expect(response.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("platforms:edit");
    expect(inMemoryAuditLog).toHaveLength(0);
  });

  it("refuses an unknown action or malformed body", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const application = await seedApplication();
    for (const body of [{ action: "delete" }, { action: "contacted", extra: 1 }, null]) {
      const response = await applicationAction(request("POST", path(application.id), body), params({ applicationId: application.id }));
      expect(response.status).toBe(400);
    }
    expect(application.status).toBe("NEW");
  });

  it("marks contacted, approves (creating the partner) and answers the conflict codes", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const application = await seedApplication("approve.example");

    const contacted = await applicationAction(request("POST", path(application.id), { action: "contacted" }), params({ applicationId: application.id }));
    expect(contacted.status).toBe(200);
    expect(await contacted.json()).toEqual({ ok: true, status: "CONTACTED" });

    const approved = await applicationAction(request("POST", path(application.id), { action: "approve" }), params({ applicationId: application.id }));
    expect(approved.status).toBe(200);
    const body = (await approved.json()) as { status: string; partnerId: string };
    expect(body.status).toBe("ONBOARDED");
    const partner = partnerMemory().partners.get(body.partnerId)!;
    expect(partner.status).toBe("ACTIVE");
    expect(partner.primaryDomain).toBe("approve.example");

    // Approving again is a conflict; a second application on the same domain too.
    const again = await applicationAction(request("POST", path(application.id), { action: "approve" }), params({ applicationId: application.id }));
    expect(again.status).toBe(409);
    const second = await seedApplication("approve.example");
    const taken = await applicationAction(request("POST", path(second.id), { action: "approve" }), params({ applicationId: second.id }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "partner_exists" });

    const missing = await applicationAction(request("POST", path("missing"), { action: "decline" }), params({ applicationId: "missing" }));
    expect(missing.status).toBe(404);

    // Two successful actions, two audit entries; refused actions write none.
    const actions = inMemoryAuditLog.map((entry) => (entry.data as Record<string, unknown>).action);
    expect(actions).toEqual(["partner_application_contacted", "partner_approved"]);
  });
});

describe("PATCH /api/admin/partners/[partnerId]", () => {
  const path = (id: string) => `/api/admin/partners/${id}`;

  it("refuses a request without CSRF", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const response = await editPartner(request("PATCH", path("p"), { primaryDomain: "a.example" }, false), params({ partnerId: "p" }));
    expect(response.status).toBe(403);
  });

  it("saves domains and the channel email, and answers the domain errors", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const partnerId = seedPartner();

    const saved = await editPartner(
      request("PATCH", path(partnerId), { primaryDomain: "forum.example", extraDomains: ["cdn.example.test"], channelEmail: "notices@example.test" }),
      params({ partnerId }),
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { partner: { primaryDomain: string; extraDomains: string[]; channelEmail: string } };
    expect(body.partner).toMatchObject({ primaryDomain: "forum.example", extraDomains: ["cdn.example.test"], channelEmail: "notices@example.test" });
    expect(inMemoryAuditLog).toHaveLength(1);

    const bad = await editPartner(request("PATCH", path(partnerId), { primaryDomain: "not a domain" }), params({ partnerId }));
    expect(bad.status).toBe(400);

    const other = seedPartner({ primaryDomain: "taken.example" });
    const taken = await editPartner(request("PATCH", path(partnerId), { primaryDomain: "taken.example" }), params({ partnerId }));
    expect(taken.status).toBe(409);
    void other;

    const missing = await editPartner(request("PATCH", path("missing"), { primaryDomain: "a.example" }), params({ partnerId: "missing" }));
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/admin/partners/[partnerId]/status", () => {
  const path = (id: string) => `/api/admin/partners/${id}/status`;

  it("refuses a request without CSRF", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const response = await partnerStatus(request("POST", path("p"), { status: "SUSPENDED" }, false), params({ partnerId: "p" }));
    expect(response.status).toBe(403);
  });

  it("suspends, refuses a no-op and an unknown status", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const partnerId = seedPartner();

    const suspended = await partnerStatus(request("POST", path(partnerId), { status: "SUSPENDED" }), params({ partnerId }));
    expect(suspended.status).toBe(200);
    expect(((await suspended.json()) as { partner: { status: string } }).partner.status).toBe("SUSPENDED");

    const noChange = await partnerStatus(request("POST", path(partnerId), { status: "SUSPENDED" }), params({ partnerId }));
    expect(noChange.status).toBe(409);

    const malformed = await partnerStatus(request("POST", path(partnerId), { status: "PAUSED" }), params({ partnerId }));
    expect(malformed.status).toBe(400);

    const missing = await partnerStatus(request("POST", path("missing"), { status: "SUSPENDED" }), params({ partnerId: "missing" }));
    expect(missing.status).toBe(404);

    const actions = inMemoryAuditLog.map((entry) => (entry.data as Record<string, unknown>).action);
    expect(actions).toEqual(["partner_suspended"]);
  });
});

describe("partner keys routes", () => {
  it("issues a key once (201, ppk_, hash-only in store) and refuses without CSRF", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const partnerId = seedPartner();

    const refused = await issueKey(request("POST", `/api/admin/partners/${partnerId}/keys`, { label: "k" }, false), params({ partnerId }));
    expect(refused.status).toBe(403);

    const response = await issueKey(request("POST", `/api/admin/partners/${partnerId}/keys`, { label: "Integration key" }), params({ partnerId }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { keyId: string; key: string };
    expect(body.key).toMatch(/^ppk_[0-9a-f]{48}$/);
    expect(partnerMemory().keys.get(body.keyId)!.keyHash).toBe(hashPartnerKey(body.key));
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_key_issued");

    const missing = await issueKey(request("POST", "/api/admin/partners/missing/keys", { label: "k" }), params({ partnerId: "missing" }));
    expect(missing.status).toBe(404);
    const badLabel = await issueKey(request("POST", `/api/admin/partners/${partnerId}/keys`, {}), params({ partnerId }));
    expect(badLabel.status).toBe(400);
  });

  it("revokes a key of this partner only, and refuses a repeat", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const partnerId = seedPartner();
    const other = seedPartner();

    const mine = await (await issueKey(request("POST", `/api/admin/partners/${partnerId}/keys`, { label: "k1" }), params({ partnerId }))).json() as { keyId: string };
    const theirs = await (await issueKey(request("POST", `/api/admin/partners/${other}/keys`, { label: "k2" }), params({ partnerId: other }))).json() as { keyId: string };

    const notOurs = await revokeKey(
      request("POST", `/api/admin/partners/${partnerId}/keys/${theirs.keyId}/revoke`, {}),
      params({ partnerId, keyId: theirs.keyId }),
    );
    expect(notOurs.status).toBe(404);
    expect(partnerMemory().keys.get(theirs.keyId)!.revokedAt).toBeNull();

    const revoked = await revokeKey(
      request("POST", `/api/admin/partners/${partnerId}/keys/${mine.keyId}/revoke`, {}),
      params({ partnerId, keyId: mine.keyId }),
    );
    expect(revoked.status).toBe(200);
    expect(partnerMemory().keys.get(mine.keyId)!.revokedAt).toBeInstanceOf(Date);

    const twice = await revokeKey(
      request("POST", `/api/admin/partners/${partnerId}/keys/${mine.keyId}/revoke`, {}),
      params({ partnerId, keyId: mine.keyId }),
    );
    expect(twice.status).toBe(409);
  });
});

describe("POST /api/admin/partners/[partnerId]/crawl-permission", () => {
  it("records the written permission and refuses bad dates", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(adminSession() as never);
    const partnerId = seedPartner();
    const path = `/api/admin/partners/${partnerId}/crawl-permission`;

    const saved = await crawlPermission(
      request("POST", path, { date: "2026-11-18", note: "Email from their DPO, on file" }),
      params({ partnerId }),
    );
    expect(saved.status).toBe(200);
    expect(partnerMemory().partners.get(partnerId)!.crawlPermissionNote).toBe("Email from their DPO, on file");
    expect((inMemoryAuditLog[0].data as Record<string, unknown>).action).toBe("partner_crawl_permission_recorded");

    const future = await crawlPermission(request("POST", path, { date: "2999-01-01", note: "Not yet" }), params({ partnerId }));
    expect(future.status).toBe(400);
    expect(await future.json()).toMatchObject({ error: "future_date" });

    const malformed = await crawlPermission(request("POST", path, { date: "18-11-2026", note: "Wrong format" }), params({ partnerId }));
    expect(malformed.status).toBe(400);

    const missing = await crawlPermission(request("POST", "/api/admin/partners/missing/crawl-permission", { date: "2026-11-01", note: "Filed with legal" }), params({ partnerId: "missing" }));
    expect(missing.status).toBe(404);
  });
});

describe("per-admin rate limit", () => {
  it("stops the 101st action within the hour", async () => {
    const session = adminSession();
    vi.mocked(requireAdminPermission).mockResolvedValue(session as never);
    const applications = [] as Array<{ id: string }>;
    for (let i = 0; i < 101; i += 1) applications.push(await seedApplication(`rate-${i}.example`));

    const statuses: number[] = [];
    for (let i = 0; i < 101; i += 1) {
      const response = await applicationAction(
        request("POST", `/api/admin/partners/applications/${applications[i].id}`, { action: "contacted" }),
        params({ applicationId: applications[i].id }),
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 100)).toEqual(Array(100).fill(200));
    expect(statuses[100]).toBe(429);
  });
});
