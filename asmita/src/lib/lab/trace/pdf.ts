/*
 * The E3 evidence PDF (docs/lab/charter.md, experiment E3): a standalone
 * document for survivors, NGOs and police — the two images side by side with
 * the highlighted regions, the scores, the date and time, a plain method
 * statement and the tool version. It can be attached to a complaint later,
 * but it is not part of filing and nothing here touches the complaint
 * workflow (the charter's import boundary).
 *
 * Built with pdf-lib — the library the site already uses for notices
 * (src/lib/notice-pdf.ts); pdf-lib is isomorphic (its own README: runs in
 * Node and in the browser), so the same builder runs client-side where the
 * images already are, and in vitest. Its StandardFonts draw WinAnsi only, so
 * every string is checked with the shared isPdfSafeText and the PDF is
 * English-only (like the site's other consequential documents); the page
 * says so in the visitor's language.
 *
 * buildEvidenceContent() is pure layout data (title, lines, image boxes) and
 * carries the whole text; buildEvidencePdf() only draws it. The content
 * builder is what the tests pin.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { isPdfSafeText } from "../../pdf-text";
import type { Box } from "./geometry";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const GAP = 14;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14.5;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.38, 0.38, 0.38);
const TEAL = rgb(0, 0.53, 0.5);
const DIVIDER = rgb(0.78, 0.78, 0.78);
const HIGHLIGHT = rgb(0.85, 0.33, 0.1);

export type EvidenceScoreRow = { label: string; value: string };

export type EvidenceImageBlock = {
  /** Caption under the image, e.g. "Suspect image - name.png". */
  caption: string;
  png: Uint8Array;
  /** Pixel size of the source image the PNG shows. */
  size: { width: number; height: number };
  /** Highlighted region in the source image's pixels, drawn on the PDF image. */
  highlight: Box | null;
};

export type EvidencePdfInput = {
  generatedAt: string;
  toolVersion: string;
  verdictLine: string;
  explanationLines: string[];
  scores: EvidenceScoreRow[];
  methodLines: string[];
  suspect: EvidenceImageBlock;
  original: EvidenceImageBlock;
};

export class EvidencePdfTextError extends Error {
  constructor(readonly field: string) {
    super(`evidence_pdf_unsupported_text:${field}`);
    this.name = "EvidencePdfTextError";
  }
}

function assertDrawable(value: string, field: string): void {
  if (!isPdfSafeText(value)) throw new EvidencePdfTextError(field);
}

/**
 * The whole document as layout data: every line the PDF will carry, in
 * order. Pure; the tests pin the structure and the honesty of the wording.
 */
