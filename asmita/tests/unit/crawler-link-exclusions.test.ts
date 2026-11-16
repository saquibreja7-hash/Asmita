import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Crawler links (source CRAWLER) stay out of everything built around the
// survivor's own signature: the signing prompt and routes, the survivor
// dispatch route, the automated follow-ups, and the escalation ladder the
// survivor sees. DisplayUrl carries source on the Prisma and Kysely paths
// and never the finding id. Placeholder data only.

const mocks = vi.hoisted(() => ({
  urlFindMany: vi.fn(),
  urlFindFirst: vi.fn(),
  urlCount: vi.fn(),
  templateFindFirst: vi.fn(),
  noticeFindMany: vi.fn(),
  caseFindFirst: vi.fn(),
  kysely: null as null | Record<string, unknown[]>,
}));

vi.mock("@/lib/db", () => ({
  db: {
    submittedUrl: { findMany: mocks.urlFindMany, findFirst: mocks.urlFindFirst, count: mocks.urlCount, updateMany: vi.fn() },
    noticeTemplate: { findFirst: mocks.templateFindFirst, findUnique: vi.fn() },
    notice: { findMany: mocks.noticeFindMany },
    case: { findFirst: mocks.caseFindFirst, updateMany: vi.fn() },
    hashSubmission: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));
// A minimal Kysely stand-in: every builder call chains, and execute returns
// the rows seeded for the table the query started from.
vi.mock("@/lib/worker-kysely", () => ({
  usesWorkerKysely: () => mocks.kysely !== null,
  getWorkerDb: () => ({
    selectFrom: (table: string) => {
      const rows = mocks.kysely?.[table.split(" ")[0]] ?? [];
      const builder: Record<string, unknown> = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === "execute") return async () => rows;
          if (prop === "executeTakeFirst") return async () => rows[0];
          if (prop === "then") return undefined;
          return () => builder;
        },
      });
      return builder;
    },
  }),
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdminPermission: async () => ({ ok: true, session: { sub: "admin-1" } }),
}));
vi.mock("@/lib/notice-dispatch", () => ({
  dispatchTier2Notice: vi.fn(),
  dispatchTier1ApiNotice: vi.fn(),
  dispatchEscalationFollowUp: vi.fn(),
}));
vi.mock("@/jobs/escalation-worker", () => ({ processEscalationJob: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendL2VictimNotification: vi.fn(), sendL3FirReadyNotification: vi.fn(), sendNoticeDraft: vi.fn() }));

import { findSignableNotice } from "@/lib/signable-notice";
import { POST as signNotice } from "@/app/api/cases/[caseId]/sign-notice/route";
import { GET as previewNotice } from "@/app/api/cases/[caseId]/preview-notice/route";
import { POST as dispatchNotice } from "@/app/api/notices/dispatch/route";
import { dispatchEscalationFollowUp, dispatchTier2Notice } from "@/lib/notice-dispatch";
import { sendL2VictimNotification } from "@/lib/email";
import { runDueEscalationsFromDb } from "@/lib/escalation-engine";
import { getCaseForUser } from "@/lib/case-ops";

