import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WP1 on the Prisma (Node) path, against a mocked client: a survivor's link
// (through the hourly sweep, never inside her request — review fix) and an
// approved finding create a REPORTED CrawlSource; never-crawl hosts
// create nothing; account erasure never touches CrawlSource. Placeholder
// hosts only.

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const self = {
    crawlSource: { findFirst: fn(), findMany: fn(), create: fn(), createMany: fn(), deleteMany: fn(), updateMany: fn() },
    crawlBlockedHost: { findFirst: fn(), findMany: fn() },
    crawlFinding: { findUnique: fn(), findMany: fn(), deleteMany: fn(), updateMany: fn() },
    // WP28 (ADR 008): the erasure deletes the case's SSCD embeddings too.
    findingEmbedding: { deleteMany: fn() },
    crawlConsent: { findMany: fn(), deleteMany: fn() },
    submittedUrl: { findMany: fn(), findFirst: fn(), findUnique: fn(), create: fn(), updateMany: fn(), deleteMany: fn() },
    hashSubmission: { updateMany: fn() },
    platform: { findFirst: fn() },
    case: { create: fn(), findMany: fn(), findFirst: fn(), updateMany: fn() },
    user: { findUnique: fn(), updateMany: fn(), update: fn() },
    notice: { findMany: fn(), deleteMany: fn() },
    auditLog: { findMany: fn() },
    emailDeliveryProof: { deleteMany: fn() },
    hashDispatch: { updateMany: fn() },
    escalation: { deleteMany: fn() },
    urlPortalToken: { deleteMany: fn() },
    linkVerification: { deleteMany: fn() },
    feedback: { deleteMany: fn() },
    adminAccessLog: { updateMany: fn() },
    sessionToken: { deleteMany: fn() },
    otpToken: { deleteMany: fn() },
    deletionJob: { findMany: fn(), updateMany: fn() },
    $queryRaw: fn(),
    $transaction: fn(),
  };
  return self;
});

vi.mock("@/lib/worker-kysely", () => ({ usesWorkerKysely: () => false, getWorkerDb: () => { throw new Error("no worker db"); } }));
vi.mock("@/lib/db", () => ({ db }));

import { addUrlsToCase, registerCaseWithUrls, hardDeleteDueUsers } from "@/lib/case-ops";
import { createReportedSourcesFromSubmittedUrls } from "@/lib/crawl-sources";
import { reviewCrawlFinding } from "@/lib/crawl-findings";
import { encryptField } from "@/lib/encryption";

const PAGE = "https://forum.example.com/thread/1";
const CONSENT = { id: "consent-1", hashSubmissionIds: ["h1"], signedAt: new Date("2026-11-01T00:00:00Z") };

const zeroCounts: Array<[Record<string, ReturnType<typeof vi.fn>>, string]> = [
  [db.emailDeliveryProof, "deleteMany"], [db.hashDispatch, "updateMany"], [db.escalation, "deleteMany"],
  [db.urlPortalToken, "deleteMany"], [db.linkVerification, "deleteMany"], [db.submittedUrl, "deleteMany"], [db.crawlFinding, "deleteMany"],
  [db.crawlConsent, "deleteMany"], [db.hashSubmission, "updateMany"], [db.feedback, "deleteMany"],
  [db.adminAccessLog, "updateMany"], [db.case, "updateMany"], [db.sessionToken, "deleteMany"],
  [db.otpToken, "deleteMany"], [db.notice, "deleteMany"],
];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  // The case-row lock finds the case; the consent lock finds the live authorisation.
  db.$queryRaw.mockImplementation(async (q: string[]) =>
    (q as string[]).join("?").includes('FROM "Case"') ? [{ id: "c1" }] : [{ ...CONSENT, caseId: "c1" }]);
  db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => run(db));
  for (const [delegate, method] of zeroCounts) delegate[method].mockResolvedValue({ count: 0 });

  db.submittedUrl.findMany.mockResolvedValue([]);
  db.submittedUrl.findFirst.mockResolvedValue(null);
  const storedUrl = (data: Record<string, unknown>) => ({
    id: "url-new", caseId: "c1", urlEncrypted: "enc", urlHash: "h", platformId: null,
    status: "PENDING_REVIEW", flaggedForReview: false, flagReason: null, signedNoticePdf: null, source: "SURVIVOR",
    crawlFindingId: null, crawlConsentWithdrawnAt: null, representativeNoticePdf: null, platformFiledAt: null,
    submittedAt: new Date(), notices: [], domain: data.domain,
  });
  db.submittedUrl.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => storedUrl(data));
  db.crawlSource.findFirst.mockResolvedValue(null);
  db.crawlSource.create.mockResolvedValue({ id: "src-new" });
  db.crawlBlockedHost.findFirst.mockResolvedValue(null);
  db.crawlBlockedHost.findMany.mockResolvedValue([]);
  // Existing-domain lookups find nothing; the re-read by generated ids
  // returns exactly the rows createMany was given.
  db.crawlSource.findMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) => {
    if (!where.id) return [];
    const inserted = db.crawlSource.createMany.mock.calls.flatMap((call) => call[0].data as Array<{ id: string; domain: string }>);
    return inserted.filter((row) => where.id!.in.includes(row.id)).map((row) => ({ id: row.id, domain: row.domain }));
  });
  db.crawlSource.createMany.mockResolvedValue({ count: 0 });
  db.platform.findFirst.mockResolvedValue(null);
  db.crawlFinding.findUnique.mockResolvedValue(null);
  db.crawlFinding.findMany.mockResolvedValue([]);
  db.crawlFinding.updateMany.mockResolvedValue({ count: 1 });
  db.crawlConsent.findMany.mockResolvedValue([{ ...CONSENT, caseId: "c1" }]);
  db.case.findMany.mockResolvedValue([]);
  db.case.findFirst.mockResolvedValue(null);
  db.case.create.mockResolvedValue({ id: "case-new", referenceNumber: "ASMITA-2026-00001" });
  db.user.findUnique.mockResolvedValue({ emailHash: "hash-1" });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.update.mockResolvedValue({});
  db.notice.findMany.mockResolvedValue([]);
  db.auditLog.findMany.mockResolvedValue([]);
  db.deletionJob.findMany.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** Unchecked submitted links for the sweep's first read, in submission order. */
