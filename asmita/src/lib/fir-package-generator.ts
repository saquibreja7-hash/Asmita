import { readFile } from "node:fs/promises";
import path from "node:path";
import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

const DEVANAGARI_FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-devanagari",
  "files",
  "noto-sans-devanagari-devanagari-400-normal.woff",
);

export async function generateFirPackagePdf(input: {
  referenceNumber: string;
  createdAt?: string;
  language?: "en" | "hi";
  urls: Array<{ domain: string; platformName?: string; status: string }>;
}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([595, 842]);
  const fontBytes = await readFile(DEVANAGARI_FONT_PATH);
  const font = await pdf.embedFont(fontBytes);
  const isHindi = input.language === "hi";
  const title = isHindi ? "अस्मिता 7-दिन कानूनी सहायता पैकेज" : "Asmita 7-day Legal Support Package";
  const createdAt = input.createdAt || new Date().toISOString();

  page.drawText(title, { x: 56, y: 780, size: 18, font });
  page.drawText(`${isHindi ? "केस" : "Case"}: ${input.referenceNumber}`, { x: 56, y: 744, size: 12, font });
  page.drawText(`${isHindi ? "बनाया गया" : "Generated"}: ${createdAt}`, { x: 56, y: 724, size: 10, font });
  page.drawText(isHindi ? "प्रस्तुत URL केवल हैश के रूप में संग्रहीत हैं।" : "Submitted URLs are stored only as hashes.", {
    x: 56,
    y: 698,
    size: 10,
    font,
  });

  input.urls.forEach((url, index) => {
    page.drawText(`${index + 1}. ${url.platformName || url.domain} - ${url.status}`, {
      x: 56,
      y: 666 - index * 22,
      size: 11,
      font,
    });
  });
  return Buffer.from(await pdf.save());
}