const platform = { id: "platform-1", name: "Example Forum", noticeBasis: "IT_RULES_2021", grievanceEmail: "grievance@example.org", isActive: true, lastContactVerifiedByHuman: true, apiEndpoint: null, tier: "TIER_2" };
const template = { id: "tpl-1", platformId: null, templateType: "IT_RULES_2021", subjectTemplate: "Notice {{caseReference}}", bodyTemplate: "Case {{caseReference}} at {{url}}", reviewedByLegal: true, isActive: true, version: 1 };
const crawlerLink = {
  id: "url-crawler", caseId: "case-1", status: "NOTICE_QUEUED", source: "CRAWLER", crawlFindingId: "cf-1",
  urlEncrypted: "enc", submittedAt: new Date(), signedNoticePdf: null, platformId: "platform-1",
  case: { referenceNumber: "ASMITA-2026-00042", declarationSignedAt: null }, platform,
};
const params = { params: Promise.resolve({ caseId: "case-1" }) };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  mocks.kysely = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("survivor signing never offers or accepts a crawler link", () => {
  it("findSignableNotice asks only for survivor links and skips any crawler row it is handed", async () => {
    mocks.urlFindMany.mockResolvedValue([{ ...crawlerLink }]);
    mocks.templateFindFirst.mockResolvedValue(template);
    expect(await findSignableNotice("case-1", false)).toBeNull();
    expect(mocks.urlFindMany.mock.calls[0][0].where).toMatchObject({ source: "SURVIVOR" });
    mocks.urlFindMany.mockResolvedValue([{ ...crawlerLink, source: "SURVIVOR", id: "url-own" }]);
    expect(await findSignableNotice("case-1", false)).toMatchObject({ id: "url-own" });
  });

  it("sign-notice refuses a crawler link named directly, and picks only survivor links otherwise", async () => {
    mocks.urlFindFirst.mockResolvedValue({ ...crawlerLink });
    const body = { urlId: "url-crawler", name: "Example Person", signature: "Example Person", contact: "person@example.invalid", templateRef: "x" };
    const res = await signNotice(new Request("https://asmita.test/api/cases/case-1/sign-notice", { method: "POST", body: JSON.stringify(body) }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "crawler_link_not_survivor_signed" });

    mocks.urlFindFirst.mockResolvedValue(null);
    const { urlId: _unused, ...auto } = body;
    void _unused;
    await signNotice(new Request("https://asmita.test/api/cases/case-1/sign-notice", { method: "POST", body: JSON.stringify(auto) }), params);
    expect(mocks.urlFindFirst.mock.calls.at(-1)![0].where).toMatchObject({ source: "SURVIVOR" });
  });

  it("preview-notice refuses a crawler link named directly, and does not prompt a form for one", async () => {
    mocks.caseFindFirst.mockResolvedValue({
      id: "case-1", referenceNumber: "ASMITA-2026-00042", userId: "user-1", createdAt: new Date(), status: "OPEN", submittedUrls: [],
    });
    mocks.urlFindMany.mockResolvedValue([]);
    mocks.urlCount.mockImplementation(async ({ where }: { where: { source?: string } }) => (where.source === "CRAWLER" ? 1 : 0));
    const res = await previewNotice(new NextRequest("https://asmita.test/api/cases/case-1/preview-notice?urlId=url-crawler"), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "crawler_link_not_survivor_signed" });
    // Without a urlId, the form-only prompt counts survivor links only.
    const next = await previewNotice(new NextRequest("https://asmita.test/api/cases/case-1/preview-notice"), params);
    expect(await next.json()).toEqual({ error: "no_eligible_url" });
    expect(mocks.urlCount.mock.calls.at(-1)![0].where).toMatchObject({ source: "SURVIVOR" });
  });

  it("the survivor dispatch route refuses a crawler link", async () => {
    mocks.urlFindFirst.mockResolvedValue({ ...crawlerLink, signedNoticePdf: "enc-pdf" });
    const res = await dispatchNotice(new Request("https://asmita.test/api/notices/dispatch", {
      method: "POST", body: JSON.stringify({ caseId: "case-1", urlId: "url-crawler" }),
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "crawler_link_not_survivor_signed" });
    expect(dispatchTier2Notice).not.toHaveBeenCalled();
  });
});

