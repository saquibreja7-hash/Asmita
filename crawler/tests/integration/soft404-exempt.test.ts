/**
 * Crawler v3 review fix for WP14: the soft-404 cut-off must not kill
 *   - an app shell (the same script-only HTML on every URL), and
 *   - a gallery whose pages differ only by a numeric id and image path;
 * while the real repeated "not found" page is still cut off (soft404.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  buildSoft404ExemptFixture,
  fixtureSeedUrl,
  NUMERIC_HOST,
  SOFT404_EXEMPT_PAGES,
  SPA_HOST,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita, siteSource } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;

beforeAll(async () => {
  fx = await buildSoft404ExemptFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      // render "http": the shell is never rendered, so only the stub
      // exemption keeps it from being judged by its identical static body.
      siteSource({ id: "src-spa", domain: SPA_HOST, pageBudget: 40, delayMs: 0 }),
      siteSource({ id: "src-numeric", domain: NUMERIC_HOST, pageBudget: 40, delayMs: 0 }),
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, {}));
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

const rowsOf = (sourceId: string) => [...api.pages.values()].filter((p) => p.sourceId === sourceId);

describe("soft-404 exemptions", () => {
  it("never cuts off an app shell served on every URL", () => {
    const rows = rowsOf("src-spa");
    expect(rows).toHaveLength(1 + SOFT404_EXEMPT_PAGES);
    for (const row of rows) expect(row.status, row.url).toBe("FETCHED");
  });

  it("never cuts off gallery pages that differ only by a numeric id and image path", () => {
    const rows = rowsOf("src-numeric");
    expect(rows).toHaveLength(1 + SOFT404_EXEMPT_PAGES);
    for (const row of rows) expect(row.status, row.url).toBe("FETCHED");
    // Every page's image was still extracted and fetched.
    for (let n = 1001; n < 1001 + SOFT404_EXEMPT_PAGES; n++) {
      expect(fx.site.requests.filter((r) => r.host === NUMERIC_HOST && r.path === `/img/${n}.png`)).toHaveLength(1);
    }
  });

  it("counts no soft-404 at all", () => {
    expect(result.summary.pagesSoft404).toBe(0);
    expect(result.exitCode).toBe(0);
  });
});
