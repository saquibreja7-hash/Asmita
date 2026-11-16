import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CRAWLER_SHOW_FINDINGS_TO_SURVIVOR on the survivor's link actions: with the
// flag off, a crawler-found link id behaves exactly like an id that is not on
// her case (same status, same body) on mark-resolved, platform-filed,
// sign-notice and preview-notice. With it on, she may mark one removed or
// filed (she can see it). Placeholder data only.

type Row = { id: string; caseId: string; source: "SURVIVOR" | "CRAWLER" };

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; caseId: string; source: string }>,
  getCase: null as null | ((caseId: string, userId: string) => Promise<unknown>),
}));

/** Applies the parts of a Prisma where clause these routes use. */
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, want]) => {
    if (key === "case") return true; // ownership: every row here belongs to user-1's case
    if (want && typeof want === "object") return true; // nested filters not modelled
    return row[key] === want;
  });

vi.mock("@/lib/db", () => ({
  db: {
    case: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === "case-1" ? { id: "case-1" } : null) },
    submittedUrl: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => mocks.rows.find((r) => matches(r, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => mocks.rows.filter((r) => matches(r, where)).length,
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1" } }) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined), inMemoryAuditLog: [] }));
vi.mock("@/lib/signable-notice", () => ({ findSignableNotice: async () => null }));
vi.mock("@/lib/case-ops", async (original) => {
  const actual = await original<typeof import("@/lib/case-ops")>();
  return { ...actual, getCaseForUser: (caseId: string, userId: string) => (mocks.getCase ?? actual.getCaseForUser)(caseId, userId) };
});

import { NextRequest } from "next/server";
import { markPlatformFiled, markUrlResolved } from "@/lib/case-ops";
import * as store from "@/lib/store";
import { POST as markResolvedRoute } from "@/app/api/cases/[caseId]/mark-resolved/route";
import { POST as platformFiledRoute } from "@/app/api/cases/[caseId]/platform-filed/route";
import { POST as signNoticeRoute } from "@/app/api/cases/[caseId]/sign-notice/route";
import { GET as previewNoticeRoute } from "@/app/api/cases/[caseId]/preview-notice/route";

const memoryUrl = (id: string, source: Row["source"]) =>
  ({ id, domain: `${id}.example.com`, platformName: `${id}.example.com`, urlHash: `h-${id}`, status: "NOTICE_QUEUED", platformId: null, flaggedForReview: false, source }) as store.UrlRecord;

const post = (body: unknown) => new Request("https://asmita.test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (caseId: string) => ({ params: Promise.resolve({ caseId }) });
const answer = async (res: Response) => ({ status: res.status, body: await res.text() });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  store.cases.clear();
  mocks.rows = [];
  mocks.getCase = null;
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function memoryCase() {
  const record = await store.createCase("user-1");
  record.urls.push(memoryUrl("hers", "SURVIVOR"), memoryUrl("found", "CRAWLER"));
  return record;
}

describe("flag off: a hidden crawler link is answered like a foreign id", () => {
  beforeEach(() => vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", "false"));

  it("mark-resolved (memory path): same response, and the link is untouched", async () => {
    const record = await memoryCase();
    const hidden = await answer(await markResolvedRoute(post({ urlId: "found" }), ctx(record.id)));
    const foreign = await answer(await markResolvedRoute(post({ urlId: "not-on-this-case" }), ctx(record.id)));
    expect(hidden).toEqual({ status: 404, body: JSON.stringify({ error: "url_not_found" }) });
    expect(hidden).toEqual(foreign);
    expect(record.urls.find((u) => u.id === "found")!.status).toBe("NOTICE_QUEUED");
  });

  it("mark-resolved without an id never falls back to a hidden link", async () => {
    const record = await store.createCase("user-1");
    record.urls.push(memoryUrl("found", "CRAWLER"), memoryUrl("hers", "SURVIVOR"));
    await markUrlResolved(record.id, "user-1");
    expect(record.urls.map((u) => [u.id, u.status])).toEqual([["found", "NOTICE_QUEUED"], ["hers", "REMOVED"]]);
  });

  it("platform-filed (memory path): same response, and nothing recorded", async () => {
    const record = await memoryCase();
    const hidden = await answer(await platformFiledRoute(post({ urlId: "found" }), ctx(record.id)));
    const foreign = await answer(await platformFiledRoute(post({ urlId: "not-on-this-case" }), ctx(record.id)));
    expect(hidden).toEqual({ status: 404, body: JSON.stringify({ error: "not_found" }) });
    expect(hidden).toEqual(foreign);
    expect(record.urls.find((u) => u.id === "found")!.platformFiledAt).toBeUndefined();
  });

  it("database path: both functions refuse a hidden crawler link as url_not_found", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.rows = [{ id: "found", caseId: "case-1", source: "CRAWLER" }, { id: "hers", caseId: "case-1", source: "SURVIVOR" }];
    await expect(markUrlResolved("case-1", "user-1", "found")).rejects.toThrow("url_not_found");
    await expect(markPlatformFiled("case-1", "user-1", "found")).rejects.toThrow("url_not_found");
    await expect(markUrlResolved("case-1", "user-1", "hers")).resolves.toBeUndefined();
  });

  it("sign-notice: same 404 as a foreign id, not crawler_link_not_survivor_signed", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.rows = [{ id: "found", caseId: "case-1", source: "CRAWLER" }];
    const body = (urlId: string) => ({ urlId, name: "Test Person", contact: "person@example.com", signature: "Test Person", templateRef: "ref" });
    const hidden = await answer(await signNoticeRoute(post(body("found")), { params: Promise.resolve({ caseId: "case-1" }) }));
    const foreign = await answer(await signNoticeRoute(post(body("not-on-this-case")), { params: Promise.resolve({ caseId: "case-1" }) }));
    expect(hidden).toEqual({ status: 404, body: JSON.stringify({ error: "url_not_found" }) });
    expect(hidden).toEqual(foreign);
  });

  it("preview-notice: same answer as a foreign id", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.rows = [{ id: "found", caseId: "case-1", source: "CRAWLER" }];
    mocks.getCase = async () => ({ id: "case-1", urls: [] });
    const get = (urlId: string) => previewNoticeRoute(new NextRequest(`https://asmita.test/api/cases/case-1/preview-notice?urlId=${urlId}`), ctx("case-1"));
    const hidden = await answer(await get("found"));
    const foreign = await answer(await get("not-on-this-case"));
    expect(hidden.status).toBe(404);
    expect(hidden).toEqual(foreign);
  });
});

describe("flag on: she can see the link, so she may act on it", () => {
  beforeEach(() => vi.stubEnv("CRAWLER_SHOW_FINDINGS_TO_SURVIVOR", "true"));

  it("marks a crawler-found link removed and filed", async () => {
    const record = await memoryCase();
    expect((await markResolvedRoute(post({ urlId: "found" }), ctx(record.id))).status).toBe(200);
    expect((await platformFiledRoute(post({ urlId: "found" }), ctx(record.id))).status).toBe(200);
    const found = record.urls.find((u) => u.id === "found")!;
    expect(found.status).toBe("REMOVED");
    expect(found.platformFiledAt).toBeTruthy();
  });

  it("sign-notice and preview-notice still refuse to let her sign a crawler link", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
    mocks.rows = [{ id: "found", caseId: "case-1", source: "CRAWLER" }];
    mocks.getCase = async () => ({ id: "case-1", urls: [] });
    const sign = await signNoticeRoute(
      post({ urlId: "found", name: "Test Person", contact: "person@example.com", signature: "Test Person", templateRef: "ref" }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );
    expect(await answer(sign)).toEqual({ status: 409, body: JSON.stringify({ error: "crawler_link_not_survivor_signed" }) });
    const preview = await previewNoticeRoute(new NextRequest("https://asmita.test/api/cases/case-1/preview-notice?urlId=found"), ctx("case-1"));
    expect(await answer(preview)).toEqual({ status: 409, body: JSON.stringify({ error: "crawler_link_not_survivor_signed" }) });
  });
});

describe("survivor pages read her links only through getCaseForUser", () => {
  // getCaseForUser omits hidden crawler links (crawler-findings-flag.test.ts),
  // so these pages can render nothing about them as long as they read nothing else.
  it.each([
    "src/app/(victim)/case/[caseId]/url/[urlId]/page.tsx",
    "src/app/(victim)/handoff/[caseId]/page.tsx",
    "src/app/(victim)/case/[caseId]/confirmation/page.tsx",
  ])("%s", async (path) => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/getCaseForUser\(caseId, auth\.session\.sub\)/);
    expect(text).not.toMatch(/includeFindings|@\/lib\/db|getWorkerDb|submittedUrl|crawl-findings|crawlFinding/);
  });
});
