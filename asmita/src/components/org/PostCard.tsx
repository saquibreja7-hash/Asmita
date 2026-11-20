import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { OrgPost, OrgPostKind } from "@/lib/org-posts";

// A card for one org post on /news, the related strip, and the Stories
// strip on /get-involved. Parchment card, kind pill, title, summary, date.

const KIND_LABEL_KEY: Record<OrgPostKind, Parameters<typeof t>[1]> = {
  NEWS: "org.news.kind.news",
  CASE_STUDY: "org.news.kind.caseStudy",
  POLICY: "org.news.kind.policy",
  CAMPAIGN: "org.news.kind.campaign",
  RESEARCH: "org.news.kind.research",
  LAB_NOTE: "org.news.kind.labNote",
  PRESS: "org.news.kind.press",
};

/** The public label for a post kind, shared by the list chips and cards. */
export function orgPostKindLabel(locale: Locale, kind: OrgPostKind) {
  return t(locale, KIND_LABEL_KEY[kind]);
}

const when = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

export function PostCard({ post, locale, heading }: { post: OrgPost; locale: Locale; heading?: "h2" | "h3" }) {
  const Tag = heading ?? "h3";
  const title = locale === "hi" && post.titleHi ? post.titleHi : post.titleEn;
  const summary = locale === "hi" && post.summaryHi ? post.summaryHi : post.summaryEn;
  const published = post.publishedAt ?? post.createdAt;
  return (
    <article className="card p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill">{orgPostKindLabel(locale, post.kind)}</span>
        <time className="muted text-sm" dateTime={published}>
          {when(published, locale)}
        </time>
      </div>
      <Tag className="mt-4 text-[20px] font-semibold">
        <Link href={`/news/${post.slug}`} className="hover:text-[var(--brand-strong)]">
          {title}
        </Link>
      </Tag>
      <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{summary}</p>
      <Link className="arrow-link mt-5" href={`/news/${post.slug}`}>
        {t(locale, "reading.more")}
      </Link>
    </article>
  );
}
