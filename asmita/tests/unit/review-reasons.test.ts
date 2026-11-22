import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP142 (review-console-spec.md): the internal review reasons, on the memory
// backend every Asmita module tests first. The seeds are create-only, the
// picker only ever offers active reasons of the decision being taken, and
// decideJob validates the picked code on the server (unknown, inactive,
// wrong-decision codes refused; "Other (explain)" requires its note). A
// reason is never deleted, so a decision keeps its label after the reason
// is deactivated. Invented hosts and placeholder ids throughout.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { decryptField } from "@/lib/encryption";
import { MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import { REASON_OTHER_CODE, SYSTEM_REVIEW_REASONS, reasonRequiresNote } from "@/lib/review-reason-seeds";
import {
  addReviewReason,
  ensureSystemReviewReasons,
  getReviewReasonByCode,
  listReviewReasons,
  moveReviewReason,
  renameReviewReason,
  resetReviewReasonMemory,
  setReviewReasonActive,
} from "@/lib/review-reasons";
import { claimNextJob, decideJob, getReviewQueueByKey, resetReviewMemory, reviewMemory, syncReviewJobs } from "@/lib/review-jobs";
import { listCaseDecisions } from "@/lib/review-views";

const NOW = new Date("2026-11-22T10:00:00Z");
const SUPER = "SUPER_ADMIN" as const;
const REVIEWER = "CASE_REVIEWER" as const;

const LINKS_REJECT_REASONS = SYSTEM_REVIEW_REASONS.filter(
  (reason) => reason.queueKey === "links" && reason.decision === "reject",
);

async function seedFlaggedLink(url = "https://forum.example.test/post/1") {
  const record = await createCase("user-1");
  const [result] = await storeAddUrls(record.id, [url], { flagReasons: ["many_unrelated_domains"] });
  if (!result.ok) throw new Error("expected accepted URL");
  return { caseId: record.id, urlId: result.url.id };
}

/** A claimed links job on the seeded, known-platform link (an invented path on a seeded platform). */
async function claimedLinksJob() {
  const link = await seedFlaggedLink("https://instagram.com/p/example");
  await syncReviewJobs(NOW);
  const queue = await getReviewQueueByKey("links");
  const { job } = await claimNextJob({ queueId: queue!.id, role: "CASE_REVIEWER", reviewerEmailHash: "hash-a", now: NOW });
  if (!job) throw new Error("expected a claimed job");
  return { link, job };
}

async function decide(input: Parameters<typeof decideJob>[0]) {
  return decideJob({ ...input, now: input.now ?? NOW });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetReviewMemory();
  cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the seeded reasons", () => {
  it("seeds exactly the spec's reasons, create-only, idempotently", async () => {
    await ensureSystemReviewReasons();
    await ensureSystemReviewReasons();
    const all = await listReviewReasons("links");
    expect(all).toHaveLength(LINKS_REJECT_REASONS.length);

    // The spec's labels, in pick order.
    expect(all.map((reason) => reason.label)).toEqual([
      "Not a link to the reported content",
      "Duplicate of another link",
      "Platform not covered",
      "Survivor asked to withdraw",
      "Other (explain)",
    ]);
    const fingerprints = await listReviewReasons("fingerprints", "reject");
    expect(fingerprints.map((reason) => reason.label)).toEqual([
      "Low quality",
      "Duplicate",
      "Survivor asked to withdraw",
      "Other (explain)",
    ]);
    // The findings queue's reject-kind decision is "dismiss".
    const dismissals = await listReviewReasons("findings", "dismiss");
    expect(dismissals.map((reason) => reason.label)).toEqual([
      "Not the same image",
      "Already reported",
      "Outside consent scope",
      "Other (explain)",
    ]);
    // Queues the spec names no reasons for have none.
    expect(await listReviewReasons("partners", "decline")).toEqual([]);
    expect(await listReviewReasons("lab-reports")).toEqual([]);
  });

  it("keeps an admin's edits when the reasons are loaded again", async () => {
    await ensureSystemReviewReasons();
    const target = (await listReviewReasons("links", "reject")).find((reason) => reason.code === "duplicate_link")!;
    await renameReviewReason({ reasonId: target.id, label: "Same link twice", role: SUPER, actorId: "admin-1" });
    await setReviewReasonActive({ reasonId: target.id, active: false, role: SUPER, actorId: "admin-1" });

    // Every later read re-ensures first; the edits survive.
    const rows = await listReviewReasons("links", "reject");
    const again = rows.find((reason) => reason.code === "duplicate_link")!;
    expect(again.label).toBe("Same link twice");
    expect(again.active).toBe(false);

    // The create-only contract on the database paths is the upsert with an
    // empty update (asserted in review-jobs-prisma.test.ts, like the queues);
    // on the in-memory dev backend a fresh isolate re-seeds the defaults.
    resetReviewReasonMemory();
    await ensureSystemReviewReasons();
    const fresh = (await listReviewReasons("links", "reject")).find((reason) => reason.code === "duplicate_link")!;
    expect(fresh.label).toBe("Duplicate of another link");
    expect(fresh.active).toBe(true);
  });

  it("hides inactive reasons from the picker list only", async () => {
    await ensureSystemReviewReasons();
    const target = (await listReviewReasons("links", "reject")).find((reason) => reason.code === "duplicate_link")!;
    await setReviewReasonActive({ reasonId: target.id, active: false, role: SUPER, actorId: "admin-1" });

    const active = await listReviewReasons("links", "reject", { activeOnly: true });
    expect(active.some((reason) => reason.code === "duplicate_link")).toBe(false);
    expect(active).toHaveLength(LINKS_REJECT_REASONS.length - 1);
    // The row itself is still readable, so old decisions keep their label.
    const row = await getReviewReasonByCode("links", "reject", "duplicate_link");
    expect(row?.label).toBe("Duplicate of another link");
  });
});

