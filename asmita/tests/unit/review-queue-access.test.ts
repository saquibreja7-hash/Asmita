import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP144 queue access (review-console-spec.md) on the memory backend. A
// queue with no ReviewQueueAccess rows keeps today's visibility; rows
// narrow it — a reviewer sees the queue only if their role or their own
// email hash is listed. The protected minor-hold queue ignores rows and
// stays SUPER_ADMIN only, so no row can ever widen it. Access is enforced
// in queueSummaries, in claimNextJob, and through the grant/revoke library
// with review:manage. Placeholder hashes and invented hosts throughout.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { hashEmail } from "@/lib/hash";
import { MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { resetReviewAdapters, registerComplaintReviewAdapters } from "@/lib/review-adapters";
import {
  canSeeReviewQueue,
  canSeeReviewQueueWithRows,
  claimNextJob,
  getReviewQueueByKey,
  grantReviewQueueAccess,
  listReviewQueueAccess,
  queueSummaries,
  resetReviewMemory,
  reviewMemory,
  reviewQueueVisibleTo,
  revokeReviewQueueAccess,
  syncReviewJobs,
  visibleReviewQueues,
} from "@/lib/review-jobs";

const NOW = new Date("2026-11-22T12:00:00Z");
const SUPER = "SUPER_ADMIN" as const;
const REVIEWER = "CASE_REVIEWER" as const;

const reviewerA = hashEmail("reviewer-a@example.test");
const reviewerB = hashEmail("reviewer-b@example.test");
const actor = "admin-owner";

async function linksQueue() {
  const queue = await getReviewQueueByKey("links");
  if (!queue) throw new Error("links queue missing");
  return queue;
}

async function seedFlaggedLink(url = "https://forum.example.test/post/1") {
  const record = await createCase("user-1");
  const [result] = await storeAddUrls(record.id, [url], { flagReasons: ["many_unrelated_domains"] });
  if (!result.ok) throw new Error("expected accepted URL");
  return { caseId: record.id, urlId: result.url.id };
}

async function grantOnLinks(target: { role?: typeof SUPER | typeof REVIEWER | "GO_EDITOR" | "LEGAL_ADVISOR"; adminEmailHash?: string }) {
  const queue = await linksQueue();
  return grantReviewQueueAccess({
    queueId: queue.id,
    role: target.role,
    adminEmailHash: target.adminEmailHash,
    callerRole: SUPER,
    actorId: actor,
    now: NOW,
  });
}

function visibleKeys(summaries: Awaited<ReturnType<typeof queueSummaries>>) {
  return summaries.map((queue) => queue.key);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetReviewMemory();
  resetReviewAdapters();
  registerComplaintReviewAdapters();
  cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a queue with no access rows keeps today's behaviour", () => {
  it("shows every role with the adapter's permission, as before", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const reviewerRows = await queueSummaries({ role: REVIEWER, emailHash: reviewerA }, NOW);
    expect(visibleKeys(reviewerRows)).toEqual(["links", "fingerprints", "findings"]);
    const superRows = await queueSummaries({ role: SUPER, emailHash: reviewerB }, NOW);
    expect(superRows.map((row) => row.key)).toContain("minor-hold");
  });
});

