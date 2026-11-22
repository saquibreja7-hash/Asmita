import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP143 (review-console-spec.md): routing rules, on the memory backend every
// Asmita module tests first. The spec's own test list, in order: evaluation
// order and first match, default fallback, shadow DRAFT logging, minor
// precedence, the field allowlist and type validation, every "never" of
// point 4 (a rule cannot decide, approve, reject, dispatch, label, send
// email, change a gate, or route into or out of minor-hold or into a queue
// of another kind), the append-only version history and the audit events.
// Placeholder ids and invented hosts throughout; the no-address assertions
// pin that no job, rule, version or log row ever carries one.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { crawlMemory, resetCrawlMemory, type MemoryCrawlFinding, type MemoryCrawlSource } from "@/lib/crawl-store";
import { resetLabMemory, labMemory } from "@/lib/lab/lab-store";
import { partnerApplications } from "@/lib/platform-partners";
import { encryptField } from "@/lib/encryption";
import { MINOR_HOLD_QUEUE_KEY } from "@/lib/review-queue-seeds";
import {
  getReviewAdapter,
  registerComplaintReviewAdapters,
  registerReviewAdapter,
  resetReviewAdapters,
  type ReviewAdapter,
} from "@/lib/review-adapters";
import { addHashesToCase, resetMemoryHashStore } from "@/lib/hash-submission";
import { addCaseNote, resetCaseNoteMemory } from "@/lib/case-notes";
import {
  archiveReviewQueue,
  claimNextJob,
  createReviewQueue,
  enqueueForReview,
  getReviewQueueByKey,
  moveJob,
  queueSummaries,
  renameReviewQueue,
  resetReviewMemory,
  reviewMemory,
  syncReviewJobs,
} from "@/lib/review-jobs";
import {
  CONDITION_MAX_LEAVES,
  ROUTING_LOG_RETENTION_DAYS,
  createRoutingRule,
  evaluateCondition,
  listRoutingRuleVersions,
  moveRoutingRule,
  pruneRoutingLogs,
  recordRoutingEvaluations,
  routingExplanationForJob,
  routingFieldsForKind,
  routingLeafText,
  routingRowsForTest,
  routeSubjectForKind,
  saveRoutingRule,
  setRoutingRuleStatus,
  testRoutingRules,
  validateRoutingCondition,
  type RoutingCondition,
  type RoutingFacts,
} from "@/lib/review-routing";

const NOW = new Date("2026-11-22T12:00:00Z");
const SUPER = "SUPER_ADMIN" as const;
const REVIEWER_ROLE = "CASE_REVIEWER" as const;
const OWNER_HASH = "hash-owner";
const OWNER_ID = "admin-owner";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The refusal code of a result promise, "" when it succeeded. */
async function errorOf(result: Promise<{ ok: boolean; error?: string }>): Promise<string> {
  const resolved = await result;
  return resolved.ok ? "" : (resolved.error ?? "unexpected_ok");
}

/** One of her cases with one flagged link on an invented host. */
async function seedFlaggedLink(url = "https://forum.example.test/post/1", flagReasons = ["many_unrelated_domains"]) {
  const record = await createCase("user-1");
  const [result] = await storeAddUrls(record.id, [url], { flagReasons });
  if (!result.ok) throw new Error("expected accepted URL");
  return { caseId: record.id, urlId: result.url.id, record };
}

function seedFinding(overrides: Partial<MemoryCrawlFinding> = {}) {
  const finding: MemoryCrawlFinding = {
    id: `finding-${randomId()}`,
    caseId: "case-finding",
    hashSubmissionId: "hash-finding",
    crawlConsentId: null,
    pageUrlEncrypted: encryptField("https://forum.example.test/page/1"),
    imageUrlEncrypted: encryptField("https://cdn.example.test/img/1"),
    urlDigest: `digest-${randomId()}`,
    distance: 5,
    sscdSimilarity: null,
    quality: 90,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    sourceId: "source-1",
    runId: "run-1",
    reviewStatus: "CANDIDATE",
    method: "PDQ",
    reviewedById: null,
    reviewedAt: null,
    secondReviewedById: null,
    secondReviewedAt: null,
    labelAiMade: false,
    labelAiMadeById: null,
    labelAiMadeAt: null,
    labelSexual: false,
    labelSexualById: null,
    labelSexualAt: null,
    labelPossibleMinor: false,
    labelPossibleMinorById: null,
    labelPossibleMinorAt: null,
    labelPossibleMinorClearedById: null,
    labelPossibleMinorClearedAt: null,
    labelPossibleMinorClearReason: null,
    minorProtocolBefore: null,
    ...overrides,
  };
  crawlMemory().findings.set(finding.id, finding);
  return finding;
}

function seedCrawlSource(origin: MemoryCrawlSource["origin"]) {
  const source: MemoryCrawlSource = {
    id: `source-${randomId()}`,
    kind: "SITE",
    domain: "forum.example.test",
    pageBudget: 10,
    delayMs: 100,
    enabled: true,
    approvedBy: OWNER_ID,
    origin,
    hops: 0,
    discoveredFromId: null,
    render: "HTTP",
    lastCrawledAt: null,
    pagesCrawled: 0,
    pausedUntil: null,
    pauseReason: null,
    disabledReason: null,
    createdAt: NOW,
  };
  crawlMemory().sources.set(source.id, source);
  return source;
}

function seedConsent(scope: "SEARCH_AND_NOTICE" | "WATCH_ONLY") {
  const consent = {
    id: `consent-${randomId()}`,
    caseId: "case-finding",
    signedPdfEncrypted: "irrelevant",
    hashSubmissionIds: ["hash-finding"],
    templateId: "template-1",
    templateDigest: "digest",
    signedAt: NOW,
    withdrawnAt: null,
    scope,
    convertedFromId: null,
    watchUntil: null,
  };
  crawlMemory().consents.push(consent);
  return consent;
}

