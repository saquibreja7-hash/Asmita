import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabSection, LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { Icon } from "@/components/Icon";
import { BRAND_TONES, ISSUE_TOPIC_STYLE, IssueTopicCards } from "@/components/IssueTopicCards";
import { getIssueTopic, issueTopics } from "@/lib/issue-content";
import { issueContentHi } from "@/lib/issue-content-hi";
import { getLocale } from "@/lib/get-locale";
import { ReadingTime } from "@/components/ReadingTime";
import { Illustration, type IllustrationName } from "@/components/Illustration";

// A topic added without its own image falls back to the main issue image.
const TOPIC_ART: Record<string, IllustrationName> = {
  ncii: "issue-ncii",
  deepfakes: "issue-deepfakes",
  morphing: "issue-morphing",
  sextortion: "issue-sextortion",
  doxxing: "issue-doxxing",
};

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
  const tone = ISSUE_TOPIC_STYLE[data.slug]?.tone ?? "teal";

  return (
    <LabToolShell variant="calm">
      <LabToolHero
        backLabel={say("The issue", "समस्या को समझें")}
        backHref="/issue"
        title={content.title}
        intro={
          <>
            <p>{content.definition}</p>
            {content.research && (
              <p className="text-[15px] text-[var(--text)]">
                {content.research.text}{" "}
                <a className="text-link" href={content.research.url} target="_blank" rel="noopener noreferrer">
                  {say("Read the survey", "सर्वेक्षण पढ़ें")} <span aria-hidden>↗</span>
                </a>
              </p>
            )}
          </>
        }
        visual={<Illustration name={TOPIC_ART[data.slug] ?? "page-issue"} eager className="issue-hero-art" />}
      >
        <p className="issue-meta">
          {content.term}
          <ReadingTime label={say("{n} min read", "{n} मिनट में पढ़ें")} />
        </p>
      </LabToolHero>

      {/* BODY: what it can look like, and what you can do */}
      <section className="lab-sub-section" aria-label={say("Details", "विवरण")}>
        <div className="container issue-body">
          <div>
            <header className="lab-section-head">
              <span className="lab-index" aria-hidden="true">01</span>
              <h2 className="lab-h2">{say("What it can look like", "यह कैसे दिख सकता है")}</h2>
            </header>
            <ul className="issue-examples" role="list">
              {content.looksLike.map((example, index) => (
                <li key={index} className={`issue-example issue-tone-${BRAND_TONES[index % BRAND_TONES.length]}`}>
                  <span className="issue-example-mark" aria-hidden="true">
                    <Icon name={ISSUE_TOPIC_STYLE[data.slug]?.icon ?? "info"} size={18} />
                  </span>
                  <p>{example}</p>
                </li>
              ))}
            </ul>
          </div>

          <aside className={`issue-act issue-tone-${tone}`} aria-labelledby="issue-act-title">
            <span className="issue-topic-icon" aria-hidden="true">
              <Icon name="heart" size={22} />
            </span>
            <h2 id="issue-act-title" className="issue-act-title">
              {say("What you can do", "आप क्या कर सकते हैं")}
            </h2>
            <p className="issue-act-body">{content.whatToDo}</p>
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
      </section>

      {/* RELATED */}
      <LabSection id="related-heading" index="02" title={say("Read about other forms of abuse", "दुर्व्यवहार के अन्य प्रकार पढ़ें")}>
        <IssueTopicCards
          moreLabel={say("Learn more", "और जानें")}
          cards={others.map((t) => ({
            href: `/issue/${t.slug}`,
            title: locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].term : t.term,
            short: locale === "hi" ? issueContentHi[t.slug as keyof typeof issueContentHi].short : t.short,
            icon: ISSUE_TOPIC_STYLE[t.slug]?.icon ?? "info",
            tone: ISSUE_TOPIC_STYLE[t.slug]?.tone,
          }))}
        />
      </LabSection>
    </LabToolShell>
  );
}
