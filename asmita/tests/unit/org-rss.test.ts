import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/news/rss.xml/route";
import { createOrgPost, orgPostSchema, orgPosts, setOrgPostStatus } from "@/lib/org-posts";

// The RSS feed (docs/org/spec.md, 56.1): valid XML, the latest published
// posts, escaped content, no case data. Memory mode.

const input = (title: string) => {
  const parsed = orgPostSchema.safeParse({
    kind: "NEWS",
    titleEn: title,
    summaryEn: `A summary about ${title}.`,
    bodyEn: "A paragraph.",
    authorDisplayName: "Meri Asmita",
  });
  if (!parsed.success) throw new Error("bad fixture");
  return parsed.data;
};

describe("/news/rss.xml", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
  });

  it("is empty but valid when nothing is published", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await response.text();
    expect(xml).toContain("<rss");
    expect(xml).not.toContain("<item>");
  });

  it("lists published posts, newest first, and never drafts", async () => {
    const draft = await createOrgPost(input("Draft piece"), "admin-1");
    const older = await createOrgPost(input("Older piece"), "admin-1");
    const newer = await createOrgPost(input("Newer piece & <angle>"), "admin-1");
    expect(draft.ok && older.ok && newer.ok).toBe(true);
    if (!older.ok || !newer.ok) return;
    await setOrgPostStatus(older.post.id, "PUBLISHED", "admin-1");
    await setOrgPostStatus(newer.post.id, "PUBLISHED", "admin-1");
    // Distinct publish moments, so newest-first is deterministic in memory.
    older.post.publishedAt = new Date(Date.now() - 60_000).toISOString();
    newer.post.publishedAt = new Date(Date.now()).toISOString();

    const xml = await (await GET()).text();
    expect(xml).toContain("<language>en-in</language>");
    const items = xml.split("<item>").slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Newer piece &amp; &lt;angle&gt;");
    expect(items[0]).toContain("<pubDate>");
    expect(items[0]).toContain('<guid isPermaLink="true">');
    expect(xml).toContain("Older piece");
    expect(xml).not.toContain("Draft piece");
  });
});
