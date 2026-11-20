import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEWS_PAGE_SIZE,
  createOrgPost,
  deleteOrgPostDraft,
  getPublishedOrgPostBySlug,
  listOrgPostsForAdmin,
  listPublishedCaseStudies,
  listPublishedOrgPosts,
  relatedOrgPosts,
  setOrgPostStatus,
  slugifyOrgTitle,
  updateOrgPost,
  orgPosts,
  orgPostSchema,
  type OrgPostKind,
} from "@/lib/org-posts";

// Post slug and publish rules (docs/org/spec.md, 56.1), including the
// case-study gate. Memory mode: no DATABASE_URL in tests.

const base = {
  kind: "NEWS" as OrgPostKind,
  titleEn: "A new tool for survivors",
  summaryEn: "We shipped a small thing that helps.",
  bodyEn: "## What changed\n\nA paragraph about the change.",
  authorDisplayName: "Meri Asmita",
};

function parse(overrides: Record<string, unknown> = {}) {
  const parsed = orgPostSchema.safeParse({ ...base, ...overrides });
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  return parsed.data;
}

const ACTOR = "admin-1";

describe("slugifyOrgTitle", () => {
  it("builds a slug from a title and refuses to be empty", () => {
    expect(slugifyOrgTitle("Hello, Big World!")).toBe("hello-big-world");
    expect(slugifyOrgTitle("   ")).toMatch(/^post-/);
  });
});

describe("org post slug rules", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
  });

  it("auto-generates the slug from the title when none is given", async () => {
    const result = await createOrgPost(parse(), ACTOR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post.slug).toBe("a-new-tool-for-survivors");
    expect(result.post.status).toBe("DRAFT");
  });

  it("refuses a slug that another post already uses", async () => {
    const first = await createOrgPost(parse(), ACTOR);
    const second = await createOrgPost(parse({ titleEn: "Another piece", slug: "a-new-tool-for-survivors" }), ACTOR);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: "slug_taken" });
  });

  it("refuses a slug taken by another post on update, but allows keeping your own", async () => {
    const first = await createOrgPost(parse(), ACTOR);
    const second = await createOrgPost(parse({ titleEn: "Second piece" }), ACTOR);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const steal = await updateOrgPost(second.post.id, parse({ slug: "a-new-tool-for-survivors" }), ACTOR);
    expect(steal).toEqual({ ok: false, error: "slug_taken" });
    const keep = await updateOrgPost(second.post.id, parse({ titleEn: "Second piece revised" }), ACTOR);
    expect(keep.ok).toBe(true);
  });
});

