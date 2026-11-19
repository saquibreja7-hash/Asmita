import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Review labels on crawler findings (review labels WP37), memory path and the
// admin route: set and clear each label with who and when, audited like a
// review; label filters on the list; and every "possible minor" block — the
// label moves the finding out of the adult queue into a separate
// MINOR_PROTOCOL state, approval and dismissal are refused, the
// representative notice is refused, and only a second, different admin with a
// reason can clear it. Placeholder data only.

vi.mock("@/lib/auth/middleware", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPermission: vi.fn() }));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createCsrfPair } from "@/lib/csrf";
import { inMemoryAuditLog } from "@/lib/audit";
import { recordCrawlConsent } from "@/lib/crawl-consent";
import { applyFindingLabel, listCrawlFindings, planReview, recordCrawlFindings, reviewCrawlFinding } from "@/lib/crawl-findings";
import { createCrawlSource } from "@/lib/crawl-sources";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { encryptField } from "@/lib/encryption";
import * as store from "@/lib/store";
import * as labelsRoute from "@/app/api/admin/findings/[id]/labels/route";

function admin(sub: string, adminRole = "CASE_REVIEWER") {
  return { ok: true as const, session: { sub, role: "ADMIN", adminRole, mfaComplete: true, emailHash: `hash-${sub}`, namespace: "admin", ageOver18: true } };
}

function request(id: string, body: unknown, csrf = true) {
  const { nonce, token } = createCsrfPair();
  return new Request(`https://asmita.test/api/admin/findings/${id}/labels`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(csrf ? { cookie: `asmita_csrf=${nonce}`, "x-csrf-token": token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

let sourceId: string;

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  resetCrawlMemory();
  store.cases.clear();
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
  const created = await createCrawlSource({ domain: "forum.example.com", pageBudget: 100, delayMs: 1000, enabled: true }, "admin-1");
  if (!created.ok) throw new Error("source");
  sourceId = created.source.id;
  vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function seedFinding(distance = 6) {
  const record = await store.createCase("user-a");
  crawlMemory().fingerprints.set("hs-1", { id: "hs-1", caseId: record.id, hashEncrypted: encryptField("a".repeat(64)), quality: 80, status: "APPROVED", crawlPoolId: null });
  const signed = await recordCrawlConsent({
    caseId: record.id, signedPdfEncrypted: encryptField("placeholder-pdf"), hashSubmissionIds: ["hs-1"],
    templateId: "tpl-1", templateDigest: "digest-1", actorId: "user-a",
  });
  expect(signed.ok).toBe(true);
  const poolId = crawlMemory().fingerprints.get("hs-1")!.crawlPoolId!;
  const reported = await recordCrawlFindings({
    runId: "run-1",
    findings: [{
      fingerprintId: poolId, pageUrl: "https://forum.example.com/thread/1", imageUrl: "https://cdn.example.com/img/1.jpg",
      distance, quality: 90, observedAt: "2026-11-16T10:00:00Z", sourceId,
    }],
  }, "key-1");
  expect(reported.results).toEqual([{ status: "accepted" }]);
  const finding = [...crawlMemory().findings.values()][0];
  return { record, finding };
}

const NOW = new Date("2026-11-19T09:30:00.000Z");

function auditEntries() {
  return inMemoryAuditLog.filter((entry) => entry.eventType === "CRAWL_FINDING_LABEL_SET" || entry.eventType === "CRAWL_FINDING_LABEL_CLEARED");
}

describe("setting and clearing the informational labels", () => {
  it("stores who set a label and when, and audits the set", async () => {
    const { finding } = await seedFinding();
    expect(await applyFindingLabel({ findingId: finding.id, action: "set", label: "aiMade", adminId: "admin-1", now: NOW })).toEqual({ ok: true, changed: true });
    expect(finding).toMatchObject({ labelAiMade: true, labelAiMadeById: "admin-1", labelAiMadeAt: NOW });
    expect(auditEntries()).toHaveLength(1);
    expect(auditEntries()[0]).toMatchObject({ eventType: "CRAWL_FINDING_LABEL_SET", entityId: finding.id, actorId: "admin-1", data: { caseId: finding.caseId, label: "aiMade" } });

    const row = (await listCrawlFindings({ id: finding.id }, "admin-1"))[0];
    expect(row.labels.aiMade).toMatchObject({ set: true, setAt: NOW.toISOString() });
    expect(row.labels.sexual.set).toBe(false);
  });

  it("is a no-op when the label is already set: nothing changes, nothing is audited", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "sexual", adminId: "admin-1", now: NOW });
    expect(await applyFindingLabel({ findingId: finding.id, action: "set", label: "sexual", adminId: "admin-2", now: new Date(NOW.getTime() + 1000) })).toEqual({ ok: true, changed: false });
    // The first setter stays on the row.
    expect(finding.labelSexualById).toBe("admin-1");
    expect(auditEntries()).toHaveLength(1);
  });

  it("clears an informational label and audits the clear", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "sexual", adminId: "admin-1", now: NOW });
    expect(await applyFindingLabel({ findingId: finding.id, action: "clear", label: "sexual", adminId: "admin-2", now: NOW })).toEqual({ ok: true, changed: true });
    expect(finding).toMatchObject({ labelSexual: false, labelSexualById: null, labelSexualAt: null });
    expect(auditEntries()).toHaveLength(2);
    expect(auditEntries()[1]).toMatchObject({ eventType: "CRAWL_FINDING_LABEL_CLEARED", actorId: "admin-2", data: { caseId: finding.caseId, label: "sexual" } });
  });

  it("refuses to clear a label that is not set", async () => {
    const { finding } = await seedFinding();
    expect(await applyFindingLabel({ findingId: finding.id, action: "clear", label: "aiMade", adminId: "admin-1", now: NOW })).toEqual({ ok: false, error: "label_not_set" });
    expect(auditEntries()).toHaveLength(0);
  });

  it("filters the findings list by label", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "aiMade", adminId: "admin-1", now: NOW });
    expect((await listCrawlFindings({ label: "aiMade" })).map((row) => row.id)).toEqual([finding.id]);
    expect(await listCrawlFindings({ label: "sexual" })).toHaveLength(0);
    expect(await listCrawlFindings({ label: "possibleMinor" })).toHaveLength(0);
  });
});

