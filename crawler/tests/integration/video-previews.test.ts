/**
 * Video previews end to end (video-fingerprints spec WP21) against the
 * prev fixture: every preview kind — a video poster, the og:image of a
 * page that declares an og:video, a JSON-LD VideoObject thumbnailUrl, a
 * video-sitemap <video:thumbnail_loc> and a preview sprite sheet split
 * into its tiles in the decoder child — is fingerprinted like an image and
 * matched against video frames AND image fingerprints (one preview within
 * the threshold is a finding, reviewed like any other).
 *
 * No video bytes are fetched: the page's <video src> and the og:video
 * target are never requested. A grid image whose address names no sprite
 * is hashed whole and never split. Logs carry counts only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVideoPreviewFixture, fixtureSeedUrl, PREV_HOST, TEST_KEY, type Fixture } from "../support/fixture-site.ts";
import { MockAsmita, type MockAsmitaOptions } from "../support/mock-asmita.ts";
import { runFixtureCrawl } from "../support/run-fixture.ts";
import { assertCleanLog } from "../support/log-scan.ts";

let fx: Fixture;
const servers: MockAsmita[] = [];

beforeAll(async () => {
  fx = await buildVideoPreviewFixture();
}, 60_000);

afterAll(async () => {
  await fx?.site.stop();
  await Promise.all(servers.map((s) => s.stop()));
});

async function mock(opts: Partial<MockAsmitaOptions> = {}): Promise<MockAsmita> {
  const api = await new MockAsmita({
    key: TEST_KEY,
    pool: fx.pool,
    sources: [{ id: "src-prev", kind: "site", domain: PREV_HOST, pageBudget: 10, delayMs: 0, origin: "admin", hops: 0, render: "http" }],
    seedUrl: fixtureSeedUrl(fx.site.port),
    ...opts,
  }).start();
  servers.push(api);
  return api;
}

describe("video previews (WP21)", () => {
  it("matches every preview kind and posts one finding per pool id", async () => {
    const api = await mock();
    const { result, lines } = await runFixtureCrawl(fx.site, api, { hosts: [PREV_HOST] });
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
        sourceId: "src-prev",
      }))
      .sort((a, b) => a.fingerprintId.localeCompare(b.fingerprintId));
    expect(got).toEqual(want);
    expect(api.created.size).toBe(6);
    expect(api.badRequests).toEqual([]);

    // The sprite's finding is its first tile, an exact frame; the poster
    // matches its image fingerprint exactly too. Every finding is within
    // the threshold and carries a usable quality.
    expect(api.posted.find((f) => f.fingerprintId === "fp-vid-sprite")?.distance).toBe(0);
    expect(api.posted.find((f) => f.fingerprintId === "fp-img-poster")?.distance).toBe(0);
    for (const f of api.posted) {
      expect(f.quality).toBeGreaterThanOrEqual(50);
      expect(f.distance).toBeLessThanOrEqual(31);
    }

    // The summary counts video previews and sprite tiles beside the
    // matches: five previews (poster, og, JSON-LD, sprite, sitemap thumb),
    // six tiles out of the one sprite, six findings of which six video
    // hits (the sprite's two tiles both hit, one finding).
    const summary = result.summary as Record<string, unknown>;
    expect(summary.matches).toBe(6);
    expect(summary.videoMatches).toBe(6);
    expect(summary.videoPreviews).toBe(5);
    expect(summary.spriteTiles).toBe(6);
    expect(summary.findingsAccepted).toBe(6);
    expect(summary.imagesHashed).toBe(7);

    // The wrongly-named grid is hashed whole and matches nothing: the
    // split is gated on the address, and a whole contact sheet is not a
    // frame. The decoy produces no finding either.
    expect(api.posted.some((f) => f.fingerprintId === "fp-vid-neg")).toBe(false);
    expect(fx.site.requested(PREV_HOST, "/img/contact-sheet.png")).toBe(true);
    expect(api.posted.some((f) => f.imageUrl.endsWith("/img/decoy.png"))).toBe(false);

    // Phase 2 never fetches video bytes: the <video src> and the og:video
    // target are never requested.
    expect(fx.site.requested(PREV_HOST, "/clip.webm")).toBe(false);
    expect(fx.site.requested(PREV_HOST, "/clip.mp4")).toBe(false);

    assertCleanLog(lines.join("\n"), { hostnames: [PREV_HOST], hashes: fx.allHashes, secrets: [TEST_KEY] });
  }, 60_000);

  it("splits the sprite but not the same grid under a plain name — the tag never buys a match", async () => {
    // Same fixture, fresh mock: the run is deterministic, so this pins the
    // split itself — exactly six tiles, one sprite request, and the
    // unsplit contact sheet yields no tile finding even though its first
    // tile is a pool frame.
    const api = await mock();
    const requestsBefore = fx.site.requests.length;
    const { result } = await runFixtureCrawl(fx.site, api, { hosts: [PREV_HOST] });
    expect(result.exitCode).toBe(0);
    expect(result.summary.spriteTiles).toBe(6);
    expect(result.summary.videoPreviews).toBe(5);
    // The fixture's request log is cumulative across the tests; count this
    // run's slice. The sprite is fetched exactly once (the per-run image
    // dedup), and never re-fetched for its tiles.
    const thisRun = fx.site.requests.slice(requestsBefore);
    expect(thisRun.filter((r) => r.host === PREV_HOST && r.path === "/img/sprite.png")).toHaveLength(1);
    expect(api.posted.filter((f) => f.fingerprintId === "fp-vid-sprite")).toHaveLength(1);
    expect(api.posted.some((f) => f.fingerprintId === "fp-vid-neg")).toBe(false);
  }, 60_000);
});
