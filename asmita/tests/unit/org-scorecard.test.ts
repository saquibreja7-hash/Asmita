import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  inMemoryAuditLog: [],
}));

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { writeAuditLog } from "@/lib/audit";
import { createCsrfPair } from "@/lib/csrf";
import { GET as LIST, POST as COMPUTE } from "@/app/api/admin/org/scorecard/route";
import { GET as GET_SNAPSHOT, PUT as PUT_SNAPSHOT } from "@/app/api/admin/org/scorecard/[id]/route";
import { GET as GET_CSV } from "@/app/research/platform-scorecard.csv/route";
import {
  SCORECARD_DEADLINE_TEXT,
  SCORECARD_MIN_NOTICES_TEXT,
} from "@/app/(public)/research/platform-scorecard/page";
import {
  aggregateScorecard,
  latestCompletedScorecardPeriod,
  scorecardCsv,
  scorecardPeriodOf,
  SCORECARD_MIN_NOTICES,
  type ScorecardHashAdvisory,
  type ScorecardUrlNotice,
} from "@/lib/scorecard";
import {
  ensureLatestScorecardSnapshot,
  hasPublishedScorecard,
  latestPublishedScorecard,
  listPublishedScorecardPeriods,
  publishScorecardSnapshot,
  recomputeScorecardSnapshot,
  saveScorecardNote,
  scorecardSnapshots,
  type ScorecardSnapshot,
} from "@/lib/scorecard-snapshots";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { listPublishedOrgPosts, orgPostHref, orgPosts, type OrgPost } from "@/lib/org-posts";

// WP58 (docs/org/spec.md): the scorecard aggregation (fixtures, the
// small-number rule, medians, the deadline, quarters), the snapshot store
// and its admin APIs (permission, CSRF, notes, publish), the CSV output,
// the /research lists with and without posts, and the page agreeing with
// the constants it quotes. Synthetic data only.

// ─── Aggregation ────────────────────────────────────────────────────────────

const SENT = "2026-08-15T10:00:00.000Z";
const at = (hours: number) => new Date(new Date(SENT).getTime() + hours * 3_600_000).toISOString();
const notice = (overrides: Partial<ScorecardUrlNotice> = {}): ScorecardUrlNotice => ({
  platformId: "platform-a",
  sentAt: SENT,
  urlStatus: "NOTICE_SENT",
  responseType: null,
  firstResponseAt: null,
  removedAt: null,
  followUps: 0,
  ...overrides,
});

function platformAFixtures() {
  const urlNotices: ScorecardUrlNotice[] = [
    notice({ removedAt: at(1.5), responseType: "REMOVED", firstResponseAt: at(1.5), followUps: 1 }),
    notice({ removedAt: at(2), responseType: "REMOVED", firstResponseAt: at(2) }),
    notice({ removedAt: at(10), responseType: "REMOVED", firstResponseAt: at(10), followUps: 1 }),
    notice({ removedAt: at(12), responseType: "REMOVED", firstResponseAt: at(12) }),
    notice({ responseType: "REMOVED", firstResponseAt: at(1) }), // confirmed, no removal time
    notice({ urlStatus: "REMOVED" }), // she marked it removed herself: no time recorded
    notice({ urlStatus: "REMOVED" }),
    notice({ responseType: "ACKNOWLEDGED", firstResponseAt: at(20) }),
    notice({ responseType: "ACKNOWLEDGED", firstResponseAt: at(100) }),
    notice(),
    notice(),
    notice(),
  ];
  const hashAdvisories: ScorecardHashAdvisory[] = [
    { platformId: "platform-a", dispatchedAt: SENT },
    { platformId: "platform-a", dispatchedAt: SENT },
    { platformId: "platform-a", dispatchedAt: SENT },
  ];
  const platformNames = { "platform-a": "Example Chat", "platform-b": "Tiny Forum", "platform-c": "Example, Inc." };
  return { urlNotices, hashAdvisories, platformNames };
}

