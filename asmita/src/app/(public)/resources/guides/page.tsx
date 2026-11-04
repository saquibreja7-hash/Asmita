import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { guides } from "@/lib/resources-content";
import { guidesHi } from "@/lib/resources-content-hi";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import type { IconName } from "@/components/Icon";
import { Callout, NextStep, ReadingLayout, ReadingSection, StepList } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";

const ICONS: IconName[] = ["lock", "clipboard", "alert"];

// What to do after each guide, in English and Hindi.
const NEXT: Record<string, { title: [string, string]; body: [string, string]; cta: [string, string]; href: string }> = {
  "secure-accounts": {
    title: ["Not sure it is safe to change settings?", "पता नहीं कि सेटिंग बदलना सुरक्षित है?"],
    body: ["Talk it through with someone first, any time.", "पहले किसी से बात करें, किसी भी समय।"],
    cta: ["Get help", "मदद लें"],
    href: "/get-help",
  },
  "collect-evidence": {
    title: ["Ready to ask for removal?", "हटाने का अनुरोध करने के लिए तैयार हैं?"],
    body: ["Share the links and we prepare the notice.", "लिंक साझा करें, सूचना हम तैयार करेंगे।"],
    cta: ["Start a takedown", "हटवाना शुरू करें"],
    href: "/start",
  },
  "report-to-platform": {
    title: ["Want a formal notice as well?", "साथ में औपचारिक सूचना भी भेजनी है?"],
    body: ["Asmita prepares a legal notice for you to review and sign.", "अस्मिता कानूनी सूचना तैयार करती है, जिसे आप पढ़कर हस्ताक्षर करते हैं।"],
    cta: ["Start a takedown", "हटवाना शुरू करें"],
    href: "/start",
  },
};

export const metadata: Metadata = {
  title: "Practical guides",
  description:
    "Step-by-step guides: secure your accounts, collect evidence safely, and report to a platform.",
};

export default async function GuidesPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Practical guides", "व्यावहारिक मार्गदर्शिकाएँ")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <Link href="/resources" className="eyebrow">
                {say("Resources", "संसाधन")}
              </Link>
              <h1 className="page-title mt-4">
                {say("Practical guides", "व्यावहारिक मार्गदर्शिकाएँ")}
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--ink)]">
                {say("Short, plain steps you can follow at your own pace. Do what you can. You do not have to do all of it at once.", "सरल कदम जिन्हें आप अपनी गति से अपना सकते हैं। जो संभव हो वही करें; सब कुछ एक साथ करने की ज़रूरत नहीं है।")}
              </p>
              <p className="eyebrow mt-6">
                {say("3 guides", "3 मार्गदर्शिकाएँ")}<ReadingTime label={t(locale, "reading.minutes")} />
              </p>
            </div>
          </div>
        </section>

        <ReadingLayout
          tocLabel={say("Guides", "मार्गदर्शिकाएँ")}
          toc={guides.map((guide, index) => ({ id: guide.slug, title: say(guide.title, guidesHi[index].title) }))}
        >
          {guides.map((guide, index) => {
            const next = NEXT[guide.slug];
            return (
              <ReadingSection key={guide.slug} id={guide.slug} icon={ICONS[index]} title={say(guide.title, guidesHi[index].title)}>
                <p>{say(guide.intro, guidesHi[index].intro)}</p>
                <StepList steps={guide.steps.map((step, i) => say(step, guidesHi[index].steps[i]))} />
                {guide.note && <Callout icon="alert">{say(guide.note, guidesHi[index].note)}</Callout>}
                <NextStep
                  title={say(next.title[0], next.title[1])}
                  body={say(next.body[0], next.body[1])}
                  cta={say(next.cta[0], next.cta[1])}
                  href={next.href}
                />
              </ReadingSection>
            );
          })}
        </ReadingLayout>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="section-title">
                {say("Ready to report?", "रिपोर्ट करने के लिए तैयार हैं?")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                  {say("Support directory", "सहायता सूची")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