function seedLabDraft() {
  const report = {
    id: `lab-report-${randomId()}`,
    chokepointId: "chokepoint-missing",
    templateKind: "HOST" as const,
    channel: null,
    subject: "Example abuse report",
    body: "The text the analyst reviewed.",
    status: "DRAFT" as const,
    toAddress: null,
    sentAt: null,
    sentById: null,
    providerReference: null,
    outcome: null,
    outcomeAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  labMemory().reports.set(report.id, report);
  return report;
}

/** A custom queue for a kind, through the real admin path. */
async function makeQueue(name: string, kind: ReviewAdapter["kind"] = "FLAGGED_LINK") {
  const queue = await createReviewQueue({ name, subjectKind: kind, role: SUPER, actorId: OWNER_ID, now: NOW });
  if (!queue.ok) throw new Error(`queue creation failed: ${queue.error}`);
  return queue.queue;
}

/** A rule through the real admin path, LIVE unless said otherwise. */
async function makeRule(input: {
  name: string;
  kind: ReviewAdapter["kind"];
  condition: unknown;
  destinationQueueId: string;
  priority?: number;
  status?: "DRAFT" | "LIVE" | "DISABLED";
}) {
  const created = await createRoutingRule({
    name: input.name,
    subjectKind: input.kind,
    condition: input.condition,
    destinationQueueId: input.destinationQueueId,
    priority: input.priority,
    role: SUPER,
    actorEmailHash: OWNER_HASH,
    actorId: OWNER_ID,
    now: NOW,
  });
  if (!created.ok) throw new Error(`rule creation failed: ${created.error}`);
  let rule = created.rule;
  if ((input.status ?? "LIVE") !== "DRAFT") {
    const switched = await setRoutingRuleStatus({
      ruleId: rule.id,
      status: (input.status ?? "LIVE") as "LIVE" | "DISABLED",
      role: SUPER,
      actorEmailHash: OWNER_HASH,
      actorId: OWNER_ID,
      now: NOW,
    });
    if (!switched.ok) throw new Error(`status switch failed: ${switched.error}`);
    rule = switched.rule;
  }
  return rule;
}

function auditEventTypes() {
  return inMemoryAuditLog.map((event) => event.eventType);
}

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  resetReviewMemory();
  resetCrawlMemory();
  resetLabMemory();
  resetMemoryHashStore();
  resetCaseNoteMemory();
  resetReviewAdapters();
  registerComplaintReviewAdapters();
  // The Lab's adapter registers exactly once per process; this file resets
  // the registry per test, so the Lab side re-registers through its own
  // exported seam (nothing outside the Lab names a lab function).
  const lab = await import("@/lib/lab/lab-review-adapter");
  lab.ensureLabReviewAdapterRegistered();
  cases.clear();
  partnerApplications.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The field allowlist and condition validation

describe("the field allowlist and type validation", () => {
  it("accepts a well-formed all-condition", async () => {
    const result = await validateRoutingCondition("FLAGGED_LINK", {
      all: [{ field: "platformTier", op: "eq", value: "TIER_1" }],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects unknown fields, wrong operators, wrong types and nesting", async () => {
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "nope", op: "eq", value: "x" }] }))).toBe("unknown_field");
    // An operator the field's type does not allow.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformTier", op: "lt", value: 1 }] }))).toBe("invalid_op");
    // is_empty carries no value.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformTier", op: "is_empty", value: "TIER_1" }] }))).toBe("invalid_value");
    // An enum value outside the closed list.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformTier", op: "eq", value: "TIER_9" }] }))).toBe("invalid_value");
    // A number field with a string value.
    expect(await errorOf(validateRoutingCondition("FINGERPRINT", { all: [{ field: "quality", op: "gte", value: "high" }] }))).toBe("invalid_value");
    // One level only: both all and any, an empty leaf list, or no shape.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }], any: [] }))).toBe("invalid_condition");
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [] }))).toBe("invalid_condition");
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", "platformTier"))).toBe("invalid_condition");
    // Every leaf is checked: the second one is unknown.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }, { field: "nope", op: "eq", value: "x" }] }))).toBe("unknown_field");
    // in needs a non-empty list of scalars.
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformKey", op: "in", value: [] }] }))).toBe("invalid_value");
    expect(await errorOf(validateRoutingCondition("FLAGGED_LINK", { all: [{ field: "platformKey", op: "in", value: ["youtube", 7] }] }))).toBe("invalid_value");
    // Too many leaves.
    expect(
      await errorOf(
        validateRoutingCondition("FLAGGED_LINK", {
          all: Array.from({ length: CONDITION_MAX_LEAVES + 1 }, () => ({ field: "platformTier", op: "eq", value: "TIER_1" })),
        }),
      ),
    ).toBe("invalid_condition");
  });

  it("exposes each kind's fixed allowlist, the Lab's from its own adapter", async () => {
    expect((await routingFieldsForKind("FLAGGED_LINK")).map((field) => field.key)).toEqual([
      "platformTier", "platformKey", "urlSource", "flagReason", "caseMode", "ageHours",
    ]);
    expect((await routingFieldsForKind("FINGERPRINT")).map((field) => field.key)).toEqual(["algorithm", "quality", "caseMode", "ageHours"]);
    expect((await routingFieldsForKind("FINDING")).map((field) => field.key)).toEqual([
      "method", "distance", "quality", "consentScope", "sourceKind", "labels", "ageHours",
    ]);
    expect((await routingFieldsForKind("PARTNER_APPLICATION")).map((field) => field.key)).toEqual(["platformTier", "ageHours"]);
    expect((await routingFieldsForKind("LAB_REPORT")).map((field) => field.key)).toEqual(["chokepointKind", "ageHours"]);
  });

  it("evaluates all and any, sets, empties and numbers", async () => {
    const fields = await routingFieldsForKind("FLAGGED_LINK");
    const facts: RoutingFacts = { platformTier: "TIER_1", platformKey: "youtube", flagReason: ["many_unrelated_domains"], ageHours: 25 };
    const all: RoutingCondition = {
      all: [
        { field: "platformTier", op: "eq", value: "TIER_1" },
        { field: "ageHours", op: "gte", value: 24 },
        { field: "flagReason", op: "in", value: ["many_unrelated_domains", "too_many_urls"] },
        { field: "platformKey", op: "neq", value: "instagram" },
      ],
    };
    expect(evaluateCondition(all, facts, fields)).toBe(true);
    expect(evaluateCondition({ any: [{ field: "platformTier", op: "eq", value: "TIER_2" }, ...all.all] }, facts, fields)).toBe(true);
    expect(evaluateCondition({ all: [{ ...all.all[0]!, op: "eq", value: "TIER_2" }] }, facts, fields)).toBe(false);
    // is_empty on a set and on a missing value; a missing value never satisfies neq.
    expect(evaluateCondition({ all: [{ field: "flagReason", op: "is_empty" }] }, { flagReason: [] }, fields)).toBe(true);
    expect(evaluateCondition({ all: [{ field: "caseMode", op: "is_empty" }] }, {}, fields)).toBe(true);
    expect(evaluateCondition({ all: [{ field: "caseMode", op: "neq", value: "WATCH" }] }, {}, fields)).toBe(false);
    expect(evaluateCondition({ all: [{ field: "ageHours", op: "lt", value: 1 }] }, {}, fields)).toBe(false);
    // eq on a set names one code.
    expect(evaluateCondition({ all: [{ field: "flagReason", op: "eq", value: "many_unrelated_domains" }] }, facts, fields)).toBe(true);
    expect(evaluateCondition({ all: [{ field: "flagReason", op: "eq", value: "too_many_urls" }] }, facts, fields)).toBe(false);
    expect(evaluateCondition({ all: [{ field: "flagReason", op: "neq", value: "too_many_urls" }] }, facts, fields)).toBe(true);
  });

  it("words a leaf for the builder and the Test panel", async () => {
    const fields = await routingFieldsForKind("FLAGGED_LINK");
    expect(routingLeafText({ field: "platformTier", op: "eq", value: "TIER_1" }, fields)).toBe("Platform tier is TIER_1");
    expect(routingLeafText({ field: "ageHours", op: "gte", value: 24 }, fields)).toBe("Age (hours) is at least 24");
    expect(routingLeafText({ field: "platformKey", op: "is_empty", value: null }, fields)).toBe("Platform is empty");
  });
});

