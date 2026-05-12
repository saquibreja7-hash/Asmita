import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = resolve(__dirname, 'TRD_Asmita.md');
const outputPath = resolve(__dirname, 'TRD_Asmita.pdf');

const markdown = readFileSync(inputPath, 'utf-8');

// Configure marked for GitHub-flavoured markdown
marked.setOptions({ gfm: true, breaks: false });

const bodyHtml = marked.parse(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TRD — Asmita</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    /* ── Page setup ── */
    @page {
      size: A4;
      margin: 22mm 20mm 22mm 22mm;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Sans', 'Noto Sans Devanagari', sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1a1a1a;
      background: #fff;
    }

    /* ── Cover block ── */
    .cover {
      border-bottom: 3px solid #7c1f3e;
      padding-bottom: 14px;
      margin-bottom: 28px;
    }
    .cover h1 {
      font-size: 22pt;
      font-weight: 700;
      color: #7c1f3e;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }
    .cover .subtitle {
      font-size: 10.5pt;
      color: #555;
      font-weight: 300;
      margin-bottom: 10px;
    }
    .cover .meta {
      font-size: 8.5pt;
      color: #777;
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .cover .meta span strong { color: #333; }

    /* ── Headings ── */
    h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #7c1f3e;
      margin: 32px 0 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e8c5cf;
      page-break-after: avoid;
    }
    h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #5a1530;
      margin: 24px 0 6px;
      padding-left: 0;
      page-break-after: avoid;
    }
    h3 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #3d0f22;
      margin: 18px 0 5px;
      page-break-after: avoid;
    }
    h4 {
      font-size: 9.5pt;
      font-weight: 600;
      color: #222;
      margin: 14px 0 4px;
      page-break-after: avoid;
    }

    /* ── Paragraphs ── */
    p {
      margin: 0 0 8px;
      orphans: 3;
      widows: 3;
    }

    /* ── Lists ── */
    ul, ol {
      margin: 4px 0 10px 20px;
    }
    li {
      margin-bottom: 3px;
    }
    li > ul, li > ol {
      margin-top: 2px;
      margin-bottom: 2px;
    }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 10px 0 14px;
      page-break-inside: auto;
    }
    thead tr {
      background: #7c1f3e;
      color: #fff;
    }
    thead th {
      padding: 5px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 8pt;
      letter-spacing: 0.2px;
    }
    tbody tr:nth-child(even) {
      background: #fdf5f7;
    }
    tbody td {
      padding: 5px 8px;
      border-bottom: 1px solid #e9d0d6;
      vertical-align: top;
    }

    /* ── Code ── */
    code {
      font-family: 'Noto Mono', 'Courier New', monospace;
      font-size: 8pt;
      background: #f5f0f2;
      color: #7c1f3e;
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: 'Noto Mono', 'Courier New', monospace;
      font-size: 7.8pt;
      line-height: 1.5;
      padding: 12px 14px;
      border-radius: 5px;
      margin: 10px 0 14px;
      overflow-x: auto;
      page-break-inside: avoid;
      white-space: pre-wrap;
      word-break: break-all;
    }
    pre code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }

    /* ── Blockquotes ── */
    blockquote {
      border-left: 4px solid #7c1f3e;
      background: #fdf5f7;
      margin: 10px 0 14px;
      padding: 8px 12px;
      font-style: italic;
      color: #444;
      page-break-inside: avoid;
    }
    blockquote p { margin-bottom: 4px; }
    blockquote p:last-child { margin-bottom: 0; }

    /* ── Horizontal rules ── */
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }

    /* ── Requirement IDs (bold terms at start of paragraph) ── */
    strong {
      font-weight: 600;
      color: #2c0d18;
    }

    /* ── TOC entries ── */
    a { color: #7c1f3e; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Page break helpers ── */
    h1 { page-break-before: always; }
    h1:first-of-type { page-break-before: avoid; }
    .cover + * h1 { page-break-before: avoid; }

    /* ── Footer via Puppeteer header/footer template — handled in JS ── */
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

// Fix: first H1 inside body should not force a page break
// (Puppeteer will handle the rest via PDF options)

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

// Load HTML with fonts from Google Fonts (requires network)
await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

// Wait for fonts to be fully loaded
await page.evaluateHandle('document.fonts.ready');

const pdf = await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '22mm', right: '20mm', bottom: '26mm', left: '22mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:7pt;color:#999;width:100%;text-align:center;font-family:sans-serif;">
    Asmita — Technical Requirements Document v0.1 (Confidential Draft)
  </div>`,
  footerTemplate: `<div style="font-size:7pt;color:#999;width:100%;display:flex;justify-content:space-between;padding:0 22mm;font-family:sans-serif;">
    <span>2026-05-12 | Pre-development</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`,
});

await browser.close();

console.log(`PDF written to: ${outputPath}`);