describe("aggregateScorecard", () => {
  it("computes the full set of metrics for one platform and one quarter", () => {
    const { urlNotices, hashAdvisories, platformNames } = platformAFixtures();
    const data = aggregateScorecard({ period: "2026-Q3", urlNotices, hashAdvisories, platformNames });
    const row = data.platforms.find((entry) => entry.platformName === "Example Chat");
    expect(row).toMatchObject({
      insufficient: false,
      noticesSent: 15, // 12 link notices + 3 hash advisories
      hashAdvisoriesSent: 3,
      urlNoticesSent: 12,
      shareActioned: 0.583, // 7 of 12 actioned
      // 5 of 12 inside PLATFORM_DEADLINE_HOURS. Master's WP26 (owner
      // decision, 19 November 2026) moved the deadline from 2 to 24 hours;
      // with 24 hours the fixtures' 1.5/2/10/12/20-hour responses all fall
      // inside the window (the 100-hour one still does not).
      shareActionedWithinDeadline: 0.417,
      medianHoursToFirstResponse: 10, // [1, 1.5, 2, 10, 12, 20, 100]
      medianHoursToRemoval: 6, // [1.5, 2, 10, 12]
      followUpsNeeded: 2,
    });
    expect(data.deadlineHours).toBe(PLATFORM_DEADLINE_HOURS);
    expect(data.minNotices).toBe(SCORECARD_MIN_NOTICES);
  });

  it("drops every number for a platform under the small-number rule", () => {
    const { urlNotices, hashAdvisories, platformNames } = platformAFixtures();
    const tiny: ScorecardUrlNotice[] = urlNotices.slice(0, SCORECARD_MIN_NOTICES - 1).map((row) => ({
      ...row,
      platformId: "platform-b",
    }));
    const data = aggregateScorecard({
      period: "2026-Q3",
      urlNotices: [...tiny, ...urlNotices],
      hashAdvisories,
      platformNames,
    });
    const tinyRow = data.platforms.find((entry) => entry.platformName === "Tiny Forum");
    expect(tinyRow?.insufficient).toBe(true);
    expect(tinyRow?.noticesSent).toBeNull();
    expect(tinyRow?.shareActioned).toBeNull();
    expect(tinyRow?.followUpsNeeded).toBeNull();
    // The numbers are dropped at computation time, not hidden at display time:
    // they never exist in the snapshot data at all.
    expect(JSON.stringify(data.platforms)).not.toContain('"platform-b"');
  });

  it("counts a platform at exactly the threshold, and sorts the sufficient rows first", () => {
    const { platformNames } = platformAFixtures();
    const urlNotices: ScorecardUrlNotice[] = Array.from({ length: SCORECARD_MIN_NOTICES }, () =>
      notice({ platformId: "platform-c" }),
    );
    const data = aggregateScorecard({ period: "2026-Q3", urlNotices, hashAdvisories: [], platformNames });
    expect(data.platforms).toHaveLength(1);
    expect(data.platforms[0]).toMatchObject({ platformName: "Example, Inc.", insufficient: false, noticesSent: SCORECARD_MIN_NOTICES, shareActioned: 0 });
  });

  it("keeps only the asked-for quarter and skips platforms it cannot name", () => {
    const { urlNotices, hashAdvisories, platformNames } = platformAFixtures();
    const otherQuarter: ScorecardUrlNotice[] = urlNotices.map((row) => ({
      ...row,
      sentAt: "2026-05-01T10:00:00.000Z",
    }));
    const unknownPlatform = notice({ platformId: "platform-zz" });
    const data = aggregateScorecard({
      period: "2026-Q3",
      urlNotices: [...otherQuarter, ...urlNotices, unknownPlatform],
      hashAdvisories: [...hashAdvisories, { platformId: "platform-a", dispatchedAt: "2026-02-01T10:00:00.000Z" }],
      platformNames,
    });
    const row = data.platforms.find((entry) => entry.platformName === "Example Chat");
    expect(row?.noticesSent).toBe(15); // the Q2 notice and Q1 advisory did not leak in
    expect(data.platforms.some((entry) => entry.platformName === "Unknown")).toBe(false);
    expect(scorecardPeriodOf("2026-01-01T00:00:00.000Z")).toBe("2026-Q1");
    expect(scorecardPeriodOf("2026-12-31T23:59:59.999Z")).toBe("2026-Q4");
    expect(latestCompletedScorecardPeriod(new Date("2026-11-21T00:00:00.000Z"))).toBe("2026-Q3");
    expect(latestCompletedScorecardPeriod(new Date("2026-01-01T00:00:00.000Z"))).toBe("2025-Q4");
  });

  it("reports null shares for a platform that only received hash advisories", () => {
    const hashAdvisories: ScorecardHashAdvisory[] = Array.from({ length: SCORECARD_MIN_NOTICES + 2 }, () => ({
      platformId: "platform-c",
      dispatchedAt: SENT,
    }));
    const data = aggregateScorecard({ period: "2026-Q3", urlNotices: [], hashAdvisories, platformNames: { "platform-c": "Example, Inc." } });
    expect(data.platforms[0]).toMatchObject({
      insufficient: false,
      noticesSent: SCORECARD_MIN_NOTICES + 2,
      urlNoticesSent: 0,
      shareActioned: null,
      medianHoursToFirstResponse: null,
      medianHoursToRemoval: null,
      shareActionedWithinDeadline: null,
    });
  });
});