function unchecked(...domains: string[]) {
  db.submittedUrl.findMany.mockResolvedValueOnce(domains.map((domain, index) => ({ id: `url-${index + 1}`, domain })));
}

describe("addUrlsToCase, database path", () => {
  it("storing her link never touches CrawlSource or the blocked-host table", async () => {
    const [result] = await addUrlsToCase("c1", [PAGE]);
    expect(result).toMatchObject({ ok: true, duplicate: false });
    expect(db.crawlBlockedHost.findFirst).not.toHaveBeenCalled();
    expect(db.crawlBlockedHost.findMany).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
    expect(db.crawlSource.createMany).not.toHaveBeenCalled();
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
  });
});

describe("the reported-source sweep, database path", () => {
  it("creates one enabled REPORTED source for the link's host with the env defaults, and no case or survivor data on the row", async () => {
    vi.stubEnv("CRAWLER_REPORTED_PAGE_BUDGET", "777");
    vi.stubEnv("CRAWLER_DEFAULT_DELAY_MS", "2500");
    const now = new Date("2026-11-17T10:00:00Z");
    unchecked("forum.example.com");
    expect(await createReportedSourcesFromSubmittedUrls(now)).toEqual({ checked: 1, created: 1 });
    expect(db.submittedUrl.findMany.mock.calls[0][0]).toMatchObject({ where: { crawlSourceChecked: false }, select: { id: true, domain: true } });
    expect(db.crawlBlockedHost.findMany).toHaveBeenCalledTimes(1);
    expect(db.crawlSource.createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = db.crawlSource.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      domain: "forum.example.com", pageBudget: 777, delayMs: 2500, enabled: true, origin: "REPORTED",
      hops: 0, approvedBy: null, discoveredFromId: null, createdAt: now,
    });
    expect(data[0]).not.toHaveProperty("caseId");
    expect(data[0]).not.toHaveProperty("userId");
    // The re-read is by the ids this call generated, never by domain.
    const reread = db.crawlSource.findMany.mock.calls.at(-1)![0];
    expect(reread.where).toEqual({ id: { in: [data[0].id] } });
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["url-1"] } }, data: { crawlSourceChecked: true } });
  });

  it("a host that already has a source creates no second source, and the link is still marked checked", async () => {
    db.crawlSource.findMany.mockResolvedValueOnce([{ domain: "forum.example.com" }]);
    unchecked("forum.example.com", "forum.example.com");
    expect(await createReportedSourcesFromSubmittedUrls()).toEqual({ checked: 2, created: 0 });
    expect(db.crawlSource.createMany).not.toHaveBeenCalled();
    expect(db.submittedUrl.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["url-1", "url-2"] } }, data: { crawlSourceChecked: true } });
  });

  it("a never-crawl host reaches neither the blocked-host table nor the source table", async () => {
    unchecked("instagram.com");
    expect(await createReportedSourcesFromSubmittedUrls()).toEqual({ checked: 1, created: 0 });
    expect(db.crawlBlockedHost.findMany).not.toHaveBeenCalled();
    expect(db.crawlSource.findMany).not.toHaveBeenCalled();
    expect(db.crawlSource.createMany).not.toHaveBeenCalled();
    expect(db.submittedUrl.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a host blocked by a CrawlBlockedHost row creates no source, for the host and its subdomains", async () => {
    db.crawlBlockedHost.findMany.mockResolvedValue([{ host: "blocked.example.org" }]);
    unchecked("blocked.example.org", "deep.forum.blocked.example.org");
    expect(await createReportedSourcesFromSubmittedUrls()).toEqual({ checked: 2, created: 0 });
    const asked = db.crawlBlockedHost.findMany.mock.calls[0][0].where.host.in as string[];
    expect(asked).toContain("blocked.example.org");
    expect(asked).toContain("example.org");
    expect(db.crawlSource.createMany).not.toHaveBeenCalled();
  });

  it("a failure while creating the source leaves the links unchecked for the next sweep", async () => {
    db.crawlSource.createMany.mockRejectedValue(new Error("db down"));
    unchecked("forum.example.com");
    await expect(createReportedSourcesFromSubmittedUrls()).rejects.toThrow("db down");
    expect(db.submittedUrl.updateMany).not.toHaveBeenCalled();
  });
});

