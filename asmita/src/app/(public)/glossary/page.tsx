import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { glossary } from "@/lib/issue-content";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Plain-language definitions of the terms used around image-based abuse and takedowns in India.",
};

const hindiGlossary = [
  { term: "NCII (बिना सहमति साझा की गई निजी तस्वीरें)", definition: "किसी व्यक्ति की सहमति के बिना उसकी निजी तस्वीर या वीडियो साझा करना, या ऐसा करने की धमकी देना।" },
  { term: "सहमति", definition: "बिना दबाव दिया गया स्पष्ट ‘हाँ’। किसी एक व्यक्ति को तस्वीर भेजना, उसे आगे साझा करने की अनुमति नहीं है।" },
  { term: "डीपफ़ेक", definition: "AI से बनाई या बदली गई तस्वीर या वीडियो जो किसी असली व्यक्ति जैसी दिखती है, जिसमें नकली नग्न तस्वीर भी हो सकती है।" },
  { term: "मॉर्फ़िंग", definition: "किसी की सामान्य तस्वीर को यौन या अपमानजनक रूप देने के लिए बदलना।" },
  { term: "यौन धमकी (सेक्सटॉर्शन)", definition: "पैसे या और सामग्री की माँग करके किसी की निजी तस्वीरें साझा करने की धमकी देना।" },
  { term: "निजी जानकारी उजागर करना (डॉक्सिंग)", definition: "किसी को परेशान या ख़तरे में डालने के लिए पता या फ़ोन नंबर जैसी निजी जानकारी सार्वजनिक करना।" },
  { term: "नकली पहचान", definition: "किसी दूसरे व्यक्ति के नाम और पहचान का दिखावा करने वाला नकली खाता या प्रोफ़ाइल बनाना।" },
  { term: "हैश या डिजिटल फ़िंगरप्रिंट (PDQ)", definition: "तस्वीर की जगह इस्तेमाल किया जा सकने वाला छोटा डिजिटल कोड। अस्मिता के मौजूदा URL-आधारित चरण में यह उपकरण या प्लेटफ़ॉर्म मिलान उपलब्ध नहीं है।" },
  { term: "हटाने की सूचना", definition: "किसी प्लेटफ़ॉर्म से तय सामग्री हटाने का औपचारिक अनुरोध, जिसमें अनुरोध का आधार बताया जाता है।" },
  { term: "मध्यस्थ (इंटरमीडियरी)", definition: "ऐसी कंपनी जो दूसरे लोगों की सामग्री दिखाती या होस्ट करती है, जैसे सोशल मीडिया प्लेटफ़ॉर्म।" },
  { term: "शिकायत अधिकारी", definition: "प्लेटफ़ॉर्म की शिकायतें प्राप्त करने और उन पर कार्रवाई करने के लिए नामित व्यक्ति।" },
  { term: "आईटी नियम 2021, नियम 3(2)(b)", definition: "भारत का नियम जो कुछ बिना सहमति साझा की गई निजी सामग्री की शिकायतों पर प्लेटफ़ॉर्म की कार्रवाई से जुड़ा है।" },
  { term: "MeitY NCII मानक प्रक्रिया", definition: "सरकारी प्रक्रिया जो भारत में NCII शिकायतों को सँभालने के लिए दिशा देती है।" },
  { term: "राष्ट्रीय साइबर अपराध रिपोर्टिंग पोर्टल", definition: "cybercrime.gov.in पर साइबर अपराध की शिकायत दर्ज करने का सरकारी पोर्टल।" },
  { term: "खोज परिणाम से हटाना", definition: "सर्च इंजन से किसी पेज को परिणामों में दिखाना बंद करने का अनुरोध। पेज वेबसाइट पर फिर भी मौजूद हो सकता है।" },
  { term: "POCSO", definition: "बच्चों को यौन अपराधों से बचाने वाला भारतीय क़ानून। 18 वर्ष से कम उम्र के व्यक्ति के लिए अलग सुरक्षित रास्ता अपनाया जाता है।" },
] as const;

export default async function GlossaryPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={say("Glossary", "शब्दावली")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("Glossary", "शब्दावली")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Words, in plain language", "शब्दों का सरल अर्थ")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("The terms you will see on this site and in the law, explained without jargon. You do not need to know any of these to get help.", "इस वेबसाइट और संबंधित नियमों में आने वाले शब्द, सरल भाषा में। मदद लेने के लिए इन सभी शब्दों को जानना ज़रूरी नहीं है।")}
              </p>
            </div>
          </div>
        </section>

        {/* TERMS */}
        <section className="zone-white section-pad" aria-label={say("Terms", "शब्द")}>
          <div className="container">
            <dl className="mx-auto max-w-3xl divide-y divide-[var(--hairline)]">
              {glossary.map((entry, index) => (
                <div key={entry.term} className="py-6">
                  <dt className="font-display text-[1.15rem] font-medium text-[var(--heading)]">
                    {say(entry.term, hindiGlossary[index].term)}
                  </dt>
                  <dd className="mt-2 text-[16px] leading-[1.65] text-[var(--body)]">
                    {say(entry.definition, hindiGlossary[index].definition)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Ready when you are.", "जब आप तैयार हों।")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">
                  {say("Back to the issue", "समस्या के बारे में पढ़ें")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
