import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedOrgPosts, type OrgPost } from "@/lib/org-posts";

// Press (docs/org/spec.md, WP58 58.4): press releases, coverage that links
// out, the media contact and kit, and the house rules we ask journalists to
// follow when covering image-based abuse. Read mode.

export const metadata: Metadata = {
  title: "Press",
  description: "Press releases, media coverage, the media kit, and guidance for reporting on image-based abuse.",
  alternates: { canonical: "/press" },
};

/** Coverage rows are PRESS posts that point at an external article. */
function isCoverage(post: OrgPost) {
  return Boolean(post.ctaUrl && /^https?:\/\//i.test(post.ctaUrl));
}

export default async function PressPage() {
  const locale = await getLocale();
  const releases = await listPublishedOrgPosts({ kind: "PRESS", perPage: 24 });
  const coverage = releases.posts.filter(isCoverage);
  const statements = releases.posts.filter((post) => !isCoverage(post));

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.press.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.press.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.press.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                {t(locale, "org.press.sub")}
              </p>
            </div>
            <Illustration name="page-about" eager className="page-hero-art" />
          </div>
        </section>

        {/* Press releases */}
        <section className="zone-white section-pad" aria-labelledby="press-releases">
          <div className="container">
            <h2 className="section-title" id="press-releases">
              {t(locale, "org.press.releasesTitle")}
            </h2>
            {statements.length === 0 ? (
              <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h3 className="text-[18px] font-medium">{t(locale, "org.press.releasesEmpty")}</h3>
                <p className="mt-3 text-[16px] leading-[1.65] text-[var(--text)]">
                  {t(locale, "org.press.releasesEmptyBody")}
                </p>
              </div>
            ) : (
              <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {statements.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* In the news: coverage links out to the publisher */}
        <section className="transform-section" aria-labelledby="press-coverage">
          <div className="transform-content container section-pad">
            <h2 className="section-title" id="press-coverage">
              {t(locale, "org.press.inNewsTitle")}
            </h2>
            {coverage.length === 0 ? (
              <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h3 className="text-[18px] font-medium">{t(locale, "org.press.inNewsEmpty")}</h3>
                <p className="mt-3 text-[16px] leading-[1.65] text-[var(--text)]">
                  {t(locale, "org.press.inNewsEmptyBody")}
                </p>
              </div>
            ) : (
              <ul className="mt-10 grid gap-4">
                {coverage.map((post) => {
                  const title = locale === "hi" && post.titleHi ? post.titleHi : post.titleEn;
                  const summary = locale === "hi" && post.summaryHi ? post.summaryHi : post.summaryEn;
                  return (
                    <li key={post.id} className="rounded-[var(--radius-box)] surface-card p-7">
                      <h3 className="text-[18px] font-medium">
                        <a href={post.ctaUrl ?? "#"} rel="noopener noreferrer" className="hover:text-[var(--brand-strong)]">
                          {title}
                        </a>
                      </h3>
                      <p className="mt-2 text-sm leading-[1.65] text-[var(--text)]">{summary}</p>
                      <a className="arrow-link mt-3" href={post.ctaUrl ?? "#"} rel="noopener noreferrer">
                        {post.ctaLabel ?? t(locale, "reading.more")}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Media contact, kit, boilerplate */}
        <section className="zone-white section-pad" aria-labelledby="press-contact">
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
              <div className="rounded-[var(--radius-box)] surface-card p-7">
                <h2 className="text-[18px] font-medium text-[var(--ink)]" id="press-contact">
                  {t(locale, "org.press.contactTitle")}
                </h2>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{t(locale, "org.press.contactBody")}</p>
              </div>
              <div className="rounded-[var(--radius-box)] surface-card p-7">
                <h2 className="text-[18px] font-medium text-[var(--ink)]">{t(locale, "org.press.kitTitle")}</h2>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{t(locale, "org.press.kitIntro")}</p>
                <ul className="mt-4 grid gap-2">
                  {(
                    [
                      ["/asmita-logo-square.png", "org.press.kitLogoSquare"],
                      ["/asmita-logo.png", "org.press.kitLogoFull"],
                      ["/asmita-wordmark-v2.png", "org.press.kitWordmark"],
                    ] as const
                  ).map(([file, labelKey]) => (
                    <li key={file}>
                      <a className="arrow-link" download href={file}>
                        {t(locale, labelKey)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mx-auto mt-4 max-w-5xl rounded-[var(--radius-box)] surface-card p-7">
              <h2 className="text-[18px] font-medium text-[var(--ink)]">{t(locale, "org.press.aboutTitle")}</h2>
              <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{t(locale, "org.press.aboutBody")}</p>
            </div>
          </div>
        </section>

        {/* Reporting guidance */}
        <section className="transform-section" aria-labelledby="press-guidance">
          <div className="transform-content container section-pad">
            <h2 className="section-title" id="press-guidance">
              {t(locale, "org.press.guidanceTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[16px] leading-[1.65] text-[var(--text)]">
              {t(locale, "org.press.guidanceIntro")}
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {(["g1", "g2", "g3"] as const).map((item) => (
                <div key={item} className="rounded-[var(--radius-box)] surface-card p-7">
                  <h3 className="text-[18px] font-medium text-[var(--ink)]">
                    {t(locale, `org.press.${item}.title` as Parameters<typeof t>[1])}
                  </h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">
                    {t(locale, `org.press.${item}.body` as Parameters<typeof t>[1])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
