import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The WP17 hash route against a mocked Prisma client, in the style of
// hash-one-signature.test.ts: video items are accepted next to image items,
// one video counts as one item, the schema rejects anything else, and a
// smuggled media payload is refused with the security event the image path
// logs. Placeholder hashes only.

const m = vi.hoisted(() => ({
  caseFindUnique: vi.fn(),
  hashFindFirst: vi.fn(),
  hashCreate: vi.fn(),
  platformCount: vi.fn(),
  logSecurityEvent: vi.fn(),
  getCaseForUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    case: { findUnique: m.caseFindUnique, updateMany: vi.fn() },
    platform: { count: m.platformCount },
    hashSubmission: { findFirst: m.hashFindFirst, create: m.hashCreate, findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfRequest: () => true }));
vi.mock("@/lib/auth/middleware", () => ({ requireSession: async () => ({ ok: true, session: { sub: "user-1", emailHash: "h" } }) }));
vi.mock("@/lib/case-ops", () => ({ getCaseForUser: m.getCaseForUser }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ allowed: true }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: m.logSecurityEvent }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

import { POST as addHashes } from "@/app/api/cases/[caseId]/hashes/route";
import { decryptField } from "@/lib/encryption";
import { MAX_VIDEO_FRAMES } from "@/lib/hash-submission";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);
const digestOf = (hashes: string[]) => createHash("sha256").update([...new Set(hashes)].sort().join("\n")).digest("hex");

const videoBody = {
  kind: "video" as const,
  frames: [
    { hash: H1, quality: 80, t: 0 },
    { hash: H2, quality: 95, t: 1 },
  ],
  durationSec: 65,
  clientVersion: "vpdq-0.1.0",
};

function post(hashes: unknown[]) {
  return addHashes(
    new Request("https://asmita.test/api/cases/case-1/hashes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hashes, declaration: true }),
    }),
    { params: Promise.resolve({ caseId: "case-1" }) },
  );
}

