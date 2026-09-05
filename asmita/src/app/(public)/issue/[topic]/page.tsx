import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getIssueTopic, issueTopics } from "@/lib/issue-content";

export function generateStaticParams() {
  return issueTopics.map((t) => ({ topic: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic } = await params;
  const data = getIssueTopic(topic);
  if (!data) return { title: "The issue" };
  return { title: data.term, description: data.short };
}

export default async function IssueTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const data = getIssueTopic(topic);
  if (!data) notFound();

  const others = issueTopics.filter((t) => t.slug !== data.slug).slice(0, 3);

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={data.term}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/issue" className="text-link font-medium">
                  The issue
                </Link>
              </p>
              <h1 className="font-display mt-4 text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.08] text-[var(--heading)]">
                {data.title}
              </h1>
              <p className="font-size-large mt-6 text-[var(--theme-color-2)]">
                {data.definition}
              </p>
            </div>
          </div>
        </section>

        {/* BODY */}
        <section className="zone-white section-pad !pt-4" aria-label="Details">
          <div className="container">
            <div className="mx-auto grid max-w-4xl gap-12 lg:grid-cols-[1.4fr_1fr]">
              {/* What it looks like */}
              <div>
                <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]">
                  What it can look like
                </h2>
                <ul className="mt-6 space-y-4">
                  {data.looksLike.map((ex) => (
                    <li
                      key={ex}
                      className="flex gap-3 text-[16px] leading-[1.6] text-[var(--body)]"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-off-black)]" aria-hidden />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>

              {/* What you can do */}
              <aside className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-7 h-fit">
                <h2 className="font-display text-[1.25rem] font-medium">
                  What you can do
                </h2>
                <p className="mt-4 text-[15px] leading-[1.65] text-[var(--body)]">
                  {data.whatToDo}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]" href="/get-help">
                    Get help
                  </Link>
                  <Link className="btn btn-secondary !m-0 !min-h-[44px] !text-[15px]" href="/glossary">
                    Glossary of terms
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* RELATED */}
        <section className="transform-section" aria-labelledby="related-heading">
          <div className="transform-content container section-pad">
            <h2
              id="related-heading"
              className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]"
            >
              Read about other forms of abuse
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {others.map((t) => (
                <Link
                  key={t.slug}
                  href={`/issue/${t.slug}`}
                  className="group flex flex-col rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm transition hover:bg-[var(--color-parchment)]"
                >
                  <h3 className="text-[16px] font-medium leading-snug text-[var(--heading)]">
                    {t.term}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-[1.55] text-[var(--muted)]">
                    {t.short}
                  </p>
                  <span className="mt-3 inline-block text-sm font-medium text-[var(--color-off-black)]">
                    Learn more{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
