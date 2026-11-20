/**
 * Preview sprite sheets (video-fingerprints spec WP21), unit level:
 *  - which image address counts as a sprite (isPreviewSpriteUrl);
 *  - the tile grid a given size is cut into (spriteGrid), including its
 *    documented limits: exact-16:9 sheets resolve to the coarsest reading,
 *    and a non-16:9 photo named like a sprite is cut;
 *  - the in-process split (hashSpriteImage): one decode, every tile hashed
 *    exactly like the standalone image it is — a misnamed single image
 *    answers with its one whole-image hash.
 */
import { describe, expect, it } from "vitest";
import { CrawlError } from "../../src/errors.ts";
import { hashImage, hashSpriteImage } from "../../src/image/hash-image.ts";
import { MAX_SPRITE_TILES, isPreviewSpriteUrl, spriteGrid } from "../../src/image/sprite.ts";
import { patternImage, spriteSheet } from "../support/synthetic.ts";

const url = (u: string) => new URL(u);

describe("isPreviewSpriteUrl (WP21)", () => {
  it("matches sprite and storyboard in the pathname, case-insensitively", () => {
    expect(isPreviewSpriteUrl(url("http://x.test/img/sprite.png"))).toBe(true);
    expect(isPreviewSpriteUrl(url("http://x.test/img/preview-sprite.jpg"))).toBe(true);
    expect(isPreviewSpriteUrl(url("http://x.test/thumbs/SPRITE2.PNG"))).toBe(true);
    expect(isPreviewSpriteUrl(url("http://x.test/sb/abc/storyboard3_L2/M0.jpg"))).toBe(true);
  });
  it("never reads the query, and a plain thumbnail is not a sprite", () => {
    expect(isPreviewSpriteUrl(url("http://x.test/img/photo.jpg?sprite=1&storyboard=2"))).toBe(false);
    expect(isPreviewSpriteUrl(url("http://x.test/img/thumb.png"))).toBe(false);
    // Deliberate: "thumbnail" names single thumbnails (hashed whole like
    // any image), not contact sheets; the tokens are a conservative pair.
    expect(isPreviewSpriteUrl(url("http://x.test/img/thumbnails.jpg"))).toBe(false);
    expect(isPreviewSpriteUrl(url("http://x.test/img/photo.jpg"))).toBe(false);
  });
});

describe("spriteGrid (WP21)", () => {
  it("cuts a 3x2 grid of 16:9 tiles on its true lines", () => {
    // 480x180: the only grid in range whose tiles sit at 16:9.
    expect(spriteGrid(480, 180, 64)).toEqual({ cols: 3, rows: 2 });
  });
  it("cuts a single-row strip of 16:9 tiles", () => {
    // 1600x90: ten 160x90 tiles, the only exact reading (20x2 is past the
    // grid-side cap).
    expect(spriteGrid(1600, 90, 64)).toEqual({ cols: 10, rows: 1 });
  });
  it("cuts a real-world 10x7 contact sheet on its true lines", () => {
    // 1600x630 = seventy 160x90 tiles, again the only exact reading.
    expect(spriteGrid(1600, 630, 64)).toEqual({ cols: 10, rows: 7 });
  });
  it("keeps a 16:9 image whole: its own aspect already hits the target", () => {
    // Exact-16:9 sizes tie across every square grid ((1,1), (2,2), ...);
    // the fewest-tiles rule keeps the whole image, so a photo named like a
    // sprite keeps its whole-image hash.
    expect(spriteGrid(1280, 720, 64)).toEqual({ cols: 1, rows: 1 });
    expect(spriteGrid(640, 360, 64)).toEqual({ cols: 1, rows: 1 });
  });
  it("resolves an ambiguous sheet to the coarsest exact reading, documented", () => {
    // 640x180 is two 320x180 frames wide AND a 4x2 grid of 160x90 tiles —
    // geometry alone cannot tell. The fewest tiles win, so a true 4x2 sheet
    // here is cut in half and its 160x90 tiles are lost: the documented
    // cost of the tie rule, chosen so a misnamed photo never is shredded.
    expect(spriteGrid(640, 180, 64)).toEqual({ cols: 2, rows: 1 });
  });
  it("keeps an image whole when it is too small to halve: no finer grid fits", () => {
    // 240x180 admits no grid with tiles >= 64 beyond the whole image.
    expect(spriteGrid(240, 180, 64)).toEqual({ cols: 1, rows: 1 });
  });
  it("documents the accepted false positive: a non-16:9 photo named like a sprite is cut", () => {
    // The aspect search finds grids closer to 16:9 than the whole photo:
    // 320x240 cuts to 160x80 tiles, 800x600 to 266x150 (the exact-16:9
    // reading, ties resolved to the fewest tiles). A misnamed photo loses
    // its whole-image hash to tiles that match nothing — the documented
    // cost of the name heuristic, bounded by MAX_SPRITE_TILES.
    expect(spriteGrid(320, 240, 64)).toEqual({ cols: 2, rows: 3 });
    expect(spriteGrid(800, 600, 64)).toEqual({ cols: 3, rows: 4 });
  });
  it("honours the tile floor: an image under MIN_IMAGE_SIDE stays whole", () => {
    expect(spriteGrid(200, 50, 64)).toEqual({ cols: 1, rows: 1 });
    expect(spriteGrid(63, 63, 64)).toEqual({ cols: 1, rows: 1 });
  });
  it("never returns more than MAX_SPRITE_TILES tiles", () => {
    // A square sheet: the finest exact reading (9x16 = 144 tiles) is past
    // the cap, so the best grid under it is 5x9 (45 tiles).
    expect(spriteGrid(1024, 1024, 64)).toEqual({ cols: 5, rows: 9 });
    expect(5 * 9).toBeLessThanOrEqual(MAX_SPRITE_TILES);
  });
});

