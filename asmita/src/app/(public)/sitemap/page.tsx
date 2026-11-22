import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { siteMap } from "@/lib/site-map";
import { issueContentHi } from "@/lib/issue-content-hi";
import { audiencesHi } from "@/lib/audience-content-hi";
import { getLocale } from "@/lib/get-locale";
import { hasPublishedScorecard } from "@/lib/scorecard-snapshots";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Every public page on Asmita, in one place.",
};

const groupTitlesHi = ["मदद लें", "समस्या को समझें", "हम किसकी मदद करते हैं", "संसाधन", "जुड़िए", "AI लैब", "अस्मिता के बारे में", "नीतियाँ"] as const;
const linksHi: Record<string, { label: string; note?: string }> = {
  "/get-help": { label: "मदद लें", note: "स्थितियाँ, कदम और साधन" },
  "/start": { label: "केस शुरू करें", note: "गोपनीय रिपोर्ट शुरू करें" },
  "/eligibility": { label: "पात्रता देखें" },
  "/check-image": { label: "AI से बनी तस्वीर की रिपोर्ट", note: "मौजूदा URL-आधारित रास्ता; स्वचालित जाँच आगे की योजना" },
  "/minor-support": { label: "18 वर्ष से कम उम्र के लिए", note: "अलग सुरक्षित रास्ता" },
  "/issue": { label: "तस्वीरों के ज़रिए दुर्व्यवहार" },
  "/glossary": { label: "शब्दावली" },
  "/who-we-help": { label: "हम किसकी मदद करते हैं" },
  "/resources": { label: "संसाधन" },
  "/resources/guides": { label: "व्यावहारिक मार्गदर्शिकाएँ" },
  "/resources/directory": { label: "सहायता सूची", note: "सार्वजनिक सेवाएँ; मौजूदा उपलब्धता जाँचें" },
  "/resources/legal": { label: "आपके कानूनी अधिकार" },
  "/faq": { label: "अक्सर पूछे सवाल" },
  "/about": { label: "परिचय" },
  "/what-we-do": { label: "हम क्या करते हैं" },
  "/how-it-works": { label: "प्रक्रिया कैसे काम करती है" },
  "/research": { label: "शोध" },
  "/for-platforms": { label: "प्लेटफ़ॉर्म के लिए", note: "अंग्रेज़ी में" },
  "/press": { label: "प्रेस", note: "विज्ञप्तियाँ, कवरेज और मीडिया किट" },
  "/research/platform-scorecard": { label: "प्लेटफ़ॉर्म स्कोरकार्ड" },
  "/contact": { label: "संपर्क" },
  "/feedback": { label: "प्रतिक्रिया" },
  "/privacy": { label: "निजता" },
  "/terms": { label: "उपयोग की शर्तें" },
  "/legal": { label: "कानूनी जानकारी" },
  "/sitemap": { label: "साइटमैप" },
  "/lab": { label: "AI लैब", note: "शोध प्रयोग और बीटा टूल; शिकायत दर्ज कराने से अलग" },
  "/lab/open-tools": { label: "ओपन टूल", note: "मुफ़्त ट्रस्ट-ऐंड-सेफ़्टी टूलों की निर्देशिका और उनसे बने मुफ़्त स्टैक" },
  "/lab/open-tools/how-we-choose": { label: "हम टूल कैसे चुनते हैं", note: "'ओपन' का अर्थ, सूची से पहले की जाँच और सुझाव देने का तरीका" },
  "/lab/stacks": { label: "मुफ़्त स्टैक", note: "इन्हीं टूलों को एक-एक काम के लिए जोड़ने वाली क़दम-दर-क़दम गाइड" },
  "/lab/trace": { label: "मॉर्फ़ का स्रोत जाँचें" },
  "/lab/detectors": { label: "डिटेक्टर पैनल" },
  "/lab/protect": { label: "फ़ोटो सुरक्षा" },
  "/lab/tracker": { label: "सेवा ट्रैकर" },
  "/lab/message-check": { label: "संदेश की जाँच" },
  "/lab/stamp": { label: "कंटेंट क्रेडेंशियल स्टैम्प" },
  "/lab/spot-the-fake": { label: "झूठी तस्वीर पहचानिए" },
};

export default async function SitemapPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const translateLink = (href: string) => {
    if (href.startsWith("/issue/")) return { label: issueContentHi[href.slice(7) as keyof typeof issueContentHi]?.title };
    if (href.startsWith("/who-we-help/")) return { label: audiencesHi[href.slice(13)]?.term };
    return linksHi[href];
  };
  // The scorecard page joins the list only once a snapshot is published
  // (WP58) — the same rule as the header nav.
  const scorecardPublished = await hasPublishedScorecard();
  const groups = siteMap.map((group) =>
    group.title === "Resources" && scorecardPublished
      ? {
          ...group,
          links: [
            ...group.links,
            { href: "/research/platform-scorecard", label: "Platform scorecard", note: "How platforms respond to our notices" },
          ],
        }
      : group,
  );
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Sitemap", "साइटमैप")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <h1 className="page-title mt-5 max-w-3xl">
                {say("Every page, in one place", "हर पेज, एक जगह")}
              </h1>
              <p className="font-size-large mt-5 max-w-2xl">
                {say("Case pages you open after signing in are private and are not listed here.", "लॉग इन करने के बाद खुलने वाले निजी केस पेज यहाँ सूचीबद्ध नहीं हैं।")}
              </p>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        <section className="section-pad" aria-label={say("All pages", "सभी पेज")}>
          <div className="container">
            <div className="mx-auto grid max-w-5xl gap-12 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group, index) => (
                <div key={group.title}>
                  <h2 className="subsection-title">{say(group.title, groupTitlesHi[index])}</h2>
                  <ul className="mt-5 space-y-3 border-t border-[var(--line)] pt-5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        {/* A full page load for /check-image: its own headers allow the C2PA WASM reader. */}
                        {link.href === "/check-image" ? (
                          <a href={link.href} className="text-link font-medium">
                            {locale === "hi" ? translateLink(link.href)?.label ?? link.label : link.label}
                          </a>
                        ) : (
                          <Link href={link.href} className="text-link font-medium">
                            {locale === "hi" ? translateLink(link.href)?.label ?? link.label : link.label}
                          </Link>
                        )}
                        {link.note && (
                          <p className="mt-0.5 text-sm text-[var(--text)]">{locale === "hi" ? translateLink(link.href)?.note ?? link.note : link.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
