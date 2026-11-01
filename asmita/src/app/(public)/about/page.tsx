import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SupporterLogos } from "@/components/layout/Supporters";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "About",
  description:
    "Asmita is an independent, tech-led response platform against image-based abuse in India, built by JAMSAQ Studio.",
};

const principles = [
  {
    title: "Privacy by architecture",
    body: "Submitted links are handled as text. Adults can generate a fingerprint on their device and add it to a case.",
  },
  {
    title: "Honest about limits",
    body: "We say exactly what a takedown can and cannot do, before you act. We do not promise to erase content from the whole internet, because no one honestly can.",
  },
  {
    title: "You stay in control",
    body: "You review and sign every notice. You decide what happens next. Nothing goes out in your name without you seeing it first.",
  },
];

const hindiPrinciples = [
  { title: "बनावट में ही निजता", body: "मौजूदा URL-आधारित प्रक्रिया में लिंक केवल पाठ के रूप में लिए जाते हैं और खोले नहीं जाते। डिवाइस पर बनने वाले डिजिटल फ़िंगरप्रिंट उपकरण आगे के चरण के लिए विकसित हो रहे हैं।" },
  { title: "सीमाओं के बारे में स्पष्टता", body: "आगे बढ़ने से पहले हम बताते हैं कि हटाने की कार्रवाई से क्या संभव है और क्या नहीं। पूरे इंटरनेट से सामग्री मिटाने का वादा कोई ईमानदारी से नहीं कर सकता।" },
  { title: "फ़ैसला आपके हाथ में", body: "आप हर सूचना पढ़ते हैं और हस्ताक्षर करते हैं। आपकी ओर से कुछ भेजने से पहले आपको उसे देखने का अवसर मिलता है।" },
] as const;

export default async function AboutPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("About Asmita", "अस्मिता के बारे में")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("About", "परिचय")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("A response platform, not a bystander", "कार्रवाई में साथ देने वाला मंच")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say(
                  "Asmita helps people in India facing non-consensual or AI-made intimate images take action through URL-based reports, notice preparation, and connections to the right help.",
                  "अस्मिता भारत में बिना सहमति साझा की गई या AI से बनाई गई निजी तस्वीरों का सामना कर रहे लोगों को URL-आधारित रिपोर्ट, हटाने की सूचना और सही सहायता तक पहुँचने में मदद करती है।",
                )}
              </p>
            </div>
          </div>
        </section>

        {/* WHO WE ARE / NOT */}
        <section className="zone-white section-pad" aria-labelledby="who-heading">
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 id="who-heading" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  {say("Who we are", "हम कौन हैं")}
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  {say(
                    "Asmita is a technology-led platform that fights image-based abuse with working tools and plain-language knowledge. We are built by JAMSAQ Studio and run independently.",
                    "अस्मिता तस्वीरों से होने वाले उत्पीड़न के लिए व्यावहारिक साधन और सरल जानकारी देने वाला स्वतंत्र मंच है। इसे JAMSAQ Studio ने बनाया है।",
                  )}
                </p>
              </div>
              <div>
                <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  {say("What we are not", "हम क्या नहीं हैं")}
                </h2>
                <ul className="mt-5 space-y-2 text-[16px] leading-[1.7] text-[var(--body)]">
                  <li>{say("Not a government body. We route you to official channels, but we are independent of them.", "हम सरकारी संस्था नहीं हैं। आधिकारिक रास्ते दिखाते हैं, पर उनसे स्वतंत्र हैं।")}</li>
                  <li>{say("Not a charity asking for donations.", "हम दान माँगने वाली संस्था नहीं हैं।")}</li>
                  <li>{say("Not a place your image is ever uploaded, stored, or seen.", "यहाँ आपकी निजी तस्वीर अपलोड, सहेजी या देखी नहीं जाती।")}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section className="transform-section" aria-labelledby="principles-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <h2 id="principles-heading" className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
                {say("What guides the work", "हमारे काम के सिद्धांत")}
              </h2>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {principles.map((p, i) => (
                  <div key={p.title} className="rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-7 backdrop-blur-sm">
                    <h3 className="text-[18px] font-medium text-[var(--heading)]">{locale === "hi" ? hindiPrinciples[i].title : p.title}</h3>
                    <p className="mt-3 text-sm leading-[1.65] text-[var(--body)]">{locale === "hi" ? hindiPrinciples[i].body : p.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* TEAM + PARTNERS (honest, no invented names) */}
        <section className="zone-white section-pad" aria-labelledby="team-heading">
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 id="team-heading" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  {say("Who is behind Asmita", "अस्मिता के पीछे कौन है")}
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  {say(
                    "Asmita is built and run by JAMSAQ Studio, a small team building practical tools for real problems. We work with legal and support partners as the platform grows.",
                    "अस्मिता को JAMSAQ Studio बनाता और चलाता है। मंच के विकसित होने के साथ हम कानूनी और सहायता साझेदारों के साथ काम करते हैं।",
                  )}
                </p>
                {/* TODO: add real team bios here once confirmed. Do not invent names. */}
              </div>
              <div>
                <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.16]">
                  {say("Partners and infrastructure", "साझेदार और तकनीकी आधार")}
                </h2>
                <p className="mt-5 text-[16px] leading-[1.7] text-[var(--body)]">
                  {say(
                    "Asmita runs on infrastructure supported by the Cloudflare for Startups program. Our takedown work is grounded in the IT Rules and the MeitY procedure for non-consensual intimate imagery.",
                    "अस्मिता Cloudflare for Startups कार्यक्रम से समर्थित तकनीकी आधार पर चलती है। हटाने की प्रक्रिया IT Rules और बिना सहमति साझा की गई निजी तस्वीरों के लिए MeitY की प्रक्रिया पर आधारित है।",
                  )}
                </p>
                {/* Hindi copy pending a native speaker; the English shows until then. */}
                <p className="mt-4 text-[16px] leading-[1.7] text-[var(--body)]">
                  Our 24/7 voice helpline runs on Sarvam, which supports Asmita with credits.
                </p>
                <SupporterLogos className="mt-8" />
              </div>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Here to help you act.", "कार्रवाई में आपका साथ।")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">{say("Get help", "मदद लें")}</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/what-we-do">{say("What we do", "हम क्या करते हैं")}</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
