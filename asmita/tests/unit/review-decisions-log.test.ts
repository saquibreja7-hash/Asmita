import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP145 (review-console-spec.md): the decisions log on the memory backend,
// through the real console flow — a claimed job decided with a picked
// reason. What the spec makes the real test: the filters (queue, kind,
// decision, reviewer, reason, IST date range, case reference), keyset
// paging with ties on decidedAt broken by id, the CSV's exact columns and
// the absence of URLs and notes, the routing explanation, and the export
// route's audit event and permission. Invented hosts and placeholder ids
// only; the reason note below is invented text, never a real survivor's.

const authCookie = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "asmita_admin_session"
    ? { value: authCookie.token } : undefined }),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

import { signAdminSession } from "@/lib/auth/jwt";
import { confirmAdminMfa, enrolAdminMfa, resetAdminMfa } from "@/lib/auth/admin-mfa-store";
import { generateTotp } from "@/lib/auth/admin-mfa";
import { hashEmail } from "@/lib/hash";
import { createCase } from "@/lib/store";
import { addUrlsToCase, cases } from "@/lib/store";
import { inMemoryAuditLog } from "@/lib/audit";
import { reviewSubmittedUrl } from "@/lib/case-ops";
import { claimNextJob, createReviewQueue, decideJob, getReviewQueueByKey, resetReviewMemory, reviewMemory, syncReviewJobs } from "@/lib/review-jobs";
import { createRoutingRule, setRoutingRuleStatus } from "@/lib/review-routing";
import {
  DECISION_CSV_COLUMNS,
  decisionLogFilterOptions,
  exportDecisionLogCsv,
  listDecisionLogPage,
  parseDecisionLogFilters,
} from "@/lib/review-decisions-log";
import { GET as exportRoute } from "@/app/api/admin/review/decisions/export/route";

const NOW = new Date("2026-11-22T10:00:00Z");
const MINUTE = 60_000;
const ME = "hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VIEWER = { emailHash: ME };

const OWNER = "log-owner@example.test";
const AGENT = "log-agent@example.test";

const saved: Record<string, string | undefined> = {};
const ENV = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_ROLES"];

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name];
  delete process.env.DATABASE_URL;
  process.env.ADMIN_EMAILS = `${OWNER},${AGENT}`;
  process.env.ADMIN_ROLES = `${OWNER}=SUPER_ADMIN,${AGENT}=SUPPORT_AGENT`;
  resetReviewMemory();
  // The shared dev store otherwise leaks its cases (and their still-open
  // jobs) into the next test, exactly as a fresh isolate would not.
  cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  authCookie.token = "";
});

beforeEach(async () => {
  for (const hash of [hashEmail(OWNER), hashEmail(AGENT)]) {
    const secret = await enrolAdminMfa(hash);
    if (secret) await confirmAdminMfa(hash, generateTotp(secret));
  }
});

