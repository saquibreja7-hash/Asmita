/**
 * Browser rendering's sandbox fail-closed rule, end to end (WP25), against
 * the real Chromium the worker launches and the real fixture site. The
 * suite runs in environments that differ in exactly one thing the WP is
 * about — whether the runtime grants Chromium's sandbox the unprivileged
 * user namespaces it needs — so the test first runs a crawl with the
 * CRAWLER_ALLOW_UNSANDBOXED_BROWSER override OFF and branches on the
 * self-test's verdict in the run summary:
 *
 *   - sandbox unavailable (the CI check container runs as root, where
 *     Chromium refuses to start sandboxed at all, and Docker's default
 *     seccomp profile denies clone(CLONE_NEWUSER) to non-root): rendering
 *     is disabled for the run. The BROWSER source's pages report `error`
 *     under the browser_sandbox_unavailable code, no browser-only image is
 *     ever requested or hashed, and AUTO pages fall back to their static
 *     result — their static images still match. The run itself exits 0 (a
 *     failing source is counted, never a run failure) and the logs stay
 *     clean of addresses.
 *
 *   - sandbox available (a container started with
 *     crawler/docker/seccomp-userns.json, or a capable host): the same
 *     crawl renders the fixture gallery and finds its planted image, and
 *     the summary records sandbox on.
 *
 * A second crawl with the local-development override ON proves the escape
 * hatch: where the runtime refuses the sandbox, rendering still works
 * (explicitly unsandboxed, recorded as such in the summary); where the
 * sandbox works, nothing changes. scripts/docker-sandbox-check.sh pins both
 * branches against real containers and greps the [sandbox] markers below.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunResult } from "../../src/crawler.ts";
import { buildFixture, fixtureSeedUrl, SOURCE_DOMAIN, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

const JS_HOST = `js.${SOURCE_DOMAIN}`;
const AUTO_HOST = `auto.${SOURCE_DOMAIN}`;

let fx: Fixture;
let strict: RunResult;
let overridden: RunResult;
const strictLines: string[] = [];
const overrideLines: string[] = [];
let strictApi: MockAsmita;
let overrideApi: MockAsmita;
/** The fixture site's request log as the strict crawl left it (the override crawl shares the site). */
let strictRequests: { host: string; path: string }[] = [];

beforeAll(async () => {
  fx = await buildFixture();
  const sources = [
    { id: "src-js", kind: "site" as const, domain: JS_HOST, pageBudget: 50, delayMs: 0, origin: "admin" as const, hops: 0, render: "browser" as const },
    { id: "src-auto", kind: "site" as const, domain: AUTO_HOST, pageBudget: 50, delayMs: 0, origin: "admin" as const, hops: 0, render: "auto" as const },
  ];
  // Crawl 1: the production posture — no override, whatever the runtime says.
  strictApi = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, sources, seedUrl: fixtureSeedUrl(fx.site.port) }).start();
  ({ result: strict } = await runFixtureCrawl(fx.site, strictApi, {
    lines: strictLines,
    env: { CRAWLER_ALLOW_UNSANDBOXED_BROWSER: "false" },
  }));
  strictRequests = fx.site.requests.slice();
  // Crawl 2: the local-development escape hatch, on a fresh frontier.
  overrideApi = await new MockAsmita({ key: TEST_KEY, pool: fx.pool, sources, seedUrl: fixtureSeedUrl(fx.site.port) }).start();
  ({ result: overridden } = await runFixtureCrawl(fx.site, overrideApi, {
    lines: overrideLines,
    env: { CRAWLER_ALLOW_UNSANDBOXED_BROWSER: "true" },
  }));
}, 300_000);

afterAll(async () => {
  await strictApi?.stop();
  await overrideApi?.stop();
  await fx?.site.stop();
});

const port = () => fx.site.port;
/** Did the strict crawl's own requests touch this fixture path? */
const strictRequested = (host: string, path: string) => strictRequests.some((r) => r.host === host && r.path === path);
const sandboxOf = (r: RunResult) => {
  const browser = r.summary.browser as { renders: number; failed: number; images: number; sandboxTested: boolean; sandboxOn: boolean; workerUid: number };
  expect(browser.sandboxTested).toBe(true);
  return browser;
};
const statusCount = (api: MockAsmita, status: string) =>
  api.reports.reduce((n, r) => n + (r.statuses[status] ?? 0), 0);

