import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  HINDI_FALLBACK_NOTE,
  UNPRINTABLE_PLACEHOLDER,
  generateFirPackagePdf,
} from "@/lib/fir-package-generator";

// Every font the PDF embeds, by BaseFont name.
async function embeddedFonts(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf);
  const fonts: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && String(object.get(PDFName.of("Type"))) === "/Font") {
      fonts.push(String(object.get(PDFName.of("BaseFont"))));
    }
  }
  return fonts;
}

// The strings drawn on page 1. Helvetica text is shown as hex WinAnsi bytes.
async function drawnLines(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf);
  const contents = doc.context.lookup(doc.getPage(0).node.get(PDFName.of("Contents")));
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => doc.context.lookup(ref))
    : [contents];
  const ops = streams
    .map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1"))
    .join("\n");
  return [...ops.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
}

const urls = [
  { domain: "example.test", platformName: "Example Platform", status: "NOTICE_SENT" },
  { domain: "other.example", status: "ESCALATED" },
];

describe("generateFirPackagePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00001",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls,
    });
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("draws an English package in Helvetica, every character intact", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00001",
      createdAt: "2026-05-12T00:00:00.000Z",
      language: "en",
      urls,
    });
    expect(await embeddedFonts(pdf)).toEqual(["/Helvetica"]);
    expect(await drawnLines(pdf)).toEqual([
      "Asmita 7-day Legal Support Package",
      "Case: ASMITA-2026-00001",
      "Generated: 2026-05-12T00:00:00.000Z",
      "Submitted URLs are stored only as hashes.",
      "1. Example Platform - NOTICE_SENT",
      "2. other.example - ESCALATED",
    ]);
  });

  it("draws a Hindi package with English labels and says why, rather than misdrawn Devanagari", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00002",
      createdAt: "2026-05-12T00:00:00.000Z",
      language: "hi",
      urls: urls.slice(0, 1),
    });
    expect(await embeddedFonts(pdf)).toEqual(["/Helvetica"]);
    expect(await drawnLines(pdf)).toEqual([
      "Asmita 7-day Legal Support Package",
      HINDI_FALLBACK_NOTE,
      "Case: ASMITA-2026-00002",
      "Generated: 2026-05-12T00:00:00.000Z",
      "Submitted URLs are stored only as hashes.",
      "1. Example Platform - NOTICE_SENT",
    ]);
  });

  it("marks a value it cannot print instead of dropping or transliterating it", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00003",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls: [
        { domain: "example.test", platformName: "उदाहरण", status: "NOTICE_SENT" },
        { domain: "other.example", platformName: "Plain ₹ Name", status: "ESCALATED" },
      ],
    });
    const lines = await drawnLines(pdf);
    expect(lines).toContain(`1. ${UNPRINTABLE_PLACEHOLDER} - NOTICE_SENT`);
    expect(lines).toContain(`2. ${UNPRINTABLE_PLACEHOLDER} - ESCALATED`);
  });

  it("rejects control characters in inputs (defensive)", async () => {
    await expect(
      generateFirPackagePdf({
        referenceNumber: "ASMITA\x002026",
        createdAt: "2026-05-12T00:00:00.000Z",
        urls: [{ domain: "example.test", status: "NOTICE_SENT" }],
      })
    ).rejects.toThrow("fir_field_control_chars:referenceNumber");

    await expect(
      generateFirPackagePdf({
        referenceNumber: "ASMITA-2026-00003",
        createdAt: "2026-05-12T00:00:00.000Z",
        urls: [{ domain: "example.test", status: "NOTICE_SENT\x07evil" }],
      })
    ).rejects.toThrow("fir_field_control_chars:status");
  });

  it("does not crash when given more URLs than fit on a single page", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      domain: `platform${i}.example`,
      status: "NOTICE_SENT",
    }));
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00099",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls: many,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(await drawnLines(pdf)).toContain("+ 15 more URLs - see attached audit trail.");
  });

  // The Worker has no host filesystem: process.cwd() is /bundle and holds only
  // the bundled modules, so a request-time file read throws ENOENT there while
  // passing here. This guards the generator; the Worker path itself is not run.
  it("does not read files at request time (the Worker has no host filesystem)", () => {
    const source = readFileSync(path.join(__dirname, "../../src/lib/fir-package-generator.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
    expect(source).not.toMatch(/process\.cwd\(/);
    expect(source).not.toMatch(/readFile/);
  });
});
