/*
 * Minimal, safe markdown renderer for org posts (docs/org/spec.md, WP56).
 *
 * Why hand-written: the renderer must run inside a Cloudflare Worker, and the
 * safest small dependency is no dependency. Everything here is plain string
 * work over an escaped document, so no raw HTML can ever reach the output.
 *
 * Supported: ATX headings, paragraphs, unordered and ordered lists,
 * blockquotes, pipe tables, fenced code blocks, thematic breaks, inline
 * code, emphasis and strong, links and images. Raw HTML is escaped and
 * shown as text, never parsed. Images may only reference the site's own
 * paths (/...), never an external or inline source. External links get
 * rel="noopener noreferrer"; javascript:, data: and other non-http(s)
 * link targets are refused and rendered as plain text.
 */

/** HTML-escape a string. Every piece of user markdown passes through this. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value.replace(/"/g, "%22").replace(/</g, "%3c").replace(/>/g, "%3e");
}

/** A link href we are willing to emit: http(s) absolute, or site-local. */
function safeLinkHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/(?!\/)[^\s]*$/.test(trimmed)) return trimmed; // "/..." but not "//..."
  return null; // javascript:, data:, mailto: unless allowed below
}

/** Site mailto links are fine for post bodies. */
function safeMailtoHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(trimmed)) return trimmed;
  return null;
}

/** An image src we are willing to emit: the site's own paths only. */
function safeImageSrc(url: string): string | null {
  const trimmed = url.trim();
  // Own paths only: starts with a single slash, no protocol, no data:.
  if (!/^\/(?!\/)[a-z0-9\-._~!$&'()*+,;=:@/\[\]]*$/i.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  return trimmed;
}

interface Link {
  text: string;
  href: string;
  external: boolean;
}

/** Render inline markdown on already-escaped text. */
function renderInline(escaped: string): string {
  // Inline code first, so nothing inside backticks is processed further.
  const codeSpans: string[] = [];
  let text = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  // Links and images: [label](url) and ![alt](url).
  const links: Link[] = [];
  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const src = safeImageSrc(url.replace(/&amp;/g, "&"));
    if (!src) return alt; // not our path: show the alt text only
    const image = `<img src="${escapeAttribute(src)}" alt="${alt}" loading="lazy" />`;
    codeSpans.push(image);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeLinkHref(url) ?? safeMailtoHref(url);
    if (!href) return label; // unsafe target: plain text
    const external = /^https?:\/\//i.test(href);
    links.push({ text: label, href, external });
    const rel = external ? ' rel="noopener noreferrer"' : "";
    const anchor = `<a href="${escapeAttribute(href)}"${rel}>${label}</a>`;
    codeSpans.push(anchor);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  // Emphasis and strong. Markers are already-escaped text; no HTML involved.
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // Restore code spans, links and images.
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => codeSpans[Number(index)] ?? "");
  return text;
}

/** True when the line is a table separator like | --- | :---: |. */
function isTableDivider(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  const cells = trimmed.slice(1, -1).split("|");
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function renderTable(lines: string[]): string {
  const rows = lines.map((line) =>
    line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((cell) => renderInline(cell.trim())),
  );
  const [header, ...body] = rows;
  const head = header.map((cell) => `<th scope="col">${cell}</th>`).join("");
  const rest = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rest}</tbody></table>`;
}

/** Split a list block into items, dropping each leading list marker. */
function listItems(lines: string[]): string[] {
  return lines.map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim());
}

/** Escape the whole document once, then group escaped lines into blocks. */
export function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown.replace(/\r\n/g, "\n"));
  const lines = escaped.split("\n");
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "") {
      index += 1;
      continue;
    }

    // Fenced code block.
    if (trimmed.startsWith("```")) {
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence (or end of input)
      out.push(`<pre><code>${buffer.join("\n")}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // Thematic break.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("<hr />");
      index += 1;
      continue;
    }

    // Blockquote.
    if (trimmed.startsWith("&gt;")) {
      const buffer: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("&gt;")) {
        buffer.push(lines[index].trim().replace(/^&gt;\s?/, ""));
        index += 1;
      }
      out.push(`<blockquote><p>${buffer.join("<br />")}</p></blockquote>`);
      continue;
    }

    // Table.
    if (trimmed.startsWith("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const buffer: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        buffer.push(lines[index]);
        index += 1;
      }
      out.push(renderTable(buffer));
      continue;
    }

    // Unordered list.
    if (/^[-*+]\s+/.test(trimmed)) {
      const buffer: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      const items = listItems(buffer).map((item) => `<li>${renderInline(item)}</li>`);
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const buffer: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      const items = listItems(buffer).map((item) => `<li>${renderInline(item)}</li>`);
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph: consecutive non-blank, non-block lines.
    const buffer: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|&gt;|```|\|)/.test(lines[index].trim())
    ) {
      buffer.push(lines[index].trim());
      index += 1;
    }
    if (buffer.length > 0) {
      out.push(`<p>${renderInline(buffer.join(" "))}</p>`);
    } else {
      // A lone line the paragraph loop cannot take (e.g. "|text|" without a
      // divider): emit it as a paragraph so nothing is silently dropped.
      out.push(`<p>${renderInline(trimmed)}</p>`);
      index += 1;
    }
  }

  return out.join("\n");
}