export function buildEvidenceContent(input: EvidencePdfInput): {
  title: string;
  meta: string[];
  verdictLine: string;
  explanationLines: string[];
  scores: EvidenceScoreRow[];
  methodLines: string[];
  images: EvidenceImageBlock[];
  disclaimer: string;
} {
  const meta = [
    `Generated: ${input.generatedAt}`,
    `Tool: Asmita AI Lab trace ${input.toolVersion} (browser-only, images never uploaded)`,
  ];
  const disclaimer =
    "This report was generated in a web browser by a research tool of the Asmita AI Lab. " +
    "It shows image similarities as measured by the tool; it is not a forensic certificate, " +
    "and it is not part of any complaint filing.";
  const texts: Array<[string, string]> = [
    ["title", "Morph-to-source trace - evidence report"],
    ["verdictLine", input.verdictLine],
    ["suspectCaption", input.suspect.caption],
    ["originalCaption", input.original.caption],
    ["disclaimer", disclaimer],
    ...input.explanationLines.map((line, i): [string, string] => [`explanation.${i}`, line]),
    ...input.methodLines.map((line, i): [string, string] => [`method.${i}`, line]),
    ...input.scores.map((row, i): [string, string] => [`score.${i}`, `${row.label}: ${row.value}`]),
    ...meta.map((line, i): [string, string] => [`meta.${i}`, line]),
  ];
  for (const [field, line] of texts) assertDrawable(line, field);
  return {
    title: "Morph-to-source trace - evidence report",
    meta,
    verdictLine: input.verdictLine,
    explanationLines: input.explanationLines,
    scores: input.scores,
    methodLines: input.methodLines,
    images: [input.suspect, input.original],
    disclaimer,
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
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

/**
 * Assemble the evidence PDF. Runs in the browser (pdf-lib is isomorphic) and
 * in vitest; the images are embedded as PNGs and the highlighted regions
 * drawn as frames over them.
 */
export async function buildEvidencePdf(input: EvidencePdfInput): Promise<Uint8Array> {
  const content = buildEvidenceContent(input);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawText = (text: string, opts: { size?: number; bold?: boolean; color?: typeof BLACK; x?: number }) => {
    page.drawText(text, { x: opts.x ?? MARGIN, y, size: opts.size ?? BODY_SIZE, font: opts.bold ? bold : font, color: opts.color ?? BLACK });
  };

  // Title and meta.
  drawText(content.title, { size: 15, bold: true, color: TEAL });
  y -= 18;
  for (const line of content.meta) {
    drawText(line, { size: 8.5, color: GREY });
    y -= 12;
  }
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: DIVIDER });
  y -= 20;

  // Verdict band.
  drawText(content.verdictLine, { size: 12, bold: true });
  y -= 18;

  // The two images, side by side, each fitted into half the content width.
  const imageWidth = (CONTENT_WIDTH - GAP) / 2;
  const maxImageHeight = 250;
  const blocks = content.images;
  const fits = blocks.map((block) => {
    const scale = Math.min(imageWidth / block.size.width, maxImageHeight / block.size.height, 1);
    return { block, scale, w: block.size.width * scale, h: block.size.height * scale };
  });
  const top = y;
  const tallest = Math.max(...fits.map((f) => f.h));
  for (let i = 0; i < fits.length; i++) {
    const { block, scale, w, h } = fits[i]!;
    const png = await pdfDoc.embedPng(block.png);
    const x = i === 0 ? MARGIN : MARGIN + imageWidth + GAP;
    page.drawImage(png, { x, y: top - h, width: w, height: h });
    if (block.highlight) {
      const hl = block.highlight;
      page.drawRectangle({
        x: x + hl.x * scale,
        y: top - h + hl.y * scale,
        width: Math.max(1, hl.w * scale),
        height: Math.max(1, hl.h * scale),
        borderColor: HIGHLIGHT,
        borderWidth: 1.2,
      });
    }
  }
  y = top - tallest;
  y -= 14;
  page.drawText(blocks[0]!.caption, { x: MARGIN, y, size: 8.5, font: bold, color: GREY });
  page.drawText(blocks[1]!.caption, { x: MARGIN + imageWidth + GAP, y, size: 8.5, font: bold, color: GREY });
  y -= 22;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: DIVIDER });
  y -= 20;

  // Scores.
  drawText("Measured similarity", { size: 11, bold: true, color: TEAL });
  y -= 16;
  for (const row of content.scores) {
    drawText(`${row.label}: ${row.value}`, {});
    y -= LINE_HEIGHT;
  }
  y -= 8;

  // Explanation + method, flowing onto a second page when needed.
  const drawParagraphs = (title: string, lines: string[], size = BODY_SIZE): void => {
    if (y < MARGIN + 60) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    drawText(title, { size: 11, bold: true, color: TEAL });
    y -= 16;
    for (const para of lines) {
      for (const line of wrapText(para, font, size, CONTENT_WIDTH)) {
        if (y < MARGIN + 24) {
          page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
        }
        if (line) drawText(line, { size });
        y -= LINE_HEIGHT;
      }
    }
    y -= 8;
  };

  drawParagraphs("What this means", content.explanationLines);
  drawParagraphs("Method", content.methodLines);
  drawParagraphs("Note", [content.disclaimer], 8.5);

  return pdfDoc.save();
}
