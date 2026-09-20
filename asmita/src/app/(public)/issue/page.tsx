import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { issueTopics } from "@/lib/issue-content";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "The issue",
  description:
    "Understand image-based abuse in India: non-consensual intimate images, deepfakes, morphing, sextortion, and doxxing, explained in plain language.",
};

const hindiTopics = [
  { term: "बिना सहमति साझा की गई निजी तस्वीरें", short: "कोई आपकी सहमति के बिना निजी तस्वीर या वीडियो साझा करता है या ऐसा करने की धमकी देता है।" },
  { term: "डीपफ़ेक और AI से बनी तस्वीरें", short: "AI से बनाई या बदली गई नकली तस्वीर या वीडियो जो आपकी जैसी दिखती है।" },
  { term: "बदली हुई तस्वीरें", short: "आपकी सामान्य तस्वीर को यौन या अपमानजनक रूप देने के लिए बदला गया है।" },
  { term: "यौन धमकी और ब्लैकमेल", short: "कोई पैसे या और सामग्री की माँग करके आपकी निजी तस्वीर फैलाने की धमकी देता है।" },
  { term: "निजी जानकारी उजागर करना और नकली पहचान", short: "आपको परेशान करने के लिए निजी जानकारी फैलाना या आपके नाम पर नकली प्रोफ़ाइल बनाना।" },
] as const;

export default async function IssuePage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={say("The issue", "समस्या को समझें")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("The issue", "समस्या को समझें")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Understand what is happening", "समझें कि क्या हो रहा है")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("Image-based abuse takes many forms. Knowing what you are dealing with is the first step to acting on it. Here is each one, in plain words.", "तस्वीरों के ज़रिए होने वाला दुर्व्यवहार कई रूप ले सकता है। अपनी स्थिति समझना अगला कदम चुनने में मदद करता है। हर रूप यहाँ सरल शब्दों में समझाया गया है।")}
              </p>
            </div>
          </div>
        </section>

        {/* TOPIC GRID */}
        <section className="zone-white section-pad" aria-labelledby="topics-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 id="topics-heading" className="sr-only">
                  {say("Types of image-based abuse", "तस्वीरों के ज़रिए दुर्व्यवहार के प्रकार")}
                </h2>
                <p className="max-w-2xl text-lg leading-[1.6] text-[var(--body)]">
                  {say("Pick the one closest to your situation, or read them all.", "अपनी स्थिति से मिलता-जुलता विषय चुनें, या सभी पढ़ें।")}
                </p>
                <Link href="/glossary" className="text-link text-sm font-medium">
                  {say("See the glossary of terms →", "शब्दावली देखें →")}
                </Link>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {issueTopics.map((topic, index) => (
                  <Link
                    key={topic.slug}
                    href={`/issue/${topic.slug}`}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-6 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <h3 className="text-[18px] font-medium leading-snug text-[var(--heading)]">
                      {say(topic.term, hindiTopics[index].term)}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                      {say(topic.short, hindiTopics[index].short)}
                    </p>
                    <span className="mt-4 inline-block text-sm font-medium text-[var(--color-off-black)]">
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

        {/* CLOSING */}
        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
                {say("Whatever form it takes, you can act on it.", "चाहे इसका रूप कुछ भी हो, आप कदम उठा सकते हैं।")}
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                {say("None of this is your fault, and none of it is something you have to sort out alone.", "इसमें आपकी कोई गलती नहीं है। आपको इससे अकेले नहीं निपटना होगा।")}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/glossary">
                  {say("Glossary of terms", "शब्दावली")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
