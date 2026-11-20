import { randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { SIZES, type IllustrationName } from "@/components/Illustration";

/*
 * Org posts (docs/org/spec.md, WP56): news, case studies, policy papers,
 * campaigns, research publications, lab notes and press releases. This is
 * organization content, entirely separate from the survivor complaint
 * workflow. Like the partner sign-up (src/lib/platform-partners.ts), local
 * development and tests without DATABASE_URL keep posts in memory; with a
 * database they live in the OrgPost table.
 */

export const ORG_POST_KINDS = [
  "NEWS",
  "CASE_STUDY",
  "POLICY",
  "CAMPAIGN",
  "RESEARCH",
  "LAB_NOTE",
  "PRESS",
] as const;
export type OrgPostKind = (typeof ORG_POST_KINDS)[number];

export const ORG_POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type OrgPostStatus = (typeof ORG_POST_STATUSES)[number];

export const NEWS_PAGE_SIZE = 12;

const MAX_MEMORY_POSTS = 500;

export type OrgPost = {
  id: string;
  slug: string;
  kind: OrgPostKind;
  titleEn: string;
  titleHi: string | null;
  summaryEn: string;
  summaryHi: string | null;
  bodyEn: string;
  bodyHi: string | null;
  coverIllustration: IllustrationName | null;
  coverImagePath: string | null;
  attachmentUrl: string | null;
  attachmentLabel: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  tags: string[];
  authorDisplayName: string;
  status: OrgPostStatus;
  publishedAt: string | null;
  consentRecorded: boolean;
  anonymised: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Slug from a title: lowercase, hyphen-separated, no noise characters. */
export function slugifyOrgTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || `post-${Date.now().toString(36)}`;
}

const illustrationNames = Object.keys(SIZES) as IllustrationName[];
const illustrationEnum = z.enum(illustrationNames as [IllustrationName, ...IllustrationName[]]);

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

// Shared post fields; create and update wrap this with what each needs.
const postFields = {
  slug: text(2, 80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_format").optional(),
  kind: z.enum(ORG_POST_KINDS),
  titleEn: text(2, 160),
  titleHi: text(2, 160).optional(),
  summaryEn: text(10, 600),
  summaryHi: text(10, 600).optional(),
  bodyEn: z.string().min(1).max(60_000),
  bodyHi: z.string().max(60_000).optional(),
  coverIllustration: illustrationEnum.optional(),
  coverImagePath: text(1, 300).regex(/^\//, "own_path").optional(),
  attachmentUrl: text(1, 300).optional(),
  attachmentLabel: text(1, 120).optional(),
  ctaLabel: text(2, 60).optional(),
  ctaUrl: z.string().trim().max(500).optional(),
  tags: z.array(text(2, 30)).max(8).default([]),
  authorDisplayName: text(2, 80),
  consentRecorded: z.boolean().default(false),
  anonymised: z.boolean().default(false),
};

function checkInvariants(
  post: { coverIllustration?: string; coverImagePath?: string; ctaLabel?: string; ctaUrl?: string },
  ctx: z.RefinementCtx,
) {
  if (post.coverIllustration && post.coverImagePath) {
    ctx.addIssue({ code: "custom", message: "one_cover_only", path: ["coverImagePath"] });
  }
  if (Boolean(post.ctaLabel) !== Boolean(post.ctaUrl)) {
    ctx.addIssue({ code: "custom", message: "cta_needs_both", path: ["ctaUrl"] });
  }
  if (post.ctaUrl && !/^https?:\/\//i.test(post.ctaUrl) && !post.ctaUrl.startsWith("/")) {
    ctx.addIssue({ code: "custom", message: "cta_url_scheme", path: ["ctaUrl"] });
  }
}

export const orgPostSchema = z.object(postFields).strict().superRefine(checkInvariants);

export const orgPostUpdateSchema = z
  .object({ ...postFields, status: z.enum(ORG_POST_STATUSES).optional() })
  .strict()
  .superRefine(checkInvariants);

function devNoDb() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

/** Local development and tests without a database keep posts here, capped. */
export const orgPosts: OrgPost[] = [];

function remember(post: OrgPost) {
  orgPosts.push(post);
  if (orgPosts.length > MAX_MEMORY_POSTS) {
    orgPosts.splice(0, orgPosts.length - MAX_MEMORY_POSTS);
  }
}

function rowToPost(row: Record<string, unknown>): OrgPost {
  return {
    id: row.id as string,
    slug: row.slug as string,
    kind: row.kind as OrgPostKind,
    titleEn: row.titleEn as string,
    titleHi: (row.titleHi as string | null) ?? null,
    summaryEn: row.summaryEn as string,
    summaryHi: (row.summaryHi as string | null) ?? null,
    bodyEn: row.bodyEn as string,
    bodyHi: (row.bodyHi as string | null) ?? null,
    coverIllustration: (row.coverIllustration as IllustrationName | null) ?? null,
    coverImagePath: (row.coverImagePath as string | null) ?? null,
    attachmentUrl: (row.attachmentUrl as string | null) ?? null,
    attachmentLabel: (row.attachmentLabel as string | null) ?? null,
    ctaLabel: (row.ctaLabel as string | null) ?? null,
    ctaUrl: (row.ctaUrl as string | null) ?? null,
    tags: (row.tags as string[]) ?? [],
    authorDisplayName: row.authorDisplayName as string,
    status: row.status as OrgPostStatus,
    publishedAt: row.publishedAt ? new Date(row.publishedAt as string).toISOString() : null,
    consentRecorded: Boolean(row.consentRecorded),
    anonymised: Boolean(row.anonymised),
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  if (devNoDb()) {
    return orgPosts.some((post) => post.slug === slug && post.id !== exceptId);
  }
  const { db } = await import("@/lib/db");
  const existing = await db.orgPost.findFirst({ where: { slug }, select: { id: true } });
  return Boolean(existing && existing.id !== exceptId);
}

export async function createOrgPost(
  input: z.infer<typeof orgPostSchema>,
  actorId: string,
): Promise<{ ok: true; post: OrgPost } | { ok: false; error: "slug_taken" }> {
  const slug = input.slug ?? slugifyOrgTitle(input.titleEn);
  if (await slugTaken(slug)) return { ok: false, error: "slug_taken" };
  const now = new Date().toISOString();
  let post: OrgPost;
  if (devNoDb()) {
    post = {
      id: randomUUID(),
      slug,
      kind: input.kind,
      titleEn: input.titleEn,
      titleHi: input.titleHi ?? null,
      summaryEn: input.summaryEn,
      summaryHi: input.summaryHi ?? null,
      bodyEn: input.bodyEn,
      bodyHi: input.bodyHi ?? null,
      coverIllustration: input.coverIllustration ?? null,
      coverImagePath: input.coverImagePath ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentLabel: input.attachmentLabel ?? null,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      tags: [...new Set(input.tags)],
      authorDisplayName: input.authorDisplayName,
      status: "DRAFT",
      publishedAt: null,
      consentRecorded: input.consentRecorded,
      anonymised: input.anonymised,
      createdAt: now,
      updatedAt: now,
    };
    remember(post);
  } else {
    const { db } = await import("@/lib/db");
    try {
      const row = await db.orgPost.create({
        data: {
          slug,
          kind: input.kind,
          titleEn: input.titleEn,
          titleHi: input.titleHi ?? null,
          summaryEn: input.summaryEn,
          summaryHi: input.summaryHi ?? null,
          bodyEn: input.bodyEn,
          bodyHi: input.bodyHi ?? null,
          coverIllustration: input.coverIllustration ?? null,
          coverImagePath: input.coverImagePath ?? null,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentLabel: input.attachmentLabel ?? null,
          ctaLabel: input.ctaLabel ?? null,
          ctaUrl: input.ctaUrl ?? null,
          tags: [...new Set(input.tags)],
          authorDisplayName: input.authorDisplayName,
          consentRecorded: input.consentRecorded,
          anonymised: input.anonymised,
        },
      });
      post = rowToPost(row);
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "slug_taken" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_POST_SAVED",
    entityType: "OrgPost",
    entityId: post.id,
    actorId,
    data: { action: "created", slug: post.slug, kind: post.kind },
  });
  return { ok: true, post };
}

export async function updateOrgPost(
  id: string,
  input: z.infer<typeof orgPostUpdateSchema>,
  actorId: string,
): Promise<{ ok: true; post: OrgPost } | { ok: false; error: "post_not_found" | "slug_taken" }> {
  const slug = input.slug ?? slugifyOrgTitle(input.titleEn);
  if (await slugTaken(slug, id)) return { ok: false, error: "slug_taken" };
  const fields = {
    slug,
    kind: input.kind,
    titleEn: input.titleEn,
    titleHi: input.titleHi ?? null,
    summaryEn: input.summaryEn,
    summaryHi: input.summaryHi ?? null,
    bodyEn: input.bodyEn,
    bodyHi: input.bodyHi ?? null,
    coverIllustration: input.coverIllustration ?? null,
    coverImagePath: input.coverImagePath ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentLabel: input.attachmentLabel ?? null,
    ctaLabel: input.ctaLabel ?? null,
    ctaUrl: input.ctaUrl ?? null,
    tags: [...new Set(input.tags)],
    authorDisplayName: input.authorDisplayName,
    consentRecorded: input.consentRecorded,
    anonymised: input.anonymised,
  };
  let post: OrgPost | null;
  if (devNoDb()) {
    const current = orgPosts.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "post_not_found" };
    Object.assign(current, fields, { updatedAt: new Date().toISOString() });
    post = current;
  } else {
    const { db } = await import("@/lib/db");
    try {
      const row = await db.orgPost.update({ where: { id }, data: fields });
      post = rowToPost(row);
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return { ok: false, error: "post_not_found" };
      if ((err as { code?: string }).code === "P2002") return { ok: false, error: "slug_taken" };
      throw err;
    }
  }
  await writeAuditLog({
    eventType: "ORG_POST_SAVED",
    entityType: "OrgPost",
    entityId: id,
    actorId,
    data: { action: "updated", slug: post.slug, kind: post.kind },
  });
  return { ok: true, post };
}

/**
 * Publish, unpublish or archive. A case study can only be published once
 * consent is recorded and the story is anonymised; the admin form explains
 * the refusal with the same error code.
 */
export async function setOrgPostStatus(
  id: string,
  status: OrgPostStatus,
  actorId: string,
): Promise<
  | { ok: true; post: OrgPost }
  | { ok: false; error: "post_not_found" | "case_study_checks_required" }
> {
  const eventType =
    status === "PUBLISHED" ? "ORG_POST_PUBLISHED" : status === "ARCHIVED" ? "ORG_POST_ARCHIVED" : "ORG_POST_UNPUBLISHED";
  if (devNoDb()) {
    const current = orgPosts.find((entry) => entry.id === id);
    if (!current) return { ok: false, error: "post_not_found" };
    if (status === "PUBLISHED" && current.kind === "CASE_STUDY" && !(current.consentRecorded && current.anonymised)) {
      return { ok: false, error: "case_study_checks_required" };
    }
    current.status = status;
    if (status === "PUBLISHED" && !current.publishedAt) current.publishedAt = new Date().toISOString();
    current.updatedAt = new Date().toISOString();
    await writeAuditLog({ eventType, entityType: "OrgPost", entityId: id, actorId, data: { slug: current.slug, kind: current.kind } });
    return { ok: true, post: current };
  }
  const { db } = await import("@/lib/db");
  const row = await db.orgPost.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "post_not_found" };
  if (status === "PUBLISHED" && row.kind === "CASE_STUDY" && !(row.consentRecorded && row.anonymised)) {
    return { ok: false, error: "case_study_checks_required" };
  }
  const publishedAt = status === "PUBLISHED" ? row.publishedAt ?? new Date() : row.publishedAt;
  const updated = await db.orgPost.update({ where: { id }, data: { status, publishedAt } });
  await writeAuditLog({
    eventType,
    entityType: "OrgPost",
    entityId: id,
    actorId,
    data: { slug: updated.slug, kind: updated.kind },
  });
  return { ok: true, post: rowToPost(updated) };
}

/** Only a draft can be deleted; published history is archived, not erased. */
export async function deleteOrgPostDraft(id: string, actorId: string): Promise<{ ok: true } | { ok: false; error: "post_not_found" | "not_a_draft" }> {
  if (devNoDb()) {
    const index = orgPosts.findIndex((entry) => entry.id === id);
    if (index === -1) return { ok: false, error: "post_not_found" };
    if (orgPosts[index].status !== "DRAFT") return { ok: false, error: "not_a_draft" };
    const [removed] = orgPosts.splice(index, 1);
    await writeAuditLog({ eventType: "ORG_POST_DELETED", entityType: "OrgPost", entityId: id, actorId, data: { slug: removed.slug } });
    return { ok: true };
  }
  const { db } = await import("@/lib/db");
  const removed = await db.orgPost.deleteMany({ where: { id, status: "DRAFT" } });
  if (removed.count === 0) {
    const exists = await db.orgPost.findUnique({ where: { id }, select: { status: true } });
    return { ok: false, error: exists ? "not_a_draft" : "post_not_found" };
  }
  await writeAuditLog({ eventType: "ORG_POST_DELETED", entityType: "OrgPost", entityId: id, actorId, data: { id } });
  return { ok: true };
}

export async function getOrgPostById(id: string): Promise<OrgPost | null> {
  if (devNoDb()) return orgPosts.find((entry) => entry.id === id) ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.orgPost.findUnique({ where: { id } });
  return row ? rowToPost(row) : null;
}

export async function getPublishedOrgPostBySlug(slug: string): Promise<OrgPost | null> {
  if (devNoDb()) return orgPosts.find((entry) => entry.slug === slug && entry.status === "PUBLISHED") ?? null;
  const { db } = await import("@/lib/db");
  const row = await db.orgPost.findFirst({ where: { slug, status: "PUBLISHED" } });
  return row ? rowToPost(row) : null;
}

export type OrgPostPage = {
  posts: OrgPost[];
  total: number;
  page: number;
  perPage: number;
};

export async function listPublishedOrgPosts(options: { kind?: OrgPostKind; page?: number; perPage?: number } = {}): Promise<OrgPostPage> {
  const perPage = Math.max(1, options.perPage ?? NEWS_PAGE_SIZE);
  const page = Math.max(1, options.page ?? 1);
  const published = (await allPublishedOrgPosts(options.kind)).sort(
    (a, b) =>
      (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  const start = (page - 1) * perPage;
  return { posts: published.slice(start, start + perPage), total: published.length, page, perPage };
}

async function allPublishedOrgPosts(kind?: OrgPostKind): Promise<OrgPost[]> {
  if (devNoDb()) return orgPosts.filter((entry) => entry.status === "PUBLISHED" && (!kind || entry.kind === kind));
  const { db } = await import("@/lib/db");
  const rows = await db.orgPost.findMany({
    where: { status: "PUBLISHED", ...(kind ? { kind } : {}) },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(rowToPost);
}

/** Same kind, published, excluding the post itself, newest first. */
export async function relatedOrgPosts(post: OrgPost, limit = 3): Promise<OrgPost[]> {
  const same = (await allPublishedOrgPosts(post.kind)).filter((entry) => entry.id !== post.id);
  return same
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, limit);
}

export async function listOrgPostsForAdmin(options: { kind?: OrgPostKind; status?: OrgPostStatus } = {}): Promise<OrgPost[]> {
  if (devNoDb()) {
    return orgPosts
      .filter((entry) => (!options.kind || entry.kind === options.kind) && (!options.status || entry.status === options.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const { db } = await import("@/lib/db");
  const rows = await db.orgPost.findMany({
    where: { ...(options.kind ? { kind: options.kind } : {}), ...(options.status ? { status: options.status } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(rowToPost);
}

/** Case studies for the Stories strip on /get-involved (56.8). */
export async function listPublishedCaseStudies(limit = 3): Promise<OrgPost[]> {
  const page = await listPublishedOrgPosts({ kind: "CASE_STUDY", page: 1, perPage: limit });
  return page.posts;
}
