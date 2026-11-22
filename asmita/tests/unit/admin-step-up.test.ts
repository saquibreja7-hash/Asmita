import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP144 step-up MFA (review-console-spec.md): the admin session's mfaAt
// claim, the 15-minute window, the dev bypass only through dev-flags, the
// POST /api/admin/mfa/step-up route (a fresh code from the admin's own
// authenticator re-issues the session), and the same gate on the existing
// MFA reset route — which now also takes an email hash, so the Admins page
// never sends a full address. Invented addresses only.

const authCookie = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

import { signAdminSession, verifyAdminSession } from "@/lib/auth/jwt";
import { STEP_UP_MINUTES, requireStepUp, stepUpFresh, stepUpNow } from "@/lib/auth/step-up";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { hashEmail } from "@/lib/hash";
import { createCsrfPair } from "@/lib/csrf";
import { POST as stepUpRoute } from "@/app/api/admin/mfa/step-up/route";
import { POST as resetMfaRoute } from "@/app/api/admin/mfa/reset/route";

const OWNER = "stepup-owner@example.test";
const OWNER_HASH = hashEmail(OWNER);
const NOW = new Date("2026-11-22T12:00:00Z");
const MINUTE = 60_000;

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA", "NODE_ENV"];

/** The acting admin's authenticator secret, enrolled in beforeEach. */
const ownerSecret = { value: null as string | null };

async function sessionWith(mfaAt: number | undefined) {
  return signAdminSession({
    sub: "admin-owner",
    emailHash: OWNER_HASH,
    adminRole: "SUPER_ADMIN",
    mfaComplete: true,
    ...(mfaAt !== undefined ? { mfaAt } : {}),
  });
}

function request(path: string, body: unknown) {
  const csrf = createCsrfPair();
  return new Request(`https://asmita.test${path}`, {
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
  authCookie.token = "";
});

beforeEach(async () => {
  // The acting admin holds a confirmed enrolment, like a real one; a session
  // whose enrolment is gone is refused by requireAdmin before step-up runs.
  ownerSecret.value = await enrolAdminMfa(OWNER_HASH);
  if (ownerSecret.value) await confirmAdminMfa(OWNER_HASH, generateTotp(ownerSecret.value));
});

afterEach(async () => {
  await resetAdminMfa(OWNER_HASH);
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("the freshness rule", () => {
  it("accepts a proof inside the window, at the boundary, and refuses outside or missing", () => {
    const at = stepUpNow(NOW);
    expect(stepUpFresh({ mfaAt: at }, NOW)).toBe(true);
    expect(stepUpFresh({ mfaAt: at - 1 }, NOW)).toBe(true);
    expect(stepUpFresh({ mfaAt: at - STEP_UP_MINUTES * 60 }, NOW)).toBe(true);
    expect(stepUpFresh({ mfaAt: at - STEP_UP_MINUTES * 60 - 1 }, NOW)).toBe(false);
    expect(stepUpFresh({}, NOW)).toBe(false);
    expect(requireStepUp({ mfaAt: at }, NOW)).toEqual({ ok: true });
    expect(requireStepUp({}, NOW)).toEqual({ ok: false, error: "mfa_step_up_required" });
  });

  it("respects the dev bypass only through dev-flags, and never in production", () => {
    process.env.DEV_SKIP_ADMIN_MFA = "true";
    expect(stepUpFresh({}, NOW)).toBe(true);
    expect(stepUpFresh({}, new Date(NOW.getTime() + 24 * 60 * MINUTE))).toBe(true);

    // The same env var is inert in a production build: dev-flags.ts refuses,
    // and step-up reads the flag only through that module.
    vi.stubEnv("NODE_ENV", "production");
    expect(stepUpFresh({}, NOW)).toBe(false);
    expect(stepUpFresh({ mfaAt: stepUpNow(NOW) }, NOW)).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("POST /api/admin/mfa/step-up", () => {
  it("verifies a fresh code against the admin's own secret and re-issues the session", async () => {
    const secret = ownerSecret.value;
    expect(secret).toBeTruthy();
    authCookie.token = await sessionWith(stepUpNow(new Date(NOW.getTime() - 30 * MINUTE)));

    const wrong = await stepUpRoute(request("/api/admin/mfa/step-up", { token: "000000" }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "invalid_totp" });

    const good = await stepUpRoute(request("/api/admin/mfa/step-up", { token: generateTotp(secret!) }));
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie") ?? "";
    const token = /asmita_admin_session=([^;]+)/.exec(cookie)?.[1];
    expect(token).toBeTruthy();
    const claims = await verifyAdminSession(token);
    expect(claims?.adminRole).toBe("SUPER_ADMIN");
    expect(claims?.mfaComplete).toBe(true);
    // The fresh proof is within the window.
    expect(claims?.mfaAt).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
    expect(stepUpFresh({ mfaAt: claims?.mfaAt })).toBe(true);
  });

  it("refuses a session that is not a complete admin session", async () => {
    authCookie.token = "";
    const response = await stepUpRoute(request("/api/admin/mfa/step-up", { token: "123456" }));
    expect(response.status).toBe(403);
  });
});

describe("the step-up gate on the existing MFA reset route", () => {
  it("refuses a stale proof with the step-up code", async () => {
    authCookie.token = await sessionWith(stepUpNow(new Date(Date.now() - (STEP_UP_MINUTES + 1) * 60_000)));
    const response = await resetMfaRoute(request("/api/admin/mfa/reset", { email: OWNER }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfa_step_up_required" });
  });

  it("issues the enrolment code for a hash-targeted admin once the proof is fresh", async () => {
    authCookie.token = await sessionWith(stepUpNow());
    const response = await resetMfaRoute(request("/api/admin/mfa/reset", { emailHash: OWNER_HASH }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enrolmentCode?: string };
    expect(body.enrolmentCode).toMatch(/^\d{12}$/);
  });

  it("keeps bypassing the gate when the dev flag is on", async () => {
    process.env.DEV_SKIP_ADMIN_MFA = "true";
    authCookie.token = await sessionWith(stepUpNow(new Date(Date.now() - 60 * MINUTE)));
    const response = await resetMfaRoute(request("/api/admin/mfa/reset", { email: OWNER }));
    expect(response.status).toBe(200);
  });

  it("refuses an unknown hash and a body with both targets", async () => {
    authCookie.token = await sessionWith(stepUpNow());
    const unknown = await resetMfaRoute(request("/api/admin/mfa/reset", { emailHash: hashEmail("stranger@example.test") }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "not_an_admin" });
    const both = await resetMfaRoute(request("/api/admin/mfa/reset", { email: OWNER, emailHash: OWNER_HASH }));
    expect(both.status).toBe(400);
    expect(await both.json()).toMatchObject({ error: "invalid_payload" });
  });
});
