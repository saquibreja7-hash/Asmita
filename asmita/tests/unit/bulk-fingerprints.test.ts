import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP145 (review-console-spec.md): the bulk fingerprints route on the memory
// backend, through the real dev hash store and the console's real
// FINGERPRINT adapter. What the spec makes the real test: the confirmed
// count must name the run exactly, fifty is the cap, every item still goes
// through the existing review function (a decided fingerprint answers the
// existing function's own refusal), one ReviewDecision closes each open
// job, the summary audit event is ADMIN_BULK_ACTION alongside the existing
// per-item HASH_APPROVED events, a run over ten items needs a fresh
// authenticator proof, and dispatch is never a bulk action. Invented ids
// only; a fingerprint is a 64-hex string, never an image.

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
import { addHashesToCase, listHashesForCase, resetMemoryHashStore } from "@/lib/hash-submission";
import { resetReviewMemory, reviewMemory } from "@/lib/review-jobs";
import { inMemoryAuditLog } from "@/lib/audit";
import { POST as bulkFingerprintsRoute } from "@/app/api/admin/bulk/fingerprints/route";

const OWNER = "bulk-fp-owner@example.test";
const OWNER_HASH = hashEmail(OWNER);
const MINUTE = 60_000;

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA", "ENABLE_HASH_UPLOAD"];

