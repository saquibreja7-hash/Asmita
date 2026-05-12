import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath  = resolve(__dirname, 'UXUI_DESIGN_PLAN_Asmita.md');
const outputPath = resolve(__dirname, 'UXUI_DESIGN_PLAN_Asmita.pdf');

const markdown = readFileSync(inputPath, 'utf-8');
marked.setOptions({ gfm: true, breaks: false });
const bodyHtml = marked.parse(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Asmita — UI/UX Design Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600&family=Noto+Sans+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 22mm 20mm 22mm 22mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent:       #0A5E5A;
      --accent-light: #E6F4F3;
      --hero-bg:      #0D1F1E;
      --surface:      #F8F7F5;
      --text:         #111111;
      --muted:        #6B7280;
      --border:       #E5E7EB;
    }

    body {
      font-family: 'Inter', 'Noto Sans Devanagari', sans-serif;
      font-size: 9.5pt;
      line-height: 1.6;
      color: var(--text);
      background: #fff;
    }

    /* Headings */
    h1 {
      font-size: 19pt;
      font-weight: 700;
      color: var(--accent);
      margin: 32px 0 8px;
      padding-bottom: 7px;
      border-bottom: 2px solid var(--accent-light);
      page-break-after: avoid;
    }
    h2 {
      font-size: 13pt;
      font-weight: 700;
      color: #074543;
      margin: 22px 0 6px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #063230;
      margin: 16px 0 5px;
      page-break-after: avoid;
    }
    h4 {
      font-size: 9.5pt;
      font-weight: 600;
      color: #222;
      margin: 13px 0 4px;
      page-break-after: avoid;
    }

    p { margin: 0 0 8px; orphans: 3; widows: 3; }
    ul, ol { margin: 4px 0 10px 20px; }
    li { margin-bottom: 3px; }
    li > ul, li > ol { margin-top: 2px; margin-bottom: 2px; }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 10px 0 14px;
    }
    thead tr { background: var(--accent); color: #fff; }
    thead th { padding: 5px 8px; text-align: left; font-weight: 600; font-size: 8pt; }
    tbody tr:nth-child(even) { background: var(--accent-light); }
    tbody td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }

    /* Code */
    code {
      font-family: 'Noto Sans Mono', monospace;
      font-size: 8pt;
      background: var(--accent-light);
      color: var(--accent);
      padding: 1px 5px;
      border-radius: 4px;
    }
    pre {
      background: var(--hero-bg);
      color: #a8d5d3;
      font-family: 'Noto Sans Mono', monospace;
      font-size: 7.6pt;
      line-height: 1.55;
      padding: 13px 15px;
      border-radius: 7px;
      margin: 10px 0 14px;
      page-break-inside: avoid;
      white-space: pre-wrap;
      word-break: break-all;
      border-left: 3px solid var(--accent);
    }
    pre code { background: none; color: inherit; padding: 0; }

    /* Blockquotes */
    blockquote {
      border-left: 4px solid var(--accent);
      background: var(--accent-light);
      margin: 10px 0 14px;
      padding: 8px 14px;
      font-style: italic;
      color: #333;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }
    blockquote p { margin-bottom: 4px; }
    blockquote p:last-child { margin-bottom: 0; }

    hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
    strong { font-weight: 600; color: #063230; }
    a { color: var(--accent); text-decoration: none; }

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
  headerTemplate: `<div style="font-size:7pt;color:#9CA3AF;width:100%;text-align:center;font-family:sans-serif;">
    Asmita — UI/UX Design Plan v0.1
  </div>`,
  footerTemplate: `<div style="font-size:7pt;color:#9CA3AF;width:100%;display:flex;justify-content:space-between;padding:0 22mm;font-family:sans-serif;">
    <span>2026-05-12 | Pre-development</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`,
});

await browser.close();
console.log(`PDF written to: ${outputPath}`);
