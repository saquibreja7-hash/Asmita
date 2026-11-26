import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authCookie = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session" ? { value: authCookie.token } : undefined }),
}));

const dbMock = vi.hoisted(() => ({
  noticeTemplate: { findUnique: vi.fn(), update: vi.fn() },
  // require-admin checks the admin is still enrolled.
  adminMfaSecret: { findUnique: vi.fn(async () => ({ enrolledAt: new Date(), confirmedAt: new Date() })) },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

const auditMock = vi.hoisted(() => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/audit", () => auditMock);

const consoleAdminMock = vi.hoisted(() => ({ role: null as string | null }));
vi.mock("@/lib/auth/console-admins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/console-admins")>()),
  getConsoleAdmin: vi.fn(async () => (consoleAdminMock.role ? { role: consoleAdminMock.role } : null)),
}));

import { signAdminSession } from "@/lib/auth/jwt";
import { createCsrfPair } from "@/lib/csrf";
import { hashEmail } from "@/lib/hash";
import { POST } from "@/app/api/admin/templates/[templateId]/legal-review/route";

const LEGAL = "legal-review-legal@example.invalid";
const REVIEWER = "legal-review-reviewer@example.invalid";
const params = { params: Promise.resolve({ templateId: "tpl-1" }) };

function request(body: unknown) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/templates/tpl-1/legal-review", {
    method: "POST",
    headers: { cookie: `asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signIn(email: string, role: "LEGAL_ADVISOR" | "CASE_REVIEWER" | "SUPER_ADMIN", mfaAt?: number) {
  authCookie.token = await signAdminSession({
    sub: `synthetic-${role}`,
    emailHash: hashEmail(email),
    adminRole: role,
    mfaComplete: true,
    ...(mfaAt !== undefined ? { mfaAt } : {}),
  });
}

const approve = { decision: "approve", reviewerName: "Synthetic Reviewer", confirmedReadFullText: true };

describe("POST /api/admin/templates/[id]/legal-review", () => {
  const saved: Record<string, string | undefined> = {};
  const names = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA"];

  beforeEach(() => {
    for (const name of names) saved[name] = process.env[name];
    process.env.DATABASE_URL = "postgresql://synthetic.invalid/db";
    delete process.env.DEV_SKIP_ADMIN_MFA;
    process.env.ADMIN_EMAILS = [LEGAL, REVIEWER].join(",");
    process.env.ADMIN_ROLES = `${LEGAL}=LEGAL_ADVISOR,${REVIEWER}=CASE_REVIEWER`;
    dbMock.noticeTemplate.findUnique.mockResolvedValue({ id: "tpl-1", templateType: "WATCH_AUTHORISATION", version: 1, reviewedByLegal: false });
    dbMock.noticeTemplate.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      reviewedByLegal: data.reviewedByLegal, reviewedAt: data.reviewedAt ?? null, reviewedByName: data.reviewedByName ?? null,
    }));
  });

  afterEach(() => {
    dbMock.noticeTemplate.findUnique.mockReset();
    dbMock.noticeTemplate.update.mockReset();
    auditMock.writeAuditLog.mockReset();
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("refuses a role without templates:activate", async () => {
    await signIn(REVIEWER, "CASE_REVIEWER", Math.floor(Date.now() / 1000));
    const response = await POST(request(approve), params);
    expect(response.status).toBe(403);
    expect(dbMock.noticeTemplate.update).not.toHaveBeenCalled();
  });

  it("refuses a super admin added from the console, who is not an owner", async () => {
    consoleAdminMock.role = "SUPER_ADMIN";
    try {
      await signIn("legal-review-console@example.invalid", "SUPER_ADMIN", Math.floor(Date.now() / 1000));
      const response = await POST(request(approve), params);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "legal_reviewer_required" });
      expect(dbMock.noticeTemplate.update).not.toHaveBeenCalled();
    } finally {
      consoleAdminMock.role = null;
    }
  });

  it("needs a fresh authenticator proof", async () => {
    await signIn(LEGAL, "LEGAL_ADVISOR");
    const response = await POST(request(approve), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfa_step_up_required" });
    expect(dbMock.noticeTemplate.update).not.toHaveBeenCalled();
  });

  it("needs the reviewer's name and an explicit read-the-full-text confirmation", async () => {
    await signIn(LEGAL, "LEGAL_ADVISOR", Math.floor(Date.now() / 1000));
    const response = await POST(request({ ...approve, confirmedReadFullText: false }), params);
    expect(response.status).toBe(400);
    expect(dbMock.noticeTemplate.update).not.toHaveBeenCalled();
  });

  it("records the review with the reviewer's name and audits it", async () => {
    await signIn(LEGAL, "LEGAL_ADVISOR", Math.floor(Date.now() / 1000));
    const response = await POST(request(approve), params);
    expect(response.status).toBe(200);
    const data = dbMock.noticeTemplate.update.mock.calls[0][0].data;
    expect(data.reviewedByLegal).toBe(true);
    expect(data.reviewedByName).toBe("Synthetic Reviewer");
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "NoticeTemplate",
      entityId: "tpl-1",
      data: expect.objectContaining({ action: "TEMPLATE_LEGAL_REVIEW_RECORDED", version: 1 }),
    }));
  });

  it("withdraws a recorded review", async () => {
    await signIn(LEGAL, "LEGAL_ADVISOR", Math.floor(Date.now() / 1000));
    dbMock.noticeTemplate.findUnique.mockResolvedValue({ id: "tpl-1", templateType: "WATCH_AUTHORISATION", version: 1, reviewedByLegal: true });
    const response = await POST(request({ ...approve, decision: "withdraw" }), params);
    expect(response.status).toBe(200);
    expect(dbMock.noticeTemplate.update.mock.calls[0][0].data).toEqual({ reviewedByLegal: false, reviewedAt: null, reviewedByName: null });
  });
});
