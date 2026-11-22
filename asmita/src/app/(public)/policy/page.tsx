import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedOrgPosts } from "@/lib/org-posts";

// Policy and advocacy (docs/org/spec.md, WP58 58.1): what we push for, the
// placeholder priority cards the owner will replace, the policy papers and
// the campaigns. Read mode: plain sections, no hero button.

export const metadata: Metadata = {
  title: "Policy and advocacy",
  description: "What Meri Asmita advocates for: our priorities, policy papers, submissions and campaigns.",
  alternates: { canonical: "/policy" },
};

const PRIORITY_KEYS = [1, 2, 3, 4] as const;

export default async function PolicyPage() {
  const locale = await getLocale();
  const [papers, campaigns] = await Promise.all([
    listPublishedOrgPosts({ kind: "POLICY", perPage: 24 }),
    listPublishedOrgPosts({ kind: "CAMPAIGN", perPage: 24 }),
  ]);

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.policy.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.policy.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.policy.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                {t(locale, "org.policy.sub")}
              </p>
            </div>
            <Illustration name="page-legal" eager className="page-hero-art" />
          </div>
        </section>

        {/* Placeholder priority cards, clearly marked; the owner replaces them. */}
        <section className="zone-white section-pad" aria-labelledby="policy-priorities">
          <div className="container">
            <h2 className="section-title" id="policy-priorities">
              {t(locale, "org.policy.prioritiesTitle")}
            </h2>
            <p className="muted mx-auto mt-4 max-w-2xl text-center text-sm">{t(locale, "org.policy.prioritiesNote")}</p>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {PRIORITY_KEYS.map((key) => (
                <div key={key} className="rounded-[var(--radius-box)] surface-card p-7">
                  <h3 className="text-[20px] font-semibold text-[var(--ink)]">
                    {t(locale, `org.policy.priority.${key}.title` as Parameters<typeof t>[1])}
                  </h3>
                  <p className="mt-3 text-[16px] leading-[1.65] text-[var(--text)]">
                    {t(locale, `org.policy.priority.${key}.body` as Parameters<typeof t>[1])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="policy-papers">
          <div className="transform-content container section-pad">
            <h2 className="section-title" id="policy-papers">
              {t(locale, "org.policy.papersTitle")}
            </h2>
            {papers.posts.length === 0 ? (
              <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h3 className="text-[18px] font-medium">{t(locale, "org.policy.papersEmpty")}</h3>
                <p className="mt-3 text-[16px] leading-[1.65] text-[var(--text)]">
                  {t(locale, "org.policy.papersEmptyBody")}
                </p>
              </div>
            ) : (
              <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {papers.posts.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} showAttachment />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="policy-campaigns">
          <div className="container">
            <h2 className="section-title" id="policy-campaigns">
              {t(locale, "org.policy.campaignsTitle")}
            </h2>
            {campaigns.posts.length === 0 ? (
              <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h3 className="text-[18px] font-medium">{t(locale, "org.policy.campaignsEmpty")}</h3>
                <p className="mt-3 text-[16px] leading-[1.65] text-[var(--text)]">
                  {t(locale, "org.policy.campaignsEmptyBody")}
                </p>
              </div>
            ) : (
              <div className="mt-10 grid gap-6 md:grid-cols-2">
                {campaigns.posts.map((post) => {
                  const title = locale === "hi" && post.titleHi ? post.titleHi : post.titleEn;
                  const summary = locale === "hi" && post.summaryHi ? post.summaryHi : post.summaryEn;
                  return (
                    <article key={post.id} className="card p-7">
                      <h3 className="text-[20px] font-semibold">
                        <Link href={`/policy/${post.slug}`} className="hover:text-[var(--brand-strong)]">
                          {title}
                        </Link>
                      </h3>
                      <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{summary}</p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Link className="btn btn-secondary btn-arrow !m-0" href={`/policy/${post.slug}`}>
                          {t(locale, "reading.more")}
                        </Link>
                        {post.ctaLabel && post.ctaUrl && (
                          <a className="btn btn-secondary btn-arrow !m-0" href={post.ctaUrl} rel="noopener noreferrer">
                            {post.ctaLabel}
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="zone-sunset" aria-label={t(locale, "org.press.eyebrow")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">{t(locale, "org.press.title")}</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/press">
                  {t(locale, "org.press.eyebrow")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/news">
                  {t(locale, "org.news.title")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
