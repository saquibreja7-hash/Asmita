import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { isPdfSafeText } from "@/lib/pdf-text";
import { NoticePdfTextError, generateNoticePdf } from "@/lib/notice-pdf";

const base = {
  platformName: "Example Platform",
  caseReference: "ASMITA-2026-00001",
  noticeSubject: "Notice ASMITA-2026-00001",
  noticeBody: "Body line one.\nBody line two.",
  date: "10 November 2026",
  survivorContact: "person@example.invalid",
};

describe("isPdfSafeText", () => {
  it("agrees with pdf-lib's Helvetica encoder for every BMP character", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const mismatches: string[] = [];
    for (let code = 0x20; code <= 0xffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCharCode(code);
      let encodable = true;
      try {
        font.encodeText(char);
      } catch {
        encodable = false;
      }
      if (encodable !== isPdfSafeText(char)) mismatches.push(code.toString(16));
    }
    expect(mismatches).toEqual([]);
  });

  it("rejects Indian scripts, the rupee sign and control characters", () => {
    expect(isPdfSafeText("सुनीता")).toBe(false); // Devanagari
    expect(isPdfSafeText("தமிழ்")).toBe(false); // Tamil
    expect(isPdfSafeText("Rs ₹500")).toBe(false);
    expect(isPdfSafeText("a\tb")).toBe(false);
    expect(isPdfSafeText("a\nb")).toBe(false);
    expect(isPdfSafeText("a‑b")).toBe(false); // non-breaking hyphen
  });

  it("accepts Latin names, including accented letters and typographic quotes", () => {
    expect(isPdfSafeText("Example Person")).toBe(true);
    expect(isPdfSafeText("José Müller-Élise O’Brien")).toBe(true);
    expect(isPdfSafeText("“quoted” – …")).toBe(true);
  });
});

describe("generateNoticePdf", () => {
  it("refuses a Devanagari name with a field-only error, never drawing a wrong name", async () => {
    const name = "सुनीता";
    const error = await generateNoticePdf({ ...base, survivorName: name, signature: "Example" }).catch((err) => err);
    expect(error).toBeInstanceOf(NoticePdfTextError);
    expect(error.field).toBe("survivorName");
    expect(error.message).not.toContain(name);
    expect(error.message).not.toContain("स");
  });

  it("builds a PDF for an accented Latin name", async () => {
    const pdf = await generateNoticePdf({ ...base, survivorName: "José Müller", signature: "José Müller" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("names the body when template text cannot be drawn", async () => {
    const error = await generateNoticePdf({ ...base, noticeBody: "Fee of ₹500" }).catch((err) => err);
    expect(error).toBeInstanceOf(NoticePdfTextError);
    expect(error.field).toBe("noticeBody");
  });

  it("draws a body saved with CRLF line endings", async () => {
    const pdf = await generateNoticePdf({ ...base, noticeBody: "Line one.\r\nLine two." });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
