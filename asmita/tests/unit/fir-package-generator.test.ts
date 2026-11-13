import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import {
  HINDI_FALLBACK_NOTE,
  UNPRINTABLE_PLACEHOLDER,
  formatPdfDateTime,
  generateFirPackagePdf,
  wrapText,
} from "@/lib/fir-package-generator";
import { isPdfSafeText } from "@/lib/pdf-text";

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

// The content stream operators of page 1.
async function pageOps(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf);
  const contents = doc.context.lookup(doc.getPage(0).node.get(PDFName.of("Contents")));
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => doc.context.lookup(ref))
    : [contents];
  return streams
    .map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1"))
    .join("\n");
}

// The strings drawn on page 1. Helvetica text is shown as hex WinAnsi bytes.
async function drawnLines(pdf: Buffer) {
  const ops = await pageOps(pdf);
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
      "Case opened: 12 May 2026, 05:30 IST",
      "Submitted links are stored encrypted.",
      "1. Example Platform - Sent, waiting for the platform",
      "2. other.example - Followed up",
    ]);
  });

  it("calls a link sent, with its date, once a notice went out even if its status still says prepared", async () => {
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00004",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls: [
        { domain: "queued.example", status: "NOTICE_QUEUED", sentAt: "2026-05-13T09:00:00.000Z" },
        { domain: "filed.example", status: "NOTICE_QUEUED", sentAt: "2026-05-14T09:00:00.000Z" },
        { domain: "sent.example", status: "NOTICE_SENT", sentAt: "2026-05-13T09:00:00.000Z" },
        { domain: "waiting.example", status: "NOTICE_QUEUED", sentAt: null },
        { domain: "removed.example", status: "REMOVED", sentAt: "2026-05-13T09:00:00.000Z" },
      ],
    });
    const lines = (await drawnLines(pdf)).slice(4);
    expect(lines).toEqual([
      "1. queued.example - Sent, waiting for the platform (13 May 2026, 14:30 IST)",
      "2. filed.example - Sent, waiting for the platform (14 May 2026, 14:30 IST)",
      "3. sent.example - Sent, waiting for the platform (13 May 2026, 14:30 IST)",
      "4. waiting.example - Prepared, not sent yet",
      "5. removed.example - Removed",
    ]);
    for (const line of lines) expect(isPdfSafeText(line)).toBe(true);
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
      "Case opened: 12 May 2026, 05:30 IST",
      "Submitted links are stored encrypted.",
      "1. Example Platform - Sent, waiting for the platform",
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
    expect(lines).toContain(`1. ${UNPRINTABLE_PLACEHOLDER} - Sent, waiting for the platform`);
    expect(lines).toContain(`2. ${UNPRINTABLE_PLACEHOLDER} - Followed up`);
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

  it("says how many links it leaves out, and where the full list is, without claiming an attachment", async () => {
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
    const lines = await drawnLines(pdf);
    expect(lines).toContain("+ 15 more links not listed here.");
    expect(lines).toContain("The full list is in the survivor's case on Asmita.");
    expect(lines.join(" ")).not.toMatch(/attach/i);
  });

  it("wraps a long platform name or domain inside the page instead of running off it", async () => {
    const longDomain = `${"a".repeat(60)}.${"b".repeat(60)}.example`;
    const longName = "Example Platform Name That Keeps Going ".repeat(4).trim();
    const pdf = await generateFirPackagePdf({
      referenceNumber: "ASMITA-2026-00005",
      createdAt: "2026-05-12T00:00:00.000Z",
      urls: [
        { domain: longDomain, status: "NOTICE_SENT" },
        { domain: "example.test", platformName: longName, status: "REMOVED" },
      ],
    });
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = await drawnLines(pdf);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 11)).toBeLessThanOrEqual(595 - 56 - 56 + 0.01);
      expect(isPdfSafeText(line)).toBe(true);
    }
    // Nothing is lost: the whole domain is still drawn, across lines.
    const joined = lines.join("");
    expect(joined).toContain(longDomain);
    expect(joined).toContain("Sent, waiting for the platform");
  });

  it("keeps every listed entry on the page when wrapped lines fill it", async () => {
    const wide = Array.from({ length: 25 }, (_, i) => ({
      domain: `${"x".repeat(200)}${i}.example`,
      status: "NOTICE_SENT",
    }));
    const pdf = await generateFirPackagePdf({ referenceNumber: "ASMITA-2026-00006", createdAt: "2026-05-12T00:00:00.000Z", urls: wide });
    const ops = await pageOps(pdf);
    const ys = [...ops.matchAll(/1 0 0 1 [\d.]+ ([\d.-]+) Tm/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(5);
    expect(Math.min(...ys)).toBeGreaterThan(30);
    const lines = await drawnLines(pdf);
    expect(lines.some((line) => /^\+ \d+ more links? not listed here\.$/.test(line))).toBe(true);
  });
});

describe("wrapText", () => {
  it("marks text it must cut with a visible ellipsis", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrapText("word ".repeat(200).trim(), font, 11, 200, 180, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("...")).toBe(true);
    expect(font.widthOfTextAtSize(lines[2], 11)).toBeLessThanOrEqual(180);
  });

  it("does not add an ellipsis when everything fits", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(wrapText("short text", font, 11, 400, 380, 3)).toEqual(["short text"]);
  });
});

describe("formatPdfDateTime", () => {
  it("prints India Standard Time with the zone named, in characters Helvetica can draw", () => {
    expect(formatPdfDateTime("2026-05-12T00:00:00.000Z")).toBe("12 May 2026, 05:30 IST");
    expect(formatPdfDateTime("2026-11-09T20:45:00.000Z")).toBe("10 November 2026, 02:15 IST");
    expect(isPdfSafeText(formatPdfDateTime("2026-11-09T20:45:00.000Z"))).toBe(true);
  });

  it("falls back to the original text for a value that is not a date", () => {
    expect(formatPdfDateTime("not a date")).toBe("not a date");
  });
});

describe("generator source", () => {
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
