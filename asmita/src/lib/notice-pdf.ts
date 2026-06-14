import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 64;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BODY_SIZE = 10;
const LINE_HEIGHT = 16;
const GREY = rgb(0.35, 0.35, 0.35);
const BLACK = rgb(0, 0, 0);
const DIVIDER = rgb(0.78, 0.78, 0.78);
const TEAL = rgb(0, 0.53, 0.5);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  startY: number,
  color = BLACK,
): number {
  const lines = wrapText(text, font, size, CONTENT_WIDTH);
  let y = startY;
  for (const line of lines) {
    if (line) page.drawText(line, { x: MARGIN, y, size, font, color });
    y -= LINE_HEIGHT;
  }
  return y;
}

export interface NoticePdfInput {
  platformName: string;
  caseReference: string;
  noticeSubject: string;
  noticeBody: string;
  date: string;
  survivorName?: string;
  survivorContact?: string;
  signature?: string;
}

export async function generateNoticePdf(input: NoticePdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ── Page 1: Notice ─────────────────────────────────────────────────────
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Title
  page.drawText("NCII TAKEDOWN NOTICE", { x: MARGIN, y, size: 15, font: bold, color: TEAL });
  y -= 26;

  // Metadata block
  for (const [label, value] of [
    ["To", input.platformName],
    ["Date", input.date],
    ["Reference", input.caseReference],
    ["Subject", input.noticeSubject],
  ]) {
    page.drawText(`${label}:`, { x: MARGIN, y, size: 9, font: bold, color: GREY });
    page.drawText(value, { x: MARGIN + 70, y, size: 9, font, color: GREY });
    y -= 15;
  }
  y -= 8;

  // Divider
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: DIVIDER,
  });
  y -= 18;

  // Body — paginate if content overflows
  const bodyLines = wrapText(input.noticeBody, font, BODY_SIZE, CONTENT_WIDTH);
  for (const line of bodyLines) {
    if (y < MARGIN + 40) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    if (line) page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: BLACK });
    y -= LINE_HEIGHT;
  }

  // ── Page 2: Survivor Declaration (only when signing) ──────────────────
  if (input.survivorName || input.survivorContact || input.signature) {
    const declPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let dy = PAGE_HEIGHT - MARGIN;

    declPage.drawText("SURVIVOR DECLARATION", { x: MARGIN, y: dy, size: 13, font: bold, color: TEAL });
    dy -= 10;
    declPage.drawLine({
      start: { x: MARGIN, y: dy },
      end: { x: PAGE_WIDTH - MARGIN, y: dy },
      thickness: 0.5,
      color: DIVIDER,
    });
    dy -= 24;

    const declarationText =
      `I, ${input.survivorName ?? "—"}, declare that I am the person depicted in the ` +
      `non-consensual intimate content referenced in this notice (case ${input.caseReference}). ` +
      `I have not consented to the creation, possession, or distribution of this content. ` +
      `I authorise Asmita / CSR India to transmit this takedown notice to ${input.platformName} ` +
      `on my behalf.`;

    dy = drawWrappedText(declPage, declarationText, font, BODY_SIZE, dy, BLACK);
    dy -= 20;

    for (const [label, value] of [
      ["Contact", input.survivorContact ?? "—"],
      ["Platform", input.platformName],
      ["Date", input.date],
    ]) {
      declPage.drawText(`${label}:`, { x: MARGIN, y: dy, size: 9, font: bold, color: GREY });
      declPage.drawText(value, { x: MARGIN + 70, y: dy, size: 9, font, color: GREY });
      dy -= 15;
    }
    dy -= 24;

    // Signature line
    declPage.drawText("Signature:", { x: MARGIN, y: dy, size: 9, font: bold, color: GREY });
    dy -= 18;
    declPage.drawText(input.signature ?? "—", {
      x: MARGIN,
      y: dy,
      size: 13,
      font: bold,
      color: BLACK,
    });
    dy -= 6;
    declPage.drawLine({
      start: { x: MARGIN, y: dy },
      end: { x: MARGIN + 200, y: dy },
      thickness: 0.5,
      color: DIVIDER,
    });
    dy -= 24;

    // Footer note
    declPage.drawText(
      "This declaration was submitted electronically via Asmita (meriasmita.org).",
      { x: MARGIN, y: dy, size: 8, font, color: GREY },
    );
  }

  return Buffer.from(await pdfDoc.save());
}