describe("rows narrow a queue", () => {
  it("a role row hides the queue from every other role with the permission", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const granted = await grantOnLinks({ role: REVIEWER });
    expect(granted).toMatchObject({ ok: true });

    const reviewerRows = await queueSummaries({ role: REVIEWER, emailHash: reviewerA }, NOW);
    expect(reviewerRows.find((row) => row.key === "links")?.pending).toBe(1);

    // cases:read roles that are not listed no longer see it.
    const legalAdvisor = await queueSummaries({ role: "LEGAL_ADVISOR" as const, emailHash: reviewerB }, NOW);
    expect(legalAdvisor.find((row) => row.key === "links")).toBeUndefined();
    const supportAgent = await queueSummaries({ role: "SUPPORT_AGENT" as const, emailHash: reviewerB }, NOW);
    expect(supportAgent.find((row) => row.key === "links")).toBeUndefined();
    // Other queues are untouched.
    expect(legalAdvisor.find((row) => row.key === "fingerprints")).toBeTruthy();
  });

  it("a person row hides the queue from other reviewers of the same role", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const granted = await grantOnLinks({ adminEmailHash: reviewerA });
    expect(granted).toMatchObject({ ok: true });

    const listed = await queueSummaries({ role: REVIEWER, emailHash: reviewerA }, NOW);
    expect(listed.find((row) => row.key === "links")?.pending).toBe(1);
    const sameRole = await queueSummaries({ role: REVIEWER, emailHash: reviewerB }, NOW);
    expect(sameRole.find((row) => row.key === "links")).toBeUndefined();

    // The pure check agrees, and so does the single-queue helper.
    const queue = await linksQueue();
    expect(await reviewQueueVisibleTo({ role: REVIEWER, emailHash: reviewerA }, queue)).toBe(true);
    expect(await reviewQueueVisibleTo({ role: REVIEWER, emailHash: reviewerB }, queue)).toBe(false);
    const visible = await visibleReviewQueues({ role: REVIEWER, emailHash: reviewerB });
    expect(visible.some((entry) => entry.key === "links")).toBe(false);
  });

  it("role rows and person rows combine: either one is enough", async () => {
    await grantOnLinks({ role: "LEGAL_ADVISOR" as const });
    await grantOnLinks({ adminEmailHash: reviewerA });
    const rows = await listReviewQueueAccess((await linksQueue()).id);
    expect(rows).toHaveLength(2);

    const legalAdvisor = await queueSummaries({ role: "LEGAL_ADVISOR" as const, emailHash: reviewerB }, NOW);
    expect(legalAdvisor.find((row) => row.key === "links")).toBeTruthy();
    const listedReviewer = await queueSummaries({ role: REVIEWER, emailHash: reviewerA }, NOW);
    expect(listedReviewer.find((row) => row.key === "links")).toBeTruthy();
  });

  it("a row never widens a queue to a role without the kind's permission", async () => {
    await grantOnLinks({ role: "GO_EDITOR" as const });
    const goEditor = await queueSummaries({ role: "GO_EDITOR" as const, emailHash: reviewerB }, NOW);
    expect(goEditor.find((row) => row.key === "links")).toBeUndefined();
    expect(await reviewQueueVisibleTo({ role: "GO_EDITOR" as const, emailHash: reviewerB }, await linksQueue())).toBe(false);
  });

  it("revoking the last row returns the queue to today's behaviour", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    await grantOnLinks({ adminEmailHash: reviewerA });
    const rows = await listReviewQueueAccess((await linksQueue()).id);
    const revoked = await revokeReviewQueueAccess({ accessId: rows[0]!.id, callerRole: SUPER, actorId: actor });
    expect(revoked).toMatchObject({ ok: true });
    expect(await listReviewQueueAccess((await linksQueue()).id)).toHaveLength(0);

    const supportAgent = await queueSummaries({ role: "SUPPORT_AGENT" as const, emailHash: reviewerB }, NOW);
    expect(supportAgent.find((row) => row.key === "links")).toBeTruthy();
  });
});

describe("claimNextJob enforces the rows", () => {
  it("refuses a narrowed queue for a reviewer who is not listed, claims for one who is", async () => {
    await seedFlaggedLink();
    await syncReviewJobs(NOW);
    const queue = await linksQueue();
    await grantOnLinks({ adminEmailHash: reviewerA });

    const refused = await claimNextJob({ queueId: queue.id, role: REVIEWER, reviewerEmailHash: reviewerB, now: NOW });
    expect(refused).toEqual({ job: null, claimId: null, refused: "permission_denied" });
    // Nothing was claimed or written.
    expect([...reviewMemory().jobs.values()].every((job) => job.claimedBy === null)).toBe(true);

    const claimed = await claimNextJob({ queueId: queue.id, role: REVIEWER, reviewerEmailHash: reviewerA, now: NOW });
    expect(claimed.job).toBeTruthy();
    expect(claimed.job?.claimedBy).toBe(reviewerA);
  });
});