describe("hashSpriteImage (WP21)", () => {
  it("hashes every tile exactly like the standalone image it is", async () => {
    const seeds = [400, 401, 402, 403, 404, 405];
    const sheet = await spriteSheet(seeds, 160, 90, 3, 2);
    const r = await hashSpriteImage(sheet, { minSide: 64 });
    expect(r.width).toBe(480);
    expect(r.height).toBe(180);
    expect(r.format).toBe("png");
    expect(r.tiles).toHaveLength(6);
    const standalone: string[] = [];
    for (const s of seeds) standalone.push((await hashImage(await patternImage(s, 160, 90, "png"), { minSide: 64 })).hash);
    expect(r.tiles.map((t) => t.hash)).toEqual(standalone);
    for (const t of r.tiles) {
      expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(t.quality).toBeGreaterThanOrEqual(50);
    }
  });
  it("cuts a single-row strip on its true lines too", async () => {
    const seeds = [430, 431, 432, 433, 434, 435, 436, 437, 438, 439];
    const strip = await spriteSheet(seeds, 160, 90, 10, 1);
    const r = await hashSpriteImage(strip, { minSide: 64 });
    expect(r.tiles).toHaveLength(10);
    const standalone: string[] = [];
    for (const s of seeds) standalone.push((await hashImage(await patternImage(s, 160, 90, "png"), { minSide: 64 })).hash);
    expect(r.tiles.map((t) => t.hash)).toEqual(standalone);
  });
  it("answers a misnamed single image with its whole-image hash", async () => {
    // A 16:9 image: every square grid ties at zero error and the fewest
    // tiles win, so the whole image is the one "tile".
    const one = await patternImage(420, 640, 360, "png");
    const sprite = await hashSpriteImage(one, { minSide: 64 });
    const whole = await hashImage(one, { minSide: 64 });
    expect(sprite.tiles).toHaveLength(1);
    expect(sprite.tiles[0]).toEqual({ hash: whole.hash, quality: whole.quality });
  });
  it("obeys the whole-image size rules before any tile is cut", async () => {
    const tiny = await patternImage(421, 60, 60, "png");
    await expect(hashSpriteImage(tiny, { minSide: 64 })).rejects.toMatchObject({ code: "image_too_small" });
    await expect(hashSpriteImage(Buffer.from("not an image at all"), { minSide: 64 })).rejects.toBeInstanceOf(CrawlError);
  });
  it("hashes a real-world 70-tile sheet inside the cap", async () => {
    const seeds = Array.from({ length: 70 }, (_, i) => 500 + i);
    const sheet = await spriteSheet(seeds, 160, 90, 10, 7);
    const r = await hashSpriteImage(sheet, { minSide: 64 });
    expect(r.tiles).toHaveLength(70);
    expect(r.tiles.length).toBeLessThanOrEqual(MAX_SPRITE_TILES);
    const first = (await hashImage(await patternImage(seeds[0]!, 160, 90, "png"), { minSide: 64 })).hash;
    const last = (await hashImage(await patternImage(seeds[69]!, 160, 90, "png"), { minSide: 64 })).hash;
    expect(r.tiles[0]!.hash).toBe(first);
    expect(r.tiles[69]!.hash).toBe(last);
  });
});