// ---------------------------------------------------------------------------
// Rule admin: create, save, status, move, versions, audit

describe("rule admin", () => {
  it("creates a rule as DRAFT v1 and refuses everything a rule must never be", async () => {
    const queue = await makeQueue("Big platforms");
    const created = await createRoutingRule({
      name: "Big platforms first",
      subjectKind: "FLAGGED_LINK",
      condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] },
      destinationQueueId: queue.id,
      priority: 5,
      role: SUPER,
      actorEmailHash: OWNER_HASH,
      actorId: OWNER_ID,
      now: NOW,
    });
    expect(created).toMatchObject({ ok: true, rule: { status: "DRAFT", version: 1, priority: 5, sequence: 10 } });

    const common = { subjectKind: "FLAGGED_LINK" as const, condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID };

    // The owner's permission alone.
    expect(
      await errorOf(createRoutingRule({ ...common, name: "No", destinationQueueId: queue.id, role: REVIEWER_ROLE, actorEmailHash: "hash-reviewer", actorId: "admin-reviewer" })),
    ).toBe("permission_denied");
    // Never into the protected queue.
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    expect(await errorOf(createRoutingRule({ ...common, name: "Into minor-hold", destinationQueueId: minorHold!.id }))).toBe("protected_queue");
    // Never into another kind's queue.
    const fingerprints = await getReviewQueueByKey("fingerprints");
    expect(await errorOf(createRoutingRule({ ...common, name: "Wrong kind", destinationQueueId: fingerprints!.id }))).toBe("queue_kind_mismatch");
    // Never an address in the name.
    expect(await errorOf(createRoutingRule({ ...common, name: "See https://forum.example.test", destinationQueueId: queue.id }))).toBe("links_not_allowed");
    // Unknown fields are refused on save.
    expect(await errorOf(createRoutingRule({ ...common, name: "Bad field", destinationQueueId: queue.id, condition: { all: [{ field: "nope", op: "eq", value: "x" }] } }))).toBe("unknown_field");
  });

  it("keeps an append-only version history with who and when, and audits every change", async () => {
    const queue = await makeQueue("Escalation");
    const rule = await makeRule({ name: "After a day", kind: "FLAGGED_LINK", condition: { all: [{ field: "ageHours", op: "gte", value: 24 }] }, destinationQueueId: queue.id });

    const saved = await saveRoutingRule({
      ruleId: rule.id,
      condition: { all: [{ field: "ageHours", op: "gte", value: 12 }] },
      priority: 7,
      role: SUPER,
      actorEmailHash: "hash-second",
      actorId: "admin-second",
      now: new Date("2026-11-22T13:00:00Z"),
    });
    // create was v1, switching LIVE was v2, so the save is v3.
    expect(saved).toMatchObject({ ok: true, rule: { version: 3, priority: 7 } });

    const moved = await moveRoutingRule({ ruleId: rule.id, direction: "up", role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID, now: NOW });
    // A single rule has no neighbour, so nothing changes.
    expect(moved).toMatchObject({ ok: true, rule: { version: 3 } });

    const versions = await listRoutingRuleVersions(rule.id);
    expect(versions.map((version) => version.version)).toEqual([3, 2, 1]);
    // Append-only: v1 keeps its original condition and author.
    expect(versions.at(-1)).toMatchObject({ version: 1, priority: 0, createdBy: OWNER_HASH, status: "DRAFT" });
    expect(versions[0]).toMatchObject({ version: 3, priority: 7, createdBy: "hash-second" });

    // Every change audits REVIEW_RULE_CHANGED, with ids only.
    const events = inMemoryAuditLog.filter((event) => event.eventType === "REVIEW_RULE_CHANGED");
    const actions = events.map((event) => (event.data as { action: string }).action);
    expect(actions).toEqual(["create", "status_live", "save"]);
    expect(events.every((event) => event.entityId === rule.id)).toBe(true);
    expect(events.every((event) => event.actorId === OWNER_ID || event.actorId === "admin-second")).toBe(true);
    // No condition value, no queue name, no note in the audit data.
    for (const event of events) {
      expect(JSON.stringify(event.data)).not.toContain("TIER_1");
      expect(JSON.stringify(event.data)).not.toContain("ageHours");
    }
  });

  it("moves rules up and down in sequence order, bumping both rows", async () => {
    const queue = await makeQueue("Ordered");
    const first = await makeRule({ name: "First", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: queue.id });
    await makeRule({ name: "Second", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_2" }] }, destinationQueueId: queue.id });
    const { listRoutingRules } = await import("@/lib/review-routing");
    expect((await listRoutingRules("FLAGGED_LINK")).map((rule) => rule.name)).toEqual(["First", "Second"]);

    const second = (await listRoutingRules("FLAGGED_LINK"))[1]!;
    const swapped = await moveRoutingRule({ ruleId: second.id, direction: "up", role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID, now: NOW });
    expect(swapped).toMatchObject({ ok: true, rule: { sequence: first.sequence } });
    const rules = await listRoutingRules("FLAGGED_LINK");
    expect(rules.map((rule) => rule.name)).toEqual(["Second", "First"]);
    // Both swapped rows got a new version (each was v2 after create + LIVE),
    // and both keep their full history.
    expect(rules.map((rule) => rule.version)).toEqual([3, 3]);
    expect((await listRoutingRuleVersions(first.id)).map((version) => version.version)).toEqual([3, 2, 1]);
    expect((await listRoutingRuleVersions(second.id)).map((version) => version.version)).toEqual([3, 2, 1]);

    // And back down again.
    const back = await moveRoutingRule({ ruleId: second.id, direction: "down", role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID, now: NOW });
    expect(back).toMatchObject({ ok: true, rule: { version: 4 } });
    expect((await listRoutingRules("FLAGGED_LINK")).map((rule) => rule.name)).toEqual(["First", "Second"]);
  });

  it("refuses to go LIVE pointing at a queue that stopped being valid", async () => {
    const queue = await makeQueue("Doomed");
    const rule = await makeRule({ name: "Points there", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: queue.id });
    // White-box: the queue is archived behind the admin path's back (which
    // itself refuses while a rule points at it), and the switch is refused.
    reviewMemory().queues.get(queue.key)!.archivedAt = NOW;
    expect(
      await errorOf(setRoutingRuleStatus({ ruleId: rule.id, status: "LIVE", role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID, now: NOW })),
    ).toBe("queue_archived");
  });
});

