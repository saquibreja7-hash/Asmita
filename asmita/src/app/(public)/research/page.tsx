import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { Illustration } from "@/components/Illustration";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedOrgPosts } from "@/lib/org-posts";
import { hasPublishedScorecard } from "@/lib/scorecard-snapshots";

// Research (docs/org/spec.md, WP58 58.2): the same hero and approach as
// before, with the real lists — publications (RESEARCH posts) and lab
// notes (LAB_NOTE posts). The "first reports are in progress" empty state
// stays only while both lists are empty.

export const metadata: Metadata = {
  title: "Research",
  description:
    "Meri Asmita's research on image-based abuse in India: plain-language findings, published openly.",
};

const approach = [
  {
    title: "Plain language",
    body: "We write findings so a survivor, a journalist, or a policymaker can all follow them. No jargon for its own sake.",
  },
  {
    title: "Honest numbers",
    body: "We only publish figures we can stand behind, and we say how we got them. If a sample is small, we say so.",
  },
  {
    title: "Privacy first",
    body: "Our research never uses or displays intimate content, and never identifies a survivor. The same rule that governs the whole platform.",
  },
];

const approachHi = [
  { title: "सरल भाषा", body: "हम निष्कर्ष ऐसे लिखेंगे जिन्हें प्रभावित व्यक्ति, पत्रकार और नीति बनाने वाले लोग समझें।" },
  { title: "साफ़ आँकड़े", body: "हम केवल ऐसे आँकड़े प्रकाशित करेंगे जिनका आधार दिखा सकें। नमूना छोटा होगा तो यह भी बताएँगे।" },
  { title: "निजता पहले", body: "शोध में निजी सामग्री इस्तेमाल या दिखाई नहीं जाएगी और किसी प्रभावित व्यक्ति की पहचान नहीं बताई जाएगी।" },
] as const;

// TODO(WP58 58.2): the AI Lab (/lab) is not merged yet. When it lands behind
// ENABLE_LAB, add its flag helper and a "From the AI Lab" section here,
// shown only while the flag is on. Deliberately left as a stub with no test,
// per the spec.

export default async function ResearchPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const [publications, labNotes, scorecardPublished] = await Promise.all([
    listPublishedOrgPosts({ kind: "RESEARCH", perPage: 12 }),
    listPublishedOrgPosts({ kind: "LAB_NOTE", perPage: 12 }),
    hasPublishedScorecard(),
  ]);
  const bothEmpty = publications.posts.length === 0 && labNotes.posts.length === 0;

  const section = (posts: typeof publications.posts, emptyTitle: string, emptyBody: string) =>
    posts.length === 0 ? (
      <div className="mt-8 max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-6 text-center">
        <h3 className="text-[17px] font-medium">{emptyTitle}</h3>
        <p className="mt-2 text-[15px] leading-[1.65] text-[var(--text)]">{emptyBody}</p>
      </div>
    ) : (
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} locale={locale} />
        ))}
      </div>
    );

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Research", "शोध")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="page-title">
                {say("Research and reporting", "शोध और रिपोर्ट")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">
                {say("We study image-based abuse in India and share supported findings openly so people and institutions can act on them.", "हम भारत में तस्वीरों के ज़रिए दुर्व्यवहार को समझते हैं और प्रमाणित निष्कर्ष खुले तौर पर साझा करते हैं।")}
              </p>
            </div>
            <Illustration name="page-research" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={say("Findings", "निष्कर्ष")}>
          <div className="container">
            {bothEmpty ? (
              /* HONEST EMPTY STATE — kept only while both lists are empty */
              <div className="mx-auto max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h2 className="section-title">
                  {say("Our first reports are in progress", "पहली रिपोर्टों पर काम चल रहा है")}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.65] text-[var(--text)]">
                  {say("We are preparing the first reports. Supported findings will appear here when they are ready, free to read.", "पहली रिपोर्टें तैयार हो रही हैं। प्रमाणित निष्कर्ष तैयार होने पर यहाँ मुफ़्त पढ़ने के लिए उपलब्ध होंगे।")}
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Link className="btn btn-secondary btn-arrow !m-0" href="/contact">
                    {say("Ask about the research", "शोध के बारे में पूछें")}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-5xl">
                <h2 className="section-title text-center">{t(locale, "org.research.publicationsTitle")}</h2>
                {section(
                  publications.posts,
                  t(locale, "org.research.publicationsEmpty"),
                  t(locale, "org.research.publicationsEmptyBody"),
                )}
                <h2 className="section-title mt-16 text-center">{t(locale, "org.research.labNotesTitle")}</h2>
                {section(
                  labNotes.posts,
                  t(locale, "org.research.labNotesEmpty"),
                  t(locale, "org.research.labNotesEmptyBody"),
                )}
              </div>
            )}
          </div>
        </section>

        {/* APPROACH */}
        <section className="transform-section" aria-labelledby="approach-heading">
          <div className="transform-content container section-pad">
            <h2 id="approach-heading" className="section-title">
              {say("How we do research", "हम शोध कैसे करते हैं")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {approach.map((a, index) => (
                <div key={a.title} className="rounded-[var(--radius-box)] surface-card p-7">
                  <h3 className="text-[18px] font-medium text-[var(--ink)]">{say(a.title, approachHi[index].title)}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{say(a.body, approachHi[index].body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open tools and data */}
        <section className="zone-white section-pad" aria-labelledby="open-tools-heading">
          <div className="container">
            <h2 className="section-title" id="open-tools-heading">
              {t(locale, "org.research.toolsTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-[1.65] text-[var(--text)]">
              {t(locale, "org.research.toolsBody")}
            </p>
            {scorecardPublished && (
              <div className="mx-auto mt-8 max-w-2xl rounded-[var(--radius-box)] border border-[var(--line)] surface-card p-7">
                <h3 className="text-[18px] font-medium text-[var(--ink)]">{t(locale, "org.research.scorecardTitle")}</h3>
                <p className="mt-3 text-sm leading-[1.65] text-[var(--text)]">{t(locale, "org.research.scorecardBody")}</p>
                <Link className="arrow-link mt-4" href="/research/platform-scorecard">
                  {t(locale, "org.scorecard.title")}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">
                {say("Need help now?", "अभी मदद चाहिए?")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">{say("Get help", "मदद लें")}</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">{say("Understand the issue", "समस्या को समझें")}</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
