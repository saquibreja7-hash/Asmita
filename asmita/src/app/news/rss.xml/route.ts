import { listPublishedOrgPosts } from "@/lib/org-posts";
import { t } from "@/lib/i18n";

// The RSS feed for /news (docs/org/spec.md, 56.1): the latest 20 published
// posts, newest first. Plain XML; no case data, no personal data.

export const dynamic = "force-dynamic";

const MAX_ITEMS = 20;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = siteUrl();
  const page = await listPublishedOrgPosts({ perPage: MAX_ITEMS, page: 1 });
  const channelTitle = escapeXml(t("en", "org.news.rssTitle"));
  const channelDescription = escapeXml(t("en", "org.news.rssDescription"));
  const items = page.posts
    .map((post) => {
      const url = `${base}/news/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.titleEn)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      ]
        .concat(post.publishedAt ? [`      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`] : [])
        .concat([
          `      <description>${escapeXml(post.summaryEn)}</description>`,
          "    </item>",
        ])
        .join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${channelTitle}</title>`,
    `    <link>${escapeXml(`${base}/news`)}</link>`,
    `    <description>${channelDescription}</description>`,
    `    <language>en-in</language>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
}