describe("the possible-minor safety switch", () => {
  it("moves a candidate finding into MINOR_PROTOCOL and out of the adult queue", async () => {
    const { finding } = await seedFinding();
    expect(await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW })).toEqual({ ok: true, changed: true });
    expect(finding).toMatchObject({
      reviewStatus: "MINOR_PROTOCOL", minorProtocolBefore: "CANDIDATE",
      labelPossibleMinor: true, labelPossibleMinorById: "admin-1", labelPossibleMinorAt: NOW,
    });
    // Out of the review queue; reachable through the status and label filters.
    expect(await listCrawlFindings({ status: "CANDIDATE" })).toHaveLength(0);
    expect((await listCrawlFindings({ status: "MINOR_PROTOCOL" })).map((row) => row.id)).toEqual([finding.id]);
    expect((await listCrawlFindings({ label: "possibleMinor" })).map((row) => row.id)).toEqual([finding.id]);
    expect(auditEntries()[0]).toMatchObject({
      eventType: "CRAWL_FINDING_LABEL_SET", data: { caseId: finding.caseId, label: "possibleMinor", minorProtocol: true },
    });
  });

  it("blocks approval and dismissal while the label is set", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-2" })).toEqual({ ok: false, error: "minor_protocol_active" });
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "dismiss", reviewerId: "admin-2" })).toEqual({ ok: false, error: "minor_protocol_active" });
    expect(planReview({ distance: 5, reviewStatus: "MINOR_PROTOCOL", reviewedById: null, labelPossibleMinor: true }, "approve", "admin-2")).toEqual({ error: "minor_protocol_active" });
    // The finding itself is unchanged.
    expect(finding.reviewStatus).toBe("MINOR_PROTOCOL");
  });

  it("moves an approved finding out of the adult flow too", async () => {
    const { finding } = await seedFinding();
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" })).toMatchObject({ ok: true, status: "APPROVED" });
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-2", now: NOW });
    expect(finding).toMatchObject({ reviewStatus: "MINOR_PROTOCOL", minorProtocolBefore: "APPROVED" });
  });

  it("records the label on a dismissed finding without moving it", async () => {
    const { finding } = await seedFinding();
    await reviewCrawlFinding({ findingId: finding.id, decision: "dismiss", reviewerId: "admin-1" });
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-2", now: NOW });
    expect(finding).toMatchObject({ reviewStatus: "DISMISSED", minorProtocolBefore: null, labelPossibleMinor: true });
    // Still blocked from the adult flow, whatever its status.
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-3" })).toEqual({ ok: false, error: "minor_protocol_active" });
  });

  it("refuses to let the setter clear it, and to clear without a reason", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    expect(await applyFindingLabel({ findingId: finding.id, action: "clear", label: "possibleMinor", adminId: "admin-1", reason: "checked the case", now: NOW }))
      .toEqual({ ok: false, error: "second_admin_required" });
    expect(await applyFindingLabel({ findingId: finding.id, action: "clear", label: "possibleMinor", adminId: "admin-2", now: NOW }))
      .toEqual({ ok: false, error: "reason_required" });
    expect(finding.labelPossibleMinor).toBe(true);
  });

  it("a second admin clears it with a reason, and the finding returns to review", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    const cleared = await applyFindingLabel({ findingId: finding.id, action: "clear", label: "possibleMinor", adminId: "admin-2", reason: "checked the case file, the survivor is an adult", now: NOW });
    expect(cleared).toEqual({ ok: true, changed: true });
    expect(finding).toMatchObject({
      reviewStatus: "CANDIDATE", minorProtocolBefore: "CANDIDATE", labelPossibleMinor: false,
      labelPossibleMinorById: "admin-1", labelPossibleMinorClearedById: "admin-2", labelPossibleMinorClearedAt: NOW,
      labelPossibleMinorClearReason: "checked the case file, the survivor is an adult",
    });
    expect(auditEntries()[1]).toMatchObject({
      eventType: "CRAWL_FINDING_LABEL_CLEARED", actorId: "admin-2",
      data: { label: "possibleMinor", reason: "checked the case file, the survivor is an adult", restoredTo: "CANDIDATE" },
    });
    // Back in the queue and reviewable again.
    expect(await listCrawlFindings({ status: "CANDIDATE" })).toHaveLength(1);
    expect(await reviewCrawlFinding({ findingId: finding.id, decision: "dismiss", reviewerId: "admin-2" })).toMatchObject({ ok: true, status: "DISMISSED" });
  });

  it("an approved-then-labelled finding returns to APPROVED on clear", async () => {
    const { finding } = await seedFinding();
    await reviewCrawlFinding({ findingId: finding.id, decision: "approve", reviewerId: "admin-1" });
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-2", now: NOW });
    await applyFindingLabel({ findingId: finding.id, action: "clear", label: "possibleMinor", adminId: "admin-3", reason: "case file verified", now: NOW });
    expect(finding.reviewStatus).toBe("APPROVED");
  });

  it("a re-set after a clear starts the clear record over", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    await applyFindingLabel({ findingId: finding.id, action: "clear", label: "possibleMinor", adminId: "admin-2", reason: "first clear", now: NOW });
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-3", now: NOW });
    expect(finding).toMatchObject({
      labelPossibleMinor: true, labelPossibleMinorById: "admin-3",
      labelPossibleMinorClearedById: null, labelPossibleMinorClearReason: null, reviewStatus: "MINOR_PROTOCOL",
    });
  });

  it("the list tells the setter they cannot clear it, and nobody else's identity", async () => {
    const { finding } = await seedFinding();
    await applyFindingLabel({ findingId: finding.id, action: "set", label: "possibleMinor", adminId: "admin-1", now: NOW });
    const setterView = (await listCrawlFindings({ id: finding.id }, "admin-1"))[0];
    const otherView = (await listCrawlFindings({ id: finding.id }, "admin-2"))[0];
    expect(setterView.currentAdminSetMinorLabel).toBe(true);
    expect(otherView.currentAdminSetMinorLabel).toBe(false);
    expect(JSON.stringify(setterView)).not.toContain("admin-1");
    expect(JSON.stringify(setterView)).not.toContain("admin-2");
  });
});