function request(body: unknown) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/bulk/fingerprints", {
    method: "POST",
    headers: {
      cookie: `asmita_admin_session=${authCookie.token}; asmita_csrf=${csrf.nonce}`,
      "x-csrf-token": csrf.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Invented fingerprints on one invented case; the enqueue hook opens their jobs. */
async function seedHashes(count: number) {
  const record = await createCase("user-fp-1");
  const items = Array.from({ length: count }, (_, index) => ({
    hash: `${"ab".repeat(31)}${String(index % 10)}${index > 9 ? "c" : "d"}`,
    quality: 60 + (index % 20),
  }));
  // One submission carries at most ten fingerprints (the existing cap).
  const hashIds: string[] = [];
  for (let start = 0; start < items.length; start += 10) {
    const results = await addHashesToCase(record.id, items.slice(start, start + 10));
    hashIds.push(...results.filter((result) => result.ok).map((result) => result.submission.id));
  }
  return { caseId: record.id, hashIds };
}

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  delete process.env.DEV_SKIP_ADMIN_MFA;
  process.env.ADMIN_EMAILS = OWNER;
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN`;
  process.env.ENABLE_HASH_UPLOAD = "true";
  authCookie.token = "";
  resetReviewMemory();
  resetMemoryHashStore();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

beforeEach(async () => {
  // The acting admin holds a confirmed enrolment, like a real one.
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

async function signIn(mfaAt?: number) {
  authCookie.token = await signAdminSession({
    sub: "admin-fp-owner",
    emailHash: OWNER_HASH,
    adminRole: "SUPER_ADMIN",
    mfaComplete: true,
    mfaAt: mfaAt ?? stepUpNow(),
  });
}

describe("POST /api/admin/bulk/fingerprints", () => {
  it("approves every item through the existing function, closes each job with a ReviewDecision, and writes one summary event", async () => {
    const seeded = await seedHashes(3);
    await signIn();

    const response = await bulkFingerprintsRoute(request({ decision: "approve", hashIds: seeded.hashIds, confirmedCount: 3 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ decision: "approve", succeeded: 3, failed: 0 });
    expect(body.results).toHaveLength(3);

    // The existing function decided every row; nothing waits any more.
    const rows = await listHashesForCase(seeded.caseId);
    expect(rows.map((row) => row.status)).toEqual(["APPROVED", "APPROVED", "APPROVED"]);

    // One ReviewDecision per item, each closing its open job.
    const memory = reviewMemory();
    const decisions = [...memory.decisions.values()];
    expect(decisions).toHaveLength(3);
    expect(decisions.every((decision) => decision.decision === "approve" && decision.reviewerEmailHash === OWNER_HASH)).toBe(true);
    for (const decision of decisions) {
      const job = memory.jobs.get(decision.jobId);
      expect(job?.status).toBe("CLOSED");
      expect(job?.closedReason).toBe("approve");
    }
    expect([...memory.jobs.values()].filter((job) => job.status === "PENDING")).toHaveLength(0);

    // The existing per-item events, plus exactly one ADMIN_BULK_ACTION.
    const bulk = inMemoryAuditLog.filter((event) => event.eventType === "ADMIN_BULK_ACTION");
    expect(bulk).toHaveLength(1);
    expect(bulk[0]!.data).toEqual({
      action: "bulk_fingerprint_review",
      decision: "approve",
      requested: 3,
      succeeded: 3,
      failed: 0,
    });
    expect(inMemoryAuditLog.filter((event) => event.eventType === "HASH_APPROVED")).toHaveLength(3);
  });

  it("refuses a confirmed count that does not name the run, before anything runs", async () => {
    const seeded = await seedHashes(2);
    await signIn();

    const response = await bulkFingerprintsRoute(request({ decision: "reject", hashIds: seeded.hashIds, confirmedCount: 5 }));
    expect(await response.json()).toEqual({ error: "count_not_confirmed" });

    const rows = await listHashesForCase(seeded.caseId);
    expect(rows.every((row) => row.status === "PENDING_REVIEW")).toBe(true);
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);
    expect(inMemoryAuditLog.filter((event) => event.eventType === "ADMIN_BULK_ACTION")).toHaveLength(0);
  });

  it("caps a run at fifty and never dispatches: only approve and reject exist", async () => {
    await signIn();
    const tooMany = Array.from({ length: 51 }, (_, index) => `hash-${index}`);
    expect((await bulkFingerprintsRoute(request({ decision: "approve", hashIds: tooMany, confirmedCount: 51 }))).status).toBe(400);

    // Dispatch is not a bulk action: the schema has no such decision.
    const dispatch = await bulkFingerprintsRoute(request({ decision: "dispatch", hashIds: ["h1"], confirmedCount: 1 }));
    expect(dispatch.status).toBe(400);
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);
  });

  it("reports per-item failures from the existing function and never re-decides", async () => {
    const seeded = await seedHashes(2);
    await signIn();

    // One item is decided first, exactly as a colleague could have.
    const first = await bulkFingerprintsRoute(request({ decision: "reject", hashIds: [seeded.hashIds[0]!], confirmedCount: 1 }));
    expect(first.status).toBe(200);

    // The same item in a bigger run answers the existing function's own
    // refusal; the other item still decides.
    const second = await bulkFingerprintsRoute(request({ decision: "reject", hashIds: seeded.hashIds, confirmedCount: 2 }));
    const body = await second.json();
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results[0]).toMatchObject({ ok: false, error: "hash_submission_already_reviewed" });
    expect(body.results[1]).toMatchObject({ ok: true });
    // Failures first.
    expect(body.results[0]!.ok).toBe(false);

    const rows = await listHashesForCase(seeded.caseId);
    expect(rows.map((row) => row.status)).toEqual(["REJECTED", "REJECTED"]);
  });

  it("needs a fresh authenticator proof above ten items", async () => {
    const seeded = await seedHashes(11);
    const ids = seeded.hashIds.slice(0, 11);

    // A proof half an hour old: outside the fifteen-minute window.
    await signIn(stepUpNow(new Date(Date.now() - 30 * MINUTE)));
    const refused = await bulkFingerprintsRoute(request({ decision: "approve", hashIds: ids, confirmedCount: 11 }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "mfa_step_up_required" });
    expect((await listHashesForCase(seeded.caseId)).every((row) => row.status === "PENDING_REVIEW")).toBe(true);
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);

    // A fresh proof lets the run through.
    await signIn();
    const allowed = await bulkFingerprintsRoute(request({ decision: "approve", hashIds: ids, confirmedCount: 11 }));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).succeeded).toBe(11);
  });

  it("answers not found when fingerprint intake is off, like the single routes", async () => {
    delete process.env.ENABLE_HASH_UPLOAD;
    await signIn();
    const response = await bulkFingerprintsRoute(request({ decision: "approve", hashIds: ["h1"], confirmedCount: 1 }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
