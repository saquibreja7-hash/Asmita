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
      urls: [{ domain: "instagram.com", platformName: "Instagram / Meta", status: "NOTICE_SENT" }],
    });
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
