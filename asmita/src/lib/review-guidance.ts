import { REVIEW_GUIDANCE_MARKDOWN } from "@/generated/review-guidance";

/*
 * The review console's per-queue guidance (review-console-spec.md, WP142):
 * one Markdown file per queue, docs/review-guidance/<queueKey>.md, embedded
 * at build time (scripts/sync-review-guidance.mjs) because the Worker cannot
 * read repo files at runtime. Rendered read-only on the server, sanitised:
 * every character of source text is HTML-escaped before the small Markdown
 * subset is applied, so raw HTML in a file can never reach the drawer, and
 * no link or image can ever be produced. The files are repo documentation,
 * not survivor data.
 */

/** The queue keys that have a guidance file (docs/review-guidance/<key>.md). */
export const GUIDED_QUEUE_KEYS: readonly string[] = Object.keys(REVIEW_GUIDANCE_MARKDOWN);

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The tiny inline subset: **bold** and *italic*, applied to escaped text. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

/**
 * Renders one guidance file to HTML. Headings are demoted one level (the
 * drawer already carries the h2 title), lists are one level of "- " bullets,
 * "> " lines become a blockquote, and everything else is paragraphs.
 */
export function renderReviewGuidance(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(escapeHtml(paragraph.join(" ")))}</p>`);
      paragraph = [];
    }
    if (bullets.length > 0) {
      html.push(`<ul>${bullets.map((item) => `<li>${renderInline(escapeHtml(item))}</li>`).join("")}</ul>`);
      bullets = [];
    }
    if (quote.length > 0) {
      html.push(`<blockquote><p>${renderInline(escapeHtml(quote.join(" ")))}</p></blockquote>`);
      quote = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      // Demote one level: # → h3 under the drawer's h2 title.
      const level = heading[1]!.length + 2;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]!))}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      if (paragraph.length > 0 || quote.length > 0) flush();
      bullets.push(trimmed.slice(2));
      continue;
    }
    if (trimmed.startsWith("> ")) {
      if (paragraph.length > 0 || bullets.length > 0) flush();
      quote.push(trimmed.slice(2));
      continue;
    }
    if (bullets.length > 0 || quote.length > 0) flush();
    paragraph.push(trimmed);
  }
  flush();
  return html.join("");
}

const renderedCache = new Map<string, string>();

/**
 * The queue's guidance as rendered HTML, or null when the queue has no file.
 * The content is fixed per deploy, so each queue renders once per isolate.
 * An empty render is treated as no guidance.
 */
export function guidanceHtmlForQueue(queueKey: string): string | null {
  const cached = renderedCache.get(queueKey);
  if (cached !== undefined) return cached || null;
  const markdown = REVIEW_GUIDANCE_MARKDOWN[queueKey];
  const html = markdown === undefined ? "" : renderReviewGuidance(markdown);
  renderedCache.set(queueKey, html);
  return html || null;
}

/** The queue's raw Markdown, for tests and tooling. Null when there is none. */
export function guidanceMarkdownForQueue(queueKey: string): string | null {
  return REVIEW_GUIDANCE_MARKDOWN[queueKey] ?? null;
}
