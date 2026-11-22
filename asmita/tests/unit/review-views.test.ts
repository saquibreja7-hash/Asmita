import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP141 (review-console-spec.md): the review screens' read models on the
// memory backend — the subject card in the words each kind's own page uses,
// the queue preview that claims nothing, the case context (reference,
// timeline, previous decisions with "You"/short handles), and the claim
// state. Invented hosts and placeholder ids only; the no-address assertion
// checks no view ever carries a full submitted URL.

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { inMemoryAuditLog } from "@/lib/audit";
import { addUrlsToCase as storeAddUrls, cases, createCase } from "@/lib/store";
import { crawlMemory, resetCrawlMemory, type MemoryCrawlFinding } from "@/lib/crawl-store";
import { resetLabMemory, labMemory } from "@/lib/lab/lab-store";
import { partnerApplications } from "@/lib/platform-partners";
import { encryptField } from "@/lib/encryption";
import { resetMemoryHashStore } from "@/lib/hash-submission";
import {
  claimNextJob,
  getReviewQueueByKey,
  resetReviewMemory,
  reviewMemory,
  syncReviewJobs,
} from "@/lib/review-jobs";
import {
  caseReferenceFor,
  caseTimelineFor,
  claimHeldBy,
  countPendingJobsForQueue,
  listCaseDecisions,
  listOtherOpenJobsForCase,
  listQueuePreview,
  reviewerHandle,
  shortAge,
} from "@/lib/review-views";
import { describeReviewSubject } from "@/app/(admin)/review/subject-view";

const NOW = new Date("2026-11-22T12:00:00Z");
const ME = "hash-me";
const COLLEAGUE = "hash-colleague";

async function seedFlaggedLink(url = "https://forum.example.test/post/1", flagReasons = ["many_unrelated_domains"]) {
  const record = await createCase("user-1");
  const [result] = await storeAddUrls(record.id, [url], { flagReasons });
  if (!result.ok) throw new Error("expected accepted URL");
  return { caseId: record.id, referenceNumber: record.referenceNumber, urlId: result.url.id };
}

