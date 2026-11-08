import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getIssueTopic, issueTopics } from "@/lib/issue-content";
import { issueContentHi } from "@/lib/issue-content-hi";
import { getLocale } from "@/lib/get-locale";
import { ItemCards, SectionHeading } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";
import { Illustration, type IllustrationName } from "@/components/Illustration";

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
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-5xl">
              <Link href="/issue" className="eyebrow">
                {say("The issue", "समस्या को समझें")}
              </Link>
              <h1 className="page-title mt-4 max-w-3xl">
                {content.title}
              </h1>
              <p className="font-size-large mt-6 max-w-2xl text-[var(--ink)]">
                {content.definition}
              </p>
              <p className="eyebrow mt-6">
                {content.term}<ReadingTime label={say("{n} min read", "{n} मिनट में पढ़ें")} />
              </p>
            </div>
            <Illustration name={`issue-${data.slug}` as IllustrationName} eager className="page-hero-art" />
          </div>
        </section>

        {/* BODY */}
        <section className="zone-white section-pad !pt-4" aria-label={say("Details", "विवरण")}>
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.4fr_1fr]">
              {/* What it looks like */}
              <div>
                <SectionHeading icon="eyeOff">
                  {say("What it can look like", "यह कैसे दिख सकता है")}
                </SectionHeading>
                <ItemCards items={content.looksLike.map((ex) => ({ body: ex }))} />
              </div>

              {/* What you can do */}
              <aside className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-7 h-fit">
                <SectionHeading icon="heart">
                  {say("What you can do", "आप क्या कर सकते हैं")}
                </SectionHeading>
                <p className="mt-4 text-[15px] leading-[1.65] text-[var(--text)]">
                  {content.whatToDo}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link className="btn btn-primary btn-arrow !m-0 !min-h-[44px] !text-[15px]" href="/get-help">
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
                className="section-title"
              >
                {say("Read about other forms of abuse", "दुर्व्यवहार के अन्य प्रकार पढ़ें")}
              </h2>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {others.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/issue/${t.slug}`}
                    className="link-card group"
                  >
                    <h3 className="link-card-title">
                      {locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].term : t.term}
                    </h3>
                    <p className="mt-2 flex-1 text-[15px] leading-[1.6] text-[var(--text)]">
                      {locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].short : t.short}
                    </p>
                    <span className="link-card-more">
                      {say("Learn more", "और जानें")}
                      <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
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
