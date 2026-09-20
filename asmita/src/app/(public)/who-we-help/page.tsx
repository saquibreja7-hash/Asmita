import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { audiences } from "@/lib/audience-content";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Who we help",
  description:
    "Help for survivors of image-based abuse, the people supporting them, parents and families, young people, and platforms.",
};

const hindiAudiences = [
  { term: "प्रभावित लोगों के लिए", cardLine: "आप तस्वीरों के ज़रिए दुर्व्यवहार का सामना कर रहे हैं और कदम उठाना चाहते हैं।" },
  { term: "किसी की मदद कर रहे हैं", cardLine: "आप किसी दोस्त या परिवार के सदस्य का साथ दे रहे हैं।" },
  { term: "माता-पिता और परिवार", cardLine: "यदि यह आपके बच्चे से जुड़ा है, तो सुरक्षित अगले कदम जानें।" },
  { term: "युवा लोगों के लिए", cardLine: "18 वर्ष से कम उम्र है? सही और सुरक्षित सहायता खोजें।" },
  { term: "प्लेटफ़ॉर्म और साझेदार", cardLine: "URL-आधारित सूचना तैयार करने की प्रक्रिया को समझें।" },
] as const;

export default async function WhoWeHelpPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={say("Who we help", "हम किसकी मदद करते हैं")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("Who we help", "हम किसकी मदद करते हैं")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Wherever you are coming from", "आपकी स्थिति जो भी हो")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("Image-based abuse touches survivors, the people around them, and the platforms that carry the content. Find the path that fits you.", "तस्वीरों के ज़रिए दुर्व्यवहार प्रभावित व्यक्ति, उनके करीबी लोगों और सामग्री दिखाने वाले प्लेटफ़ॉर्म से जुड़ा हो सकता है। अपने लिए सही रास्ता चुनें।")}
              </p>
            </div>
          </div>
        </section>

        {/* AUDIENCE GRID */}
        <section className="zone-white section-pad" aria-label={say("Audiences", "किसके लिए मदद")}>
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {audiences.map((a, index) => (
                  <Link
                    key={a.slug}
                    href={`/who-we-help/${a.slug}`}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <h2 className="text-[19px] font-medium leading-snug text-[var(--heading)]">
                      {say(a.term, hindiAudiences[index].term)}
                    </h2>
                    <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                      {say(a.cardLine, hindiAudiences[index].cardLine)}
                    </p>
                    <span className="mt-4 inline-block text-sm font-medium text-[var(--color-off-black)]">
                      {say("Open", "देखें")}{" "}
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

        {/* CLOSING */}
        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Not sure where you fit? Start here.", "समझ नहीं आ रहा कहाँ से शुरू करें? यहाँ आएँ।")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">
                  {say("Understand the issue", "समस्या को समझें")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
