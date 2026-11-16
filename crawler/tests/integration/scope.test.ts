/**
 * Page scope: approving blog.fixture.test covers that host and its
 * subdomains only, never the parent domain or sibling hosts, and a redirect
 * cannot take a page fetch out of scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";

let fx: Fixture;
let api: MockAsmita;
const BLOG = `blog.${SOURCE_DOMAIN}`;

beforeAll(async () => {
  fx = await buildFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-blog", kind: "site", domain: BLOG, pageBudget: 20, delayMs: 0 }],
  }).start();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

describe("page scope", () => {
  it("crawls the approved host and its subdomains, never the parent or siblings", async () => {
    const { result } = await runFixtureCrawl(fx.site, api);
    const hosts = new Set(fx.site.requests.map((r) => r.host));
    expect(hosts.has(BLOG)).toBe(true);
    expect(hosts.has(`a.${BLOG}`)).toBe(true);
    expect(hosts.has(SOURCE_DOMAIN)).toBe(false); // parent domain
    expect(hosts.has(`shop.${SOURCE_DOMAIN}`)).toBe(false); // sibling, also via redirect
    expect(hosts.has(`www.${SOURCE_DOMAIN}`)).toBe(false);
    const ids = api.posted.map((f) => f.fingerprintId).sort();
    expect(ids).toEqual(["fp-blog", "fp-blog-deep"]);
    expect((result.summary.errors as Record<string, number>).out_of_scope).toBe(1); // the /jump redirect
    for (const f of api.posted) expect(new URL(f.pageUrl).hostname.endsWith(BLOG)).toBe(true);
  }, 30_000);
});
