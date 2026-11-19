import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Video fingerprints on the server (video-fingerprints spec WP17): the
// validator, the dev memory store, the erasure of the frame list, and the
// pool exclusion (rule 3). Synthetic frame hashes only — no video bytes
// exist anywhere in this suite.

vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("prisma path must not run here"); } }) }));

import {
  addHashesToCase,
  listHashesForCase,
  validateVideoItem,
  videoFingerprintLabel,
  MAX_VIDEO_FRAMES,
  type VideoFrameItem,
  type VideoPayloadItem,
} from "@/lib/hash-submission";
import * as store from "@/lib/store";
import { crawlMemory, resetCrawlMemory } from "@/lib/crawl-store";
import { buildCrawlPool } from "@/lib/crawl-pool";
import { recordCrawlConsent } from "@/lib/crawl-consent";
import { encryptField } from "@/lib/encryption";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import hiReview from "@/i18n/hi-review-status.json";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
const H3 = "c".repeat(64);

function frame(hash: string, quality: number, t: number): VideoFrameItem {
  return { hash, quality, t };
}

function videoItem(frames: VideoFrameItem[], durationSec = 300, clientVersion = "vpdq-0.1.0"): VideoPayloadItem {
  return { kind: "video", frames, durationSec, clientVersion };
}

function expectedDigest(hashes: string[]) {
  return createHash("sha256").update([...new Set(hashes)].sort().join("\n")).digest("hex");
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  globalThis.__asmitaHashStore = new Map();
  resetCrawlMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("validateVideoItem", () => {
  it("accepts a well-formed video item and derives the row's stored fields", () => {
    const result = validateVideoItem(videoItem([frame(H1, 80, 0), frame(H2, 95, 1), frame(H3, 60, 2)]));
    expect(result).toMatchObject({
      ok: true,
      durationSec: 300,
      clientVersion: "vpdq-0.1.0",
      bestFrame: { hash: H2, quality: 95 },
      hashDigest: expectedDigest([H1, H2, H3]),
      lowQuality: false,
    });
  });

  it("breaks digest ties deterministically and is order-independent", () => {
    const one = validateVideoItem(videoItem([frame(H1, 90, 0), frame(H2, 90, 1)]));
    const two = validateVideoItem(videoItem([frame(H2, 90, 1), frame(H1, 90, 0)]));
    expect(one.ok && one.hashDigest).toBe(two.ok ? two.hashDigest : "");
    // A quality tie keeps the earliest frame's hash.
    expect(one.ok && one.bestFrame).toMatchObject({ hash: H1, quality: 90 });
  });

  it("dedups the digest over unique frame hashes only", () => {
    const repeated = validateVideoItem(videoItem([frame(H1, 70, 0), frame(H1, 70, 1)]));
    expect(repeated.ok && repeated.hashDigest).toBe(expectedDigest([H1]));
  });

  it("rejects more frames than the cap", () => {
    const tooMany = Array.from({ length: MAX_VIDEO_FRAMES + 1 }, (_, i) => frame((i % 10).toString().repeat(64), 50, i));
    expect(validateVideoItem(videoItem(tooMany, 4000))).toMatchObject({ ok: false, error: "too_many_frames" });
  });

  it("rejects an empty frame list and a bad duration", () => {
    expect(validateVideoItem(videoItem([], 300))).toMatchObject({ ok: false, error: "no_frames" });
    expect(validateVideoItem(videoItem([frame(H1, 50, 0)], 0))).toMatchObject({ ok: false, error: "invalid_duration" });
    expect(validateVideoItem(videoItem([frame(H1, 50, 0)], 3601))).toMatchObject({ ok: false, error: "invalid_duration" });
  });

  it("rejects a frame hash that is not exactly 64 hex chars", () => {
    expect(validateVideoItem(videoItem([frame("xyz", 50, 0)]))).toMatchObject({ ok: false, error: "invalid_hash_format" });
    expect(validateVideoItem(videoItem([frame(H1.slice(0, 63), 50, 0)]))).toMatchObject({ ok: false, error: "invalid_hash_format" });
    expect(validateVideoItem(videoItem([frame("g".repeat(64), 50, 0)]))).toMatchObject({ ok: false, error: "invalid_hash_format" });
  });

  it("rejects data-URL and base64-looking frame hashes as media smuggling", () => {
    expect(validateVideoItem(videoItem([frame("data:image/png;base64,iVBOR", 50, 0)]))).toMatchObject({
      ok: false,
      error: "media_payload_rejected",
    });
    expect(validateVideoItem(videoItem([frame("iVBORw0KGgoAAAANSUhEUg+/Zg==", 50, 0)]))).toMatchObject({
      ok: false,
      error: "media_payload_rejected",
    });
  });

  it("rejects out-of-range frame quality and timestamps", () => {
    expect(validateVideoItem(videoItem([frame(H1, 101, 0)]))).toMatchObject({ ok: false, error: "invalid_quality" });
    expect(validateVideoItem(videoItem([frame(H1, 50, -1)]))).toMatchObject({ ok: false, error: "invalid_frame_time" });
    expect(validateVideoItem(videoItem([frame(H1, 50, 3601)]))).toMatchObject({ ok: false, error: "invalid_frame_time" });
  });

  it("flags a video whose best frame is low quality", () => {
    expect(validateVideoItem(videoItem([frame(H1, 20, 0), frame(H2, 49, 1)]))).toMatchObject({
      ok: true,
      bestFrame: { hash: H2, quality: 49 },
      lowQuality: true,
    });
  });
});

describe("addHashesToCase, memory store", () => {
  it("stores one VPDQ row with the frame list, and never returns it to callers", async () => {
    const results = await addHashesToCase("case-1", [videoItem([frame(H1, 80, 0), frame(H2, 95, 1)], 65)]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ok: true,
      duplicate: false,
      submission: {
        algorithm: "VPDQ",
        quality: 95,
        videoFrameCount: 2,
        videoDurationSec: 65,
        status: "PENDING_REVIEW",
      },
    });
    // The frame list never leaves the store.
    expect(results[0].ok && JSON.stringify(results[0].submission)).not.toContain(H2);
    const listed = await listHashesForCase("case-1");
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(H2);

    const stored = globalThis.__asmitaHashStore!.get("case-1")!;
    expect(stored).toHaveLength(1);
    expect(stored[0].videoFrames).toBe(JSON.stringify([{ hash: H1, quality: 80, t: 0 }, { hash: H2, quality: 95, t: 1 }]));
  });

  it("treats a video as one item and mixes it with image hashes", async () => {
    const results = await addHashesToCase("case-2", [
      { hash: H3, quality: 70 },
      videoItem([frame(H1, 90, 0)], 30),
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => (r.ok ? r.submission.algorithm : r.error))).toEqual(["PDQ", "VPDQ"]);
  });

  it("dedups a re-upload by the frame digest, whatever the frame order", async () => {
    await addHashesToCase("case-3", [videoItem([frame(H1, 80, 0), frame(H2, 95, 1)])]);
    const again = await addHashesToCase("case-3", [videoItem([frame(H2, 95, 1), frame(H1, 80, 0)])]);
    expect(again[0]).toMatchObject({ ok: true, duplicate: true });
    expect(globalThis.__asmitaHashStore!.get("case-3")).toHaveLength(1);
  });

  it("keeps per-item validation results for a bad frame without storing anything", async () => {
    const results = await addHashesToCase("case-4", [videoItem([frame("nope", 50, 0)])]);
    expect(results).toEqual([{ ok: false, error: "invalid_hash_format" }]);
    expect(globalThis.__asmitaHashStore!.get("case-4") ?? []).toHaveLength(0);
  });

  it("account erasure removes the frame list but keeps the row, like the database paths", async () => {
    const record = await store.createCase("user-video");
    await addHashesToCase(record.id, [videoItem([frame(H1, 80, 0), frame(H2, 95, 1)], 65)]);
    const deletion = store.deactivateUser("user-video");

    const deleted = await store.hardDeleteDueUsers(new Date(new Date(deletion.hardDeleteAfter).getTime() + 1));
    expect(deleted).toEqual(["user-video"]);

    const rows = globalThis.__asmitaHashStore!.get(record.id)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].videoFrames).toBeUndefined();
    expect(rows[0].algorithm).toBe("VPDQ");
    expect(rows[0].videoFrameCount).toBe(2);
  });
});