describe("registerCaseWithUrls, database path", () => {
  it("stores the links without creating a source; the sweep then creates one source per host, sorted", async () => {
    const outcome = await registerCaseWithUrls("user-1", [PAGE, "https://forum.example.com/thread/2", "https://other.example.org/a"]);
    expect(outcome).toMatchObject({ ok: true, accepted: 3 });
    expect(db.crawlSource.create).not.toHaveBeenCalled();
    expect(db.crawlSource.createMany).not.toHaveBeenCalled();

    unchecked("other.example.org", "forum.example.com", "forum.example.com");
    expect(await createReportedSourcesFromSubmittedUrls()).toEqual({ checked: 3, created: 2 });
    const data = db.crawlSource.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data.map((row) => row.domain)).toEqual(["forum.example.com", "other.example.org"]);
    for (const row of data) expect(row).toMatchObject({ origin: "REPORTED", enabled: true });
  });

  it("a replayed registration creates nothing", async () => {
    db.case.findFirst.mockResolvedValue({ id: "c1", referenceNumber: "ASMITA-2026-00042", _count: { submittedUrls: 1 } });
    const replay = await registerCaseWithUrls("user-1", [PAGE], { registrationKeyHash: "key-1" });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
  });
});

describe("an approved crawler finding, database path", () => {
  const finding = (pageUrl: string) => ({
    id: "cf1", caseId: "c1", hashSubmissionId: "h1", distance: 6, reviewStatus: "CANDIDATE", reviewedById: null,
    firstSeenAt: new Date(), pageUrlEncrypted: encryptField(pageUrl), imageUrlEncrypted: encryptField("https://cdn.example.com/i.jpg"),
  });

  it("creates a REPORTED source for the finding's page host", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(finding("https://deep.forum.example.com/t/1"));
    const outcome = await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED", createdUrl: true });
    expect(db.crawlSource.create).toHaveBeenCalledTimes(1);
    expect(db.crawlSource.create.mock.calls[0][0].data).toMatchObject({ domain: "deep.forum.example.com", origin: "REPORTED", enabled: true, pageBudget: 2000, delayMs: 1500 });
  });

  it("a finding on a host that already has a source creates nothing", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(finding(PAGE));
    db.crawlSource.findFirst.mockResolvedValue({ id: "src-existing" });
    const outcome = await reviewCrawlFinding({ findingId: "cf1", decision: "approve", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "APPROVED" });
    expect(db.crawlSource.create).not.toHaveBeenCalled();
  });

  it("a dismissed finding creates nothing", async () => {
    db.crawlFinding.findUnique.mockResolvedValue(finding("https://deep.forum.example.com/t/1"));
    const outcome = await reviewCrawlFinding({ findingId: "cf1", decision: "dismiss", reviewerId: "admin-1" });
    expect(outcome).toMatchObject({ ok: true, status: "DISMISSED" });
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
  });
});

describe("account erasure, database path", () => {
  it("hard-deletes the survivor without touching any CrawlSource row", async () => {
    db.deletionJob.findMany.mockResolvedValue([{ id: "job-1", case: { userId: "user-1" } }]);
    db.case.findMany.mockResolvedValue([{ id: "c1", referenceNumber: "ASMITA-2026-00042" }]);
    const deleted = await hardDeleteDueUsers(new Date());
    expect(deleted).toEqual(["user-1"]);
    expect(db.crawlSource.findFirst).not.toHaveBeenCalled();
    expect(db.crawlSource.create).not.toHaveBeenCalled();
    expect(db.crawlSource.deleteMany).not.toHaveBeenCalled();
    expect(db.crawlSource.updateMany).not.toHaveBeenCalled();
  });
});
