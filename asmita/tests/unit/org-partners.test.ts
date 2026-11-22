import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { POST as SUBMIT } from "@/app/api/org/submissions/route";
import { GET as LIST_PARTNERS, POST as CREATE_PARTNER } from "@/app/api/admin/org/partners/route";
import { PUT as PUT_PARTNER } from "@/app/api/admin/org/partners/[id]/route";
import { POST as REORDER_PARTNERS } from "@/app/api/admin/org/partners/reorder/route";
import { PLATFORM_DEADLINE_TEXT, PLATFORM_FOLLOW_UP_TEXT } from "@/app/(public)/for-platforms/trusted-flagger/page";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { ESCALATION_HOURS } from "@/lib/escalation-engine";
import { resolveSupporterStrip } from "@/components/layout/Supporters";
import { listOrgPartnersForAdmin, listPublicOrgPartners, orgPartners, type OrgPartner } from "@/lib/org-partners";
import {
  orgSubmissions,
  partnerAcademicSchema,
  partnerLegalSchema,
  partnerNgoSchema,
  partnerPoliceSchema,
} from "@/lib/org-submissions";

// WP57 (docs/org/spec.md): the four typed partner inquiry schemas and their
// API, the OrgPartner admin APIs and their permission, the Supporters strip
// with and without public partners, and the trusted-flagger page reading its
// deadline from the constants. Synthetic data only.

// ─── Shared form endpoint helpers (mirrors org-submissions-api.test.ts) ────

let ipCounter = 0;
function submissionRequest(body: unknown, options: { csrf?: boolean; ip?: string } = {}) {
  const csrf = createCsrfPair();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": options.ip ?? `198.51.100.${(ipCounter += 1)}`,
  };
  if (options.csrf !== false) {
    headers.cookie = `asmita_csrf=${csrf.nonce}`;
    headers["x-csrf-token"] = csrf.token;
  }
  return new Request("https://asmita.test/api/org/submissions", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const baseContact = {
  organizationName: "Example Trust",
  website: "https://example.invalid",
  contactName: "Test Contact",
  role: "Coordinator",
  email: "ngo@example.invalid",
  city: "Pune",
  state: "Maharashtra",
  message: "We run a helpline and want to build a referral path.",
};

const ngo = { kind: "PARTNER_NGO", type: "HELPLINE", areasServed: ["Maharashtra", "Pan-India"], services: ["HELPLINE", "COUNSELLING"], ...baseContact };
const legal = { kind: "PARTNER_LEGAL", type: "LAW_FIRM", practiceAreas: ["CYBER_CRIME"], proBonoHours: "FROM_2_TO_5", ...baseContact, email: "legal@example.invalid" };
const police = { kind: "PARTNER_LAW_ENFORCEMENT", type: "CYBER_CELL", unit: "Cyber Police Station", district: "Pune", interest: "TRAINING", ...baseContact, email: "police@example.invalid" };
const academic = { kind: "PARTNER_ACADEMIC", type: "DEPARTMENT", department: "Media Studies", interest: "RESEARCH", ...baseContact, email: "study@example.invalid" };

describe("partner inquiry schemas", () => {
  it.each([
    ["ngo", partnerNgoSchema, ngo],
    ["legal", partnerLegalSchema, legal],
    ["police", partnerPoliceSchema, police],
    ["academic", partnerAcademicSchema, academic],
  ] as const)("accepts a full %s inquiry and rejects a broken one", (_name, schema, payload) => {
    const { kind: _kind, ...fields } = payload;
    void _kind;
    expect(schema.safeParse(fields).success).toBe(true);
    // A required type-specific field is enforced per kind.
    const stripped: Record<string, unknown> = { ...fields };
    delete stripped[_name === "ngo" ? "services" : _name === "legal" ? "practiceAreas" : _name === "police" ? "unit" : "department"];
    expect(schema.safeParse(stripped).success).toBe(false);
    expect(schema.safeParse({ ...fields, surprise: "x" }).success).toBe(false);
  });

  it("rejects an unknown state, type and service, and a bad website", () => {
    const { kind: _ngoKind, ...fields } = ngo;
    void _ngoKind;
    expect(partnerNgoSchema.safeParse({ ...fields, areasServed: ["Atlantis"] }).success).toBe(false);
    expect(partnerNgoSchema.safeParse({ ...fields, type: "PLATFORM" }).success).toBe(false);
    expect(partnerNgoSchema.safeParse({ ...fields, services: ["GHOST"] }).success).toBe(false);
    expect(partnerNgoSchema.safeParse({ ...fields, website: "not a url" }).success).toBe(false);
    const { kind: _legalKind, ...legalFields } = legal;
    void _legalKind;
    expect(partnerLegalSchema.safeParse({ ...legalFields, barState: "Atlantis" }).success).toBe(false);
  });
});

describe("POST /api/org/submissions with partner kinds", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgSubmissions.splice(0, orgSubmissions.length);
  });

  it.each([
    ["PARTNER_NGO", ngo],
    ["PARTNER_LEGAL", legal],
    ["PARTNER_LAW_ENFORCEMENT", police],
    ["PARTNER_ACADEMIC", academic],
  ] as const)("stores a valid %s inquiry", async (kind, payload) => {
    const response = await SUBMIT(submissionRequest(payload));
    expect(response.status).toBe(200);
    expect(orgSubmissions).toHaveLength(1);
    expect(orgSubmissions[0]?.kind).toBe(kind);
    expect(orgSubmissions[0]?.status).toBe("NEW");
  });

  it("refuses a police inquiry without its unit, naming the field", async () => {
    const response = await SUBMIT(submissionRequest({ ...police, unit: "" }));
    expect(response.status).toBe(400);
    const data = (await response.json()) as { field?: string };
    expect(data.field).toBe("unit");
    expect(orgSubmissions).toHaveLength(0);
  });

  it("keeps the honeypot trick for partner kinds and stores nothing", async () => {
    const response = await SUBMIT(submissionRequest({ ...ngo, fax: "spam" }));
    expect(response.status).toBe(200);
    expect(orgSubmissions).toHaveLength(0);
  });
});

