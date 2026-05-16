import { describe, expect, it } from "vitest";
import { generateFirPackagePdf } from "@/lib/fir-package-generator";

describe("generateFirPackagePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00001",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls: [
        { domain: "instagram.com", status: "NOTICE_SENT" },
        { domain: "pornhub.com", status: "ESCALATED" },
      ],
    });
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("embeds a Devanagari-capable font for Hindi packages", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00002",
      createdAt: "2026-05-12T00:00:00.000Z",
      language: "hi",
      urls: [
        {
          domain: "instagram.com",
          platformName: "Instagram / Meta",
          status: "NOTICE_SENT",
        },
      ],
    });
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // A subsetted custom font ships ~10–30KB of embedded glyph data, much
    // larger than a Helvetica-only PDF (~1–3KB). Size is a coarse-but-stable
    // signal that the custom font was actually embedded.
    expect(pdf.length).toBeGreaterThan(10_000);
  });

  it("rejects control characters in inputs (defensive)", async () => {
    await expect(
      generateFirPackagePdf({
        referenceNumber: "ASMITA\x002026",
        createdAt: "2026-05-12T00:00:00.000Z",
        urls: [{ domain: "instagram.com", status: "NOTICE_SENT" }],
      })
    ).rejects.toThrow("fir_field_control_chars:referenceNumber");

    await expect(
      generateFirPackagePdf({
        referenceNumber: "ASMITA-2026-00003",
        createdAt: "2026-05-12T00:00:00.000Z",
        urls: [
          { domain: "instagram.com", status: "NOTICE_SENT\x07evil" },
        ],
      })
    ).rejects.toThrow("fir_field_control_chars:status");
  });

  it("does not crash when given more URLs than fit on a single page", async () => {
    const urls = Array.from({ length: 40 }, (_, i) => ({
      domain: `platform${i}.example`,
      status: "NOTICE_SENT",
    }));
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00099",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