describe("crawler pool excludes video fingerprints (rule 3)", () => {
  it("never lists a VPDQ fingerprint under its consent, memory path", async () => {
    // The pool keeps fingerprints only while the case is open or inside its
    // re-upload window (watch-and-verify WP24), so the fixture needs an open
    // case for the consent to cover anything.
    store.cases.set("case-9", {
      id: "case-9", referenceNumber: "ASMITA-2026-V0009", userId: "user-video",
      createdAt: new Date().toISOString(), status: "OPEN", urls: [],
    });
    crawlMemory().fingerprints.set("hs-img", {
      id: "hs-img", caseId: "case-9", hashEncrypted: encryptField(H1), quality: 80, status: "APPROVED", crawlPoolId: null,
    });
    crawlMemory().fingerprints.set("hs-vid", {
      id: "hs-vid", caseId: "case-9", hashEncrypted: encryptField(H2), quality: 90, status: "APPROVED", crawlPoolId: null,
      algorithm: "VPDQ",
    });
    expect(
      (await recordCrawlConsent({
        caseId: "case-9", signedPdfEncrypted: "enc",
        hashSubmissionIds: ["hs-img", "hs-vid"], templateId: "t", templateDigest: "d",
      })).ok,
    ).toBe(true);

    const pool = await buildCrawlPool();
    expect(pool.fingerprints).toHaveLength(1);
    expect(pool.fingerprints[0].pdq).toBe(H1);
  });
});

describe("display labels and wording", () => {
  it("labels a video as Video · N frames · M:SS", () => {
    expect(videoFingerprintLabel(12, 65)).toBe("Video · 12 frames · 1:05");
    expect(videoFingerprintLabel(1, 59)).toBe("Video · 1 frame · 0:59");
    expect(videoFingerprintLabel(1000, 3600)).toBe("Video · 1000 frames · 60:00");
    expect(videoFingerprintLabel(null, 300)).toBeNull();
  });

  it("ships the survivor-facing video wording in both locales and marks the Hindi key machine translated", () => {
    expect(en["case.fingerprints.videoItem"]).toBe("Video {n}");
    expect(hi["case.fingerprints.videoItem"]).toBe("वीडियो {n}");
    expect(hiReview.machineTranslated.keys).toContain("case.fingerprints.videoItem");
  });
});
