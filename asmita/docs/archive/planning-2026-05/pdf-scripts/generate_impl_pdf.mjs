import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath  = resolve(__dirname, 'IMPLEMENTATION_PLAN_Asmita.md');
const outputPath = resolve(__dirname, 'IMPLEMENTATION_PLAN_Asmita.pdf');

const markdown = readFileSync(inputPath, 'utf-8');
marked.setOptions({ gfm: true, breaks: false });
const bodyHtml = marked.parse(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Asmita — Implementation Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 22mm 20mm 22mm 22mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Sans', 'Noto Sans Devanagari', sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1a1a1a;
      background: #fff;
    }

    /* ── Headings ── */
    h1 {
      font-size: 20pt;
      font-weight: 700;
      color: #1a4d2e;
      margin: 32px 0 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #a8d5b5;
      page-break-after: avoid;
    }
    h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #145a32;
      margin: 24px 0 6px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #0e3d23;
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

    p { margin: 0 0 8px; orphans: 3; widows: 3; }

    ul, ol { margin: 4px 0 10px 20px; }
    li { margin-bottom: 3px; }
    li > ul, li > ol { margin-top: 2px; margin-bottom: 2px; }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 10px 0 14px;
      page-break-inside: auto;
    }
    thead tr { background: #1a4d2e; color: #fff; }
    thead th {
      padding: 5px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 8pt;
    }
    tbody tr:nth-child(even) { background: #f3faf5; }
    tbody td {
      padding: 5px 8px;
      border-bottom: 1px solid #c8e6ce;
      vertical-align: top;
    }

    /* ── Code ── */
    code {
      font-family: 'Noto Mono', monospace;
      font-size: 8pt;
      background: #f0faf2;
      color: #1a4d2e;
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre {
      background: #1e2a22;
      color: #c8e6ce;
      font-family: 'Noto Mono', monospace;
      font-size: 7.8pt;
      line-height: 1.55;
      padding: 12px 14px;
      border-radius: 5px;
      margin: 10px 0 14px;
      page-break-inside: avoid;
      white-space: pre-wrap;
      word-break: break-all;
    }
    pre code { background: none; color: inherit; padding: 0; }

    /* ── Blockquotes ── */
    blockquote {
      border-left: 4px solid #1a4d2e;
      background: #f3faf5;
      margin: 10px 0 14px;
      padding: 8px 12px;
      font-style: italic;
      color: #333;
      page-break-inside: avoid;
    }
    blockquote p { margin-bottom: 4px; }
    blockquote p:last-child { margin-bottom: 0; }

    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    strong { font-weight: 600; color: #0e3d23; }
    a { color: #1a4d2e; text-decoration: none; }

    /* ── Status checkboxes (task lists) ── */
    input[type="checkbox"] { margin-right: 5px; }

    h1 { page-break-before: always; }
    h1:first-of-type { page-break-before: avoid; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluateHandle('document.fonts.ready');

await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '22mm', right: '20mm', bottom: '26mm', left: '22mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:7pt;color:#999;width:100%;text-align:center;font-family:sans-serif;">
    Asmita — Implementation Plan v0.1 (Internal)
  </div>`,
  footerTemplate: `<div style="font-size:7pt;color:#999;width:100%;display:flex;justify-content:space-between;padding:0 22mm;font-family:sans-serif;">
    <span>2026-05-12 | Pre-development</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`,
});

await browser.close();
console.log(`PDF written to: ${outputPath}`);