// ─── OrgPartner admin APIs ─────────────────────────────────────────────────

const partnerInput = {
  name: "Sahyog Trust",
  type: "NGO",
  blurbEn: "A helpline for survivors in Maharashtra.",
};

function adminRequest(path: string, method: string, body: unknown, withCsrf = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withCsrf) {
    const { nonce, token } = createCsrfPair();
    headers.cookie = `asmita_csrf=${nonce}`;
    headers["x-csrf-token"] = token;
  }
  return new Request(`https://asmita.test${path}`, { method, headers, body: JSON.stringify(body) });
}

function admin(ok: boolean) {
  vi.mocked(requireAdminPermission).mockResolvedValue(
    ok
      ? ({ ok: true as const, session: { sub: "admin-1", adminRole: "SUPER_ADMIN" as never } } as never)
      : ({ ok: false as const, status: 403, error: "permission_denied" } as never),
  );
}

describe("org partner admin APIs", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPartners.splice(0, orgPartners.length);
    vi.clearAllMocks();
  });

  it("refuses every route without content:manage and mutations without CSRF", async () => {
    admin(false);
    expect((await LIST_PARTNERS()).status).toBe(403);
    expect(
      (await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", partnerInput, false))).status,
    ).toBe(403);

    admin(true);
    expect((await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", partnerInput, false))).status).toBe(403);
    expect(orgPartners).toHaveLength(0);
  });

  it("creates a partner hidden, edits it, and audits both", async () => {
    const created = await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", partnerInput));
    expect(created.status).toBe(201);
    const { partner } = (await created.json()) as { partner: OrgPartner };
    expect(partner.isPublic).toBe(false); // never public until an admin says so
    expect(partner.sortOrder).toBe(1);

    const edited = await PUT_PARTNER(
      adminRequest(`/api/admin/org/partners/${partner.id}`, "PUT", { ...partnerInput, blurbEn: "Updated blurb." }),
      { params: Promise.resolve({ id: partner.id }) },
    );
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as { partner: OrgPartner }).partner.blurbEn).toBe("Updated blurb.");
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeAuditLog).mock.calls.every((call) => call[0].eventType === "ORG_PARTNER_SAVED")).toBe(true);
  });

  it("validates the create payload: logo must live under /partners/", async () => {
    const badLogo = await CREATE_PARTNER(
      adminRequest("/api/admin/org/partners", "POST", { ...partnerInput, logoPath: "https://cdn.example.invalid/logo.svg" }),
    );
    expect(badLogo.status).toBe(400);
    const badUrl = await CREATE_PARTNER(
      adminRequest("/api/admin/org/partners", "POST", { ...partnerInput, url: "not a url" }),
    );
    expect(badUrl.status).toBe(400);
    const okLogo = await CREATE_PARTNER(
      adminRequest("/api/admin/org/partners", "POST", { ...partnerInput, logoPath: "/partners/sahyog.svg" }),
    );
    expect(okLogo.status).toBe(201);
  });

  it("toggles visibility and lists public partners only", async () => {
    const created = await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", partnerInput));
    const { partner } = (await created.json()) as { partner: OrgPartner };
    await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", { ...partnerInput, name: "Second Trust", type: "LEGAL" }));

    const shown = await PUT_PARTNER(adminRequest(`/api/admin/org/partners/${partner.id}`, "PUT", { isPublic: true }), {
      params: Promise.resolve({ id: partner.id }),
    });
    expect(shown.status).toBe(200);
    expect(((await shown.json()) as { partner: OrgPartner }).partner.isPublic).toBe(true);
    expect(vi.mocked(writeAuditLog).mock.calls.some((call) => call[0].eventType === "ORG_PARTNER_VISIBILITY_CHANGED")).toBe(true);

    const list = await LIST_PARTNERS();
    const { partners } = (await list.json()) as { partners: OrgPartner[] };
    expect(partners).toHaveLength(2); // the admin list shows all
    // listPublicOrgPartners drives the public pages:
    expect((await listPublicOrgPartners()).map((entry) => entry.name)).toEqual(["Sahyog Trust"]);
  });

  it("reorders the whole list in one request and refuses unknown ids", async () => {
    const first = (await (await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", partnerInput))).json()) as {
      partner: OrgPartner;
    };
    const second = (
      await (await CREATE_PARTNER(adminRequest("/api/admin/org/partners", "POST", { ...partnerInput, name: "Second Trust" })))
        .json()
    ) as { partner: OrgPartner };

    const reorder = await REORDER_PARTNERS(
      adminRequest("/api/admin/org/partners/reorder", "POST", { ids: [second.partner.id, first.partner.id] }),
    );
    expect(reorder.status).toBe(200);
    expect(vi.mocked(writeAuditLog).mock.calls.some((call) => call[0].eventType === "ORG_PARTNER_REORDERED")).toBe(true);
    const inOrder = await listOrgPartnersForAdmin();
    expect(inOrder.map((entry) => entry.name)).toEqual(["Second Trust", "Sahyog Trust"]);
    expect(inOrder.map((entry) => entry.sortOrder)).toEqual([1, 2]);

    const unknown = await REORDER_PARTNERS(
      adminRequest("/api/admin/org/partners/reorder", "POST", { ids: ["missing-id"] }),
    );
    expect(unknown.status).toBe(404);
  });
});