describe("the labels route", () => {
  it("refuses everything while the crawler is switched off", async () => {
    vi.stubEnv("ENABLE_CRAWLER", "");
    const response = await labelsRoute.POST(request("f1", { action: "set", label: "aiMade" }), { params: Promise.resolve({ id: "f1" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "crawler_disabled" });
  });

  it("checks the CSRF token, the admin permission and the payload", async () => {
    const { finding } = await seedFinding();
    const context = { params: Promise.resolve({ id: finding.id }) };
    expect((await labelsRoute.POST(request(finding.id, { action: "set", label: "aiMade" }, false), context)).status).toBe(403);
    vi.mocked(requireAdminPermission).mockResolvedValue({ ok: false, status: 403, error: "permission_denied" } as never);
    expect(await labelsRoute.POST(request(finding.id, { action: "set", label: "aiMade" }), context)).toMatchObject({ status: 403 });
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-1") as never);
    for (const bad of [{ action: "set" }, { action: "set", label: "other" }, { action: "set", label: "aiMade", extra: 1 }, {}]) {
      const response = await labelsRoute.POST(request(finding.id, bad), context);
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_payload" });
    }
  });

  it("sets a label through the route and answers with what changed", async () => {
    const { finding } = await seedFinding();
    const response = await labelsRoute.POST(request(finding.id, { action: "set", label: "aiMade" }), { params: Promise.resolve({ id: finding.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, changed: true });
    expect(finding.labelAiMade).toBe(true);
    expect(requireAdminPermission).toHaveBeenCalledWith("findings:review");
  });

  it("maps the possible-minor refusals to their codes", async () => {
    const { finding } = await seedFinding();
    const context = { params: Promise.resolve({ id: finding.id }) };
    await labelsRoute.POST(request(finding.id, { action: "set", label: "possibleMinor" }), context);
    const self = await labelsRoute.POST(request(finding.id, { action: "clear", label: "possibleMinor", reason: "x" }), context);
    expect(self.status).toBe(409);
    expect(await self.json()).toEqual({ error: "second_admin_required" });
    vi.mocked(requireAdminPermission).mockResolvedValue(admin("admin-2") as never);
    const noReason = await labelsRoute.POST(request(finding.id, { action: "clear", label: "possibleMinor" }), context);
    expect(noReason.status).toBe(400);
    expect(await noReason.json()).toEqual({ error: "reason_required" });
    const cleared = await labelsRoute.POST(request(finding.id, { action: "clear", label: "possibleMinor", reason: "checked the case file" }), context);
    expect(cleared.status).toBe(200);
  });

  it("answers 404 for an unknown finding", async () => {
    const response = await labelsRoute.POST(request("missing", { action: "set", label: "aiMade" }), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "finding_not_found" });
  });
});
