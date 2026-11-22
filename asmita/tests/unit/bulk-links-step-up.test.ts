import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP144: the bulk flagged-link decision needs a fresh authenticator proof
// once it covers more than ten items (review-console-spec.md). The route's
// own per-item review, its audit events and its 50-item cap are covered by
// the flagged-link tests; this file pins the new gate only. Placeholder
// ids throughout; no survivor data is involved.

const authCookie = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

const db = vi.hoisted(() => ({ submittedUrl: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { signAdminSession } from "@/lib/auth/jwt";
import { stepUpNow } from "@/lib/auth/step-up";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { hashEmail } from "@/lib/hash";
import { createCsrfPair } from "@/lib/csrf";
import { POST as bulkLinksRoute } from "@/app/api/admin/bulk/links/route";

const OWNER = "bulk-owner@example.test";
const OWNER_HASH = hashEmail(OWNER);
const MINUTE = 60_000;

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA"];

function request(body: unknown) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/bulk/links", {
    method: "POST",
    headers: {
      cookie: `asmita_csrf=${csrf.nonce}; asmita_admin_session=${authCookie.token}`,
      "x-csrf-token": csrf.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  delete process.env.DEV_SKIP_ADMIN_MFA;
  process.env.ADMIN_EMAILS = OWNER;
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN`;
  db.submittedUrl.findMany.mockReset().mockResolvedValue([]);
  authCookie.token = "";
});

beforeEach(async () => {
  // The acting admin holds a confirmed enrolment, like a real one; a session
  // whose enrolment is gone is refused by requireAdmin before step-up runs.
  const secret = await enrolAdminMfa(OWNER_HASH);
  if (secret) await confirmAdminMfa(OWNER_HASH, generateTotp(secret));
});

afterEach(async () => {
  await resetAdminMfa(OWNER_HASH);
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("bulk decisions over ten items need step-up MFA", () => {
  it("refuses eleven items on a stale proof and lets ten through", async () => {
    // A proof half an hour old: outside the 15-minute window.
    authCookie.token = await signAdminSession({
      sub: "admin-owner",
      emailHash: OWNER_HASH,
      adminRole: "SUPER_ADMIN",
      mfaComplete: true,
      mfaAt: stepUpNow(new Date(Date.now() - 30 * MINUTE)),
    });
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `url-${index}`);

    const eleven = await bulkLinksRoute(request({ decision: "approve", urlIds: ids(11) }));
    expect(eleven.status).toBe(403);
    expect(await eleven.json()).toEqual({ error: "mfa_step_up_required" });
    // The per-item work never ran.
    expect(db.submittedUrl.findMany).not.toHaveBeenCalled();

    // Ten items stay on the ordinary session; the route proceeds to the
    // (mocked) lookup and reports every item as not found.
    const ten = await bulkLinksRoute(request({ decision: "approve", urlIds: ids(10) }));
    expect(ten.status).toBe(200);
    expect(db.submittedUrl.findMany).toHaveBeenCalled();
  });

  it("lets eleven items through once the proof is fresh", async () => {
    authCookie.token = await signAdminSession({
      sub: "admin-owner",
      emailHash: OWNER_HASH,
      adminRole: "SUPER_ADMIN",
      mfaComplete: true,
      mfaAt: stepUpNow(),
    });
    const ids = Array.from({ length: 11 }, (_, index) => `url-${index}`);
    const response = await bulkLinksRoute(request({ decision: "approve", urlIds: ids }));
    expect(response.status).toBe(200);
  });
});