describe("automated follow-ups skip representative notices", () => {
  const row = (source: string) => ({
    id: `notice-${source}`, sentAt: new Date("2026-05-10T00:00:00Z"), escalationLevel: 0, responseType: null, templateId: "tpl-rep",
    submittedUrl: {
      id: "url-1", caseId: "case-1", status: "NOTICE_SENT", domain: "forum.example.com", source,
      platform: { name: "Example Forum", grievanceEmail: "grievance@example.org", lastContactVerifiedByHuman: true },
      case: { id: "case-1", referenceNumber: "ASMITA-2026-00042", user: { id: "user-1", emailEncrypted: "enc", preferredLocale: null } },
    },
    template: { bodyTemplate: "Case {{caseReference}}", subjectTemplate: "S {{caseReference}}", reviewedByLegal: true },
  });

  it("filters them in the query and skips any that reach the loop, at every level", async () => {
    mocks.noticeFindMany.mockResolvedValue([row("CRAWLER")]);
    const summary = await runDueEscalationsFromDb(new Date("2026-06-30T00:00:00Z"));
    expect(mocks.noticeFindMany.mock.calls[0][0].where).toMatchObject({ submittedUrl: { source: { not: "CRAWLER" } } });
    expect(summary.skipped).toEqual([{ noticeId: "notice-CRAWLER", reason: "representative_notice" }]);
    expect(summary.fired).toEqual([]);
    expect(dispatchEscalationFollowUp).not.toHaveBeenCalled();
    expect(sendL2VictimNotification).not.toHaveBeenCalled();
  });
});

describe("DisplayUrl.source", () => {
  const dbUrl = (source: string) => ({
    id: `url-${source}`, caseId: "case-1", domain: "forum.example.com", urlHash: "h", status: "NOTICE_SENT", platformId: null,
    signedNoticePdf: null, flaggedForReview: false, flagReason: null, platformFiledAt: null, source, crawlFindingId: "cf-secret",
    crawlConsentWithdrawnAt: null, representativeNoticePdf: "enc", submittedAt: new Date(),
    notices: [{ sentAt: new Date("2026-11-12T00:00:00Z"), responseType: null, responseReceivedAt: null }],
  });

  function check(urls: Array<Record<string, unknown>>) {
    const crawler = urls.find((u) => u.source === "CRAWLER")!;
    const own = urls.find((u) => u.source === "SURVIVOR")!;
    // A representative notice states no deadline, so no ladder start for it.
    expect(crawler).toMatchObject({ noticeSentAt: null, representativeNoticeSentAt: "2026-11-12T00:00:00.000Z", crawlConsentWithdrawn: false });
    expect(own).toMatchObject({ noticeSentAt: "2026-11-12T00:00:00.000Z" });
    for (const url of urls) {
      expect(url).not.toHaveProperty("crawlFindingId");
      expect(url).not.toHaveProperty("representativeNoticePdf");
    }
  }

  it("Prisma path", async () => {
    mocks.caseFindFirst.mockResolvedValue({
      id: "case-1", referenceNumber: "ASMITA-2026-00042", userId: "user-1", createdAt: new Date(), status: "OPEN",
      submittedUrls: [dbUrl("SURVIVOR"), dbUrl("CRAWLER")],
    });
    const record = await getCaseForUser("case-1", "user-1");
    check(record!.urls as Array<Record<string, unknown>>);
  });

  it("Kysely (Worker) path", async () => {
    const [own, crawler] = [dbUrl("SURVIVOR"), dbUrl("CRAWLER")].map(({ notices: _n, ...rest }) => { void _n; return rest; });
    mocks.kysely = {
      Case: [{ id: "case-1", referenceNumber: "ASMITA-2026-00042", userId: "user-1", createdAt: new Date().toISOString(), status: "OPEN" }],
      SubmittedUrl: [own, crawler],
      Notice: [
        { urlId: own.id, sentAt: new Date("2026-11-12T00:00:00Z"), responseType: null, responseReceivedAt: null },
        { urlId: crawler.id, sentAt: new Date("2026-11-12T00:00:00Z"), responseType: null, responseReceivedAt: null },
      ],
    };
    const record = await getCaseForUser("case-1", "user-1");
    check(record!.urls as Array<Record<string, unknown>>);
  });
});
