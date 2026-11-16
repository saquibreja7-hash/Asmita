/**
 * Page scope: approving blog.fixture.test covers that host and its
 * subdomains only, never the parent domain or sibling hosts, and a redirect
 * cannot take a page fetch out of scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, CDN_HOST, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
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

  it("fetches images from off-scope hosts only up to the per-source host cap", async () => {
    const gallery = await new MockAsmita({
      key: TEST_KEY,
      pool: fx.pool,
      sources: [{ id: "src-gallery", kind: "site", domain: `gallery.${SOURCE_DOMAIN}`, pageBudget: 5, delayMs: 0 }],
    }).start();
    try {
      const before = fx.site.requests.length;
      const { result } = await runFixtureCrawl(fx.site, gallery, { env: { MAX_OFFSITE_IMAGE_HOSTS: "3" } });
      const contacted = new Set(fx.site.requests.slice(before).map((r) => r.host).filter((h) => h.endsWith(CDN_HOST)));
      expect([...contacted].sort()).toEqual([1, 2, 3].map((i) => `h${i}.${CDN_HOST}`));
      expect(result.summary.imagesOffHost).toBe(3);
      expect(result.summary.imageHostsCapped).toBe(3); // h4, h5 and the redirect to h6
      expect((result.summary.imagesSkipped as Record<string, number>).image_hosts_capped).toBe(3);
      // An off-scope CDN image embedded by an in-scope page is still matched.
      expect(gallery.posted.map((f) => f.fingerprintId)).toEqual(["fp-off-a"]);
    } finally {
      await gallery.stop();
    }
  }, 30_000);

  const junkRun = async (env: Record<string, string>) => {
    const junk = await new MockAsmita({
      key: TEST_KEY,
      pool: fx.pool,
      sources: [{ id: "src-junk", kind: "site", domain: `junk.${SOURCE_DOMAIN}`, pageBudget: 2, delayMs: 0 }],
    }).start();
    try {
      const before = fx.site.requests.length;
      const { result } = await runFixtureCrawl(fx.site, junk, { env });
      const contacted = new Set(fx.site.requests.slice(before).map((r) => r.host).filter((h) => h.endsWith(CDN_HOST)));
      return { result, contacted: [...contacted].sort(), posted: junk.posted.map((f) => f.fingerprintId) };
    } finally {
      await junk.stop();
    }
  };

  it("hosts that never return an image do not use up the image-host cap", async () => {
    // Cap 1: before, the first junk host took the only slot and the real CDN
    // image was skipped. A host now counts only once it has returned an image.
    const { result, contacted, posted } = await junkRun({ MAX_OFFSITE_IMAGE_HOSTS: "1", MAX_OFFSITE_HOST_FAILURES: "10" });
    expect(contacted).toEqual([`h1.${CDN_HOST}`, ...[1, 2, 3, 4].map((i) => `j${i}.${CDN_HOST}`)]);
    expect(posted).toEqual(["fp-off-a"]);
    expect(result.summary.imageHostsCapped).toBe(0);
    expect(result.summary.imageHostFailuresCapped).toBe(0);
  }, 30_000);

  it("bounds the distinct off-scope hosts that failed, so junk cannot cause unbounded requests", async () => {
    const { result, contacted, posted } = await junkRun({ MAX_OFFSITE_IMAGE_HOSTS: "5", MAX_OFFSITE_HOST_FAILURES: "2" });
    // j1 and j2 fail and fill the failure cap; j3, j4 and h1 are never contacted.
    expect(contacted).toEqual([`j1.${CDN_HOST}`, `j2.${CDN_HOST}`]);
    expect(posted).toEqual([]);
    expect(result.summary.imageHostFailuresCapped).toBe(3);
    expect((result.summary.imagesSkipped as Record<string, number>).image_host_failures_capped).toBe(3);
  }, 30_000);
});