describe("org post publish rules", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => {
    vi.unstubAllEnvs();
    orgPosts.splice(0, orgPosts.length);
  });

  it("publishes, lists published posts newest first and paginates 12 per page", async () => {
    const created = await createOrgPost(parse(), ACTOR);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const published = await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR);
    expect(published.ok).toBe(true);
    expect(published.ok && published.post.publishedAt).toBeTruthy();

    for (let index = 0; index < NEWS_PAGE_SIZE + 2; index += 1) {
      const more = await createOrgPost(parse({ titleEn: `Post number ${index}` }), ACTOR);
      expect(more.ok).toBe(true);
      if (more.ok) {
        await setOrgPostStatus(more.post.id, "PUBLISHED", ACTOR);
        // Distinct publish moments, so newest-first is deterministic in memory.
        more.post.publishedAt = new Date(Date.now() + (index + 1) * 60_000).toISOString();
      }
    }
    const page1 = await listPublishedOrgPosts({ page: 1 });
    const page2 = await listPublishedOrgPosts({ page: 2 });
    expect(page1.posts).toHaveLength(NEWS_PAGE_SIZE);
    expect(page2.posts).toHaveLength(3);
    expect(page1.total).toBe(NEWS_PAGE_SIZE + 3);
    // Newest first.
    expect(page1.posts[0].slug).toBe("post-number-13");
  });

  it("unpublish takes a post off the public list, and only drafts can be deleted", async () => {
    const created = await createOrgPost(parse(), ACTOR);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR);
    const unpublished = await setOrgPostStatus(created.post.id, "DRAFT", ACTOR);
    expect(unpublished.ok && unpublished.post.status).toBe("DRAFT");
    expect(await getPublishedOrgPostBySlug(created.post.slug)).toBeNull();

    const asPublished = await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR);
    expect(asPublished.ok).toBe(true);
    expect(await deleteOrgPostDraft(created.post.id, ACTOR)).toEqual({ ok: false, error: "not_a_draft" });

    await setOrgPostStatus(created.post.id, "DRAFT", ACTOR);
    expect(await deleteOrgPostDraft(created.post.id, ACTOR)).toEqual({ ok: true });
    expect(await getPublishedOrgPostBySlug(created.post.slug)).toBeNull();
    expect(await listOrgPostsForAdmin()).toHaveLength(0);
  });

  it("blocks publishing a case study until consent is recorded and the story is anonymised", async () => {
    const created = await createOrgPost(
      parse({ kind: "CASE_STUDY", titleEn: "One survivor's story", consentRecorded: false, anonymised: false }),
      ACTOR,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const refused = await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR);
    expect(refused).toEqual({ ok: false, error: "case_study_checks_required" });
    expect(await getPublishedOrgPostBySlug(created.post.slug)).toBeNull();

    const withConsent = await updateOrgPost(created.post.id, parse({ kind: "CASE_STUDY", titleEn: "One survivor's story", consentRecorded: true, anonymised: false }), ACTOR);
    expect(withConsent.ok).toBe(true);
    expect(await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR)).toEqual({ ok: false, error: "case_study_checks_required" });

    const anonymised = await updateOrgPost(created.post.id, parse({ kind: "CASE_STUDY", titleEn: "One survivor's story", consentRecorded: true, anonymised: true }), ACTOR);
    expect(anonymised.ok).toBe(true);
    const published = await setOrgPostStatus(created.post.id, "PUBLISHED", ACTOR);
    expect(published.ok && published.post.status).toBe("PUBLISHED");

    // The Stories strip picks case studies up (56.8).
    const stories = await listPublishedCaseStudies();
    expect(stories.map((story) => story.slug)).toContain(created.post.slug);
  });

  it("related posts share the kind and exclude the post itself", async () => {
    const newsA = await createOrgPost(parse({ titleEn: "News piece A" }), ACTOR);
    const newsB = await createOrgPost(parse({ titleEn: "News piece B" }), ACTOR);
    const research = await createOrgPost(parse({ kind: "RESEARCH", titleEn: "A study of responses" }), ACTOR);
    expect(newsA.ok && newsB.ok && research.ok).toBe(true);
    if (!newsA.ok || !newsB.ok || !research.ok) return;
    await setOrgPostStatus(newsA.post.id, "PUBLISHED", ACTOR);
    await setOrgPostStatus(newsB.post.id, "PUBLISHED", ACTOR);
    await setOrgPostStatus(research.post.id, "PUBLISHED", ACTOR);
    const related = await relatedOrgPosts(newsA.post, 3);
    expect(related.map((entry) => entry.slug)).toEqual(["news-piece-b"]);
    const relatedResearch = await relatedOrgPosts(research.post, 3);
    expect(relatedResearch).toEqual([]);
  });

  it("refuses unknown kinds and a cover on both channels at the schema layer", () => {
    expect(orgPostSchema.safeParse({ ...base, kind: "GOSSIP" }).success).toBe(false);
    expect(
      orgPostSchema.safeParse({ ...base, coverIllustration: "page-about", coverImagePath: "/x.png" }).success,
    ).toBe(false);
    expect(orgPostSchema.safeParse({ ...base, ctaLabel: "Act" }).success).toBe(false);
  });
});
