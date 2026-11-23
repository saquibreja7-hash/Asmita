import type { Metadata } from "next";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { AUDIENCE_STYLE, IssueTopicCards } from "@/components/IssueTopicCards";
import { audiences } from "@/lib/audience-content";
import { getLocale } from "@/lib/get-locale";
import { Illustration } from "@/components/Illustration";

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
    <LabToolShell variant="calm">
      <LabToolHero
        badge={say("Who we help", "हम किसकी मदद करते हैं")}
        title={say("Wherever you are coming from", "आपकी स्थिति जो भी हो")}
        intro={
          <p>
            {say(
              "Image-based abuse touches survivors, the people around them, and the platforms that carry the content. Find the path that fits you.",
              "तस्वीरों के ज़रिए दुर्व्यवहार प्रभावित व्यक्ति, उनके करीबी लोगों और सामग्री दिखाने वाले प्लेटफ़ॉर्म से जुड़ा हो सकता है। अपने लिए सही रास्ता चुनें।",
            )}
          </p>
        }
        visual={<Illustration name="who-we-help" eager className="issue-hero-art" />}
      />

      {/* AUDIENCES */}
      <section className="lab-sub-section" aria-label={say("Audiences", "किसके लिए मदद")}>
        <div className="container">
          <IssueTopicCards
            headingLevel={2}
            moreLabel={say("Open", "देखें")}
            cards={audiences.map((a, index) => ({
              href: `/who-we-help/${a.slug}`,
              title: say(a.term, hindiAudiences[index].term),
              short: say(a.cardLine, hindiAudiences[index].cardLine),
              icon: AUDIENCE_STYLE[a.slug]?.icon ?? "users",
              tone: AUDIENCE_STYLE[a.slug]?.tone,
              number: index + 1,
            }))}
          />
        </div>
      </section>

      {/* CLOSING */}
      <section className="lab-sub-section" aria-label={say("Get help", "मदद लें")}>
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{say("Not sure where you fit? Start here.", "समझ नहीं आ रहा कहाँ से शुरू करें? यहाँ आएँ।")}</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                {say("Get help", "मदद लें")}
              </Link>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/issue">
                {say("Understand the issue", "समस्या को समझें")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
