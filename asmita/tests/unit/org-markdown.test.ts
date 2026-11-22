import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings, renderMarkdown } from "@/lib/markdown";

// The safe markdown renderer (docs/org/spec.md, 56.1): everything is escaped
// before it is structured, so no raw HTML can survive. Synthetic payloads
// only — no real platform names, no real URLs with content.

describe("markdown renderer structure", () => {
  it("renders headings, lists, quotes, tables, code and breaks", () => {
    const html = renderMarkdown([
      "# Title",
      "",
      "A paragraph with **bold**, *emphasis* and `code`.",
      "",
      "## Section",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "> a quote",
      "",
      "| Head | Count |",
      "| --- | ---: |",
      "| a | 1 |",
      "",
      "```",
      "<script>alert(1)</script>",
      "```",
      "",
      "---",
    ].join("\n"));
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain('<h2 id="section">Section</h2>');
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain("<blockquote><p>a quote</p></blockquote>");
    expect(html).toContain('<table class="data-table">');
    expect(html).toContain("<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>");
    expect(html).toContain("<hr />");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<code>code</code>");
  });

  it("gives duplicate headings distinct ids and extracts them for the contents rail", () => {
    const markdown = "## Notes\n\ntext\n\n## Notes\n\nmore";
    const html = renderMarkdown(markdown);
    expect(html).toContain('<h2 id="notes">Notes</h2>');
    expect(html).toContain('<h2 id="notes-2">Notes</h2>');
    expect(extractMarkdownHeadings(markdown)).toEqual([
      { level: 2, id: "notes", title: "Notes" },
      { level: 2, id: "notes-2", title: "Notes" },
    ]);
  });

  it("linkifies external links with rel and keeps site-local links plain", () => {
    const html = renderMarkdown("[External](https://example.invalid/page) and [Internal](/news)");
    expect(html).toContain('<a href="https://example.invalid/page" rel="noopener noreferrer">External</a>');
    expect(html).toContain('<a href="/news">Internal</a>');
  });

  it("allows mailto links to plain addresses", () => {
    expect(renderMarkdown("[Write](mailto:team@example.invalid)")).toContain('href="mailto:team@example.invalid"');
  });
});

describe("markdown renderer XSS cases", () => {
  it("escapes raw HTML instead of parsing it", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    expect(html).not.toContain("<img ");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("refuses javascript: and data: link targets, rendering the label as text", () => {
    const html = renderMarkdown("[Click me](javascript:alert(1)) and [Data](data:text/html;base64,QUJD)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("Click me");
    expect(html).toContain("Data");
  });

  it("refuses an image from an external source, a data URI and a protocol-relative path", () => {
    const html = renderMarkdown(
      '![Evil](https://evil.example/x.png) ![Inline](data:image/png;base64,AAAA) ![Proto](//evil.example/x.png)',
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Evil");
  });

  it("allows only images from the site's own paths", () => {
    const html = renderMarkdown("![Cover](/images/illustrations/page-research.webp)");
    expect(html).toContain('<img src="/images/illustrations/page-research.webp" alt="Cover" loading="lazy" />');
  });

  it("escapes attribute injection through crafted link text", () => {
    const html = renderMarkdown('[a" onmouseover="alert(1)](https://example.invalid)');
    expect(html).not.toContain('onmouseover="alert');
    expect(html).toContain("onmouseover");
  });

  it("does not smuggle HTML through emphasis or code spans", () => {
    const html = renderMarkdown("**<b>bold</b>** `<>` *<i>x</i>*");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("<code>&lt;&gt;</code>");
  });

  it("keeps a table cell from breaking out with a pipe or quotes", () => {
    const html = renderMarkdown('| "x" | <b> | \n| --- | --- |\n| [a](javascript:1) | b |');
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("javascript:1");
  });
});
