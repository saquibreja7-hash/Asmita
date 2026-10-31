import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Research",
  description:
    "Asmita's research on image-based abuse in India: plain-language findings, published openly. First reports in progress.",
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
  { title: "सरल भाषा", body: "हम निष्कर्ष ऐसे लिखेंगे जिन्हें प्रभावित व्यक्ति, पत्रकार और नीति बनाने वाले लोग समझ सकें।" },
  { title: "साफ़ आँकड़े", body: "हम केवल ऐसे आँकड़े प्रकाशित करेंगे जिनका आधार दिखा सकें। नमूना छोटा होगा तो यह भी बताएँगे।" },
  { title: "निजता पहले", body: "शोध में निजी सामग्री इस्तेमाल या दिखाई नहीं जाएगी और किसी प्रभावित व्यक्ति की पहचान नहीं बताई जाएगी।" },
] as const;

export default async function ResearchPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Research", "शोध")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("Research", "शोध")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Research and reporting", "शोध और रिपोर्ट")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("We aim to study image-based abuse in India and share supported findings openly so people and institutions can act on them.", "हम भारत में तस्वीरों के ज़रिए दुर्व्यवहार को समझने और प्रमाणित निष्कर्ष खुले तौर पर साझा करने की योजना बना रहे हैं।")}
              </p>
            </div>
          </div>
        </section>

        {/* HONEST EMPTY STATE */}
        <section className="zone-white section-pad" aria-label={say("Reports", "रिपोर्ट") }>
          <div className="container">
            <div className="mx-auto max-w-3xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
              <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]">
                {say("Our first reports are in progress", "पहली रिपोर्टों पर काम चल रहा है")}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.65] text-[var(--body)]">
                {say("We are preparing the first reports. Supported findings will appear here when they are ready, free to read.", "पहली रिपोर्टें तैयार हो रही हैं। प्रमाणित निष्कर्ष तैयार होने पर यहाँ मुफ़्त पढ़ने के लिए उपलब्ध होंगे।")}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/contact">
                  {say("Ask about the research", "शोध के बारे में पूछें")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* APPROACH */}
        <section className="transform-section" aria-labelledby="approach-heading">
          <div className="transform-content container section-pad">
            <h2 id="approach-heading" className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
              {say("How we will do research", "हम शोध कैसे करेंगे")}
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {approach.map((a, index) => (
                <div key={a.title} className="rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-7 backdrop-blur-sm">
                  <h3 className="text-[18px] font-medium text-[var(--heading)]">{say(a.title, approachHi[index].title)}</h3>
                  <p className="mt-3 text-sm leading-[1.65] text-[var(--body)]">{say(a.body, approachHi[index].body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Need help now?", "अभी मदद चाहिए?")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">{say("Get help", "मदद लें")}</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">{say("Understand the issue", "समस्या को समझें")}</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