describe("decideJob validates the picked reason on the server", () => {
  it("records a valid reason code, and the note stays optional for it", async () => {
    const { job } = await claimedLinksJob();
    const result = await decide({
      jobId: job.id,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      reasonCode: "not_reported_content",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    const decision = reviewMemory().decisions.get(job.id)!;
    expect(decision.reasonCode).toBe("not_reported_content");
    expect(decision.reasonNote).toBeNull();
    // Internal: the survivor's row keeps its empty flag reason.
    const record = cases.values().next().value!;
    expect(record.urls[0].flagReason ?? null).toBeNull();
  });

  it("refuses an unknown or inactive reason code before anything runs", async () => {
    const { job } = await claimedLinksJob();
    expect(
      await decide({
        jobId: job.id,
        me: "hash-a",
        reviewerId: "admin-1",
        role: REVIEWER,
        decision: "reject",
        reasonCode: "not_the_content",
      }),
    ).toMatchObject({ ok: false, error: "invalid_reason" });

    // A reason of a different decision is as foreign as an invented one.
    expect(
      await decide({
        jobId: job.id,
        me: "hash-a",
        reviewerId: "admin-1",
        role: REVIEWER,
        decision: "reject",
        reasonCode: "low_quality",
      }),
    ).toMatchObject({ ok: false, error: "invalid_reason" });

    const target = (await listReviewReasons("links", "reject")).find((reason) => reason.code === "duplicate_link")!;
    await setReviewReasonActive({ reasonId: target.id, active: false, role: SUPER, actorId: "admin-1" });
    expect(
      await decide({
        jobId: job.id,
        me: "hash-a",
        reviewerId: "admin-1",
        role: REVIEWER,
        decision: "reject",
        reasonCode: "duplicate_link",
      }),
    ).toMatchObject({ ok: false, error: "invalid_reason" });

    // Nothing was decided and the job stays open.
    expect(reviewMemory().jobs.get(job.id)!.status).toBe("PENDING");
  });

  it("requires the note for Other (explain), and stores it encrypted", async () => {
    const { job } = await claimedLinksJob();
    expect(
      await decide({
        jobId: job.id,
        me: "hash-a",
        reviewerId: "admin-1",
        role: REVIEWER,
        decision: "reject",
        reasonCode: REASON_OTHER_CODE,
      }),
    ).toMatchObject({ ok: false, error: "reason_note_required" });

    const result = await decide({
      jobId: job.id,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      reasonCode: REASON_OTHER_CODE,
      reasonNote: "The link points at her public profile, not the reported content.",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    const decision = reviewMemory().decisions.get(job.id)!;
    expect(decision.reasonCode).toBe("other");
    expect(decision.reasonNote).not.toContain("public profile");
    expect(decryptField(decision.reasonNote!)).toBe("The link points at her public profile, not the reported content.");
  });

  it("still accepts a plain note as the reason (WP141 behaviour kept)", async () => {
    const { job } = await claimedLinksJob();
    const result = await decide({
      jobId: job.id,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      reasonNote: "Checked against the case timeline.",
    });
    expect(result).toMatchObject({ ok: true, closed: true });
    const decision = reviewMemory().decisions.get(job.id)!;
    expect(decision.reasonCode).toBeNull();
    expect(decryptField(decision.reasonNote!)).toBe("Checked against the case timeline.");
  });

  it("keeps showing a decision's reason label after the reason is deactivated", async () => {
    const { job, link } = await claimedLinksJob();
    await decide({
      jobId: job.id,
      me: "hash-a",
      reviewerId: "admin-1",
      role: REVIEWER,
      decision: "reject",
      reasonCode: "platform_not_covered",
    });
    const reason = (await listReviewReasons("links", "reject")).find((row) => row.code === "platform_not_covered")!;
    await setReviewReasonActive({ reasonId: reason.id, active: false, role: SUPER, actorId: "admin-1" });

    const rows = await listCaseDecisions(link.caseId, "hash-a");
    expect(rows).toHaveLength(1);
    expect(rows[0].reasonCode).toBe("platform_not_covered");
    expect(rows[0].reasonLabel).toBe("Platform not covered");
  });
});

describe("the SUPER_ADMIN reason controls", () => {
  it("refuses every control for anyone else", async () => {
    await ensureSystemReviewReasons();
    const target = (await listReviewReasons("links", "reject"))[0]!;
    expect(
      await addReviewReason({ queueKey: "links", decision: "reject", code: "new_reason", label: "New", role: REVIEWER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "permission_denied" });
    expect(
      await renameReviewReason({ reasonId: target.id, label: "No", role: REVIEWER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "permission_denied" });
    expect(
      await setReviewReasonActive({ reasonId: target.id, active: false, role: REVIEWER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "permission_denied" });
    expect(
      await moveReviewReason({ reasonId: target.id, direction: "up", role: REVIEWER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "permission_denied" });
    expect(target.active).toBe(true);
  });

  it("adds a reason only for a decision the queue's adapter offers", async () => {
    await ensureSystemReviewReasons();
    expect(
      await addReviewReason({ queueKey: "links", decision: "explode", code: "x", label: "No such decision", role: SUPER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "invalid_decision" });
    expect(
      await addReviewReason({ queueKey: "nope", decision: "reject", code: "x", label: "No such queue", role: SUPER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "queue_not_found" });
    // The protected queue has no decisions at all.
    expect(
      await addReviewReason({ queueKey: MINOR_HOLD_QUEUE_KEY, decision: "approve", code: "x", label: "Never", role: SUPER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "protected_queue" });
    expect(
      await addReviewReason({ queueKey: "links", decision: "reject", code: "Not A Code", label: "Bad code", role: SUPER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "invalid_code" });
    expect(
      await addReviewReason({ queueKey: "links", decision: "reject", code: "duplicate_link", label: "Already there", role: SUPER, actorId: "admin-1" }),
    ).toMatchObject({ ok: false, error: "reason_exists" });

    const added = await addReviewReason({
      queueKey: "links",
      decision: "reject",
      code: "out_of_scope",
      label: "Outside what she reported",
      role: SUPER,
      actorId: "admin-1",
    });
    expect(added).toMatchObject({ ok: true });
    if (added.ok) {
      // A new reason lands after the seeded ones.
      expect(added.reason.sortOrder).toBeGreaterThan(LINKS_REJECT_REASONS.length * 10);
    }
    const active = await listReviewReasons("links", "reject", { activeOnly: true });
    expect(active.at(-1)!.label).toBe("Outside what she reported");
    // The change audited as console config, with the ids only.
    const event = inMemoryAuditLog.at(-1)!;
    expect(event.eventType).toBe("ADMIN_ACTION");
    expect(event.data).toMatchObject({ action: "add", queueKey: "links", decision: "reject", code: "out_of_scope" });
  });

  it("renames, reorders and deactivates, and the code never changes", async () => {
    await ensureSystemReviewReasons();
    const rows = await listReviewReasons("links", "reject");
    const first = rows[0]!;
    const second = rows[1]!;

    const renamed = await renameReviewReason({ reasonId: first.id, label: "Not the reported content, on checking", role: SUPER, actorId: "admin-1" });
    expect(renamed).toMatchObject({ ok: true, reason: { label: "Not the reported content, on checking", code: "not_reported_content" } });

    const moved = await moveReviewReason({ reasonId: second.id, direction: "up", role: SUPER, actorId: "admin-1" });
    expect(moved).toMatchObject({ ok: true });
    const after = await listReviewReasons("links", "reject");
    expect(after[0]!.code).toBe("duplicate_link");
    expect(after[1]!.code).toBe("not_reported_content");

    // Moving past the end changes nothing and stays ok.
    expect(await moveReviewReason({ reasonId: after[0]!.id, direction: "up", role: SUPER, actorId: "admin-1" })).toMatchObject({ ok: true });
    expect((await listReviewReasons("links", "reject"))[0]!.code).toBe("duplicate_link");

    const deactivated = await setReviewReasonActive({ reasonId: first.id, active: false, role: SUPER, actorId: "admin-1" });
    expect(deactivated).toMatchObject({ ok: true, reason: { active: false } });
    const reason = await getReviewReasonByCode("links", "reject", "not_reported_content");
    expect(reason?.label).toBe("Not the reported content, on checking");
    expect(reason?.active).toBe(false);
  });
});

describe("the reason helpers", () => {
  it("marks exactly Other as the note-required reason", () => {
    expect(reasonRequiresNote(REASON_OTHER_CODE)).toBe(true);
    expect(reasonRequiresNote("duplicate_link")).toBe(false);
    expect(reasonRequiresNote("")).toBe(false);
  });
});
