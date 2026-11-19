/**
 * Crawler v3 WP14, the "done when" fixture: a site that answers every
 * unknown path with the same 200 "not found" page is cut off — the first
 * five distinct URLs carrying that body digest are processed normally, every
 * further one is a soft-404 (no images, no links, reported `error` since the review fix) — and a
 * site of genuinely similar gallery pages (same layout, digits in the body,
 * a different image each) is not affected.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  ALIKE_GALLERIES,
  ALIKE_HOST,
  buildSoft404Fixture,
  fixtureSeedUrl,
  SOFT404_HOST,
  SOFT404_MISSING,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

type ReportEntry = { id: string; status: string; links: Array<{ url: string; kind: string }> };

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];

beforeAll(async () => {
  fx = await buildSoft404Fixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      siteSource({ id: "src-soft404", domain: SOFT404_HOST, pageBudget: 60, delayMs: 0 }),
      siteSource({ id: "src-alike", domain: ALIKE_HOST, pageBudget: 60, delayMs: 0 }),
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, { lines: logLines }));
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

/** Every frontier-report page entry for one source, keyed by its row URL. */
function entriesFor(sourceId: string): Map<string, ReportEntry> {
  const out = new Map<string, ReportEntry>();
  for (const req of api.requests) {
    if (req.path !== "/api/crawler/frontier/report" || req.body === undefined) continue;
    const body = req.body as { sourceId?: string; pages?: ReportEntry[] };
    if (body.sourceId !== sourceId) continue;
    for (const p of body.pages ?? []) {
      const url = api.pages.get(p.id)?.url;
      if (url !== undefined) out.set(url, p);
    }
  }
  return out;
}

const pageUrl = (host: string, path: string) => `http://${host}:${fx.site.port}${path}`;

describe("the fake \"not found\" site is cut off", () => {
  it("fetches every claimed page once — recognition is retrospective", () => {
    for (const w of SOFT404_MISSING) {
      expect(fx.site.requests.filter((r) => r.host === SOFT404_HOST && r.path === `/missing/${w}`)).toHaveLength(1);
    }
    // The one link the not-found page carries was reported by the first
    // pages only, so exactly one row exists under it and it was fetched once.
    expect(fx.site.requests.filter((r) => r.host === SOFT404_HOST && r.path === "/loop-deeper")).toHaveLength(1);
    // No other page rows exist for the source: hub + 12 + loop-deeper.
    expect([...api.pages.values()].filter((p) => p.sourceId === "src-soft404")).toHaveLength(1 + SOFT404_MISSING.length + 1);
  });

  it("reports the first five template URLs fetched, the rest error with nothing extracted", () => {
    const entries = entriesFor("src-soft404");
    expect(entries.size).toBe(1 + SOFT404_MISSING.length + 1);
    expect(entries.get(pageUrl(SOFT404_HOST, "/"))?.status).toBe("fetched");
    for (const [i, w] of SOFT404_MISSING.entries()) {
      const e = entries.get(pageUrl(SOFT404_HOST, `/missing/${w}`));
      expect(e, `/missing/${w}`).toBeDefined();
      // The spec's "5 or more": URLs 1..5 are processed normally, further
      // ones are soft-404s — no images, no links, reported gone.
      // Review fix: a soft-404 guess is recoverable (error), never an instant kill.
      expect(e!.status, `/missing/${w}`).toBe(i < 5 ? "fetched" : "error");
      if (i >= 5) expect(e!.links, `/missing/${w}`).toEqual([]);
    }
    const loop = entries.get(pageUrl(SOFT404_HOST, "/loop-deeper"));
    expect(loop?.status).toBe("error");
    expect(loop?.links).toEqual([]);
    // The soft-404 rows back off in the app (first error step), none killed.
    const cutRows = [...api.pages.values()].filter((p) => p.sourceId === "src-soft404" && p.url.includes("/missing/"));
    expect(cutRows.filter((p) => p.status === "ERROR" && p.failCount === 1)).toHaveLength(SOFT404_MISSING.length - 5);
    expect(cutRows.filter((p) => p.status === "GONE" || p.status === "DEAD")).toHaveLength(0);
  });

  it("extracts the template's image exactly once and reports exactly one finding", () => {
    expect(fx.site.requests.filter((r) => r.host === SOFT404_HOST && r.path === "/img/soft404.png")).toHaveLength(1);
    const posted = api.posted.filter((f) => f.sourceId === "src-soft404");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.fingerprintId).toBe("fp-soft404");
    expect(posted[0]!.pageUrl).toBe(pageUrl(SOFT404_HOST, "/missing/alpha"));
    expect(posted[0]!.imageUrl).toBe(pageUrl(SOFT404_HOST, "/img/soft404.png"));
  });

  it("counts the cut in the summary", () => {
    const s = result.summary;
    expect(s.pagesSoft404).toBe(SOFT404_MISSING.length - 5 + 1); // 7 missing + loop-deeper
    expect(s.pagesFetched).toBe(1 + SOFT404_MISSING.length + 1 + 1 + ALIKE_GALLERIES.length); // both sources, all HTML
    expect(s.pagesNotModified).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.outcome).toBe("completed");
    expect(api.badRequests).toEqual([]);
  });
});

