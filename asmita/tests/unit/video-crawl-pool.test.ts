import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Video fingerprints in the crawler pool (video-fingerprints spec WP20), on
// the memory dev path: the pool serves a VPDQ row as { id, kind: "video",
// frames } — hashes only, decrypted from the stored frame list — the image
// entries are unchanged, the pool version covers videos, the best-frame
// fallback holds when the frame list is unreadable, and withdrawal and
// erasure take a video out of the pool. Synthetic frame hashes only.

vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import { buildCrawlPool, resolvePoolFingerprint } from "@/lib/crawl-pool";
import { crawlMemory, eraseCrawlMemoryForCases, resetCrawlMemory, type MemoryFingerprint } from "@/lib/crawl-store";
import { withdrawCrawlConsent } from "@/lib/crawl-consent";
import { encryptField } from "@/lib/encryption";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
const H3 = "c".repeat(64);
const NOT_HEX = "x".repeat(64);

function framesJson(hashes: string[]): string {
  return encryptField(JSON.stringify(hashes.map((hash, t) => ({ hash, quality: 90, t }))));
}

function seedVideo(overrides: Partial<MemoryFingerprint> = {}): void {
  crawlMemory().fingerprints.set("hs-vid", {
    id: "hs-vid",
    caseId: "case-v",
    hashEncrypted: encryptField(H2),
    quality: 95,
    status: "APPROVED",
    crawlPoolId: "fp_vid",
    algorithm: "VPDQ",
    videoFramesEncrypted: framesJson([H1, H2]),
    ...overrides,
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetCrawlMemory();
  crawlMemory().consents.push({
    id: "consent-1", caseId: "case-v", signedPdfEncrypted: "enc",
    hashSubmissionIds: ["hs-vid"], templateId: "t", templateDigest: "d",
    signedAt: new Date(), withdrawnAt: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("the pool's video entries (memory path)", () => {
  it("serves a VPDQ fingerprint as { id, kind: \"video\", frames } with its stored frame hashes", async () => {
    seedVideo();
    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([{ id: "fp_vid", kind: "video", frames: [H1, H2] }]);
    expect(pool.threshold).toBe(31);
  });

  it("serves the image shape unchanged beside it", async () => {
    seedVideo();
    crawlMemory().fingerprints.set("hs-img", {
      id: "hs-img", caseId: "case-v", hashEncrypted: encryptField(H3), quality: 80, status: "APPROVED", crawlPoolId: "fp_img",
    });
    crawlMemory().consents[0]!.hashSubmissionIds.push("hs-img");
    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toEqual([
      { id: "fp_img", pdq: H3, quality: 80 },
      { id: "fp_vid", kind: "video", frames: [H1, H2] },
    ]);
  });

  it("keeps the image-only pool version formula and covers videos in the version", async () => {
    crawlMemory().fingerprints.set("hs-img", {
      id: "hs-img", caseId: "case-v", hashEncrypted: encryptField(H3), quality: 80, status: "APPROVED", crawlPoolId: "fp_img",
    });
    crawlMemory().consents[0]!.hashSubmissionIds = ["hs-img"];
    const imageOnly = await buildCrawlPool();
    const expectedImageOnly = createHash("sha256").update("fp_img:" + H3 + ":80").digest("hex").slice(0, 32);
    expect(imageOnly.version).toBe(expectedImageOnly);

    crawlMemory().consents[0]!.hashSubmissionIds = ["hs-img", "hs-vid"];
    seedVideo();
    const withVideo = await buildCrawlPool();
    expect(withVideo.version).not.toBe(imageOnly.version);
    // Deterministic: the same pool twice hashes the same.
    expect((await buildCrawlPool()).version).toBe(withVideo.version);
  });

  it("falls back to the stored best frame when the frame list is gone or unreadable", async () => {
    seedVideo({ videoFramesEncrypted: null });
    expect((await buildCrawlPool()).fingerprints).toEqual([{ id: "fp_vid", kind: "video", frames: [H2] }]);

    seedVideo({ videoFramesEncrypted: encryptField("not the stored json") });
    expect((await buildCrawlPool()).fingerprints).toEqual([{ id: "fp_vid", kind: "video", frames: [H2] }]);

    // No valid hash anywhere: the row is skipped, not served empty.
    seedVideo({ videoFramesEncrypted: null, hashEncrypted: encryptField(NOT_HEX) });
    expect((await buildCrawlPool()).fingerprints).toEqual([]);
  });

  it("drops non-hex frame hashes from the stored list", async () => {
    seedVideo({ videoFramesEncrypted: framesJson([NOT_HEX, H3]) });
    expect((await buildCrawlPool()).fingerprints).toEqual([{ id: "fp_vid", kind: "video", frames: [H3] }]);
  });

  it("withdrawn consent takes the video out of the pool and unresolves its id", async () => {
    seedVideo();
    expect(await resolvePoolFingerprint("fp_vid")).toMatchObject({ hashSubmissionId: "hs-vid", caseId: "case-v" });
    expect((await withdrawCrawlConsent("case-v")).ok).toBe(true);
    expect((await buildCrawlPool()).fingerprints).toEqual([]);
    expect(await resolvePoolFingerprint("fp_vid")).toBeNull();
  });

  it("erasure clears the frame list with the pool id on the memory crawl store", async () => {
    seedVideo();
    eraseCrawlMemoryForCases(["case-v"]);
    const row = crawlMemory().fingerprints.get("hs-vid")!;
    expect(row.crawlPoolId).toBeNull();
    expect(row.videoFramesEncrypted).toBeNull();
    expect((await buildCrawlPool()).fingerprints).toEqual([]);
  });
});
