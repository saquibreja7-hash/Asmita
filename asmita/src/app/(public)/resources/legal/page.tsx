import type { Metadata } from "next";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { legalSections } from "@/lib/resources-content";
import { legalSectionsHi } from "@/lib/resources-content-hi";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import type { IconName } from "@/components/Icon";
import { Callout, NextStep, ReadingSection } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";
import { Illustration } from "@/components/Illustration";

// One icon per right, in the order of legalSections.
const ICONS: IconName[] = ["shieldCheck", "building", "alert", "refresh", "scale", "heart"];

export const metadata: Metadata = {
  title: "Your legal rights",
  description:
    "Plain-language rights for image-based abuse in India: the IT Rules, the MeitY procedure, reporting, escalation, and legal aid.",
};

export default async function LegalRightsPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        backLabel={say("Resources", "संसाधन")}
        backHref="/resources"
        title={say("Your rights, in plain words", "आपके अधिकार, सरल शब्दों में")}
        intro={<p>{say("Indian rules give you ways to act. Here is what they mean in plain language.", "भारतीय नियम कार्रवाई के रास्ते देते हैं। यहाँ उनका सरल अर्थ समझें।")}</p>}
        visual={<Illustration name="page-legal" eager className="issue-hero-art" />}
      >
        <p className="issue-meta">{say("Not legal advice", "कानूनी सलाह नहीं")}<ReadingTime label={t(locale, "reading.minutes")} /></p>
      </LabToolHero>


        <section className="lab-sub-section !pt-4" aria-label={say("Rights", "अधिकार")}>
          <div className="container">
            <div className="reading-col mx-auto">
              {legalSections.map((section, index) => (
                <ReadingSection
                  key={section.title}
                  id={`right-${index + 1}`}
                  icon={ICONS[index]}
                  title={say(section.title, legalSectionsHi[index].title)}
                >
                  <p>{say(section.body, legalSectionsHi[index].body)}</p>
                  {index === 4 && (
                    <NextStep
                      title={say("Find free legal aid near you", "अपने पास मुफ़्त कानूनी सहायता खोजें")}
                      body={say("NALSA, One Stop Centres and other verified contacts.", "NALSA, वन स्टॉप सेंटर और दूसरे सत्यापित संपर्क।")}
                      cta={say("Support directory", "सहायता सूची")}
                      href="/resources/directory"
                    />
                  )}
                  {index === 5 && (
                    <NextStep
                      title={say("Under 18, or was the image taken when you were?", "18 साल से कम हैं, या तस्वीर तब ली गई थी?")}
                      body={say("There is a separate, safer path with child-safety help.", "बच्चों की सुरक्षा के लिए एक अलग, सुरक्षित रास्ता है।")}
                      cta={say("See the safer path", "सुरक्षित रास्ता देखें")}
                      href="/minor-support"
                    />
                  )}
                </ReadingSection>
              ))}

              <div className="mt-4">
                <Callout>
                  {say("This is general information, not legal advice, and the law can change. For advice on your situation, ask NALSA about eligibility for free legal aid or consult a lawyer.", "यह सामान्य जानकारी है, कानूनी सलाह नहीं। नियम बदल सकते हैं। अपनी स्थिति के लिए NALSA से मुफ़्त सहायता की पात्रता पूछें या वकील से सलाह लें।")}
                </Callout>
              </div>
            </div>
          </div>
        </section>

        <section className="lab-sub-section" aria-label={say("Get help", "मदद लें")}>
          <div className="container">
            <div className="issue-close">
              <h2 className="lab-h2">{say("Use the right reporting path.", "रिपोर्ट का सही रास्ता चुनें।")}</h2>
            <p className="issue-close-body">{say("The URL-only flow helps prepare a takedown notice you can review and sign. Dispatch waits for verified contacts and templates.", "URL-आधारित प्रक्रिया हटाने की सूचना तैयार करने में मदद करती है। आप उसे पढ़कर हस्ताक्षर कर सकते हैं। भेजने से पहले संपर्क और नमूने की पुष्टि ज़रूरी है।")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
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
    </LabToolShell>
  );
}
