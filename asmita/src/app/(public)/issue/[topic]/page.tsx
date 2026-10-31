import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getIssueTopic, issueTopics } from "@/lib/issue-content";
import { issueContentHi } from "@/lib/issue-content-hi";
import { getLocale } from "@/lib/get-locale";

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
  if (await getLocale() === "hi") {
    const translated = issueContentHi[data.slug as keyof typeof issueContentHi];
    return { title: translated.title, description: translated.short };
  }
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
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const content = locale === "hi" ? issueContentHi[data.slug as keyof typeof issueContentHi] : data;

  const others = issueTopics.filter((t) => t.slug !== data.slug).slice(0, 3);

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={content.term}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <p className="text-sm">
                <Link href="/issue" className="text-link font-medium">
                  {say("The issue", "समस्या को समझें")}
                </Link>
              </p>
              <h1 className="font-display mt-4 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.08] text-[var(--heading)]">
                {content.title}
              </h1>
              <p className="font-size-large mt-6 max-w-2xl text-[var(--theme-color-2)]">
                {content.definition}
              </p>
            </div>
          </div>
        </section>

        {/* BODY */}
        <section className="zone-white section-pad !pt-4" aria-label={say("Details", "विवरण")}>
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.4fr_1fr]">
              {/* What it looks like */}
              <div>
                <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]">
                  {say("What it can look like", "यह कैसे दिख सकता है")}
                </h2>
                <ul className="mt-6 space-y-4">
                  {content.looksLike.map((ex) => (
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
                  {say("What you can do", "आप क्या कर सकते हैं")}
                </h2>
                <p className="mt-4 text-[15px] leading-[1.65] text-[var(--body)]">
                  {content.whatToDo}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]" href="/get-help">
                    {say("Get help", "मदद लें")}
                  </Link>
                  <Link className="btn btn-secondary !m-0 !min-h-[44px] !text-[15px]" href="/glossary">
                    {say("Glossary of terms", "शब्दावली")}
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* RELATED */}
        <section className="transform-section" aria-labelledby="related-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <h2
                id="related-heading"
                className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]"
              >
                {say("Read about other forms of abuse", "दुर्व्यवहार के अन्य प्रकार पढ़ें")}
              </h2>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {others.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/issue/${t.slug}`}
                    className="group flex flex-col rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm transition hover:bg-[var(--color-parchment)]"
                  >
                    <h3 className="text-[16px] font-medium leading-snug text-[var(--heading)]">
                      {locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].term : t.term}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-[1.55] text-[var(--muted)]">
                      {locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].short : t.short}
                    </p>
                    <span className="mt-3 inline-block text-sm font-medium text-[var(--color-off-black)]">
                      {say("Learn more", "और जानें")}{" "}
                      <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                        →
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