// ---------------------------------------------------------------------------
// Evaluation: order, first match, default fallback, shadow drafts

describe("evaluation", () => {
  it("routes by the first LIVE match in sequence order and sets the priority", async () => {
    const big = await makeQueue("Big platforms");
    const urgent = await makeQueue("Urgent links");
    await makeRule({ name: "Urgent after a day", kind: "FLAGGED_LINK", condition: { all: [{ field: "ageHours", op: "gte", value: 24 }] }, destinationQueueId: urgent.id, priority: 9 });
    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id, priority: 5 });

    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-1");
    const enqueued = await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    expect(enqueued).toMatchObject({ ok: true, merged: false });

    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    // The link is under a day old, so the first rule does not match and the
    // second one wins: order and first match.
    expect(job.queueId).toBe(big.id);
    expect(job.priority).toBe(5);
    expect(job.routedByRuleId).not.toBeNull();
    expect(job.enqueueSource).toBe("RULE");
  });

  it("falls back to the kind's default queue when nothing matches", async () => {
    const big = await makeQueue("Big platforms");
    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });

    const { urlId } = await seedFlaggedLink("https://forum.example.test/post/2");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const links = await getReviewQueueByKey("links");
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    expect(job.queueId).toBe(links!.id);
    expect(job.routedByRuleId).toBeNull();
    expect(job.priority).toBe(0);
    expect(job.enqueueSource).toBe("MANUAL");
  });

  it("logs a matching DRAFT as would_have_matched without effect, and never evaluates a DISABLED rule", async () => {
    const big = await makeQueue("Big platforms");
    const draft = await makeRule({ name: "Draft big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id, status: "DRAFT" });
    await makeRule({ name: "Disabled catch-all", kind: "FLAGGED_LINK", condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] }, destinationQueueId: big.id, status: "DISABLED" });

    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-2");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const links = await getReviewQueueByKey("links");
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    // The draft matched, the disabled rule never ran, and the job stayed put.
    expect(job.queueId).toBe(links!.id);
    expect(job.routedByRuleId).toBeNull();

    const logs = routingRowsForTest().logs.filter((row) => row.jobId === job.id);
    expect(logs.map((row) => [row.ruleId, row.matched, (row.details as { outcome: string }).outcome])).toEqual([
      [draft.id, true, "would_have_matched"],
    ]);

    // The job screen explains both halves.
    const explanation = await routingExplanationForJob(job, job.id);
    expect(explanation?.line).toBe("Default queue");
    expect(explanation?.draftLine).toContain("Draft rule");
    expect(explanation?.draftLine).toContain("Draft big platforms");
  });

  it("skips a rule whose destination stopped being valid, and says so in the log", async () => {
    const big = await makeQueue("Resigned");
    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });
    // Behind the admin path's back (see the admin test above): a destination
    // that went away must silently fall through to the default queue.
    reviewMemory().queues.get(big.key)!.archivedAt = NOW;

    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-3");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const links = await getReviewQueueByKey("links");
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    expect(job.queueId).toBe(links!.id);
    const logs = routingRowsForTest().logs.filter((row) => row.jobId === job.id);
    expect(logs.map((row) => (row.details as { outcome: string }).outcome)).toEqual(["invalid_destination"]);
  });

  it("the minor check runs before any rule and no evaluation is logged", async () => {
    const anywhere = await makeQueue("All findings", "FINDING");
    // A catch-all LIVE rule: without the minor check it would take the finding.
    await makeRule({ name: "Everything", kind: "FINDING", condition: { all: [{ field: "quality", op: "gte", value: 0 }] }, destinationQueueId: anywhere.id });

    const held = seedFinding({ reviewStatus: "MINOR_PROTOCOL", labelPossibleMinor: true });
    const enqueued = await enqueueForReview("FINDING", held.id, { now: NOW });
    expect(enqueued).toMatchObject({ ok: true });
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === held.id)!;
    expect(job.queueId).toBe(minorHold!.id);
    expect(job.routedByRuleId).toBeNull();
    expect(job.enqueueSource).toBe("MANUAL");
    // The rules never even saw it.
    expect(routingRowsForTest().logs.filter((row) => row.jobId === job.id)).toHaveLength(0);
  });

  it("logs every rule it consulted, deduplicated per job, rule and version", async () => {
    const big = await makeQueue("Big platforms");
    const matching = await makeRule({ name: "Matches", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });
    // A later rule the pass never reaches: the first LIVE match stops it.
    await makeRule({ name: "Never consulted", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_2" }] }, destinationQueueId: big.id });

    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-4");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;

    const first = routingRowsForTest().logs.filter((row) => row.jobId === job.id);
    expect(first.map((row) => [row.ruleId, row.matched, (row.details as { outcome: string }).outcome])).toEqual([
      [matching.id, true, "routed"],
    ]);

    // A second enqueue (the merge path) evaluates again and writes nothing new.
    await enqueueForReview("FLAGGED_LINK", urlId, { now: new Date(NOW.getTime() + 60_000) });
    expect(routingRowsForTest().logs.filter((row) => row.jobId === job.id)).toHaveLength(1);

    // recordRoutingEvaluations itself is a no-op for the same keys.
    await recordRoutingEvaluations(job.id, [
      { ruleId: matching.id, ruleVersion: matching.version, ruleName: "Matches", matched: true, outcome: "routed" },
    ]);
    expect(routingRowsForTest().logs.filter((row) => row.jobId === job.id)).toHaveLength(1);
  });

  it("prunes the routing log after its retention window", async () => {
    const { urlId } = await seedFlaggedLink("https://forum.example.test/post/3");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    await recordRoutingEvaluations(
      "old-job",
      [{ ruleId: "rule-old", ruleVersion: 1, ruleName: "Old", matched: true, outcome: "routed" }],
      new Date(NOW.getTime() - (ROUTING_LOG_RETENTION_DAYS + 1) * 24 * 60 * 60_000),
    );

    const pruned = await pruneRoutingLogs(NOW);
    expect(pruned).toBe(1);
    expect(routingRowsForTest().logs.every((row) => row.jobId !== "old-job")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every "never" of spec point 4

describe("what a rule can never do", () => {
  it("never decides, approves, rejects, dispatches, labels or sends anything", async () => {
    const big = await makeQueue("Big platforms");
    await makeRule({ name: "Catch-all", kind: "FLAGGED_LINK", condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] }, destinationQueueId: big.id });

    // A stub adapter with spies proves the console's decision path is never
    // touched by routing.
    const decide = vi.fn(async () => ({ ok: true as const, resolved: true }));
    const routingFacts = vi.fn(async () => ({ quality: 90 }) as RoutingFacts);
    registerReviewAdapter({
      kind: "FINDING",
      permission: "findings:review",
      decisions: [{ code: "approve", label: "Approve", reasonKind: "approve" }],
      listOpenSubjects: async () => [{ subjectId: "finding-stub", caseId: null, minorHold: false }],
      subjectNeedsReview: async () => ({ subjectId: "finding-stub", caseId: null, minorHold: false }),
      decide,
      routingFields: [{ key: "quality", label: "Quality", type: "number", ops: ["gte"], emptyPossible: false, emptyLabel: "" }],
      routingFacts,
    } as unknown as ReviewAdapter);
    const findingsQueue = await makeQueue("Findings routed", "FINDING");
    await makeRule({ name: "Quality findings", kind: "FINDING", condition: { all: [{ field: "quality", op: "gte", value: 50 }] }, destinationQueueId: findingsQueue.id });
    const routed = await enqueueForReview("FINDING", "finding-stub", { now: NOW });
    expect(routed).toMatchObject({ ok: true });
    expect(decide).not.toHaveBeenCalled();
    expect(routingFacts).toHaveBeenCalled(); // read-only facts, nothing else

    // And on the real flagged-link flow: the survivor's link is untouched.
    const { urlId, caseId } = await seedFlaggedLink("https://youtube.com/watch?v=example-5");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const url = cases.get(caseId)!.urls.find((entry) => entry.id === urlId)!;
    expect(url.status).toBe("PENDING_REVIEW");
    expect(url.flaggedForReview).toBe(true);

    // Nothing was sent, decided, labelled or dispatched anywhere.
    const eventTypes = auditEventTypes();
    expect(eventTypes).not.toContain("URL_APPROVED");
    expect(eventTypes).not.toContain("URL_REJECTED");
    expect(eventTypes).not.toContain("NOTICE_SENT");
    expect(eventTypes).not.toContain("HASH_DISPATCHED");
    expect(eventTypes).not.toContain("CRAWL_FINDING_LABEL_SET");
    expect(eventTypes).not.toContain("LAB_REPORT_SENT");
    expect(eventTypes).not.toContain("GO_CONTACT_VERIFIED");
  });

  it("never changes a gate: its whole effect is a queue and a priority", async () => {
    const big = await makeQueue("Big platforms");
    await makeRule({ name: "Catch-all", kind: "FLAGGED_LINK", condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] }, destinationQueueId: big.id, priority: 3 });
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-6");

    const result = await routeSubjectForKind("FLAGGED_LINK", urlId, NOW);
    // The evaluation's entire output: a queue row, a priority and log rows.
    expect(result.destination).toMatchObject({ priority: 3 });
    expect(Object.keys(result.destination!.queue).sort()).toEqual([
      "archivedAt", "description", "id", "isDefault", "key", "name", "protected",
      "requireReasonOnApprove", "requireReasonOnReject", "sortOrder", "subjectKind",
    ]);
    expect(
      result.evaluations.every((evaluation) => ["ruleId", "ruleVersion", "ruleName", "matched", "outcome"].every((key) => key in evaluation)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The sync: re-routing open jobs

describe("the sync re-routes open jobs", () => {
  it("moves an open job when a rule starts matching, releases the lease, and re-runs idempotently", async () => {
    const big = await makeQueue("Big platforms");
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-7");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;

    // A reviewer holds the item when the rule arrives.
    const claimed = await claimNextJob({ queueId: job.queueId, reviewerEmailHash: "hash-a", now: NOW });
    expect(claimed.job?.id).toBe(job.id);

    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id, priority: 5 });

    const first = await syncReviewJobs(new Date(NOW.getTime() + 60_000));
    expect(first.moved).toBe(1);
    const moved = reviewMemory().jobs.get(job.id)!;
    expect(moved.queueId).toBe(big.id);
    expect(moved.priority).toBe(5);
    expect(moved.routedByRuleId).not.toBeNull();
    // The holder lost the lease: the safe outcome when an item's queue changes.
    expect(moved.claimedBy).toBeNull();
    expect(moved.claimedUntil).toBeNull();
    expect(reviewMemory().claims.filter((claim) => claim.jobId === job.id && claim.releasedAt === null)).toHaveLength(0);

    const second = await syncReviewJobs(new Date(NOW.getTime() + 120_000));
    expect(second.moved).toBe(0);
    expect(reviewMemory().jobs.get(job.id)!.queueId).toBe(big.id);

    // The routed queue works like any other: claiming it hands over the item.
    const reclaimed = await claimNextJob({ queueId: big.id, reviewerEmailHash: "hash-b", now: new Date(NOW.getTime() + 130_000) });
    expect(reclaimed.job?.id).toBe(job.id);
  });

  it("re-routes by age as time passes", async () => {
    const aged = await makeQueue("Aged links");
    const { urlId } = await seedFlaggedLink("https://forum.example.test/post/4");
    // Backdate the memory row the way a real 25-hour-old submission would read.
    const record = [...cases.values()].find((entry) => entry.urls.some((url) => url.id === urlId))!;
    record.urls.find((url) => url.id === urlId)!.submittedAt = new Date(NOW.getTime() - 26 * 60 * 60_000).toISOString();
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    await makeRule({ name: "After a day", kind: "FLAGGED_LINK", condition: { all: [{ field: "ageHours", op: "gte", value: 24 }] }, destinationQueueId: aged.id, priority: 2 });

    const result = await syncReviewJobs(new Date(NOW.getTime() + 60_000));
    expect(result.moved).toBe(1);
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    expect(job.queueId).toBe(aged.id);
    expect(job.priority).toBe(2);
  });

  it("moves a job back to the default queue when its rule is disabled", async () => {
    const big = await makeQueue("Big platforms");
    const rule = await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-8");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });

    const disabled = await setRoutingRuleStatus({ ruleId: rule.id, status: "DISABLED", role: SUPER, actorEmailHash: OWNER_HASH, actorId: OWNER_ID, now: NOW });
    expect(disabled).toMatchObject({ ok: true });

    const result = await syncReviewJobs(new Date(NOW.getTime() + 60_000));
    expect(result.moved).toBe(1);
    const links = await getReviewQueueByKey("links");
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    expect(job.queueId).toBe(links!.id);
    expect(job.routedByRuleId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The facts loaders, per kind, on the memory backend

describe("routing facts per kind", () => {
  it("reads a flagged link's platform, source, flag reasons, case mode and age", async () => {
    const adapter = (await getReviewAdapter("FLAGGED_LINK"))!;
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-9");
    const facts = await adapter.routingFacts!(urlId, NOW);
    expect(facts).toMatchObject({
      platformTier: "TIER_1",
      platformKey: "youtube",
      urlSource: "SURVIVOR",
      flagReason: ["many_unrelated_domains"],
      caseMode: "CASE",
    });
    expect((facts!.ageHours as number)).toBeLessThan(1);

    const unknown = await seedFlaggedLink("https://forum.example.test/post/5");
    expect(await adapter.routingFacts!(unknown.urlId, NOW)).toMatchObject({ platformTier: null, platformKey: null });
    expect(await adapter.routingFacts!("missing-url", NOW)).toBeNull();
  });

  it("reads a fingerprint's algorithm, quality and case mode", async () => {
    const record = await createCase("user-2");
    const [result] = await addHashesToCase(record.id, [{ hash: "a".repeat(64), quality: 77 }]);
    if (!result.ok) throw new Error("expected accepted hash");
    const adapter = (await getReviewAdapter("FINGERPRINT"))!;
    const facts = await adapter.routingFacts!(result.submission.id, NOW);
    expect(facts).toMatchObject({ algorithm: "PDQ", quality: 77, caseMode: "CASE" });
  });

  it("reads a finding's method, distance, consent scope, source origin and labels", async () => {
    const source = seedCrawlSource("REPORTED");
    const consent = await seedConsent("WATCH_ONLY");
    const finding = seedFinding({ sourceId: source.id, crawlConsentId: consent.id, labelSexual: true });
    const adapter = (await getReviewAdapter("FINDING"))!;
    const facts = await adapter.routingFacts!(finding.id, NOW);
    expect(facts).toMatchObject({
      method: "PDQ",
      distance: 5,
      quality: 90,
      consentScope: "WATCH_ONLY",
      sourceKind: "REPORTED",
      labels: ["sexual"],
    });

    // An SSCD finding carries no distance: is_empty matches.
    const sscd = seedFinding({ method: "SSCD", distance: null, sscdSimilarity: 0.9 });
    const sscdFacts = (await adapter.routingFacts!(sscd.id, NOW))!;
    const fields = await routingFieldsForKind("FINDING");
    expect(evaluateCondition({ all: [{ field: "distance", op: "is_empty" }] }, sscdFacts, fields)).toBe(true);
  });

  it("reads a partner application's platform tier from the platform directory and its age", async () => {
    const application = {
      id: `application-${randomId()}`,
      organisationName: "Example Trust",
      platformName: "Example Forum",
      websiteDomain: "forum.example.test",
      platformType: "FORUM" as const,
      userBase: "UNDER_100K" as const,
      contactName: "Example Contact",
      contactRole: "Trust & Safety",
      contactEmail: "contact@example.test",
      interests: ["FINGERPRINT_ALERTS" as const],
      message: "We would like to join.",
      status: "NEW" as const,
      createdAt: NOW.toISOString(),
    };
    partnerApplications.push(application);
    const known = { ...application, id: `application-${randomId()}`, websiteDomain: "instagram.com" };
    partnerApplications.push(known);

    const adapter = (await getReviewAdapter("PARTNER_APPLICATION"))!;
    expect(await adapter.routingFacts!(application.id, NOW)).toMatchObject({ platformTier: null });
    expect(await adapter.routingFacts!(known.id, NOW)).toMatchObject({ platformTier: "TIER_1" });
  });

  it("reads a lab report's chokepoint kind and age through the Lab's own adapter", async () => {
    const report = seedLabDraft();
    const adapter = (await getReviewAdapter("LAB_REPORT"))!;
    expect(await adapter.routingFacts!(report.id, NOW)).toMatchObject({ chokepointKind: "HOST" });

    // And a rule over it routes a draft into a custom lab queue.
    const queue = await makeQueue("Registrar reports", "LAB_REPORT");
    await makeRule({ name: "Registrars", kind: "LAB_REPORT", condition: { all: [{ field: "chokepointKind", op: "eq", value: "HOST" }] }, destinationQueueId: queue.id });
    const enqueued = await enqueueForReview("LAB_REPORT", report.id, { now: NOW });
    expect(enqueued).toMatchObject({ ok: true });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === report.id)!;
    expect(job.queueId).toBe(queue.id);
    expect(job.enqueueSource).toBe("RULE");
  });
});

// ---------------------------------------------------------------------------
// The Test panel: a dry run

describe("the test panel", () => {
  it("answers for hand-entered values and for an open job, writing nothing", async () => {
    const big = await makeQueue("Big platforms");
    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });
    await makeRule({ name: "Draft everything", kind: "FLAGGED_LINK", condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] }, destinationQueueId: big.id, status: "DRAFT" });

    const byValues = await testRoutingRules({ kind: "FLAGGED_LINK", facts: { platformTier: "TIER_1", urlSource: "SURVIVOR" }, role: SUPER, now: NOW });
    expect(byValues.ok).toBe(true);
    if (!byValues.ok) return;
    // The live rule wins; the draft after it also matches, but as a draft it
    // has no effect either way — the panel says so.
    expect(byValues.results.map((result) => [result.name, result.outcome])).toEqual([
      ["Big platforms", "routed"],
      ["Draft everything", "would_have_matched"],
    ]);
    expect(byValues.results[0]!.conditions).toEqual([{ text: "Platform tier is TIER_1", matched: true }]);
    expect(byValues.chosenQueue).toMatchObject({ id: big.id, viaRuleId: expect.any(String) });

    // No rule matches: the default queue is the answer.
    const none = await testRoutingRules({ kind: "FLAGGED_LINK", facts: { platformTier: "TIER_2" }, role: SUPER, now: NOW });
    expect(none.ok && none.chosenQueue.viaRuleId).toBeNull();

    // An open job's own facts, evaluated against the rules in place.
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-10");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    const byJob = await testRoutingRules({ kind: "FLAGGED_LINK", jobId: job.id, role: SUPER, now: NOW });
    expect(byJob.ok && byJob.chosenQueue.id).toBe(big.id);

    // A dry run: the job never moved and nothing was logged.
    expect(reviewMemory().jobs.get(job.id)!.queueId).toBe(big.id);
    const logsBefore = routingRowsForTest().logs.length;
    await testRoutingRules({ kind: "FLAGGED_LINK", jobId: job.id, role: SUPER, now: NOW });
    expect(routingRowsForTest().logs.length).toBe(logsBefore);

    // The owner alone, and only valid hand-entered facts.
    expect(await errorOf(testRoutingRules({ kind: "FLAGGED_LINK", facts: {}, role: REVIEWER_ROLE }))).toBe("permission_denied");
    expect(await errorOf(testRoutingRules({ kind: "FLAGGED_LINK", facts: { nope: "x" }, role: SUPER }))).toBe("unknown_field");
    expect(await errorOf(testRoutingRules({ kind: "FLAGGED_LINK", facts: { platformTier: "TIER_9" }, role: SUPER }))).toBe("invalid_value");
    expect(await errorOf(testRoutingRules({ kind: "FLAGGED_LINK", jobId: "missing", role: SUPER }))).toBe("job_not_found");
  });

  it("shows a matching draft as would-have-matched with the default queue chosen", async () => {
    const big = await makeQueue("Drafts only");
    await makeRule({ name: "Draft catch-all", kind: "FLAGGED_LINK", condition: { all: [{ field: "urlSource", op: "eq", value: "SURVIVOR" }] }, destinationQueueId: big.id, status: "DRAFT" });
    const result = await testRoutingRules({ kind: "FLAGGED_LINK", facts: { urlSource: "SURVIVOR" }, role: SUPER, now: NOW });
    expect(result.ok && result.results[0]!.outcome).toBe("would_have_matched");
    expect(result.ok && result.chosenQueue.viaRuleId).toBeNull();
    const links = await getReviewQueueByKey("links");
    expect(result.ok && result.chosenQueue.id).toBe(links!.id);
  });
});

// ---------------------------------------------------------------------------
// Queues admin (spec point 6)

describe("queues admin", () => {
  it("adds a custom queue per kind with a derived, stable key", async () => {
    const created = await createReviewQueue({
      name: "High Priority Links",
      description: "The owner looks at these personally.",
      subjectKind: "FLAGGED_LINK",
      requireReasonOnApprove: true,
      role: SUPER,
      actorId: OWNER_ID,
      now: NOW,
    });
    expect(created).toMatchObject({ ok: true, queue: { key: "high-priority-links", isDefault: false, protected: false, requireReasonOnApprove: true } });
    expect(auditEventTypes()).toContain("ADMIN_ACTION");

    // The same name twice cannot shadow the first queue's key.
    expect(
      await errorOf(createReviewQueue({ name: "High Priority Links", subjectKind: "FLAGGED_LINK", role: SUPER, actorId: OWNER_ID, now: NOW })),
    ).toBe("queue_key_exists");
    // The owner alone.
    expect(
      await errorOf(createReviewQueue({ name: "No", subjectKind: "FLAGGED_LINK", role: REVIEWER_ROLE, actorId: "admin-reviewer" })),
    ).toBe("permission_denied");
    // No addresses in a queue name.
    expect(
      await errorOf(createReviewQueue({ name: "See https://forum.example.test/help", subjectKind: "FLAGGED_LINK", role: SUPER, actorId: OWNER_ID })),
    ).toBe("links_not_allowed");
  });

  it("renames only custom queues", async () => {
    const queue = await makeQueue("Renamable");
    const renamed = await renameReviewQueue({
      queueId: queue.id,
      name: "Renamed queue",
      description: "New words.",
      requireReasonOnApprove: true,
      role: SUPER,
      actorId: OWNER_ID,
      now: NOW,
    });
    expect(renamed).toMatchObject({ ok: true, queue: { name: "Renamed queue", key: queue.key, requireReasonOnApprove: true } });

    const links = await getReviewQueueByKey("links");
    expect(await errorOf(renameReviewQueue({ queueId: links!.id, name: "Nope", role: SUPER, actorId: OWNER_ID }))).toBe("system_queue");
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    expect(await errorOf(renameReviewQueue({ queueId: minorHold!.id, name: "Nope", role: SUPER, actorId: OWNER_ID }))).toBe("protected_queue");
  });

  it("archives only empty custom queues that no rule points at", async () => {
    const empty = await makeQueue("Empty queue");
    const archived = await archiveReviewQueue({ queueId: empty.id, role: SUPER, actorId: OWNER_ID, now: NOW });
    expect(archived).toMatchObject({ ok: true });

    // Archived: out of the console, not a destination.
    const summaries = await queueSummaries({ role: SUPER, emailHash: OWNER_HASH }, NOW);
    expect(summaries.some((summary) => summary.key === empty.key)).toBe(false);
    expect(
      await errorOf(
        createRoutingRule({
          name: "Into the archive",
          subjectKind: "FLAGGED_LINK",
          condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] },
          destinationQueueId: empty.id,
          role: SUPER,
          actorEmailHash: OWNER_HASH,
          actorId: OWNER_ID,
        }),
      ),
    ).toBe("queue_archived");

    // A queue with an open item is refused.
    const busy = await makeQueue("Busy queue");
    const { urlId } = await seedFlaggedLink("https://forum.example.test/post/6");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    reviewMemory().jobs.get(job.id)!.queueId = busy.id;
    expect(await errorOf(archiveReviewQueue({ queueId: busy.id, role: SUPER, actorId: OWNER_ID }))).toBe("queue_not_empty");

    // A queue a rule points at is refused.
    const referenced = await makeQueue("Referenced queue");
    await makeRule({ name: "Points here", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: referenced.id });
    expect(await errorOf(archiveReviewQueue({ queueId: referenced.id, role: SUPER, actorId: OWNER_ID }))).toBe("queue_in_use");

    // System queues and the protected queue are never archived.
    const links = await getReviewQueueByKey("links");
    expect(await errorOf(archiveReviewQueue({ queueId: links!.id, role: SUPER, actorId: OWNER_ID }))).toBe("system_queue");
    const minorHold = await getReviewQueueByKey(MINOR_HOLD_QUEUE_KEY);
    expect(await errorOf(archiveReviewQueue({ queueId: minorHold!.id, role: SUPER, actorId: OWNER_ID }))).toBe("protected_queue");
  });

  it("refuses to move a job into an archived queue by hand", async () => {
    const empty = await makeQueue("Archived by hand");
    await archiveReviewQueue({ queueId: empty.id, role: SUPER, actorId: OWNER_ID, now: NOW });
    const { urlId } = await seedFlaggedLink("https://forum.example.test/post/7");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    const job = [...reviewMemory().jobs.values()].find((entry) => entry.subjectId === urlId)!;
    expect(await errorOf(moveJob(job.id, OWNER_HASH, empty.id, { now: NOW }))).toBe("queue_archived");
  });
});

// ---------------------------------------------------------------------------
// No address anywhere

describe("no address in any row", () => {
  it("keeps every rule, version, log and queue row free of address-like text", async () => {
    const big = await makeQueue("Big platforms");
    await makeRule({ name: "Big platforms", kind: "FLAGGED_LINK", condition: { all: [{ field: "platformTier", op: "eq", value: "TIER_1" }] }, destinationQueueId: big.id });
    const { urlId } = await seedFlaggedLink("https://youtube.com/watch?v=example-11");
    await enqueueForReview("FLAGGED_LINK", urlId, { now: NOW });
    await syncReviewJobs(new Date(NOW.getTime() + 60_000));
    // A case note carrying an address is refused; nothing routing-related
    // ever stores one either.
    await addCaseNote({
      caseId: "case-1",
      body: "Look at https://forum.example.test/post/8",
      authorEmailHash: OWNER_HASH,
      authorId: OWNER_ID,
      role: SUPER,
      now: NOW,
    });

    const serialised = JSON.stringify({
      rules: routingRowsForTest().rules,
      logs: routingRowsForTest().logs,
      queues: [...reviewMemory().queues.values()],
      jobs: [...reviewMemory().jobs.values()],
      audit: inMemoryAuditLog.filter((event) => event.eventType === "REVIEW_RULE_CHANGED" || event.eventType === "ADMIN_ACTION"),
    });
    expect(serialised).not.toContain("example.test");
    expect(serialised).not.toContain("youtube.com");
  });
});
