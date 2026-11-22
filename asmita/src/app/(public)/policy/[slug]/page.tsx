import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostDetail } from "@/components/org/PostDetail";
import { getPublishedOrgPostBySlug, relatedOrgPosts } from "@/lib/org-posts";

// One published policy paper or campaign (docs/org/spec.md, WP58 58.1). It
// reuses the /news/[slug] layout (PostDetail) with the policy section's own
// back link. Other kinds of posts stay under /news.

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");

async function policyPost(slug: string) {
  const post = await getPublishedOrgPostBySlug(slug);
  if (!post) return null;
  return post.kind === "POLICY" || post.kind === "CAMPAIGN" ? post : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await policyPost(slug);
  if (!post) return { title: "Not found" };
  const locale = await getLocale();
  const title = locale === "hi" && post.titleHi ? post.titleHi : post.titleEn;
  const description = locale === "hi" && post.summaryHi ? post.summaryHi : post.summaryEn;
  const image = post.coverImagePath ?? "/opengraph-image.png";
  return {
    title,
    description,
    alternates: { canonical: `/policy/${post.slug}` },
    openGraph: { title, description, type: "article", url: `${siteUrl()}/policy/${post.slug}`, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PolicyPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await policyPost(slug);
  if (!post) notFound();
  const locale = await getLocale();
  const related = await relatedOrgPosts(post, 3);
  return (
    <AppShell>
      <PostDetail
        post={post}
        locale={locale}
        related={related}
        url={`${siteUrl()}/policy/${post.slug}`}
        tocLabel={t(locale, "org.post.tocLabel")}
        listHref="/policy"
        listLabel={t(locale, "org.policy.backTitle")}
      />
    </AppShell>
  );
}
