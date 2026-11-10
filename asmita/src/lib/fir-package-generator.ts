import { PDFDocument, StandardFonts } from "pdf-lib";
import { isPdfSafeText } from "@/lib/pdf-text";

/*
 * Drawn with pdf-lib's built-in Helvetica, like the notice PDF. The export used
 * to load a Noto Sans Devanagari file from node_modules at request time, which
 * failed on the Worker (its filesystem holds only the bundle), and that file
 * has no Latin glyphs, so English text, digits and reference numbers came out
 * as missing-glyph boxes. pdf-lib also drops the font's mark positioning, which
 * moves vowel signs such as the e-matra. Until Devanagari can be drawn
 * correctly, every package uses English labels; a Hindi package says why.
 */

// One physical page can show ~25 URLs at 22px line height starting from y=666.
// If we ever pass more, truncate and note the count - PDFs that overflow off
// the page silently lose evidence, which is worse than truncating loudly.
const MAX_URLS_PER_PAGE = 25;

const FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// Shown in place of a value Helvetica cannot draw, so nothing is dropped,
// replaced or transliterated without the reader being told.
export const UNPRINTABLE_PLACEHOLDER = "(not shown: uses characters this PDF cannot print)";

export const HINDI_FALLBACK_NOTE =
  "This package is in English so that every character prints correctly.";

function assertCleanField(label: string, value: string) {
  if (FORBIDDEN_CONTROL_CHARS.test(value)) {
    throw new Error(`fir_field_control_chars:${label}`);
  }
}

function printable(value: string) {
  return isPdfSafeText(value) ? value : UNPRINTABLE_PLACEHOLDER;
}

export async function generateFirPackagePdf(input: {
  referenceNumber: string;
  createdAt?: string;
  language?: "en" | "hi";
  urls: Array<{ domain: string; platformName?: string; status: string }>;
}) {
  assertCleanField("referenceNumber", input.referenceNumber);
  for (const url of input.urls) {
    assertCleanField("domain", url.domain);
    if (url.platformName) assertCleanField("platformName", url.platformName);
    assertCleanField("status", url.status);
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const createdAt = input.createdAt || new Date().toISOString();

  page.drawText("Asmita 7-day Legal Support Package", { x: 56, y: 780, size: 18, font });
  if (input.language === "hi") {
    page.drawText(HINDI_FALLBACK_NOTE, { x: 56, y: 762, size: 10, font });
  }
  page.drawText(`Case: ${printable(input.referenceNumber)}`, { x: 56, y: 744, size: 12, font });
  page.drawText(`Generated: ${printable(createdAt)}`, { x: 56, y: 724, size: 10, font });
  page.drawText("Submitted URLs are stored only as hashes.", { x: 56, y: 698, size: 10, font });

  const visibleUrls = input.urls.slice(0, MAX_URLS_PER_PAGE);
  visibleUrls.forEach((url, index) => {
    page.drawText(
      `${index + 1}. ${printable(url.platformName || url.domain)} - ${printable(url.status)}`,
      { x: 56, y: 666 - index * 22, size: 11, font }
    );
  });

  const remaining = input.urls.length - visibleUrls.length;
  if (remaining > 0) {
    page.drawText(
      `+ ${remaining} more URLs - see attached audit trail.`,
      { x: 56, y: 666 - visibleUrls.length * 22, size: 10, font }
    );
  }

  return Buffer.from(await pdf.save());
}
