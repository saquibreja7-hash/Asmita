import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The crawl authorisation's fingerprint list (video-fingerprints spec WP19):
// the list is the single annex appended to the authorisation template, so a
// video fingerprint is named there as one entry, "Video fingerprint (vPDQ,
// N frames)", with its frame hashes - the template text itself is never
// edited. Real annex and draft code; only the database is faked. Synthetic
// frame hashes only.

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

type FindWhere = { caseId?: string; status?: { not?: string } };

vi.mock("@/lib/db", () => ({
  db: {
    hashSubmission: {
      findMany: vi.fn(async ({ where = {} }: { where?: FindWhere }) =>
        (state.rows as Array<Record<string, unknown> & { id: string; caseId: string; status: string; submittedAt: Date }>)
          .filter(
            (row) =>
              (where.caseId === undefined || row.caseId === where.caseId) &&
              (where.status?.not !== undefined ? row.status !== where.status.not : true),
          )
          .sort((a, b) => +a.submittedAt - +b.submittedAt),
      ),
    },
    noticeTemplate: {
      findFirst: vi.fn(async () => ({
        id: "authorisation-t1",
        platformId: null,
        templateType: "CRAWL_AUTHORISATION",
        subjectTemplate: "Authorisation to search - {{caseReference}}",
        bodyTemplate: [
          "AUTHORISATION TO SEARCH FOR COPIES OF MY IMAGES",
          "",
          "[The list of fingerprints covered by this authorisation is appended below.]",
        ].join("\n"),
        reviewedByLegal: true,
        isActive: true,
        version: 1,
      })),
    },
  },
}));

import { buildCrawlAuthorisationDraft } from "@/lib/crawl-consent";
import { encryptField } from "@/lib/encryption";
import { templateRef } from "@/lib/signed-template";

const IMG_ID = "5f0c1d2e-0000-4000-8000-00000000000a";
const VID_ID = "5f0c1d2e-0000-4000-8000-00000000000b";
const IMG_HASH = "a".repeat(64);
const F1 = "b".repeat(64);
const F2 = "c".repeat(64);
const F3 = "d".repeat(64);

function imageRow(id: string, submittedAt: Date, status = "PENDING_REVIEW") {
  return {
    id,
    caseId: "case-1",
    algorithm: "PDQ",
    hashEncrypted: encryptField(IMG_HASH),
    hashDigest: `digest-${id}`,
    quality: 92,
    clientVersion: "pdq-1",
    videoFramesEncrypted: null,
    videoFrameCount: null,
    videoDurationSec: null,
    status,
    flaggedForReview: false,
    flagReason: null,
    submittedAt,
  };
}

function videoRow(id: string, submittedAt: Date, status = "PENDING_REVIEW") {
  return {
    ...imageRow(id, submittedAt, status),
    algorithm: "VPDQ",
    hashEncrypted: encryptField(F2),
    quality: 95,
    hashDigest: `digest-${id}`,
    clientVersion: "vpdq-0.1.0",
    videoFramesEncrypted: encryptField(JSON.stringify([
      { hash: F1, quality: 80, t: 0 },
      { hash: F2, quality: 95, t: 1 },
      { hash: F3, quality: 60, t: 2 },
    ])),
    videoFrameCount: 3,
    videoDurationSec: 300,
  };
}

beforeEach(() => {
  vi.stubEnv("ENABLE_HASH_UPLOAD", "true");
  vi.stubEnv("DATABASE_URL", "postgresql://placeholder.invalid/asmita_test");
  state.rows = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("the crawl authorisation's fingerprint list", () => {
  it("names a video fingerprint as one entry with its frame hashes, beside the image hashes", async () => {
    state.rows = [
      imageRow(IMG_ID, new Date("2026-11-01T00:00:00Z")),
      videoRow(VID_ID, new Date("2026-11-02T00:00:00Z")),
    ];
    const draft = await buildCrawlAuthorisationDraft("case-1", "ASMITA-2026-00001", false);
    expect("error" in draft).toBe(false);
    if ("error" in draft) return;

    // The template text is appended, not edited, and the annex follows it.
    expect(draft.body).toContain("AUTHORISATION TO SEARCH FOR COPIES OF MY IMAGES");
    expect(draft.body).toContain("[The list of fingerprints covered by this authorisation is appended below.]");
    expect(draft.body.indexOf("appended below.")).toBeLessThan(draft.body.indexOf("PERCEPTUAL HASH ANNEX"));
    // The list names the image as before and the video as one vPDQ entry.
    expect(draft.body).toContain(`  1. ${IMG_HASH} (quality: 92/100)`);
    expect(draft.body).toContain("  2. Video fingerprint (vPDQ, 3 frames)");
    expect(draft.body).toContain(`       ${F1}`);
    expect(draft.body).toContain(`       ${F3}`);
    // Both ids are pinned by the reference she ticks against, video like image.
    expect(draft.hashSubmissionIds).toEqual([IMG_ID, VID_ID]);
    expect(draft.templateRef).toBe(templateRef(draft.template, [IMG_ID, VID_ID]));
  });

  it("covers a case whose only fingerprint is a video", async () => {
    state.rows = [videoRow(VID_ID, new Date("2026-11-02T00:00:00Z"))];
    const draft = await buildCrawlAuthorisationDraft("case-1", "ASMITA-2026-00001", false);
    expect("error" in draft).toBe(false);
    if ("error" in draft) return;
    expect(draft.hashSubmissionIds).toEqual([VID_ID]);
    expect(draft.body).toContain("  1. Video fingerprint (vPDQ, 3 frames)");
    expect(draft.body).not.toContain("Hash values (PDQ, 256-bit hex):");
  });

  it("still refuses when there is no fingerprint to cover", async () => {
    const draft = await buildCrawlAuthorisationDraft("case-1", "ASMITA-2026-00001", false);
    expect(draft).toEqual({ error: "no_hashes" });
  });
});
