import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostDetail } from "@/components/org/PostDetail";
import { getPublishedOrgPostBySlug, orgPostHref, relatedOrgPosts } from "@/lib/org-posts";

// One published post. Drafts and archived posts are never reachable from
// here. OpenGraph meta carries the cover image when there is one. Policy
// and campaign posts also live at /policy/[slug] (WP58), which is their
// canonical URL; this page still renders them for every link already shared.

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedOrgPostBySlug(slug);
  if (!post) return { title: "Not found" };
  const locale = await getLocale();
  const title = locale === "hi" && post.titleHi ? post.titleHi : post.titleEn;
  const description = locale === "hi" && post.summaryHi ? post.summaryHi : post.summaryEn;
  const image = post.coverImagePath ?? "/opengraph-image.png";
  return {
    title,
    description,
    // Policy and campaign posts canonicalise to /policy/[slug] (WP58).
    alternates: { canonical: orgPostHref(post) },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteUrl()}${orgPostHref(post)}`,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedOrgPostBySlug(slug);
  if (!post) notFound();
  const locale = await getLocale();
  const related = await relatedOrgPosts(post, 3);
  return (
    <AppShell>
      <PostDetail
        post={post}
        locale={locale}
        related={related}
        url={`${siteUrl()}/news/${post.slug}`}
        tocLabel={t(locale, "org.post.tocLabel")}
      />
    </AppShell>
  );
}
