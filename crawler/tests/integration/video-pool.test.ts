/**
 * Video fingerprints in the crawler pool, end to end (video-fingerprints
 * spec WP20) against the vpdq fixture:
 *   - a poster image whose hash is a frame of two video pool entries (one
 *     exact, one near) and also an ordinary image entry produces one finding
 *     per pool id — the finding contract unchanged, the fingerprint id the
 *     video submission's pool id — while an image far from every frame
 *     produces none;
 *   - the run summary counts video matches separately, and the pool logs
 *     carry the video and frame counts only;
 *   - no video bytes are ever fetched: the page's <video src> is never
 *     requested (Phase 2 fetches images only);
 *   - a video finding the server no longer accepts is withdrawn like an
 *     image fingerprint (fingerprint_not_accepted), through the same
 *     sink callback, and counted by reason.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVideoPoolFixture, fixtureSeedUrl, TEST_KEY, VPDQ_HOST, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildVideoPoolFixture();
}, 30_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

async function mock(opts: Partial<MockAsmitaOptions> = {}): Promise<MockAsmita> {
  const api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-vpdq", kind: "site", domain: VPDQ_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" }],
    seedUrl: fixtureSeedUrl(fx.site.port),
    ...opts,
  }).start();
  servers.push(api);
  return api;
}

describe("video fingerprints in the pool (WP20)", () => {
  it("matches a poster against video frames and posts one finding per pool id", async () => {
    const api = await mock();
    const { result, lines } = await runFixtureCrawl(fx.site, api, { hosts: [VPDQ_HOST] });
    expect(result.exitCode).toBe(0);
    expect(result.outcome).toBe("completed");

    const port = fx.site.port;
    const got = api.posted
      .map((f) => ({ fingerprintId: f.fingerprintId, pageUrl: f.pageUrl, imageUrl: f.imageUrl, sourceId: f.sourceId }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    const want = fx.expected
      .map((e) => ({
        fingerprintId: e.fingerprintId,
        pageUrl: `http://${e.imageHost}:${port}${e.pagePath}`,
        imageUrl: `http://${e.imageHost}:${port}${e.imagePath}`,
        sourceId: "src-vpdq",
      }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    expect(got).toEqual(want);
    expect(api.created.size).toBe(3);
    expect(api.badRequests).toEqual([]);

    // The exact frame matches at distance 0 for the image entry and video A;
    // video B's best frame sits at the planted near distance.
    expect(api.posted.find((f) => f.fingerprintId === "fp-poster-img")?.distance).toBe(0);
    expect(api.posted.find((f) => f.fingerprintId === "fp-vid-a")?.distance).toBe(0);
    expect(api.posted.find((f) => f.fingerprintId === "fp-vid-b")?.distance).toBe(6);
    for (const f of api.posted) {
      expect(f.quality).toBeGreaterThanOrEqual(50);
      expect(f.distance).toBeLessThanOrEqual(31);
    }

    // The summary counts video matches beside the image match.
    const summary = result.summary as Record<string, unknown>;
    expect(summary.matches).toBe(3);
    expect(summary.videoMatches).toBe(2);
    expect(summary.findingsAccepted).toBe(3);

    // The far decoy image was hashed and produced no finding; the page's
    // video bytes were never fetched (Phase 2 fetches images only).
    expect(fx.site.requested(VPDQ_HOST, "/img/decoy.png")).toBe(true);
    expect(api.posted.some((f) => f.imageUrl.endsWith("/img/decoy.png"))).toBe(false);
    expect(fx.site.requested(VPDQ_HOST, "/clip.webm")).toBe(false);

    // The pool logs carry counts only: sizes, videos, frames — never a hash.
    const loaded = lines.map((l) => JSON.parse(l) as { event: string } & Record<string, unknown>).find((l) => l.event === "pool_loaded");
    expect(loaded).toMatchObject({ poolSize: 4, poolVideos: 3, poolFrames: 7 });
    assertCleanLog(lines.join("\n"), { hostnames: [VPDQ_HOST], hashes: fx.allHashes, secrets: [TEST_KEY] });
  }, 30_000);

  it("withdraws a video fingerprint the server no longer accepts, like an image one", async () => {
    const api = await mock({ notAccepted: ["fp-vid-a"] });
    const { result } = await runFixtureCrawl(fx.site, api, { hosts: [VPDQ_HOST] });
    expect(result.exitCode).toBe(0);

    // The video finding was sent once and refused; the image finding and the
    // other video's went through. The withdrawal is counted, never re-posted.
    expect(api.posted.filter((f) => f.fingerprintId === "fp-vid-a")).toHaveLength(1);
    expect(api.created.size).toBe(2);
    const rejected = result.summary.rejectedByReason as Record<string, number>;
    expect(rejected).toEqual({ fingerprint_not_accepted: 1 });
    expect(result.summary.findingsWithdrawn).toBe(0); // nothing else was queued for it
    expect(result.summary.findingsAccepted).toBe(2);
    expect(result.summary.videoMatches).toBe(2);
  }, 30_000);
});
