import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CRAWLER_SHOW_FINDINGS_TO_SURVIVOR holds on every survivor-facing read:
// off, crawler-found links are omitted on the memory, Prisma and Kysely paths
// (getCaseForUser, listCasesForUser) and the echo of her own report carries no
// finding state; on, nothing changes. Her data export always lists them,
// labelled. Admin reads are not affected. Placeholder data only.

const mocks = vi.hoisted(() => ({
  caseFindFirst: vi.fn(),
  caseFindMany: vi.fn(),
  urlFindMany: vi.fn(),
  kysely: null as null | Record<string, unknown[]>,
  kyselyWheres: [] as unknown[][],
}));

vi.mock("@/lib/db", () => {
  const db: Record<string, unknown> = {
    case: { findFirst: mocks.caseFindFirst, findMany: mocks.caseFindMany },
    submittedUrl: { findMany: mocks.urlFindMany },
    platform: { findFirst: vi.fn().mockResolvedValue(null) },
    // addUrlsToCase locks the case row in a transaction (case-link-lock.ts).
    $queryRaw: vi.fn().mockResolvedValue([{ id: "case-1" }]),
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return { db };
});
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
          if (prop === "where") return (...args: unknown[]) => { mocks.kyselyWheres.push(args); return builder; };
          return () => builder;
        },
      });
      return builder;
    },
  }),
}));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined), inMemoryAuditLog: [] }));
vi.mock("@/lib/fir-package-generator", async (original) => {
  const actual = await original<typeof import("@/lib/fir-package-generator")>();
  return { ...actual, generateFirPackagePdf: vi.fn(actual.generateFirPackagePdf) };
});

import { addUrlsToCase, getCaseForUser, listAllCases, listCasesForUser } from "@/lib/case-ops";
import * as store from "@/lib/store";
import { generateFirPackagePdf } from "@/lib/fir-package-generator";
import { GET as exportRoute } from "@/app/api/cases/[caseId]/export/route";
import { GET as caseRoute } from "@/app/api/cases/[caseId]/route";
import { crawlerFindingsVisibleToSurvivor } from "@/lib/crawler-flags";

const row = (source: "SURVIVOR" | "CRAWLER") => ({
  id: `url-${source}`, caseId: "case-1", domain: "forum.example.com", urlHash: `h-${source}`, status: "NOTICE_SENT", platformId: null,
  signedNoticePdf: null, flaggedForReview: false, flagReason: null, platformFiledAt: null, source, crawlFindingId: "cf-secret",
  crawlConsentWithdrawnAt: null, representativeNoticePdf: "enc", submittedAt: new Date(), notices: [],
});
const caseRow = () => ({ id: "case-1", referenceNumber: "ASMITA-2026-00042", userId: "user-1", createdAt: new Date(), status: "OPEN" });
const sources = (urls: Array<{ source?: string }>) => urls.map((u) => u.source);
const memoryUrl = (id: string, source: "SURVIVOR" | "CRAWLER", extra: Partial<store.UrlRecord> = {}) =>
  ({ id, domain: `${id}.example.com`, platformName: `${id}.example.com`, urlHash: `h-${id}`, status: "NOTICE_SENT", platformId: null, flaggedForReview: false, source, ...extra }) as store.UrlRecord;
const where = (call: unknown[][]) => (call[0][0] as { include?: { submittedUrls?: { where?: unknown } } }).include?.submittedUrls?.where;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  mocks.kysely = null;
  mocks.kyselyWheres.length = 0;
  store.cases.clear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("the helper", () => {
  it("is on unless the value is exactly false", () => {
    expect(crawlerFindingsVisibleToSurvivor({})).toBe(true);
    expect(crawlerFindingsVisibleToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "true" })).toBe(true);
    expect(crawlerFindingsVisibleToSurvivor({ CRAWLER_SHOW_FINDINGS_TO_SURVIVOR: "false" })).toBe(false);
  });
});