describe("minor-hold ignores rows and stays SUPER_ADMIN only", () => {
  it("refuses to create rows for the protected queue and ignores invented ones", async () => {
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    if (!minorHold) throw new Error("minor-hold queue missing");
    const granted = await grantReviewQueueAccess({
      queueId: minorHold.id,
      role: REVIEWER,
      callerRole: SUPER,
      actorId: actor,
      now: NOW,
    });
    expect(granted).toMatchObject({ ok: false, error: "protected_queue" });
    expect(await listReviewQueueAccess(minorHold.id)).toHaveLength(0);

    // Even a row that somehow existed would be ignored: the check answers
    // SUPER_ADMIN only for the protected queue, whatever the rows say.
    const withInventedRow = canSeeReviewQueueWithRows(
      { role: REVIEWER, emailHash: reviewerA },
      minorHold,
      [{ role: REVIEWER, adminEmailHash: null }],
    );
    expect(withInventedRow).toBe(false);
    expect(canSeeReviewQueue(REVIEWER, minorHold)).toBe(false);
    expect(canSeeReviewQueue(SUPER, minorHold)).toBe(true);
  });
});

describe("the grant and revoke library", () => {
  it("requires review:manage", async () => {
    const queue = await linksQueue();
    const refused = await grantReviewQueueAccess({
      queueId: queue.id,
      role: REVIEWER,
      callerRole: REVIEWER,
      actorId: actor,
      now: NOW,
    });
    expect(refused).toMatchObject({ ok: false, error: "permission_denied" });

    const revoked = await revokeReviewQueueAccess({ accessId: "row-1", callerRole: REVIEWER, actorId: actor });
    expect(revoked).toMatchObject({ ok: false, error: "permission_denied" });
    expect(await listReviewQueueAccess(queue.id)).toHaveLength(0);
  });

  it("demands exactly one target and a hash-shaped admin entry", async () => {
    expect(await grantOnLinks({})).toMatchObject({ ok: false, error: "invalid_target" });
    expect(await grantOnLinks({ role: REVIEWER, adminEmailHash: reviewerA })).toMatchObject({ ok: false, error: "invalid_target" });
    expect(await grantOnLinks({ adminEmailHash: "not-a-hash" })).toMatchObject({ ok: false, error: "invalid_target" });
    expect(await grantOnLinks({ adminEmailHash: "" })).toMatchObject({ ok: false, error: "invalid_target" });
  });

  it("is idempotent: granting the same target twice keeps one row", async () => {
    const first = await grantOnLinks({ role: REVIEWER });
    const second = await grantOnLinks({ role: REVIEWER });
    expect(second).toMatchObject({ ok: true });
    if (first.ok && second.ok) expect(second.row.id).toBe(first.row.id);
    expect(await listReviewQueueAccess((await linksQueue()).id)).toHaveLength(1);
  });

  it("refuses an archived queue and a missing row on revoke", async () => {
    const { createReviewQueue, archiveReviewQueue } = await import("@/lib/review-jobs");
    const created = await createReviewQueue({ name: "Narrowed", subjectKind: "FINGERPRINT", role: SUPER, actorId: actor, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const archived = await archiveReviewQueue({ queueId: created.queue.id, role: SUPER, actorId: actor, now: NOW });
    expect(archived.ok).toBe(true);
    const granted = await grantReviewQueueAccess({
      queueId: created.queue.id,
      role: REVIEWER,
      callerRole: SUPER,
      actorId: actor,
      now: NOW,
    });
    expect(granted).toMatchObject({ ok: false, error: "queue_archived" });

    const revoked = await revokeReviewQueueAccess({ accessId: "row-missing", callerRole: SUPER, actorId: actor });
    expect(revoked).toMatchObject({ ok: false, error: "access_row_not_found" });
  });

  it("audits every change with ids only, and no row ever carries an address", async () => {
    await grantOnLinks({ adminEmailHash: reviewerA });
    const rows = await listReviewQueueAccess((await linksQueue()).id);
    await revokeReviewQueueAccess({ accessId: rows[0]!.id, callerRole: SUPER, actorId: actor });

    const events = inMemoryAuditLog.filter((event) => event.entityType === "ReviewQueueAccess");
    expect(events.map((event) => (event.data as { action?: string }).action)).toEqual(["grant", "revoke"]);
    const serialised = JSON.stringify({ events, rows, memory: reviewMemory().queueAccess });
    expect(serialised).not.toContain("example.test");
    expect(serialised).not.toContain("@");
    expect(serialised).not.toContain("http");
  });
});
