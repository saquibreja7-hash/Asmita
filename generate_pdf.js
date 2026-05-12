const puppeteer = require('puppeteer');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'PRD_Asmita.md');
const pdfPath = path.join(__dirname, 'PRD_Asmita.pdf');

const md = fs.readFileSync(mdPath, 'utf8');

marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Asmita PRD</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap');

  :root {
    --accent: #b5272d;
    --accent-light: #fdf2f2;
    --accent-mid: #e8b4b6;
    --text: #1a1a1a;
    --muted: #6b7280;
    --border: #e5e7eb;
    --code-bg: #f3f4f6;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: var(--text);
    background: white;
    padding: 0;
  }

  /* Cover page */
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 72px 64px;
    background: white;
    border-left: 6px solid var(--accent);
    page-break-after: always;
  }
  .cover-badge {
    background: var(--accent-light);
    color: var(--accent);
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 4px;
    margin-bottom: 32px;
  }
  .cover h1 {
    font-size: 36pt;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.1;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }
  .cover-hindi {
    font-family: 'Noto Sans Devanagari', 'Mangal', sans-serif;
    font-size: 22pt;
    color: var(--muted);
    margin-bottom: 28px;
  }
  .cover-subtitle {
    font-size: 13pt;
    color: #374151;
    font-weight: 500;
    max-width: 480px;
    line-height: 1.5;
    margin-bottom: 48px;
  }
  .cover-meta {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
  }
  .cover-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cover-meta-label {
    font-size: 7.5pt;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .cover-meta-value {
    font-size: 10pt;
    font-weight: 500;
    color: var(--text);
  }
  .cover-divider {
    width: 64px;
    height: 3px;
    background: var(--accent);
    margin: 32px 0;
    border-radius: 2px;
  }

  /* Content wrapper */
  .content {
    padding: 48px 64px;
    max-width: 100%;
  }

  /* Headings */
  h1, h2, h3, h4 {
    font-weight: 600;
    color: var(--text);
    line-height: 1.25;
  }

  h1 {
    font-size: 22pt;
    font-weight: 700;
    color: var(--accent);
    margin: 40px 0 16px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--accent);
    page-break-after: avoid;
  }
  h1:first-child { margin-top: 0; }

  h2 {
    font-size: 14pt;
    font-weight: 700;
    color: #111827;
    margin: 36px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
    page-break-after: avoid;
  }

  h3 {
    font-size: 11.5pt;
    font-weight: 600;
    color: var(--accent);
    margin: 24px 0 8px;
    page-break-after: avoid;
  }

  h4 {
    font-size: 10.5pt;
    font-weight: 600;
    color: #374151;
    margin: 18px 0 6px;
    font-style: italic;
    page-break-after: avoid;
  }

  /* Paragraphs */
  p {
    margin: 0 0 10px;
    orphans: 3;
    widows: 3;
  }

  /* Lists */
  ul, ol {
    margin: 6px 0 12px 20px;
    padding: 0;
  }
  li {
    margin-bottom: 4px;
    padding-left: 4px;
  }
  li > ul, li > ol {
    margin-top: 4px;
    margin-bottom: 4px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 20px;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  thead {
    background: var(--accent);
    color: white;
  }
  thead th {
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 9pt;
    letter-spacing: 0.02em;
  }
  tbody tr:nth-child(even) {
    background: var(--accent-light);
  }
  tbody tr:hover { background: #fef9f9; }
  td {
    padding: 7px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    line-height: 1.45;
  }
  td:first-child { font-weight: 500; }

  /* Code */
  code {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 9pt;
    background: var(--code-bg);
    padding: 2px 5px;
    border-radius: 3px;
    color: var(--accent);
  }
  pre {
    background: #1f2937;
    color: #f9fafb;
    padding: 16px 20px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 14px 0;
    font-size: 8.5pt;
    line-height: 1.6;
    page-break-inside: avoid;
    border-left: 3px solid var(--accent);
  }
  pre code {
    background: none;
    padding: 0;
    color: #e5e7eb;
    font-size: inherit;
  }

  /* Blockquote / callouts */
  blockquote {
    border-left: 4px solid var(--accent);
    background: var(--accent-light);
    padding: 12px 16px;
    margin: 14px 0;
    border-radius: 0 6px 6px 0;
    color: #374151;
    font-style: normal;
  }
  blockquote p { margin: 0; }

  /* Horizontal rule */
  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 28px 0;
  }

  /* Strong */
  strong { font-weight: 600; color: #111827; }

  /* Links */
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* TOC styling */
  .content > ul:first-of-type {
    background: var(--accent-light);
    border: 1px solid var(--accent-mid);
    border-radius: 8px;
    padding: 20px 20px 20px 40px;
    margin-bottom: 32px;
  }
  .content > ul:first-of-type li {
    margin-bottom: 6px;
  }
  .content > ul:first-of-type a {
    font-weight: 500;
  }

  /* Page breaks */
  h2 { page-break-before: auto; }
  .page-break { page-break-before: always; }

  /* Print / PDF specifics */
  @page {
    margin: 16mm 16mm 20mm 16mm;
    size: A4;
    @bottom-center {
      content: "Asmita PRD — Confidential Draft — " counter(page);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #9ca3af;
    }
  }
  @media print {
    .cover { page-break-after: always; }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-badge">Product Requirements Document</div>
  <h1>Asmita</h1>
  <div class="cover-hindi">अस्मिता</div>
  <div class="cover-subtitle">Dignity Restoration Platform for Non-Consensual Intimate Image Abuse in India</div>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <span class="cover-meta-label">Version</span>
      <span class="cover-meta-value">0.2 — Draft</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">Date</span>
      <span class="cover-meta-value">May 12, 2026</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">Status</span>
      <span class="cover-meta-value">Pre-development</span>
    </div>
    <div class="cover-meta-item">
      <span class="cover-meta-label">Scope</span>
      <span class="cover-meta-value">India-specific (Phase 1–2)</span>
    </div>
  </div>
</div>

<div class="content">
${body}
</div>

</body>
</html>`;

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  console.log('Loading HTML...');
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait a moment for fonts if any loaded
  await new Promise(r => setTimeout(r, 1000));

  console.log('Generating PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '16mm', bottom: '20mm', left: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%; font-family:'Segoe UI',sans-serif; font-size:8pt; color:#9ca3af;
                  display:flex; justify-content:space-between; padding:0 16mm;">
        <span>Asmita PRD &mdash; Confidential Draft</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });

  await browser.close();
  console.log('PDF saved to:', pdfPath);
})();