describe.each([["off", "false"], ["on", "true"]])("flag %s", (label, value) => {
  const hidden = value === "false";
  const expected = hidden ? ["SURVIVOR"] : ["SURVIVOR", "CRAWLER"];
  beforeEach(() => vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", value));

  it(`memory path (${label})`, async () => {
    const record = await store.createCase("user-1");
    record.urls.push(memoryUrl("hers", "SURVIVOR"), memoryUrl("found", "CRAWLER"));
    expect(sources((await getCaseForUser(record.id, "user-1"))!.urls)).toEqual(expected);
    expect(sources((await listCasesForUser("user-1"))[0].urls)).toEqual(expected);
    // Admin reads and the export's read ignore the flag.
    expect(sources((await listAllCases())[0].urls)).toEqual(["SURVIVOR", "CRAWLER"]);
    expect(sources((await getCaseForUser(record.id, "user-1", { includeFindings: true }))!.urls)).toEqual(["SURVIVOR", "CRAWLER"]);
  });

  it(`Prisma path (${label})`, async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.caseFindFirst.mockResolvedValue({ ...caseRow(), submittedUrls: [row("SURVIVOR"), row("CRAWLER")] });
    mocks.caseFindMany.mockResolvedValue([{ ...caseRow(), submittedUrls: [row("SURVIVOR"), row("CRAWLER")] }]);
    expect(sources((await getCaseForUser("case-1", "user-1"))!.urls)).toEqual(expected);
    expect(sources((await listCasesForUser("user-1"))[0].urls)).toEqual(expected);
    expect(where(mocks.caseFindFirst.mock.calls)).toEqual(hidden ? { source: { not: "CRAWLER" } } : undefined);
    expect(where(mocks.caseFindMany.mock.calls)).toEqual(hidden ? { source: { not: "CRAWLER" } } : undefined);
  });

  it(`Kysely (Worker) path (${label})`, async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.kysely = { Case: [caseRow()], SubmittedUrl: [row("SURVIVOR"), row("CRAWLER")], Notice: [] };
    expect(sources((await getCaseForUser("case-1", "user-1"))!.urls)).toEqual(expected);
    expect(sources((await listCasesForUser("user-1"))[0].urls)).toEqual(expected);
    expect(mocks.kyselyWheres.some((args) => args[0] === "source" && args[1] === "!=" && args[2] === "CRAWLER")).toBe(hidden);
  });

  it(`case API route (${label})`, async () => {
    const record = await store.createCase("user-1");
    record.urls.push(memoryUrl("found", "CRAWLER"));
    const res = await caseRoute(new Request("https://asmita.test"), { params: Promise.resolve({ caseId: record.id }) });
    expect(((await res.json()) as { urls: unknown[] }).urls).toHaveLength(hidden ? 0 : 1);
  });
});

describe("the echo of her own report (Prisma path)", () => {
  it("carries no finding state for a noticed crawler link when hidden, and is unchanged when shown", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    const noticed = { ...row("CRAWLER"), notices: [{ sentAt: new Date("2026-11-12T00:00:00Z"), responseType: null, responseReceivedAt: null }] };
    mocks.urlFindMany.mockResolvedValue([noticed]);
    vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", "false");
    const [hiddenResult] = await addUrlsToCase("case-1", ["https://forum.example.com/post/1"]);
    expect(hiddenResult).toMatchObject({ ok: true, duplicate: true });
    const hiddenUrl = (hiddenResult as { url: Record<string, unknown> }).url;
    for (const key of ["source", "crawlConsentWithdrawn", "representativeNoticeSentAt", "noticeSentAt", "crawlFindingId"]) expect(hiddenUrl).not.toHaveProperty(key);
    vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", "true");
    const [shownResult] = await addUrlsToCase("case-1", ["https://forum.example.com/post/1"]);
    expect((shownResult as { url: Record<string, unknown> }).url).toMatchObject({ source: "CRAWLER", representativeNoticeSentAt: "2026-11-12T00:00:00.000Z" });
  });
});

describe("the data export", () => {
  it.each(["false", "true"])("always lists found links, labelled, and no internals (flag %s)", async (value) => {
    vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", value);
    const record = await store.createCase("user-1");
    record.urls.push(
      memoryUrl("hers", "SURVIVOR"),
      memoryUrl("found", "CRAWLER", { crawlFindingId: "cf-secret" } as Partial<store.UrlRecord>),
    );
    const res = await exportRoute(new Request("https://asmita.test"), { params: Promise.resolve({ caseId: record.id }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const input = vi.mocked(generateFirPackagePdf).mock.calls[0][0];
    expect(input.urls.map((u) => [u.domain, u.foundByAsmita])).toEqual([["hers.example.com", false], ["found.example.com", true]]);
    expect(JSON.stringify(input)).not.toMatch(/cf-secret|distance|reviewer|fingerprint/i);
  });
});