afterEach(async () => {
  await resetAdminMfa(hashEmail(OWNER));
  await resetAdminMfa(hashEmail(AGENT));
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/** One of her cases with N flagged links on invented hosts, jobs opened by the sync. */
async function seedFlaggedLinks(count: number, label = "seed") {
  const record = await createCase(`user-${label}`);
  const urls = Array.from({ length: count }, (_, index) => `https://${label}-${index}.example.test/post/1`);
  const results = await addUrlsToCase(record.id, urls, { flagReasons: ["many_unrelated_domains"] });
  const urlIds = results.filter((result) => result.ok).map((result) => result.url.id);
  if (urlIds.length !== count) throw new Error("expected every invented link to be flagged");
  // The memory store's addUrlsToCase has no enqueue hook (the hook lives in
  // the database path), so the sync opens the jobs here.
  await syncReviewJobs(NOW);
  return { caseId: record.id, urlIds };
}

/**
 * Flagged links on a seeded platform, so the existing function's
 * unknown-platform guard lets an approval through (the e2e fixtures do the
 * same: invented hosts approve-refuse, the seeded platform approves).
 */
async function seedApprovableLinks(count: number, label = "seed") {
  const record = await createCase(`user-${label}`);
  const urls = Array.from({ length: count }, (_, index) => `https://youtube.com/watch?v=wp145-${label}-${index}`);
  const results = await addUrlsToCase(record.id, urls, { flagReasons: ["many_unrelated_domains"] });
  const urlIds = results.filter((result) => result.ok).map((result) => result.url.id);
  if (urlIds.length !== count) throw new Error("expected every seeded-platform link to be flagged");
  await syncReviewJobs(NOW);
  return { caseId: record.id, urlIds };
}

/** Claims the next links job as ME and decides it, at the given moments. */
async function decideNext(input: { at: Date; claimAt?: Date; decision?: string; reasonCode?: string; note?: string; me?: string }) {
  const linksQueue = await getReviewQueueByKey("links");
  if (!linksQueue) throw new Error("links queue missing");
  const claimed = await claimNextJob({
    queueId: linksQueue.id,
    role: "CASE_REVIEWER",
    reviewerEmailHash: input.me ?? ME,
    now: input.claimAt ?? input.at,
  });
  if (!claimed.job) throw new Error("nothing to claim");
  return decideJob({
    jobId: claimed.job.id,
    me: input.me ?? ME,
    reviewerId: "admin-1",
    role: "CASE_REVIEWER",
    decision: input.decision ?? "reject",
    reasonCode: input.reasonCode,
    reasonNote: input.note,
    now: input.at,
  });
}

describe("parseDecisionLogFilters", () => {
  it("keeps well-formed filters and drops anything malformed", () => {
    expect(parseDecisionLogFilters({
      queue: "links",
      kind: "FLAGGED_LINK",
      decision: "reject",
      reviewer: "system",
      reason: "duplicate_link",
      from: "2026-11-20",
      to: "2026-11-22",
      case: "asmita-2026-abc123",
    })).toEqual({
      queueKey: "links",
      subjectKind: "FLAGGED_LINK",
      decision: "reject",
      reviewerEmailHash: "",
      reasonCode: "duplicate_link",
      fromIstDay: "2026-11-20",
      toIstDay: "2026-11-22",
      caseReference: "ASMITA-2026-ABC123",
    });
    expect(parseDecisionLogFilters({ kind: "NOT_A_KIND", reviewer: "not-a-hash", reason: "Not A Code", from: "22-11-2026", case: "http://forum.example.test" })).toEqual({});
    expect(parseDecisionLogFilters({ reviewer: "a".repeat(15) })).toEqual({});
    expect(parseDecisionLogFilters({ reviewer: "a".repeat(16) })).toEqual({ reviewerEmailHash: "a".repeat(16) });
  });
});

describe("the decisions log rows", () => {
  it("shows the decided item with its reason label, reviewer handle, case link and routing line", async () => {
    const seeded = await seedFlaggedLinks(2);
    await decideNext({ claimAt: NOW, at: new Date(NOW.getTime() + 90_000), reasonCode: "duplicate_link", note: "Second copy of the same upload." });

    const page = await listDecisionLogPage(VIEWER, {});
    expect(page.rows).toHaveLength(1);
    const row = page.rows[0]!;
    expect(row.queueName).toBe("Flagged links");
    expect(row.subjectKind).toBe("FLAGGED_LINK");
    expect(row.decision).toBe("reject");
    expect(row.reasonCode).toBe("duplicate_link");
    expect(row.reasonLabel).toBe("Duplicate of another link");
    expect(row.reviewer).toBe("You");
    expect(row.caseId).toBe(seeded.caseId);
    expect(row.caseReference?.startsWith("ASMITA-")).toBe(true);
    expect(row.decidedAt).toBe(new Date(NOW.getTime() + 90_000).toISOString());
    // Claim at NOW, decided 90 seconds later.
    expect(row.handleSeconds).toBe(90);
    expect(row.routing).toBe("Default queue");

    // Another viewer sees a handle, never an email or the full hash.
    const otherView = await listDecisionLogPage({ emailHash: OTHER }, {});
    expect(otherView.rows[0]!.reviewer).toBe(`Reviewer ${ME.slice(0, 4)}`);
  });

  it("says which rule routed the decided item", async () => {
    const queue = await createReviewQueue({ name: "Second look", subjectKind: "FLAGGED_LINK", role: "SUPER_ADMIN", actorId: "admin-1" });
    if (!queue.ok) throw new Error(queue.error);
    const rule = await createRoutingRule({
      name: "Everything once more",
      subjectKind: "FLAGGED_LINK",
      condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] },
      destinationQueueId: queue.queue.id,
      role: "SUPER_ADMIN",
      actorEmailHash: ME,
      actorId: "admin-1",
      now: NOW,
    });
    if (!rule.ok) throw new Error(rule.error);
    const live = await setRoutingRuleStatus({
      ruleId: rule.rule.id,
      status: "LIVE",
      role: "SUPER_ADMIN",
      actorEmailHash: ME,
      actorId: "admin-1",
      now: NOW,
    });
    if (!live.ok) throw new Error(live.error);

    await seedFlaggedLinks(1, "routed");
    const secondLook = await getReviewQueueByKey("second-look");
    expect(secondLook).toBeTruthy();
    const claimed = await claimNextJob({ queueId: secondLook!.id, role: "CASE_REVIEWER", reviewerEmailHash: ME, now: NOW });
    expect(claimed.job).toBeTruthy();
    await decideJob({
      jobId: claimed.job!.id,
      me: ME,
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "reject",
      // The custom queue has no seeded reason codes, so this decision
      // carries a plain internal note, exactly as WP141 allows.
      reasonNote: "Held for a second look.",
      now: NOW,
    });

    const page = await listDecisionLogPage(VIEWER, {});
    // Switching the rule Live made it version 2, and the job recorded that.
    expect(page.rows[0]!.routing).toBe("Routed here by rule Everything once more (version 2)");
  });

  it("filters by queue, kind, decision, reviewer, reason, case reference and IST day", async () => {
    await seedFlaggedLinks(1, "one");
    await seedApprovableLinks(1, "two");
    const outside = await seedFlaggedLinks(1, "outside");
    await seedFlaggedLinks(1, "late");

    await decideNext({ at: NOW, reasonCode: "duplicate_link" });
    await decideNext({ at: NOW, decision: "approve" });
    // A link decided outside the console: the next sync closes its job with
    // the system's close_stale decision.
    await reviewSubmittedUrl({ caseId: outside.caseId, urlId: outside.urlIds[0]!, decision: "reject", reviewerId: "admin-2" });
    await syncReviewJobs(NOW);
    // A decision at 00:00 IST on 23 November (18:30Z on the 22nd).
    await decideNext({ at: new Date("2026-11-22T18:30:00Z"), reasonCode: "duplicate_link" });

    const all = await listDecisionLogPage(VIEWER, {});
    expect(all.rows).toHaveLength(4);
    // The 18:30Z decision is the newest; the other three share NOW, so
    // within that tie the order is the id tiebreak, not the decision.
    expect(all.rows[0]!.decision).toBe("reject");
    const counts = all.rows.slice(1).reduce<Record<string, number>>((totals, row) => {
      totals[row.decision] = (totals[row.decision] ?? 0) + 1;
      return totals;
    }, {});
    expect(counts).toEqual({ reject: 1, approve: 1, close_stale: 1 });

    const linksQueue = await getReviewQueueByKey("links");
    expect(linksQueue?.key).toBe("links");
    expect((await listDecisionLogPage(VIEWER, { queueKey: "links" })).rows).toHaveLength(4);
    expect((await listDecisionLogPage(VIEWER, { queueKey: "no-such-queue" })).rows).toHaveLength(0);
    expect((await listDecisionLogPage(VIEWER, { subjectKind: "FLAGGED_LINK" })).rows).toHaveLength(4);
    expect((await listDecisionLogPage(VIEWER, { subjectKind: "FINGERPRINT" })).rows).toHaveLength(0);
    expect((await listDecisionLogPage(VIEWER, { decision: "approve" })).rows).toHaveLength(1);
    expect((await listDecisionLogPage(VIEWER, { reviewerEmailHash: "" })).rows.map((row) => row.decision)).toEqual(["close_stale"]);
    expect((await listDecisionLogPage(VIEWER, { reviewerEmailHash: ME })).rows).toHaveLength(3);
    expect((await listDecisionLogPage(VIEWER, { reasonCode: "duplicate_link" })).rows).toHaveLength(2);

    // IST days are inclusive: 23 November IST starts at 18:30Z on the 22nd.
    expect((await listDecisionLogPage(VIEWER, { fromIstDay: "2026-11-23" })).rows).toHaveLength(1);
    expect((await listDecisionLogPage(VIEWER, { toIstDay: "2026-11-22" })).rows).toHaveLength(3);
    expect((await listDecisionLogPage(VIEWER, { fromIstDay: "2026-11-22", toIstDay: "2026-11-22" })).rows).toHaveLength(3);

    const reference = all.rows.find((row) => row.decision === "approve")!.caseReference!;
    expect((await listDecisionLogPage(VIEWER, { caseReference: reference })).rows).toHaveLength(1);
    expect((await listDecisionLogPage(VIEWER, { caseReference: "ASMITA-2026-ZZZZZZ" })).rows).toHaveLength(0);
  });

  it("keyset-pages on (decidedAt, id), ties broken by id, never skipping or repeating a row", async () => {
    const seeded = await seedApprovableLinks(4, "keyset");
    // Four decisions at the same moment: the id tiebreak is the whole test.
    const sameMoment = new Date(NOW.getTime() + 5 * MINUTE);
    for (let index = 0; index < seeded.urlIds.length; index += 1) {
      const linksQueue = await getReviewQueueByKey("links");
      const claimed = await claimNextJob({ queueId: linksQueue!.id, role: "CASE_REVIEWER", reviewerEmailHash: ME, now: sameMoment });
      const decided = await decideJob({
        jobId: claimed.job!.id,
        me: ME,
        reviewerId: "admin-1",
        role: "CASE_REVIEWER",
        decision: "approve",
        now: sameMoment,
      });
      expect(decided.ok).toBe(true);
    }

    const seen: string[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await listDecisionLogPage(VIEWER, {}, { before, limit: 3 });
      seen.push(...page.rows.map((row) => row.decisionId));
      if (!page.nextBefore) break;
      before = page.nextBefore;
    }
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);

    // The whole set is the decisions in the store, newest first, id-desc in the tie.
    const all = [...reviewMemory().decisions.values()]
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime() || (left.id < right.id ? 1 : -1))
      .map((row) => row.id);
    expect(seen).toEqual(all);
  });
});

