import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP145 (review-console-spec.md): the bulk flagged-links route on the memory
// backend, through the real dev store and the real review function. What
// the spec makes the real test: the confirmed count must name the run
// exactly, fifty is the cap, the survivor-visible rejection reason is
// required and reaches every link, links no longer waiting answer the
// existing function's own refusal (never re-decided), failures are listed
// first, one ADMIN_BULK_ACTION summary event is written beside the existing
// per-item events, one ReviewDecision closes each item's console job, and a
// run over ten items needs a fresh authenticator proof. Invented hosts
// only; the reject reason below is invented text.

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
import { inMemoryAuditLog } from "@/lib/audit";
import { ensureSystemQueues, getReviewQueueByKey, resetReviewMemory, reviewMemory, syncReviewJobs } from "@/lib/review-jobs";
import { MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { POST as bulkLinksRoute } from "@/app/api/admin/bulk/links/route";

const NOW = new Date("2026-11-22T12:00:00Z");

const OWNER = "bulk-owner@example.test";
const AGENT = "bulk-agent@example.test";
const OWNER_HASH = hashEmail(OWNER);
const MINUTE = 60_000;

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES", "DEV_SKIP_ADMIN_MFA"];

function request(body: unknown, withCsrf = true) {
  const csrf = createCsrfPair();
  return new Request("https://asmita.test/api/admin/bulk/links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withCsrf
        ? { cookie: `asmita_admin_session=${authCookie.token}; asmita_csrf=${csrf.nonce}`, "x-csrf-token": csrf.token }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

/** One of her cases with flagged links: invented hosts reject, the seeded platform approves. */
async function seedFlaggedLinks(count: number, label: string, domain: string) {
  const record = await createCase(`user-${label}`);
  const urls = Array.from({ length: count }, (_, index) => `https://${domain}/post/${label}-${index}`);
  const results = await addUrlsToCase(record.id, urls, { flagReasons: ["many_unrelated_domains"] });
  const urlIds = results.filter((result) => result.ok).map((result) => result.url.id);
  if (urlIds.length !== count) throw new Error("expected every invented link to be flagged");
  // The memory store's addUrlsToCase has no enqueue hook (the hook lives in
  // the database path), so the sync opens the console's jobs here.
  await syncReviewJobs(NOW);
  return { caseId: record.id, urlIds };
}

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  delete process.env.DEV_SKIP_ADMIN_MFA;
  process.env.ADMIN_EMAILS = `${OWNER},${AGENT}`;
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN,${AGENT}=SUPPORT_AGENT`;
  authCookie.token = "";
  resetReviewMemory();
  cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

beforeEach(async () => {
  // The acting admins hold confirmed enrolments, like real ones.
  for (const hash of [OWNER_HASH, hashEmail(AGENT)]) {
    const secret = await enrolAdminMfa(hash);
    if (secret) await confirmAdminMfa(hash, generateTotp(secret));
  }
});

afterEach(async () => {
  await resetAdminMfa(OWNER_HASH);
  await resetAdminMfa(hashEmail(AGENT));
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

async function signIn(role: "SUPER_ADMIN" | "SUPPORT_AGENT" = "SUPER_ADMIN", mfaAt?: number) {
  authCookie.token = await signAdminSession({
    sub: role === "SUPER_ADMIN" ? "admin-bulk-owner" : "admin-bulk-agent",
    emailHash: role === "SUPER_ADMIN" ? OWNER_HASH : hashEmail(AGENT),
    adminRole: role,
    mfaComplete: true,
    mfaAt: mfaAt ?? stepUpNow(),
  });
}

describe("POST /api/admin/bulk/links", () => {
  it("needs CSRF and the review permission", async () => {
    await signIn();
    expect((await bulkLinksRoute(request({ decision: "approve", urlIds: ["u1"], confirmedCount: 1 }, false))).status).toBe(403);

    await signIn("SUPPORT_AGENT");
    const response = await bulkLinksRoute(request({ decision: "approve", urlIds: ["u1"], confirmedCount: 1 }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "permission_denied" });
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);
  });

  it("needs a reason to reject and caps a run at 50", async () => {
    await signIn();
    expect(await (await bulkLinksRoute(request({ decision: "reject", urlIds: ["u1"], confirmedCount: 1 }))).json()).toEqual({ error: "reason_required" });
    expect(await (await bulkLinksRoute(request({ decision: "reject", urlIds: ["u1"], confirmedCount: 1, reason: "  " }))).json()).toEqual({ error: "reason_required" });
    const tooMany = Array.from({ length: 51 }, (_, index) => `u${index}`);
    expect((await bulkLinksRoute(request({ decision: "approve", urlIds: tooMany, confirmedCount: 51 }))).status).toBe(400);
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);
  });

  it("refuses a confirmed count that does not name the run (WP145), before anything runs", async () => {
    await signIn();
    const seeded = await seedFlaggedLinks(2, "count", "count-host.example.test");
    const response = await bulkLinksRoute(request({ decision: "approve", urlIds: seeded.urlIds, confirmedCount: 5 }));
    expect(await response.json()).toEqual({ error: "count_not_confirmed" });

    const memory = reviewMemory();
    for (const urlId of seeded.urlIds) {
      const job = [...memory.jobs.values()].find((item) => item.subjectId === urlId);
      expect(job?.status).toBe("PENDING");
    }
    expect([...memory.decisions.values()]).toHaveLength(0);
    expect(inMemoryAuditLog.filter((event) => event.eventType === "ADMIN_BULK_ACTION")).toHaveLength(0);
  });

  it("reviews only links still waiting, each on its own, reports failures first, and closes each job with a ReviewDecision", async () => {
    await signIn();
    const seeded = await seedFlaggedLinks(2, "run", "youtube.com");
    // One link is decided by hand first, exactly as a colleague could have.
    const { reviewSubmittedUrl } = await import("@/lib/case-ops");
    await reviewSubmittedUrl({ caseId: seeded.caseId, urlId: seeded.urlIds[0]!, decision: "reject", reviewerId: "admin-2" });

    const response = await bulkLinksRoute(
      request({ decision: "approve", urlIds: [...seeded.urlIds, "url-missing"], confirmedCount: 3 }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(2);
    // Failures first, in the order the run met them.
    expect(body.results).toEqual([
      { urlId: seeded.urlIds[0]!, ok: false, error: "not_awaiting_review" },
      { urlId: "url-missing", ok: false, error: "url_not_found" },
      { urlId: seeded.urlIds[1]!, ok: true },
    ]);

    // One ReviewDecision for the decided item, closing its job.
    const memory = reviewMemory();
    const decisions = [...memory.decisions.values()].filter((decision) => decision.decision === "approve");
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.reviewerEmailHash).toBe(OWNER_HASH);
    const job = memory.jobs.get(decisions[0]!.jobId);
    expect(job?.status).toBe("CLOSED");
    expect(job?.closedReason).toBe("approve");

    // The summary event, beside the existing per-item events.
    const bulk = inMemoryAuditLog.filter((event) => event.eventType === "ADMIN_BULK_ACTION");
    expect(bulk).toHaveLength(1);
    expect(bulk[0]!.data).toEqual({
      action: "bulk_link_review",
      decision: "approve",
      requested: 3,
      succeeded: 1,
      failed: 2,
    });
  });

  it("never decides a link held in minor-hold, even for a SUPER_ADMIN", async () => {
    await signIn();
    const seeded = await seedFlaggedLinks(1, "held", "youtube.com");
    await ensureSystemQueues();
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === seeded.urlIds[0]);
    job!.queueId = minorHold!.id;

    const response = await bulkLinksRoute(request({ decision: "approve", urlIds: seeded.urlIds, confirmedCount: 1 }));
    const body = await response.json();
    expect(body.results).toEqual([{ urlId: seeded.urlIds[0]!, ok: false, error: "minor_hold" }]);
    const link = cases.get(seeded.caseId)!.urls.find((url) => url.id === seeded.urlIds[0]);
    expect(link?.status).not.toBe("NOTICE_QUEUED");
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);
  });

  it("passes the rejection reason to every link", async () => {
    await signIn();
    const seeded = await seedFlaggedLinks(2, "reason", "reason-host.example.test");
    await bulkLinksRoute(request({ decision: "reject", urlIds: seeded.urlIds, confirmedCount: 2, reason: "Not the survivor's content" }));

    const record = cases.get(seeded.caseId)!;
    const reasons = record.urls
      .filter((url) => seeded.urlIds.includes(url.id))
      .map((url) => url.flagReason);
    expect(reasons).toEqual(["Not the survivor's content", "Not the survivor's content"]);
    expect(inMemoryAuditLog.filter((event) => event.eventType === "URL_REJECTED")).toHaveLength(2);
  });

  it("refuses eleven items on a stale authenticator proof and lets ten through", async () => {
    await signIn("SUPER_ADMIN", stepUpNow(new Date(Date.now() - 30 * MINUTE)));
    // Eleven flagged links, each on its own invented host.
    const record = await createCase("user-stepup");
    const urls = Array.from({ length: 11 }, (_, index) => `https://stepup-${index}.example.test/post/1`);
    const seeded = await addUrlsToCase(record.id, urls, { flagReasons: ["many_unrelated_domains"] });
    const urlIds = seeded.filter((result) => result.ok).map((result) => result.url.id);
    if (urlIds.length !== 11) throw new Error("expected every invented link to be flagged");
    await syncReviewJobs(NOW);

    const eleven = await bulkLinksRoute(request({ decision: "reject", urlIds, confirmedCount: 11, reason: "Bulk check" }));
    expect(eleven.status).toBe(403);
    expect(await eleven.json()).toEqual({ error: "mfa_step_up_required" });
    expect([...reviewMemory().decisions.values()]).toHaveLength(0);

    // Ten items stay on the ordinary session.
    const ten = await bulkLinksRoute(request({ decision: "reject", urlIds: urlIds.slice(0, 10), confirmedCount: 10, reason: "Bulk check" }));
    expect(ten.status).toBe(200);
    expect((await ten.json()).succeeded).toBe(10);
  });
});
