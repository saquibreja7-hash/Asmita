/**
 * In-page redirects end to end (crawler v3 WP12), against the local fixture
 * site and the real decoder, and for the stub case the real Chromium:
 *   - a meta-refresh redirector's target images are hashed, attributed to the
 *     page as claimed, with the target's links reported (the redirector's
 *     own candidates are discarded, like an HTTP redirect's);
 *   - an off-scope meta refresh is never followed: the other host is not
 *     contacted, not even for robots.txt, the page reports an error, and no
 *     discovery is recorded for it;
 *   - a refresh slower than 10 seconds is page content: its own image is
 *     found and the target is never requested;
 *   - a self-refresh loop is bounded by the shared redirect-hop budget
 *     (exactly the six requests the budget allows, then an error);
 *   - a refresh target that robots.txt disallows is never requested and the
 *     page reports blocked;
 *   - a location.replace() stub page of an AUTO source is rendered in the
 *     browser (a tiny script-only page with no links and no images), and
 *     the images of the page it redirects to are hashed; a small script-less
 *     page of the same source is never rendered.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import {
  AWAY_HOST,
  buildPageRedirectsFixture,
  FIXTURE_HOSTS,
  fixtureSeedUrl,
  REDIR_HOST,
  STUB_HOST,
  TEST_KEY,
  type Fixture,
} from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
let api: MockAsmita;
let result: RunResult;
const logLines: string[] = [];

beforeAll(async () => {
  fx = await buildPageRedirectsFixture();
  api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [
      { id: "src-redirects", kind: "site", domain: REDIR_HOST, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "http" },
      { id: "src-stub", kind: "site", domain: STUB_HOST, pageBudget: 50, delayMs: 0, origin: "admin", hops: 0, render: "auto" },
    ],
    seedUrl: fixtureSeedUrl(fx.site.port),
  }).start();
  ({ result } = await runFixtureCrawl(fx.site, api, { lines: logLines, hosts: [...FIXTURE_HOSTS, AWAY_HOST] }));
}, 180_000);

afterAll(async () => {
  await fx?.site.stop();
  await api?.stop();
});

const port = () => fx.site.port;
const requestsTo = (host: string, path?: string) => fx.site.requests.filter((r) => r.host === host && (path === undefined || r.path === path)).length;
const frontierHas = (path: string, host: string) => [...api.pages.values()].some((p) => p.url === `http://${host}:${port()}${path}`);

describe("redirects that live in the page", () => {
  it("completes the run", () => {
    expect(result.outcome).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(api.badRequests).toEqual([]);
  });

  it("follows a meta refresh on the static path and hashes the target's image", () => {
    const finding = api.posted.find((f) => f.fingerprintId === "fp-meta");
    expect(finding).toBeDefined();
    // The page as claimed; the image at the address the target page wrote.
    expect(finding!.pageUrl).toBe(`http://${REDIR_HOST}:${port()}/meta-refresh`);
    expect(finding!.imageUrl).toBe(`http://${REDIR_HOST}:${port()}/img/meta-target.png`);
    expect(requestsTo(REDIR_HOST, "/refreshed")).toBe(1); // once, as the redirect hop
    // The redirector's own image is discarded like an HTTP redirect's page.
    expect(requestsTo(REDIR_HOST, "/img/redirector-decoy.png")).toBe(0);
    expect(requestsTo(REDIR_HOST, "/img/meta-target.png")).toBe(1);
    // Links come from the target's document: its child page became a row.
    expect(frontierHas("/refreshed-child", REDIR_HOST)).toBe(true);
    expect(fx.site.requested(REDIR_HOST, "/refreshed-child")).toBe(true);
  });

  it("never follows an off-scope meta refresh, not even for robots.txt", () => {
    expect(requestsTo(AWAY_HOST)).toBe(0);
    const row = [...api.pages.values()].find((p) => p.url.endsWith("/meta-offsite"));
    expect(row?.status).toBe("ERROR");
    // Not a link either: only anchors become discoveries.
    expect(api.discoveryReports.some((r) => r.hosts.includes(AWAY_HOST))).toBe(false);
    const errors = result.summary.errors as Record<string, number>;
    expect(errors.out_of_scope).toBe(1);
  });

  it("treats a refresh slower than 10 seconds as page content", () => {
    expect(requestsTo(REDIR_HOST, "/never-refreshed")).toBe(0);
    const finding = api.posted.find((f) => f.fingerprintId === "fp-meta-slow");
    expect(finding).toBeDefined();
    expect(finding!.pageUrl).toBe(`http://${REDIR_HOST}:${port()}/meta-slow`);
    expect(finding!.imageUrl).toBe(`http://${REDIR_HOST}:${port()}/img/slow-own.png`);
  });

  it("bounds a self-refresh chain with the shared redirect budget", () => {
    expect(requestsTo(REDIR_HOST, "/meta-loop")).toBe(6); // the initial hop plus the five redirects the budget allows
    const row = [...api.pages.values()].find((p) => p.url.endsWith("/meta-loop"));
    expect(row?.status).toBe("ERROR");
    const errors = result.summary.errors as Record<string, number>;
    expect(errors.too_many_redirects).toBe(1);
  });

  it("robots-checks the refresh target and reports the page blocked", () => {
    expect(requestsTo(REDIR_HOST, "/private/target")).toBe(0);
    const row = [...api.pages.values()].find((p) => p.url.endsWith("/meta-robots"));
    expect(row?.status).toBe("BLOCKED");
    const errors = result.summary.errors as Record<string, number>;
    expect(errors.robots_disallowed).toBe(1);
  });

  it("renders a location.replace stub of an AUTO source and hashes its target's images", () => {
    const finding = api.posted.find((f) => f.fingerprintId === "fp-stub");
    expect(finding).toBeDefined();
    expect(finding!.pageUrl).toBe(`http://${STUB_HOST}:${port()}/stub`);
    expect(finding!.imageUrl).toBe(`http://${STUB_HOST}:${port()}/img/stub-target.png`);
    const browser = result.summary.browser as { renders: number; failed: number; images: number };
    expect(browser.renders).toBeGreaterThanOrEqual(1);
    // The stub's document is requested twice (HTTP pre-fetch + Chromium);
    // its target and image once each (by the browser only), and the image is
    // not re-fetched when the target's own frontier row is processed.
    expect(requestsTo(STUB_HOST, "/stub")).toBe(2);
    expect(requestsTo(STUB_HOST, "/img/stub-target.png")).toBe(1);
    expect(frontierHas("/stub-target-child", STUB_HOST)).toBe(true);
  });

  it("never renders a small script-less page of the same AUTO source", () => {
    expect(requestsTo(STUB_HOST, "/stub-plain")).toBe(1); // the HTTP pre-fetch only
  });

  it("posts exactly the planted findings", () => {
    expect(api.posted.map((f) => f.fingerprintId).sort()).toEqual(["fp-meta", "fp-meta-slow", "fp-stub"]);
  });

  it("logs no URL, hostname, fingerprint or body", () => {
    assertCleanLog(logLines.join("\n"), {
      hostnames: [REDIR_HOST, STUB_HOST, AWAY_HOST],
      hashes: fx.allHashes,
      secrets: [TEST_KEY],
    });
  });
});