// ─── CSV ────────────────────────────────────────────────────────────────────

describe("scorecardCsv", () => {
  it("writes a header and one row per platform, with the small-number sentence", () => {
    const { urlNotices, hashAdvisories, platformNames } = platformAFixtures();
    const tiny = urlNotices.slice(0, 3).map((row) => ({ ...row, platformId: "platform-b" }));
    const data = aggregateScorecard({
      period: "2026-Q3",
      urlNotices: [...urlNotices, ...tiny],
      hashAdvisories,
      platformNames,
    });
    const csv = scorecardCsv(data);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Platform,Notices sent,Hash advisories sent,Link notices sent,Share actioned (%),Median hours to first response,Median hours to removal,Share actioned within deadline (%),Follow-ups needed",
    );
    expect(csv).toContain("Example Chat,15,3,12,58.3,10,6,41.7,2");
    const tinyLine = lines.find((line) => line.startsWith("Tiny Forum"));
    expect(tinyLine).toBe("Tiny Forum," + Array<string>(8).fill("Not enough notices to report").join(","));
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes a platform name that contains a comma", () => {
    const urlNotices: ScorecardUrlNotice[] = Array.from({ length: SCORECARD_MIN_NOTICES }, () =>
      notice({ platformId: "platform-c" }),
    );
    const data = aggregateScorecard({
      period: "2026-Q3",
      urlNotices,
      hashAdvisories: [],
      platformNames: { "platform-c": "Example, Inc." },
    });
    expect(scorecardCsv(data)).toContain('"Example, Inc.",10,0,10,0.0,,,0.0,0');
  });
});

// ─── The store and the admin APIs (memory mode) ─────────────────────────────

function adminRequest(path: string, method: string, body: unknown, withCsrf = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withCsrf) {
    const { nonce, token } = createCsrfPair();
    headers.cookie = `asmita_csrf=${nonce}`;
    headers["x-csrf-token"] = token;
  }
  return new Request(`https://asmita.test${path}`, { method, headers, body: JSON.stringify(body) });
}

function admin(ok: boolean) {
  vi.mocked(requireAdminPermission).mockResolvedValue(
    ok
      ? ({ ok: true as const, session: { sub: "admin-1", adminRole: "SUPER_ADMIN" as never } } as never)
      : ({ ok: false as const, status: 403, error: "permission_denied" } as never),
  );
}