beforeEach(() => {
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  m.caseFindUnique.mockReset().mockResolvedValue({ declarationSignedAt: null, hashAdvisoryPlatformIds: [] });
  m.hashFindFirst.mockReset().mockResolvedValue(null);
  m.hashCreate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "hash-new",
    algorithm: data.algorithm,
    hashDigest: data.hashDigest,
    quality: data.quality,
    status: "PENDING_REVIEW",
    flaggedForReview: false,
    flagReason: null,
    submittedAt: new Date(),
    videoFrameCount: data.videoFrameCount ?? null,
    videoDurationSec: data.videoDurationSec ?? null,
  }));
  m.platformCount.mockReset().mockResolvedValue(0);
  m.logSecurityEvent.mockClear();
  m.getCaseForUser.mockReset().mockResolvedValue({ id: "case-1", createdAt: new Date().toISOString() });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/cases/[caseId]/hashes with a video item", () => {
  it("stores one VPDQ row: best frame hash, frame digest, encrypted frame list", async () => {
    const res = await post([videoBody]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      ok: true,
      duplicate: false,
      submission: { algorithm: "VPDQ", quality: 95, videoFrameCount: 2, videoDurationSec: 65 },
    });

    expect(m.hashCreate).toHaveBeenCalledTimes(1);
    const data = m.hashCreate.mock.calls[0][0].data;
    expect(data.algorithm).toBe("VPDQ");
    expect(data.hashDigest).toBe(digestOf([H1, H2]));
    expect(decryptField(data.hashEncrypted)).toBe(H2);
    expect(JSON.parse(decryptField(data.videoFramesEncrypted))).toEqual(videoBody.frames);
    expect(data.videoFrameCount).toBe(2);
    expect(data.videoDurationSec).toBe(65);
    expect(data.clientVersion).toBe("vpdq-0.1.0");
  });

  it("accepts an image and a video in one request; a video counts as one item", async () => {
    const res = await post([{ hash: H1, quality: 70 }, videoBody, { kind: "image", hash: "c".repeat(64), quality: 70 }]);
    expect(res.status).toBe(200);
    expect(m.hashCreate).toHaveBeenCalledTimes(3);
    expect(m.hashCreate.mock.calls.map((c) => c[0].data.algorithm)).toEqual(["PDQ", "VPDQ", "PDQ"]);
  });

  it("refuses too many frames at the schema layer and stores nothing", async () => {
    const frames = Array.from({ length: MAX_VIDEO_FRAMES + 1 }, (_, i) => ({
      hash: (i % 16).toString(16).repeat(64),
      quality: 50,
      t: i,
    }));
    const res = await post([{ kind: "video", frames, durationSec: 4000 }]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("refuses anything that is neither an image item nor a video item", async () => {
    for (const bad of [
      { kind: "audio", frames: [], durationSec: 10 },
      { kind: "video", frames: [], durationSec: 10 },
      { kind: "video", durationSec: 10 },
      { kind: "video", frames: videoBody.frames, durationSec: 0 },
      { ...videoBody, extraField: "x" },
      { ...videoBody, frames: [{ hash: H1, quality: 80, t: 0, width: 320 }] },
      { hash: H1 },
    ]) {
      const res = await post([bad]);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("answers a bad frame hash as a per-item result, like a bad image hash", async () => {
    const res = await post([{ kind: "video", frames: [{ hash: "xyz", quality: 50, t: 0 }], durationSec: 10 }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ ok: false, error: "invalid_hash_format" }]);
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("logs the media-smuggling security event for a data-URL frame hash", async () => {
    const res = await post([{ kind: "video", frames: [{ hash: "data:image/png;base64,iVBOR", quality: 50, t: 0 }], durationSec: 10 }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ ok: false, error: "media_payload_rejected" }]);
    expect(m.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "media_payload_rejected", route: "/api/cases/[caseId]/hashes" }),
    );
  });

  it("reports a re-upload as a duplicate by the frame digest", async () => {
    m.hashFindFirst.mockResolvedValue({
      id: "hash-old", algorithm: "VPDQ", hashDigest: digestOf([H1, H2]), quality: 95, status: "APPROVED",
      flaggedForReview: false, flagReason: null, submittedAt: new Date(), videoFrameCount: 2, videoDurationSec: 65,
    });
    const res = await post([{ ...videoBody, frames: [...videoBody.frames].reverse() }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ ok: true, duplicate: true, submission: { id: "hash-old", algorithm: "VPDQ" } });
    expect(m.hashCreate).not.toHaveBeenCalled();
    expect(m.hashFindFirst).toHaveBeenCalledWith({ where: { caseId: "case-1", hashDigest: digestOf([H1, H2]) } });
  });

  it("refuses an oversized body before parsing it", async () => {
    // The route reads the declared length before touching the body, exactly as
    // the deployed runtime sees it on the wire.
    const res = await addHashes(
      new Request("https://asmita.test/api/cases/case-1/hashes", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(2_000_000) },
        body: "x".repeat(2_000_000),
      }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(m.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "media_payload_rejected" }));
  });
});

// Review fixes: nothing can hide in an unknown key, and the size cap counts the
// bytes actually read.
describe("hash route rejects hidden media and oversized image-only bodies", () => {
  const DATA_URL = "data:image/jpeg;base64," + "A".repeat(2000);

  it("refuses an unknown key on an image item instead of dropping it", async () => {
    const res = await post([{ hash: H1, quality: 80, frame: DATA_URL }]);
    expect(res.status).toBe(400);
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("refuses an unknown key at the top level", async () => {
    const res = await addHashes(
      new Request("https://asmita.test/api/cases/case-1/hashes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hashes: [{ hash: H1, quality: 80 }], declaration: true, preview: DATA_URL }),
      }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );
    expect(res.status).toBe(400);
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("keeps the 16 KB cap for a request with no video item, whatever Content-Length says", async () => {
    const res = await addHashes(
      new Request("https://asmita.test/api/cases/case-1/hashes", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "10" },
        body: JSON.stringify({ hashes: [{ hash: H1, quality: 80, clientVersion: "x".repeat(40) }], declaration: true, pad: " ".repeat(20_000) }),
      }),
      { params: Promise.resolve({ caseId: "case-1" }) },
    );
    expect([400, 413]).toContain(res.status);
    expect(m.hashCreate).not.toHaveBeenCalled();
  });

  it("refuses a video frame timed after the end of the video", async () => {
    const res = await post([{ ...videoBody, durationSec: 1, frames: [{ hash: H1, quality: 80, t: 5 }] }]);
    expect(res.status).toBe(400);
  });
});
