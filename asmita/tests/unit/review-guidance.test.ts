import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// WP142 (review-console-spec.md): the per-queue guidance. One Markdown file
// per queue in docs/review-guidance/, embedded at build time for the Worker
// and rendered read-only server-side, sanitised: the renderer escapes all
// HTML before applying its small Markdown subset, so nothing in a file can
// ever become a live tag, a link or an image. The files are drafts, marked
// so, and written only from what the code and existing docs say.

import {
  GUIDED_QUEUE_KEYS,
  guidanceHtmlForQueue,
  guidanceMarkdownForQueue,
  renderReviewGuidance,
} from "@/lib/review-guidance";
import { REVIEW_GUIDANCE_MARKDOWN } from "@/generated/review-guidance";
import { containsUrlLikeText } from "@/lib/url-like-text";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "..", "..", "docs", "review-guidance");

describe("the sanitising renderer", () => {
  it("escapes every kind of injected HTML", () => {
    const html = renderReviewGuidance("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script>");
    expect(html).toContain("&lt;script&gt;");

    const attribute = renderReviewGuidance('<img src=x onerror="alert(1)"> tries a picture');
    expect(attribute).not.toContain("<img");
    expect(attribute).toContain("&lt;img");

    const link = renderReviewGuidance("[click](https://forum.example.test)");
    expect(link).not.toContain("href=");
    expect(link).not.toContain("<a ");
  });

  it("renders the Markdown subset the drafts use", () => {
    const html = renderReviewGuidance(
      [
        "# Title",
        "",
        "> A quoted remark",
        "> spilling to a second line.",
        "",
        "A paragraph with **bold** and *emphasis*.",
        "",
        "## Section",
        "",
        "- one bullet",
        "- two bullet",
        "",
        "### Deeper",
        "Tail paragraph.",
      ].join("\n"),
    );
    // Headings demote one level: the drawer already carries the h2 title.
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<h4>Section</h4>");
    expect(html).toContain("<h5>Deeper</h5>");
    expect(html).toContain("<blockquote><p>A quoted remark spilling to a second line.</p></blockquote>");
    expect(html).toContain("<p>A paragraph with <strong>bold</strong> and <em>emphasis</em>.</p>");
    expect(html).toContain("<ul><li>one bullet</li><li>two bullet</li></ul>");
    expect(html).toContain("<p>Tail paragraph.</p>");
  });

  it("escapes markdown-styled hostile text too", () => {
    const html = renderReviewGuidance("- <b>bold lie</b>");
    expect(html).toContain("<ul><li>&lt;b&gt;bold lie&lt;/b&gt;</li></ul>");
  });
});

describe("the six guidance files", () => {
  it("exist for every queue key, each marked as a draft", () => {
    expect([...GUIDED_QUEUE_KEYS].sort()).toEqual(
      ["findings", "fingerprints", "lab-reports", "links", "minor-hold", "partners"].sort(),
    );
    for (const key of GUIDED_QUEUE_KEYS) {
      const markdown = guidanceMarkdownForQueue(key);
      expect(markdown, key).not.toBeNull();
      expect(markdown!.startsWith("# "), key).toBe(true);
      expect(markdown, key).toContain("Draft: not reviewed");
    }
  });

  it("carry no URL plaintext of any kind", () => {
    for (const key of GUIDED_QUEUE_KEYS) {
      expect(containsUrlLikeText(guidanceMarkdownForQueue(key)!), key).toBe(false);
    }
  });

  it("match the generated module exactly (run scripts/sync-review-guidance.mjs)", () => {
    for (const key of GUIDED_QUEUE_KEYS) {
      const onDisk = readFileSync(join(docsDir, `${key}.md`), "utf8");
      expect(REVIEW_GUIDANCE_MARKDOWN[key], key).toBe(onDisk);
    }
  });

  it("render through the queue lookup, and an unknown queue has none", () => {
    const html = guidanceHtmlForQueue("links");
    expect(html).toContain("Flagged links: review guidance");
    expect(html).toContain("Draft: not reviewed");
    expect(html).not.toContain("<script");
    expect(guidanceHtmlForQueue("no-such-queue")).toBeNull();
  });
});
