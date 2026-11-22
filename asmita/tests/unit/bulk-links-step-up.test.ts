import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP144: the bulk flagged-link decision needs a fresh authenticator proof
// once it covers more than ten items (review-console-spec.md). The route's
// own per-item review, its audit events and its 50-item cap are covered by
// tests/unit/bulk-links.test.ts; this file pins the new gate only. Since
// WP145 gave the route its memory-backend path, the gate is pinned against
// the real dev store instead of a mocked lookup. Placeholder ids
// throughout; no survivor data is involved.

const authCookie = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

import { signAdminSession } from "@/lib/auth/jwt";
import { stepUpNow } from "@/lib/auth/step-up";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { hashEmail } from "@/lib/hash";
import { createCsrfPair } from "@/lib/csrf";
import { createCase } from "@/lib/store";
import { addUrlsToCase, cases } from "@/lib/store";
import { resetReviewMemory, reviewMemory, syncReviewJobs } from "@/lib/review-jobs";
import { POST as bulkLinksRoute } from "@/app/api/admin/bulk/links/route";

const NOW = new Date("2026-11-22T12:00:00Z");

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
      cookie: `asmita_admin_session=${authCookie.token}; asmita_csrf=${csrf.nonce}`,
      "x-csrf-token": csrf.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Flagged links on invented hosts, so the reject path decides them all. */
async function seedFlaggedLinks(count: number) {
  const record = await createCase("user-stepup");
  const urls = Array.from({ length: count }, (_, index) => `https://stepup-${index}.example.test/post/1`);
  const results = await addUrlsToCase(record.id, urls, { flagReasons: ["many_unrelated_domains"] });
  const urlIds = results.filter((result) => result.ok).map((result) => result.url.id);
  if (urlIds.length !== count) throw new Error("expected every invented link to be flagged");
  // The memory store's addUrlsToCase has no enqueue hook (the hook lives in
  // the database path), so the sync opens the console's jobs here.
  await syncReviewJobs(NOW);
  return urlIds;
}

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  delete process.env.DEV_SKIP_ADMIN_MFA;
  process.env.ADMIN_EMAILS = OWNER;
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN`;
  authCookie.token = "";
  resetReviewMemory();
  cases.clear();
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
    const urlIds = await seedFlaggedLinks(11);

    // A proof half an hour old: outside the 15-minute window.
    authCookie.token = await signAdminSession({
      sub: "admin-owner",
      emailHash: OWNER_HASH,
      adminRole: "SUPER_ADMIN",
      mfaComplete: true,
      mfaAt: stepUpNow(new Date(Date.now() - 30 * MINUTE)),
    });

    const eleven = await bulkLinksRoute(request({ decision: "reject", urlIds, confirmedCount: 11, reason: "Bulk check" }));
    expect(eleven.status).toBe(403);
    expect(await eleven.json()).toEqual({ error: "mfa_step_up_required" });
    // The per-item work never ran.
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);

    // Ten items stay on the ordinary session; the route proceeds and
    // decides every one of them.
    const ten = await bulkLinksRoute(request({ decision: "reject", urlIds: urlIds.slice(0, 10), confirmedCount: 10, reason: "Bulk check" }));
    expect(ten.status).toBe(200);
    const body = await ten.json();
    expect(body.succeeded).toBe(10);
    expect([...reviewMemory().decisions.values()]).toHaveLength(10);
  });

  it("lets eleven items through once the proof is fresh", async () => {
    const urlIds = await seedFlaggedLinks(11);
    authCookie.token = await signAdminSession({
      sub: "admin-owner",
      emailHash: OWNER_HASH,
      adminRole: "SUPER_ADMIN",
      mfaComplete: true,
      mfaAt: stepUpNow(),
    });
    const response = await bulkLinksRoute(request({ decision: "reject", urlIds, confirmedCount: 11, reason: "Bulk check" }));
    expect(response.status).toBe(200);
    expect((await response.json()).succeeded).toBe(11);
  });
});
