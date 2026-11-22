import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { PostCard, orgPostKindLabel } from "@/components/org/PostCard";
import { NEWS_PAGE_SIZE, ORG_POST_KINDS, listPublishedOrgPosts, type OrgPostKind } from "@/lib/org-posts";

// All published posts, newest first, with kind filter chips and pagination
// (12 per page). Honest empty state while nothing is published yet.

export const metadata: Metadata = {
  title: "News",
  description: "News, stories, research, policy notes and campaigns from Meri Asmita.",
  alternates: { types: { "application/rss+xml": "/news/rss.xml" } },
};

const KIND_QUERY: Record<string, OrgPostKind> = Object.fromEntries(ORG_POST_KINDS.map((kind) => [kind.toLowerCase().replace(/_/g, "-"), kind]));

export default async function NewsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const raw = (await searchParams) || {};
  const kindParam = typeof raw.kind === "string" ? raw.kind : "";
  const kind = KIND_QUERY[kindParam];
  const page = Math.max(1, Number.parseInt(typeof raw.page === "string" ? raw.page : "1", 10) || 1);
  const result = await listPublishedOrgPosts({ kind, page, perPage: NEWS_PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));

  const filterHref = (filterKind?: OrgPostKind) => (filterKind ? `/news?kind=${filterKind.toLowerCase().replace(/_/g, "-")}` : "/news");

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.news.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.news.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.news.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.news.sub")}</p>
            </div>
            <Illustration name="page-research" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={t(locale, "org.news.title")}>
          <div className="container">
            {/* Kind filter chips */}
            <nav aria-label={t(locale, "org.news.filterAll")} className="flex flex-wrap justify-center gap-3">
              <Link
                href="/news"
                aria-current={!kind ? "page" : undefined}
                className={`pill hover:border-[var(--brand)] ${!kind ? "border-[var(--brand)] bg-[var(--brand-soft)]" : ""}`}
              >
                {t(locale, "org.news.filterAll")}
              </Link>
              {ORG_POST_KINDS.map((entry) => (
                <Link
                  key={entry}
                  href={filterHref(entry)}
                  aria-current={kind === entry ? "page" : undefined}
                  className={`pill hover:border-[var(--brand)] ${kind === entry ? "border-[var(--brand)] bg-[var(--brand-soft)]" : ""}`}
                >
                  {orgPostKindLabel(locale, entry)}
                </Link>
              ))}
            </nav>

            {result.posts.length === 0 ? (
              <div className="mx-auto mt-12 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h2 className="section-title">{t(locale, "org.news.emptyTitle")}</h2>
                <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.65] text-[var(--text)]">{t(locale, "org.news.emptyBody")}</p>
              </div>
            ) : (
              <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {result.posts.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <nav
                className="mt-12 flex items-center justify-center gap-4"
                aria-label={t(locale, "org.news.pageLabel").replace("{n}", String(page)).replace("{total}", String(totalPages))}
              >
                {page > 1 && (
                  <Link className="pill hover:border-[var(--brand)]" href={`/news?${kind ? `kind=${kindParam}&` : ""}page=${page - 1}`}>
                    {t(locale, "org.news.prevPage")}
                  </Link>
                )}
                <span className="muted text-sm">
                  {t(locale, "org.news.pageLabel").replace("{n}", String(page)).replace("{total}", String(totalPages))}
                </span>
                {page < totalPages && (
                  <Link className="pill hover:border-[var(--brand)]" href={`/news?${kind ? `kind=${kindParam}&` : ""}page=${page + 1}`}>
                    {t(locale, "org.news.nextPage")}
                  </Link>
                )}
              </nav>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
