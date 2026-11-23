import { Illustration } from "@/components/Illustration";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ISSUE_TOPIC_STYLE, IssueTopicCards } from "@/components/IssueTopicCards";
import { LabSection, LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
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

// The Issue hub (2026-11-23 redesign): the shared modern page parts in their
// calm variant. The copy is unchanged; only the layout is new.
export default async function IssuePage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => (locale === "hi" ? hi : en);
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        badge={say("The issue", "समस्या को समझें")}
        title={say("Understand what is happening", "समझें कि क्या हो रहा है")}
        intro={
          <p>
            {say(
              "Image-based abuse takes many forms. Knowing what you are dealing with is the first step to acting on it. Here is each one, in plain words.",
              "तस्वीरों के ज़रिए होने वाला दुर्व्यवहार कई रूप ले सकता है। अपनी स्थिति समझना अगला कदम चुनने में मदद करता है। हर रूप यहाँ सरल शब्दों में समझाया गया है।",
            )}
          </p>
        }
        visual={<Illustration name="page-issue" eager className="issue-hero-art" />}
      />

      {/* TOPICS */}
      <LabSection
        id="topics-heading"
        index="01"
        title={say("Types of image-based abuse", "तस्वीरों के ज़रिए दुर्व्यवहार के प्रकार")}
        lede={<p>{say("Pick the one closest to your situation, or read them all.", "अपनी स्थिति से मिलता-जुलता विषय चुनें, या सभी पढ़ें।")}</p>}
      >
        <IssueTopicCards
          moreLabel={say("Learn more", "और जानें")}
          cards={issueTopics.map((topic, index) => ({
            href: `/issue/${topic.slug}`,
            title: say(topic.term, hindiTopics[index].term),
            short: say(topic.short, hindiTopics[index].short),
            icon: ISSUE_TOPIC_STYLE[topic.slug]?.icon ?? "info",
            tone: ISSUE_TOPIC_STYLE[topic.slug]?.tone,
            number: index + 1,
          }))}
        >
          <li className="issue-topic issue-topic-glossary">
            <div className="issue-topic-top">
              <span className="issue-topic-icon" aria-hidden="true">
                <Icon name="book" size={22} />
              </span>
            </div>
            <h3 className="issue-topic-title">
              <Link className="lab-card-link" href="/glossary">
                {say("See the glossary of terms", "शब्दावली देखें")}
              </Link>
            </h3>
            <span className="issue-topic-more" aria-hidden="true">
              <span className="issue-topic-arrow">→</span>
            </span>
          </li>
        </IssueTopicCards>
      </LabSection>

      {/* CLOSING */}
      <section className="lab-sub-section" aria-label={say("Get help", "मदद लें")}>
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{say("Whatever form it takes, you can act on it.", "चाहे इसका रूप कुछ भी हो, आप कदम उठा सकते हैं।")}</h2>
            <p className="issue-close-body">
              {say(
                "None of this is your fault, and none of it is something you have to sort out alone.",
                "इसमें आपकी कोई गलती नहीं है। आपको इससे अकेले नहीं निपटना होगा।",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                {say("Get help", "मदद लें")}
              </Link>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/glossary">
                {say("Glossary of terms", "शब्दावली")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
