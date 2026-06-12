import { describe, expect, it } from "vitest";
import { validateHashItem, LOW_QUALITY_THRESHOLD } from "@/lib/hash-submission";
import { buildHashAnnex } from "@/lib/notice-generator";

const VALID_HASH = "a".repeat(64);

describe("validateHashItem", () => {
  it("accepts a well-formed PDQ hash", () => {
    const result = validateHashItem({ hash: VALID_HASH, quality: 80, clientVersion: "pdq-ts-0.1.0" });
    expect(result).toMatchObject({ ok: true, hash: VALID_HASH, quality: 80, lowQuality: false });
  });

  it("lowercases hashes", () => {
    const result = validateHashItem({ hash: "A".repeat(64), quality: 80 });
    expect(result).toMatchObject({ ok: true, hash: VALID_HASH });
  });

  it("flags low-quality hashes", () => {
    const result = validateHashItem({ hash: VALID_HASH, quality: LOW_QUALITY_THRESHOLD - 1 });
    expect(result).toMatchObject({ ok: true, lowQuality: true });
  });

  it("rejects data URLs and base64-looking payloads as media smuggling", () => {
    expect(validateHashItem({ hash: "data:image/png;base64,iVBOR", quality: 50 })).toMatchObject({
      ok: false,
      error: "media_payload_rejected",
    });
    expect(validateHashItem({ hash: "iVBORw0KGgoAAAANSUhEUg+/Zg==", quality: 50 })).toMatchObject({
      ok: false,
      error: "media_payload_rejected",
    });
  });

  it("rejects wrong-length or non-hex hashes", () => {
    expect(validateHashItem({ hash: "abc123", quality: 50 })).toMatchObject({
      ok: false,
      error: "invalid_hash_format",
    });
    expect(validateHashItem({ hash: "g".repeat(64), quality: 50 })).toMatchObject({
      ok: false,
      error: "invalid_hash_format",
    });
  });

  it("rejects out-of-range quality", () => {
    expect(validateHashItem({ hash: VALID_HASH, quality: 101 })).toMatchObject({
      ok: false,
      error: "invalid_quality",
    });
    expect(validateHashItem({ hash: VALID_HASH, quality: -1 })).toMatchObject({
      ok: false,
      error: "invalid_quality",
    });
  });
});

describe("buildHashAnnex", () => {
  it("renders hashes with matching guidance and passes PII guards", () => {
    const annex = buildHashAnnex({
      algorithm: "PDQ",
      hashes: [
        { value: VALID_HASH, quality: 92 },
        { value: "b".repeat(64), quality: 64 },
      ],
      clientVersion: "pdq-ts-0.1.0",
    });
    expect(annex).toContain("PERCEPTUAL HASH ANNEX");
    expect(annex).toContain(VALID_HASH);
    expect(annex).toContain("Hamming distance threshold of 31");
    expect(annex).toContain("pdq-ts-0.1.0");
  });

  it("rejects empty hash lists and malformed hashes", () => {
    expect(() => buildHashAnnex({ algorithm: "PDQ", hashes: [] })).toThrow("hash_annex_empty");
    expect(() =>
      buildHashAnnex({ algorithm: "PDQ", hashes: [{ value: "nope", quality: 50 }] }),
    ).toThrow("hash_annex_invalid_hash");
  });
});