describe("scorecard snapshot store and admin APIs", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    scorecardSnapshots.splice(0, scorecardSnapshots.length);
    vi.clearAllMocks();
  });

  it("refuses the routes without content:manage and mutations without CSRF", async () => {
    admin(false);
    expect((await LIST()).status).toBe(403);
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", {}, false))).status).toBe(403);
    admin(true);
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", {}, false))).status).toBe(403);
    expect(scorecardSnapshots).toHaveLength(0);
  });

  it("computes the latest completed quarter on demand, as a draft", async () => {
    const created = await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", {}));
    expect(created.status).toBe(201);
    const { snapshot, created: wasCreated } = (await created.json()) as { snapshot: ScorecardSnapshot; created: boolean };
    expect(wasCreated).toBe(true);
    expect(snapshot.period).toBe(latestCompletedScorecardPeriod(new Date()));
    expect(snapshot.status).toBe("DRAFT");
    expect(vi.mocked(writeAuditLog).mock.calls.some((call) => call[0].eventType === "ORG_SCORECARD_COMPUTED")).toBe(true);
  });

  it("accepts an explicit past period and refuses future or malformed ones", async () => {
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }))).status).toBe(201);
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2999-Q1" }))).status).toBe(400);
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "soon" }))).status).toBe(400);
    expect((await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3", extra: 1 }))).status).toBe(400);
    expect(scorecardSnapshots).toHaveLength(1);
  });

  it("refreshes a draft but never a published snapshot", async () => {
    const first = (await (await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }))).json()) as {
      snapshot: ScorecardSnapshot;
    };
    await saveScorecardNote(first.snapshot.id, { notesEn: "Checked against the raw counts." }, "admin-1");
    const refreshed = await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }));
    expect(refreshed.status).toBe(200); // a draft can be recomputed
    const afterRefresh = (await refreshed.json()) as { snapshot: ScorecardSnapshot; created: boolean };
    expect(afterRefresh.created).toBe(false);
    expect(afterRefresh.snapshot.notesEn).toBe("Checked against the raw counts."); // the note survives a refresh

    const published = await publishScorecardSnapshot(first.snapshot.id, "admin-1");
    expect(published.ok && published.snapshot.status).toBe("PUBLISHED");
    const refused = await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("period_published");
  });

  it("saves the methodology note on a draft and freezes it once published", async () => {
    const { snapshot } = (await (await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }))).json()) as {
      snapshot: ScorecardSnapshot;
    };
    const context = { params: Promise.resolve({ id: snapshot.id }) };

    const noted = await PUT_SNAPSHOT(
      adminRequest(`/api/admin/org/scorecard/${snapshot.id}`, "PUT", { notesEn: "Note v1.", notesHi: "टिप्पणी।" }),
      context,
    );
    expect(noted.status).toBe(200);
    expect(vi.mocked(writeAuditLog).mock.calls.some((call) => call[0].eventType === "ORG_SCORECARD_NOTE_SAVED")).toBe(true);
    const detail = await GET_SNAPSHOT(new Request(`https://asmita.test/api/admin/org/scorecard/${snapshot.id}`), context);
    expect(((await detail.json()) as { snapshot: ScorecardSnapshot }).snapshot.notesHi).toBe("टिप्पणी।");

    const published = await PUT_SNAPSHOT(
      adminRequest(`/api/admin/org/scorecard/${snapshot.id}`, "PUT", { publish: true }),
      context,
    );
    expect(published.status).toBe(200);
    expect(vi.mocked(writeAuditLog).mock.calls.some((call) => call[0].eventType === "ORG_SCORECARD_PUBLISHED")).toBe(true);
    const publishedBody = (await published.json()) as { snapshot: ScorecardSnapshot };
    expect(publishedBody.snapshot.publishedBy).toBe("admin-1");
    expect(publishedBody.snapshot.publishedAt).not.toBeNull();

    const rePublish = await PUT_SNAPSHOT(
      adminRequest(`/api/admin/org/scorecard/${snapshot.id}`, "PUT", { publish: true }),
      context,
    );
    expect(rePublish.status).toBe(409);
    const reNote = await PUT_SNAPSHOT(
      adminRequest(`/api/admin/org/scorecard/${snapshot.id}`, "PUT", { notesEn: "late edit" }),
      context,
    );
    expect(reNote.status).toBe(409);
    const missing = await PUT_SNAPSHOT(
      adminRequest("/api/admin/org/scorecard/missing", "PUT", { publish: true }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missing.status).toBe(404);
  });

  it("the maintenance cron drafts the completed quarter once and never overwrites", async () => {
    const now = new Date("2026-11-21T00:00:00.000Z");
    const first = await ensureLatestScorecardSnapshot(now);
    expect(first).toEqual({ period: "2026-Q3", created: true });
    await saveScorecardNote(scorecardSnapshots[0].id, { notesEn: "Under review." }, "admin-1");
    const second = await ensureLatestScorecardSnapshot(now);
    expect(second.created).toBe(false);
    expect(scorecardSnapshots).toHaveLength(1);
    expect(scorecardSnapshots[0].notesEn).toBe("Under review.");
  });
});

// ─── What the public pages read ─────────────────────────────────────────────

