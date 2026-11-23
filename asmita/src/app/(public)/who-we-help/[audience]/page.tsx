import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabSection, LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { Icon } from "@/components/Icon";
import { AUDIENCE_STYLE, BRAND_TONES, IssueTopicCards } from "@/components/IssueTopicCards";
import { audiences, getAudience } from "@/lib/audience-content";
import { audiencesHi } from "@/lib/audience-content-hi";
import { getLocale } from "@/lib/get-locale";
import { Illustration, type IllustrationName } from "@/components/Illustration";

// The young-people image has no people in it: that page is for under-18s.
const AUDIENCE_ART: Record<string, IllustrationName> = {
  survivors: "how-3-protect",
  "helping-someone": "audience-helping",
  parents: "audience-parents",
  "young-people": "audience-young",
  platforms: "audience-platforms",
};

export function generateStaticParams() {
  return audiences.map((a) => ({ audience: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ audience: string }>;
}): Promise<Metadata> {
  const { audience } = await params;
  const data = getAudience(audience);
  if (!data) return { title: "Who we help" };
  if (await getLocale() === "hi") {
    const translated = audiencesHi[audience];
    return { title: translated.term, description: translated.cardLine };
  }
  return { title: data.term, description: data.cardLine };
}

export default async function AudiencePage({
  params,
}: {
  params: Promise<{ audience: string }>;
}) {
  const { audience } = await params;
  const englishData = getAudience(audience);
  if (!englishData) notFound();
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const data = locale === "hi" ? audiencesHi[audience] : englishData;

  const others = audiences.filter((a) => a.slug !== data.slug).slice(0, 3)
    .map((a) => locale === "hi" ? audiencesHi[a.slug] : a);

  const tone = AUDIENCE_STYLE[data.slug]?.tone ?? "teal";

  return (
    <LabToolShell variant="calm">
      <LabToolHero
        backLabel={say("Who we help", "हम किसकी मदद करते हैं")}
        backHref="/who-we-help"
        title={data.title}
        intro={<p>{data.intro}</p>}
        visual={<Illustration name={AUDIENCE_ART[data.slug] ?? "who-we-help"} eager className="issue-hero-art" />}
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn-primary btn-arrow !m-0" href={data.cta.href}>
            {data.cta.label}
          </Link>
          {data.secondary && (
            <Link className="btn btn-secondary btn-arrow !m-0" href={data.secondary.href}>
              {data.secondary.label}
            </Link>
          )}
        </div>
      </LabToolHero>

      {/* POINTS */}
      <section className="lab-sub-section" aria-label={say("How we help", "हम कैसे मदद करते हैं")}>
        <div className="container">
          {data.callout && (
            <div className={`issue-act issue-tone-${tone} mb-10`}>
              <span className="issue-topic-icon" aria-hidden="true">
                <Icon name="heart" size={22} />
              </span>
              <p className="issue-act-title">{data.callout.title}</p>
              <p className="issue-act-body">{data.callout.body}</p>
            </div>
          )}
          <ul className="issue-points" role="list">
            {data.points.map((point, index) => (
              <li key={point.title} className={`issue-point issue-tone-${BRAND_TONES[index % BRAND_TONES.length]}`}>
                <span className="issue-point-n" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="issue-point-title">{point.title}</h2>
                <p className="issue-point-body">{point.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* OTHER AUDIENCES */}
      <LabSection id="others-heading" index="02" title={say("Coming from somewhere else?", "किसी और स्थिति के बारे में पढ़ना है?")}>
        <IssueTopicCards
          moreLabel={say("Open", "देखें")}
          cards={others.map((a) => ({
            href: `/who-we-help/${a.slug}`,
            title: a.term,
            short: a.cardLine,
            icon: AUDIENCE_STYLE[a.slug]?.icon ?? "users",
            tone: AUDIENCE_STYLE[a.slug]?.tone,
          }))}
        />
      </LabSection>
    </LabToolShell>
  );
}