describe("genuinely similar gallery pages are not affected", () => {
  it("fetches every gallery page and reports it fetched, never gone", () => {
    const entries = entriesFor("src-alike");
    expect(entries.get(pageUrl(ALIKE_HOST, "/"))?.status).toBe("fetched");
    for (const w of ALIKE_GALLERIES) {
      expect(fx.site.requests.filter((r) => r.host === ALIKE_HOST && r.path === `/gallery/${w}`)).toHaveLength(1);
      const e = entries.get(pageUrl(ALIKE_HOST, `/gallery/${w}`));
      expect(e, `/gallery/${w}`).toBeDefined();
      expect(e!.status, `/gallery/${w}`).toBe("fetched");
      expect(e!.links.length, `/gallery/${w}`).toBe(0);
    }
    expect([...api.pages.values()].filter((p) => p.sourceId === "src-alike" && p.status === "GONE")).toHaveLength(0);
  });

  it("finds every gallery's image exactly once, attributed to its page", () => {
    const port = fx.site.port;
    for (const w of ALIKE_GALLERIES) {
      expect(fx.site.requests.filter((r) => r.host === ALIKE_HOST && r.path === `/img/gal-${w}.png`)).toHaveLength(1);
    }
    const got = api.posted
      .filter((f) => f.sourceId === "src-alike")
      .map((f) => ({ fingerprintId: f.fingerprintId, pageUrl: f.pageUrl, imageUrl: f.imageUrl }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    const want = fx.expected
      .filter((e) => e.imageHost === ALIKE_HOST)
      .map((e) => ({
        fingerprintId: e.fingerprintId,
        pageUrl: `http://${ALIKE_HOST}:${port}${e.pagePath}`,
        imageUrl: `http://${ALIKE_HOST}:${port}${e.imagePath}`,
      }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    expect(got).toEqual(want);
    expect(result.summary.matches).toBe(want.length + 1); // the galleries + the one template finding
    expect(result.summary.findingsUnsent).toBe(0);
  });
});

describe("logs", () => {
  it("carries no URL, hostname, fingerprint or body — and no digest either", () => {
    expect(logLines.length).toBeGreaterThan(3);
    assertCleanLog(logLines.join("\n"), {
      hostnames: [SOFT404_HOST, ALIKE_HOST],
      hashes: [...fx.allHashes, ...fx.pool.fingerprints.map((f) => f.pdq)],
    });
    const summary = logLines.map((l) => JSON.parse(l) as { event: string }).find((l) => l.event === "run_summary");
    expect(summary).toBeDefined();
  });
});