describe("browser sandbox self-test in a real crawl (WP25)", () => {
  it("records the sandbox verdict in the run summary (booleans only)", () => {
    const browser = sandboxOf(strict);
    // A boolean and an id, never a URL: the marker line lets the docker
    // verification script pin which branch a container took.
    console.log(`[sandbox] ${browser.sandboxOn ? "available" : "unavailable"}`);
    // A refused self-test answers before any worker exists, so no uid was
    // reported; a working sandbox has a worker running as this user
    // (the container image drops it onto a separate one instead).
    expect(browser.workerUid).toBe(browser.sandboxOn ? (process.getuid?.() ?? 0) : -1);
    expect(strict.exitCode).toBe(0);
  });

  it("fails closed without the override when the runtime refuses the sandbox", () => {
    const browser = sandboxOf(strict);
    if (browser.sandboxOn) return; // this runtime allows the sandbox; the other branch is a no-op here
    console.log("[sandbox] unavailable: fail-closed verified");
    // Rendering was disabled for the run: every BROWSER page answered the
    // clear code without rendering (counted, never a hostname).
    expect(strict.summary.errors).toMatchObject({ browser_sandbox_unavailable: expect.any(Number) });
    expect((strict.summary.errors as Record<string, number>).browser_sandbox_unavailable ?? 0).toBeGreaterThan(0);
    expect(browser.renders).toBe(0);
    expect(statusCount(strictApi, "error")).toBeGreaterThan(0);
    // Nothing the page's own scripts would have revealed was requested:
    // the browser-only gallery image was never fetched or hashed.
    expect(strictRequested(JS_HOST, "/img/js-deep.png")).toBe(false);
    expect(strictApi.posted.find((f) => f.fingerprintId === "fp-js-deep")).toBeUndefined();
    // AUTO pages fell back to their static result: /auto-b's static image
    // still matches, /auto-a's script-only image does not exist statically.
    const staticFinding = strictApi.posted.find((f) => f.fingerprintId === "fp-auto-static");
    expect(staticFinding).toBeDefined();
    expect(staticFinding!.pageUrl).toBe(`http://${AUTO_HOST}:${port()}/auto-b`);
    expect(strictApi.posted.find((f) => f.fingerprintId === "fp-auto-js")).toBeUndefined();
    // The refusal is logged once, as a code only.
    expect(strictLines.filter((l) => l.includes("browser_rendering_disabled")).length).toBe(1);
  });

  it("renders and finds the planted image when the runtime allows the sandbox", () => {
    const browser = sandboxOf(strict);
    if (!browser.sandboxOn) return; // this runtime refuses the sandbox; the other branch is a no-op here
    console.log("[sandbox] available: rendered and found");
    expect(browser.renders).toBeGreaterThanOrEqual(3);
    expect(browser.failed).toBe(0);
    const finding = strictApi.posted.find((f) => f.fingerprintId === "fp-js-deep");
    expect(finding).toBeDefined();
    expect(strictRequested(JS_HOST, "/img/js-deep.png")).toBe(true);
  });

  it("the local-development override renders without the sandbox, recorded as such", () => {
    const browser = sandboxOf(overridden);
    expect(overridden.exitCode).toBe(0);
    // Where the runtime refuses the sandbox the override is the only way a
    // render happens — and the summary says it is unsandboxed.
    if (!browser.sandboxOn) {
      expect(browser.renders).toBeGreaterThanOrEqual(3);
      expect(overrideLines.some((l) => l.includes("browser_unsandboxed_override"))).toBe(true);
      expect(overrideApi.posted.find((f) => f.fingerprintId === "fp-js-deep")).toBeDefined();
      // The unsandboxed override worker did answer, as this user.
      expect(browser.workerUid).toBe(process.getuid?.() ?? 0);
    } else {
      // A working sandbox ignores the override: nothing is loosened.
      expect(overrideLines.some((l) => l.includes("browser_unsandboxed_override"))).toBe(false);
      expect(overrideApi.posted.find((f) => f.fingerprintId === "fp-js-deep")).toBeDefined();
    }
  });

  it("logs no URL, hostname, fingerprint or body in either crawl", () => {
    for (const lines of [strictLines, overrideLines]) {
      assertCleanLog(lines.join("\n"), {
        hostnames: [JS_HOST, AUTO_HOST],
        hashes: [...fx.allHashes, ...fx.pool.fingerprints.flatMap((f) => ("pdq" in f ? [f.pdq] : []))],
        secrets: [TEST_KEY],
      });
    }
  });
});