describe("the CSV export of the filtered set", () => {
  it("carries the fixed columns, never a URL and never the note", async () => {
    await seedFlaggedLinks(1, "csv");
    await decideNext({ claimAt: NOW, at: new Date(NOW.getTime() + 2 * MINUTE), reasonCode: "duplicate_link", note: "Second copy of the same upload." });

    const exported = await exportDecisionLogCsv(VIEWER, { queueKey: "links" });
    const lines = exported.csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(DECISION_CSV_COLUMNS.map((column) => `"${column}"`).join(","));
    const row = lines[1]!;
    expect(row).toContain(`"Flagged links"`);
    expect(row).toContain(`"Flagged link"`);
    expect(row).toContain(`"reject"`);
    expect(row).toContain(`"Duplicate of another link"`);
    expect(row).toContain(`"You"`);
    expect(row).toContain("ASMITA-");
    // Claim at NOW, decided two minutes later.
    expect(row).toContain(`"120"`);
    // No URL, no note, no PII: the columns are the whole row.
    expect(exported.csv).not.toContain("example.test");
    expect(exported.csv).not.toContain("http");
    expect(exported.csv).not.toContain("Second copy of the same upload");
  });

  it("exports the filtered set and honours the filters", async () => {
    await seedFlaggedLinks(1, "filtered");
    await decideNext({ at: NOW, reasonCode: "duplicate_link" });
    await seedApprovableLinks(1, "filtered-approve");
    await decideNext({ at: NOW, decision: "approve" });

    const all = await exportDecisionLogCsv(VIEWER, {});
    expect(all.count).toBe(2);
    const rejects = await exportDecisionLogCsv(VIEWER, { decision: "reject" });
    expect(rejects.count).toBe(1);
    expect(rejects.csv).toContain("reject");
    expect(rejects.csv).not.toContain(`"approve"`);
  });
});