// ─── The Supporters strip (57.3) ────────────────────────────────────────────

describe("the Supporters strip", () => {
  it("keeps its current behaviour with no public partners", () => {
    const entries = resolveSupporterStrip([]);
    expect(entries.map((entry) => entry.name)).toEqual(["Cloudflare", "Sarvam"]);
    expect(entries[0]).toMatchObject({ href: "https://www.cloudflare.com", src: "/images/supporters/cloudflare.svg" });
  });

  it("shows public partners instead when there are any", () => {
    const partner: OrgPartner = {
      id: "p1",
      name: "Sahyog Trust",
      type: "NGO",
      logoPath: "/partners/sahyog.svg",
      url: "https://sahyog.example.invalid",
      blurbEn: "A helpline.",
      blurbHi: null,
      isPublic: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const entries = resolveSupporterStrip([partner]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "Sahyog Trust",
      href: "https://sahyog.example.invalid",
      src: "/partners/sahyog.svg",
    });
    // A partner without a logo or url still renders, as a name.
    const plain = resolveSupporterStrip([{ ...partner, id: "p2", logoPath: null, url: null }]);
    expect(plain[0]).toEqual({ name: "Sahyog Trust", size: "h-8" });
  });
});

// ─── The trusted-flagger page reads its deadline from the constant ──────────

describe("trusted-flagger page deadlines", () => {
  it("states the removal deadline the escalation ladder actually uses", () => {
    expect(PLATFORM_DEADLINE_TEXT).toContain(`${PLATFORM_DEADLINE_HOURS} hours`);
    expect(PLATFORM_DEADLINE_TEXT).not.toContain(`${PLATFORM_DEADLINE_HOURS + 1} hours`);
  });

  it("states the follow-up window the escalation engine actually uses", () => {
    expect(PLATFORM_FOLLOW_UP_TEXT).toContain(`${ESCALATION_HOURS[1]} hours`);
  });
});