function seedFinding(overrides: Partial<MemoryCrawlFinding> = {}) {
  const id = `finding-${Math.random().toString(36).slice(2, 10)}`;
  const finding: MemoryCrawlFinding = {
    id,
    caseId: "case-finding",
    hashSubmissionId: "hash-finding",
    crawlConsentId: null,
    pageUrlEncrypted: encryptField("https://forum.example.test/page/1"),
    imageUrlEncrypted: encryptField("https://cdn.example.test/img/1"),
    urlDigest: `digest-${Math.random().toString(36).slice(2, 10)}`,
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
  // A live authorisation for the case, so the consent line reads as live.
  crawlMemory().consents.push({
    id: `consent-${id}`,
    caseId: finding.caseId,
    signedPdfEncrypted: "unused",
    hashSubmissionIds: [finding.hashSubmissionId],
    templateId: "template-1",
    templateDigest: "digest-1",
    signedAt: NOW,
    withdrawnAt: null,
  });
  return finding;
}

function seedPartnerApplication() {
  const application = {
    id: `application-${Math.random().toString(36).slice(2, 10)}`,
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
  return application;
}

function seedLabDraft() {
  const report = {
    id: `lab-report-${Math.random().toString(36).slice(2, 10)}`,
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
    bulkProviderName: null,
    bulkAbuseContact: null,
    bulkServiceIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
  labMemory().reports.set(report.id, report);
  return report;
}

/** Every view object under test, serialised, for the no-address assertions. */
function collected(...values: unknown[]): string {
  return JSON.stringify(values);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("ENABLE_CRAWLER", "true");
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  resetReviewMemory();
  resetCrawlMemory();
  resetLabMemory();
  resetMemoryHashStore();
  cases.clear();
  partnerApplications.length = 0;
  inMemoryAuditLog.splice(0, inMemoryAuditLog.length);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the subject card, in the words of each kind's own page", () => {
  it("describes a flagged link with the Flagged page's own facts and wording", async () => {
    const link = await seedFlaggedLink("https://forum.example.test/post/9");
    const card = await describeReviewSubject("FLAGGED_LINK", link.urlId, NOW);
    expect(card).not.toBeNull();
    expect(card!.summary).toBe("Link on forum.example.test · Unknown - will be reviewed");
    expect(card!.caseReference).toBe(link.referenceNumber);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Address"]).toBe("forum.example.test");
    expect(byLabel["Reason"]).toBe("Unknown platform: investigate public reporting routes");
    expect(byLabel["Status"]).toBe("pending review");
    expect(collected(card)).not.toContain("https://");
  });

  it("keeps a known platform's link approvable-looking words and no path", async () => {
    const link = await seedFlaggedLink("https://youtube.com/watch?v=asmita-example");
    const card = await describeReviewSubject("FLAGGED_LINK", link.urlId, NOW);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Platform"]).toBe("YouTube");
    expect(byLabel["Reason"]).toBe("many_unrelated_domains");
    // The domain is shown; the full submitted address never is.
    expect(collected(card)).not.toContain("watch?v=");
  });

  it("describes a fingerprint with the hashes page's facts", async () => {
    const { addHashesToCase } = await import("@/lib/hash-submission");
    const record = await createCase("user-2");
    await addHashesToCase(record.id, [{ hash: "a".repeat(64), quality: 80 }]);
    const queue = (await import("@/lib/hash-submission")).listHashReviewQueue;
    const [row] = await queue();
    const card = await describeReviewSubject("FINGERPRINT", row.id, NOW);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Algorithm"]).toBe("PDQ");
    expect(byLabel["Quality"]).toBe("80/100");
    expect(byLabel["Status"]).toBe("pending review");
    expect(byLabel["Case"]).toBe(record.referenceNumber);
    expect(collected(card)).not.toContain("https://");
  });

  it("describes a finding with the match, labels, consent scope and purged state", async () => {
    const finding = seedFinding({ labelSexual: true, labelSexualAt: NOW, labelSexualById: "admin-1" });
    const card = await describeReviewSubject("FINDING", finding.id, NOW);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Match"]).toBe("Distance 5 (lower is closer)");
    expect(byLabel["Labels"]).toBe("Sexual content");
    expect(byLabel["Consent"]).toBe("Matched under her live crawl authorisation.");
    expect(byLabel["Review"]).toBe("Needs review");
    expect(card!.urlsPurged).toBe(false);
    expect(collected(card)).not.toContain("page/1");
    expect(collected(card)).not.toContain("img/1");
  });

  it("says purged findings are purged and keeps every address out", async () => {
    const finding = seedFinding();
    const purged = seedFinding({ pageUrlEncrypted: "", imageUrlEncrypted: "" });
    const cards = await Promise.all([
      describeReviewSubject("FINDING", finding.id, NOW),
      describeReviewSubject("FINDING", purged.id, NOW),
    ]);
    expect(cards[0]!.urlsPurged).toBe(false);
    expect(cards[1]!.urlsPurged).toBe(true);
    expect(cards[1]!.fields.find((field) => field.label === "Consent")!.value).toContain("Matched under her live crawl authorisation");
    expect(collected(cards)).not.toContain("page/1");
    expect(collected(cards)).not.toContain("img/1");
  });

  it("describes a partner application with the partners page's fields", async () => {
    const application = seedPartnerApplication();
    const card = await describeReviewSubject("PARTNER_APPLICATION", application.id, NOW);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Platform"]).toBe("Example Forum");
    expect(byLabel["Contact"]).toBe("Example Contact, Trust & Safety");
    expect(byLabel["Status"]).toBe("new");
    expect(card!.caseId).toBeNull();
  });

  it("describes a lab report through the registered Lab adapter, without lab imports here", async () => {
    const report = seedLabDraft();
    const card = await describeReviewSubject("LAB_REPORT", report.id, NOW);
    const byLabel = Object.fromEntries(card!.fields.map((field) => [field.label, field.value]));
    expect(byLabel["Subject"]).toBe("Example abuse report");
    expect(byLabel["Status"]).toBe("Draft, waiting to be sent");
  });

  it("answers null for a subject that no longer resolves", async () => {
    expect(await describeReviewSubject("FLAGGED_LINK", "missing-url", NOW)).toBeNull();
  });
});

describe("the queue preview claims nothing", () => {
  it("lists pending jobs with ages and holders, and leaves every lease untouched", async () => {
    const one = await seedFlaggedLink("https://one.example.test/post/1");
    await seedFlaggedLink("https://two.example.test/post/2");
    resetReviewMemory();
    await syncReviewJobs(NOW);
    const links = await getReviewQueueByKey("links");
    if (!links) throw new Error("links queue missing");

    const before = await listQueuePreview(links, { emailHash: ME }, NOW);
    expect(before).toHaveLength(2);
    expect(before.every((row) => row.heldBy === null)).toBe(true);
    expect(before[0].subjectId).toBe(one.urlId);

    // Listing again changed nothing: nobody gained a lease.
    const again = await listQueuePreview(links, { emailHash: ME }, NOW);
    expect(again).toHaveLength(2);
    expect([...reviewMemory().jobs.values()].every((job) => job.claimedBy === null)).toBe(true);

    const claim = await claimNextJob({ queueId: links.id, role: "CASE_REVIEWER", reviewerEmailHash: ME, now: NOW });
    const mine = await listQueuePreview(links, { emailHash: ME }, NOW);
    const theirs = await listQueuePreview(links, { emailHash: COLLEAGUE }, NOW);
    expect(mine.find((row) => row.jobId === claim.job!.id)?.heldBy).toBe("you");
    expect(theirs.find((row) => row.jobId === claim.job!.id)?.heldBy).toBe("another");
    expect(collected(before, mine, theirs)).not.toContain("https://");
  });

  it("counts the pending jobs of one queue", async () => {
    await seedFlaggedLink("https://one.example.test/post/1");
    await seedFlaggedLink("https://two.example.test/post/2");
    resetReviewMemory();
    await syncReviewJobs(NOW);
    const links = await getReviewQueueByKey("links");
    const fingerprints = await getReviewQueueByKey("fingerprints");
    expect(await countPendingJobsForQueue(links!.id)).toBe(2);
    expect(await countPendingJobsForQueue(fingerprints!.id)).toBe(0);
  });
});

describe("the claim state", () => {
  it("treats only an unexpired own lease as held", async () => {
    await seedFlaggedLink();
    resetReviewMemory();
    await syncReviewJobs(NOW);
    const links = await getReviewQueueByKey("links");
    const { job } = await claimNextJob({ queueId: links!.id, role: "CASE_REVIEWER", reviewerEmailHash: ME, now: NOW });
    expect(claimHeldBy(job!, ME, NOW)).toBe(true);
    expect(claimHeldBy(job!, COLLEAGUE, NOW)).toBe(false);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(claimHeldBy(job!, ME, later)).toBe(false);
  });
});

describe("the case context of a job", () => {
  it("gives the reference, the other open jobs and the timeline", async () => {
    // One case, two flagged links: the second is the "other open job".
    const record = await createCase("user-1");
    const [first, second] = await storeAddUrls(record.id, [
      "https://one.example.test/post/1",
      "https://two.example.test/post/2",
    ], { flagReasons: ["many_unrelated_domains"] });
    if (!first.ok || !second.ok) throw new Error("expected accepted URLs");
    resetReviewMemory();
    await syncReviewJobs(NOW);

    const reference = await caseReferenceFor(record.id);
    expect(reference).toBe(record.referenceNumber);

    const job = [...reviewMemory().jobs.values()].find((item) => item.subjectId === first.url.id)!;
    const others = await listOtherOpenJobsForCase(record.id, job.id, NOW);
    expect(others).toHaveLength(1);
    expect(others[0].queueName).toBe("Flagged links");

    const timeline = await caseTimelineFor(record.id, first.url.id);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.some((event) => event.eventType === "URL_SUBMITTED")).toBe(true);
    // The timeline carries event names and times, never an address.
    expect(collected(timeline)).not.toContain("https://");
  });

  it("shows previous decisions as You, a short handle or System, never an email or note", async () => {
    const { decideJob } = await import("@/lib/review-jobs");
    const link = await seedFlaggedLink("https://forum.example.test/post/1", ["many_unrelated_domains"]);
    resetReviewMemory();
    await syncReviewJobs(NOW);
    const links = await getReviewQueueByKey("links");
    const { job } = await claimNextJob({ queueId: links!.id, role: "CASE_REVIEWER", reviewerEmailHash: ME, now: NOW });
    const decided = await decideJob({
      jobId: job!.id,
      me: ME,
      reviewerId: "admin-1",
      role: "CASE_REVIEWER",
      decision: "reject",
      reasonNote: "internal note, never shown",
      now: NOW,
    });
    expect(decided.ok).toBe(true);

    const mine = await listCaseDecisions(link.caseId, ME);
    expect(mine).toHaveLength(1);
    expect(mine[0].reviewer).toBe("You");
    expect(mine[0].decisionLabel).toBe("Rejected");
    expect(collected(mine)).not.toContain("internal note");

    const theirs = await listCaseDecisions(link.caseId, COLLEAGUE);
    expect(theirs[0].reviewer).toMatch(/^Reviewer /);
    expect(theirs[0].reviewer).not.toContain("@");
  });

  it("labels the system's close_stale and keeps the encrypted note out", async () => {
    await seedFlaggedLink();
    resetReviewMemory();
    await syncReviewJobs(NOW);
    // Decide the subject outside the console; the sync then closes the job.
    const { reviewSubmittedUrl } = await import("@/lib/case-ops");
    const seeded = cases.values().next().value!;
    const url = seeded.urls[0];
    await reviewSubmittedUrl({ caseId: seeded.id, urlId: url.id, decision: "reject", reason: "survivor-visible" });
    await syncReviewJobs(NOW);
    const rows = await listCaseDecisions(seeded.id, ME);
    expect(rows.some((row) => row.reviewer === "System" && row.decisionLabel === "Closed (resolved elsewhere)")).toBe(true);
  });
});

describe("handles and ages", () => {
  it("never derives a handle from anything but the hash", () => {
    expect(reviewerHandle(ME, ME)).toBe("You");
    expect(reviewerHandle("", ME)).toBe("System");
    expect(reviewerHandle("abcd1234ef", ME)).toBe("Reviewer abcd");
  });

  it("formats ages in the console's wording", () => {
    expect(shortAge(45 * 60_000)).toBe("45m");
    expect(shortAge(3 * 60 * 60_000 + 10 * 60_000)).toBe("3h 10m");
    expect(shortAge(30 * 60 * 60_000)).toBe("30h");
    expect(shortAge(54 * 60 * 60_000)).toBe("2d 6h");
  });
});