describe("the filter options", () => {
  it("offers queues, kinds, decisions, reviewer handles and reason labels", async () => {
    await seedFlaggedLinks(1, "options");
    await decideNext({ at: NOW, reasonCode: "duplicate_link" });
    // A link decided outside the console: the sync closes its job as the
    // system decider, so "system" appears among the reviewer options.
    const outside = await seedFlaggedLinks(1, "options-outside");
    await reviewSubmittedUrl({ caseId: outside.caseId, urlId: outside.urlIds[0]!, decision: "reject", reviewerId: "admin-2" });
    await syncReviewJobs(NOW);

    const options = await decisionLogFilterOptions(VIEWER);
    expect(options.queues.map((queue) => queue.key)).toContain("links");
    expect(options.kinds).toContain("FLAGGED_LINK");
    expect(options.decisions).toContain("close_stale");
    expect(options.reviewers.map((reviewer) => reviewer.value)).toContain("system");
    expect(options.reviewers.find((reviewer) => reviewer.value === ME)?.label).toBe("You");
    expect(options.reasons.map((reason) => reason.value)).toContain("duplicate_link");
    expect(options.reasons.find((reason) => reason.value === "duplicate_link")?.label).toContain("Duplicate of another link");
  });
});

describe("GET /api/admin/review/decisions/export", () => {
  function exportRequest(query: string) {
    return new Request(`https://asmita.test/api/admin/review/decisions/export${query}`);
  }

  it("exports CSV for the allowed role and writes the audit event", async () => {
    await seedFlaggedLinks(1, "route");
    await decideNext({ at: NOW, reasonCode: "duplicate_link" });
    authCookie.token = await signAdminSession({
      sub: "admin-log-owner",
      emailHash: hashEmail(OWNER),
      adminRole: "SUPER_ADMIN",
      mfaComplete: true,
    });

    const response = await exportRoute(exportRequest("?queue=links"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const csv = await response.text();
    expect(csv).toContain("Decided at (IST)");
    expect(csv).toContain("reject");

    const audit = inMemoryAuditLog.filter(
      (event) => event.eventType === "ADMIN_ACTION" && (event.data as { action?: string }).action === "decisions_csv_export",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.data).toMatchObject({ count: 1, filters: { queue: "links" } });
  });

  it("refuses a role without audit:read", async () => {
    authCookie.token = await signAdminSession({
      sub: "admin-log-agent",
      emailHash: hashEmail(AGENT),
      adminRole: "SUPPORT_AGENT",
      mfaComplete: true,
    });
    const response = await exportRoute(exportRequest(""));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "permission_denied" });
  });
});