describe("the published scorecard is what the public sees", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    admin(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    scorecardSnapshots.splice(0, scorecardSnapshots.length);
    vi.clearAllMocks();
  });

  it("hides everything while nothing is published, then serves the CSV once it is", async () => {
    expect(await hasPublishedScorecard()).toBe(false);
    const noCsv = await GET_CSV(new Request("https://asmita.test/research/platform-scorecard.csv"));
    expect(noCsv.status).toBe(404);

    const { snapshot } = (await (await COMPUTE(adminRequest("/api/admin/org/scorecard", "POST", { period: "2026-Q3" }))).json()) as {
      snapshot: ScorecardSnapshot;
    };
    await publishScorecardSnapshot(snapshot.id, "admin-1");
    expect(await hasPublishedScorecard()).toBe(true);
    expect(await listPublishedScorecardPeriods()).toEqual(["2026-Q3"]);

    const csv = await GET_CSV(new Request("https://asmita.test/research/platform-scorecard.csv"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain("platform-scorecard-2026-Q3.csv");
    const body = await csv.text();
    expect(body.split("\r\n")[0]).toContain("Platform,Notices sent");

    // Drafts never leak: a second period stays draft, so no CSV for it.
    await recomputeScorecardSnapshot("2026-Q2", "admin-1");
    expect(await listPublishedScorecardPeriods()).toEqual(["2026-Q3"]);
    const latest = await latestPublishedScorecard();
    expect(latest?.period).toBe("2026-Q3");
  });
});

// ─── The /research lists, with and without posts ────────────────────────────

function seedPost(kind: OrgPost["kind"], slug: string, publishedAt: string): OrgPost {
  return {
    id: `${kind}-${slug}`,
    slug,
    kind,
    titleEn: `Post ${slug}`,
    titleHi: null,
    summaryEn: `Summary for ${slug}`,
    summaryHi: null,
    bodyEn: "Body text.",
    bodyHi: null,
    coverIllustration: null,
    coverImagePath: null,
    attachmentUrl: null,
    attachmentLabel: null,
    ctaLabel: null,
    ctaUrl: null,
    tags: [],
    authorDisplayName: "Meri Asmita",
    status: "PUBLISHED",
    publishedAt,
    consentRecorded: false,
    anonymised: false,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  };
}

describe("the /research lists", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
  });

  it("list published research and lab notes, newest first, and only their own kind", async () => {
    orgPosts.push(
      seedPost("RESEARCH", "first-study", "2026-07-01T00:00:00.000Z"),
      seedPost("RESEARCH", "second-study", "2026-09-01T00:00:00.000Z"),
      seedPost("LAB_NOTE", "lab-note-1", "2026-08-01T00:00:00.000Z"),
      seedPost("NEWS", "site-news", "2026-10-01T00:00:00.000Z"),
      { ...seedPost("RESEARCH", "draft-study", "2026-06-01T00:00:00.000Z"), status: "DRAFT" },
    );
    const publications = await listPublishedOrgPosts({ kind: "RESEARCH" });
    expect(publications.posts.map((post) => post.slug)).toEqual(["second-study", "first-study"]);
    const labNotes = await listPublishedOrgPosts({ kind: "LAB_NOTE" });
    expect(labNotes.posts.map((post) => post.slug)).toEqual(["lab-note-1"]);
  });

  it("are honestly empty when nothing is published", async () => {
    expect((await listPublishedOrgPosts({ kind: "RESEARCH" })).posts).toEqual([]);
    expect((await listPublishedOrgPosts({ kind: "LAB_NOTE" })).posts).toEqual([]);
  });

  it("give every post one URL, policy posts under /policy and the rest under /news", () => {
    expect(orgPostHref({ slug: "ask", kind: "POLICY" })).toBe("/policy/ask");
    expect(orgPostHref({ slug: "sign", kind: "CAMPAIGN" })).toBe("/policy/sign");
    expect(orgPostHref({ slug: "hello", kind: "NEWS" })).toBe("/news/hello");
    expect(orgPostHref({ slug: "study", kind: "RESEARCH" })).toBe("/news/study");
  });
});

// ─── The page quotes the constants, never its own numbers ──────────────────

describe("the scorecard page agrees with the constants it quotes", () => {
  it("states the deadline the escalation ladder actually enforces", () => {
    expect(SCORECARD_DEADLINE_TEXT).toContain(`${PLATFORM_DEADLINE_HOURS} hours`);
    expect(SCORECARD_DEADLINE_TEXT).not.toContain(`${PLATFORM_DEADLINE_HOURS + 1} hours`);
  });

  it("states the small-number threshold the aggregation actually applies", () => {
    expect(SCORECARD_MIN_NOTICES_TEXT).toContain(`${SCORECARD_MIN_NOTICES} `);
    expect(SCORECARD_MIN_NOTICES_TEXT).not.toContain(`${SCORECARD_MIN_NOTICES + 1} `);
  });
});
