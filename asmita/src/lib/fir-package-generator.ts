import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { isPdfSafeText } from "@/lib/pdf-text";
import { t, type MessageKey } from "@/lib/i18n";

/*
 * Drawn with pdf-lib's built-in Helvetica, like the notice PDF. The export used
 * to load a Noto Sans Devanagari file from node_modules at request time, which
 * failed on the Worker (its filesystem holds only the bundle), and that file
 * has no Latin glyphs, so English text, digits and reference numbers came out
 * as missing-glyph boxes. pdf-lib also drops the font's mark positioning, which
 * moves vowel signs such as the e-matra. Until Devanagari can be drawn
 * correctly, every package uses English labels; a Hindi package says why.
 */

// A page lists at most 25 links, and fewer if wrapped lines fill it first.
// Whatever is not listed is counted on the page, never dropped silently: a PDF
// that runs off the page loses evidence without saying so.
const MAX_URLS_PER_PAGE = 25;

const LEFT = 56;
const RIGHT_EDGE = 595 - 56;
const LIST_TOP = 666;
const LIST_BOTTOM = 80; // an entry never starts its last line below this, leaving room for the "more links" lines
const LIST_SIZE = 11;
const LINE_HEIGHT = 14;
const ENTRY_GAP = 8;
const CONTINUATION_INDENT = 16;
const MAX_LINES_PER_ENTRY = 3;
const ELLIPSIS = "...";

// Survivors' dates in the app are India Standard Time (see the case page).
const TIME_ZONE = "Asia/Kolkata";

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

// The same plain words the survivor sees on their case page.
const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  PENDING_REVIEW: "case.urlStatus.pendingReview",
  NOTICE_QUEUED: "case.urlStatus.queued",
  NOTICE_SENT: "case.urlStatus.sent",
  REMOVED: "case.urlStatus.resolved",
  UNRESOLVED: "case.urlStatus.unresolved",
  ESCALATED: "case.urlStatus.escalated",
  REJECTED: "case.urlStatus.rejected",
};

function statusLabel(status: string) {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t("en", key) : status.replaceAll("_", " ");
}

/** "12 May 2026, 14:30 IST". Not the locale's own pattern, whose spaces can be characters Helvetica cannot draw. */
export function formatPdfDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("day")} ${parts.get("month")} ${parts.get("year")}, ${parts.get("hour")}:${parts.get("minute")} IST`;
}

/*
 * Breaks text into lines, measured in the font: the first line may be
 * firstWidth wide, later lines restWidth (they are indented). Breaks at
 * spaces, and inside a word that is wider than a line (a long domain has no
 * spaces). Past maxLines the last line ends in "..." so the reader can see
 * that something is cut; the text is never cut without that mark.
 */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  firstWidth: number,
  restWidth: number,
  maxLines: number,
) {
  const width = (value: string) => font.widthOfTextAtSize(value, size);
  const limit = (lineCount: number) => (lineCount === 0 ? firstWidth : restWidth);
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= limit(lines.length)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    let rest = word;
    while (width(rest) > limit(lines.length)) {
      let cut = rest.length - 1;
      while (cut > 1 && width(rest.slice(0, cut)) > limit(lines.length)) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  const lastLimit = limit(maxLines - 1);
  while (last.length > 0 && width(last + ELLIPSIS) > lastLimit) last = last.slice(0, -1);
  kept[maxLines - 1] = last + ELLIPSIS;
  return kept;
}

export async function generateFirPackagePdf(input: {
  referenceNumber: string;
  createdAt?: string;
  language?: "en" | "hi";
  // sentAt: when this link's notice went out, or the survivor filed it on the
  // platform's own form. A link keeps an earlier status in some cases (the
  // survivor page treats a filed link as sent too), so this fact wins over a
  // "prepared, not sent yet" status.
  urls: Array<{ domain: string; platformName?: string; status: string; sentAt?: string | null }>;
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
  // The date is the case's creation time when the caller has it; otherwise the time of this export.
  const dateLabel = input.createdAt ? "Case opened" : "Generated";
  const when = printable(formatPdfDateTime(input.createdAt || new Date().toISOString()));

  page.drawText("Asmita 7-day Legal Support Package", { x: LEFT, y: 780, size: 18, font });
  if (input.language === "hi") {
    page.drawText(HINDI_FALLBACK_NOTE, { x: LEFT, y: 762, size: 10, font });
  }
  page.drawText(`Case: ${printable(input.referenceNumber)}`, { x: LEFT, y: 744, size: 12, font });
  page.drawText(`${dateLabel}: ${when}`, { x: LEFT, y: 724, size: 10, font });
  page.drawText("Submitted links are stored encrypted.", { x: LEFT, y: 698, size: 10, font });

  let y = LIST_TOP;
  let listed = 0;
  for (const [index, url] of input.urls.slice(0, MAX_URLS_PER_PAGE).entries()) {
    const sent = Boolean(url.sentAt) && (url.status === "NOTICE_QUEUED" || url.status === "PENDING_REVIEW" || url.status === "NOTICE_SENT");
    const label = statusLabel(sent ? "NOTICE_SENT" : url.status);
    const sentOn = sent && url.sentAt ? ` (${formatPdfDateTime(url.sentAt)})` : "";
    const text = `${index + 1}. ${printable(url.platformName || url.domain)} - ${printable(`${label}${sentOn}`)}`;
    const wrapped = wrapText(
      text,
      font,
      LIST_SIZE,
      RIGHT_EDGE - LEFT,
      RIGHT_EDGE - LEFT - CONTINUATION_INDENT,
      MAX_LINES_PER_ENTRY,
    );
    if (y - (wrapped.length - 1) * LINE_HEIGHT < LIST_BOTTOM) break;
    wrapped.forEach((line, lineIndex) => {
      page.drawText(line, { x: LEFT + (lineIndex === 0 ? 0 : CONTINUATION_INDENT), y: y - lineIndex * LINE_HEIGHT, size: LIST_SIZE, font });
    });
    y -= wrapped.length * LINE_HEIGHT + ENTRY_GAP;
    listed += 1;
  }

  const remaining = input.urls.length - listed;
  if (remaining > 0) {
    // The export lists what fits; the rest stay in the survivor's own case.
    page.drawText(
      `+ ${remaining} more ${remaining === 1 ? "link" : "links"} not listed here.`,
      { x: LEFT, y, size: 10, font },
    );
    page.drawText(
      "The full list is in the survivor's case on Asmita.",
      { x: LEFT, y: y - 14, size: 10, font },
    );
  }

  return Buffer.from(await pdf.save());
}
