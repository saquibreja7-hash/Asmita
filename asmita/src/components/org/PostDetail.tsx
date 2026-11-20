import Link from "next/link";
import { Illustration } from "@/components/Illustration";
import { Callout, ReadingLayout } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";
import { t, type Locale } from "@/lib/i18n";
import { extractMarkdownHeadings, renderMarkdown } from "@/lib/markdown";
import { PostCard, orgPostKindLabel } from "@/components/org/PostCard";
import { ShareLinks } from "@/components/org/ShareLinks";
import type { OrgPost } from "@/lib/org-posts";

// The shared post layout (docs/org/spec.md, 56.1): the reading column with
// a contents rail, the safe markdown renderer, Hindi fallback per field,
// the campaign call-to-action, the attachment link, share links and
// related posts of the same kind. /news/[slug] renders it directly and
// /policy/[slug] (WP58) will reuse it.

const when = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

export function PostDetail({
  post,
  locale,
  related,
  url,
  tocLabel,
}: {
  post: OrgPost;
  locale: Locale;
  related: OrgPost[];
  url: string;
  tocLabel: string;
}) {
  const inHindi = locale === "hi";
  const hasHindi = Boolean(post.titleHi && post.summaryHi && post.bodyHi);
  const title = inHindi && post.titleHi ? post.titleHi : post.titleEn;
  const summary = inHindi && post.summaryHi ? post.summaryHi : post.summaryEn;
  const body = inHindi && post.bodyHi ? post.bodyHi : post.bodyEn;
  const published = post.publishedAt ?? post.createdAt;
  const headings = extractMarkdownHeadings(body);

  return (
    <div className="page-canvas">
      <section className="hero" aria-label={title}>
        <div className="hero-content container page-hero">
          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow">{orgPostKindLabel(locale, post.kind)}</span>
            <h1 className="page-title mt-5">{title}</h1>
            <p className="muted mt-4 text-sm">
              {t(locale, "org.post.byPrefix")}
              {post.authorDisplayName} · <time dateTime={published}>{when(published, locale)}</time>
              <ReadingTime label={t(locale, "reading.minutes")} />
            </p>
            <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{summary}</p>
          </div>
        </div>
      </section>

      {post.coverIllustration && (
        <div className="container -mt-8 mb-4">
          <Illustration name={post.coverIllustration} className="mx-auto max-w-2xl rounded-[var(--radius-box)]" />
        </div>
      )}
      {post.coverImagePath && (
        <div className="container -mt-8 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.coverImagePath} alt="" className="mx-auto max-w-2xl rounded-[var(--radius-box)]" />
        </div>
      )}

      <ReadingLayout tocLabel={tocLabel} toc={headings.map((heading) => ({ id: heading.id, title: heading.title }))}>
        {inHindi && !hasHindi && (
          <Callout>
            <p className="text-[15px]">{t(locale, "org.post.notInHindi")}</p>
          </Callout>
        )}

        <div className="reading-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />

        {post.tags.length > 0 && (
          <p className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </p>
        )}

        {(post.attachmentUrl || (post.ctaLabel && post.ctaUrl)) && (
          <div className="mt-8 flex flex-wrap gap-3">
            {post.attachmentUrl && (
              <a
                className="btn btn-secondary btn-arrow !m-0"
                href={post.attachmentUrl}
                rel="noopener noreferrer"
                download
              >
                {post.attachmentLabel ?? t(locale, "org.post.attachment")}
              </a>
            )}
            {post.ctaLabel && post.ctaUrl && (
              <a className="btn btn-primary btn-arrow !m-0" href={post.ctaUrl} rel="noopener noreferrer">
                {post.ctaLabel}
              </a>
            )}
          </div>
        )}

        <ShareLinks locale={locale} url={url} title={title} />
      </ReadingLayout>

      {related.length > 0 && (
        <section className="zone-white section-pad" aria-label={t(locale, "org.post.related")}>
          <div className="container">
            <h2 className="section-title">{t(locale, "org.post.related")}</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {related.map((entry) => (
                <PostCard key={entry.id} post={entry} locale={locale} />
              ))}
            </div>
            <p className="mt-10 text-center">
              <Link className="btn btn-secondary btn-arrow !m-0" href="/news">
                {t(locale, "org.post.notFoundCta")}
              </Link>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
