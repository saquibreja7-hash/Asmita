import { Illustration } from "@/components/Illustration";
import type { Metadata } from "next";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { IssueTopicCards, RESOURCE_STYLE } from "@/components/IssueTopicCards";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Practical guides, a verified support directory, and your legal rights in India for image-based abuse.",
};

const sections = [
  {
    title: "Practical guides",
    body: "Step-by-step help: secure your accounts, collect evidence safely, and report to a platform.",
    href: "/resources/guides",
    cta: "Read the guides",
  },
  {
    title: "Support directory",
    body: "Verified helplines, government portals, image-removal tools, and free legal aid across India.",
    href: "/resources/directory",
    cta: "Find support",
  },
  {
    title: "Your legal rights",
    body: "What the IT Rules, the MeitY procedure, and the reporting channels actually mean for you.",
    href: "/resources/legal",
    cta: "Know your rights",
  },
] as const;

const hindiSections = [
  { title: "व्यावहारिक मार्गदर्शिकाएँ", body: "अपने खाते सुरक्षित करने, संबंधित संदेशों को सुरक्षित रखने और प्लेटफ़ॉर्म पर रिपोर्ट करने के लिए चरण-दर-चरण मदद।", cta: "मार्गदर्शिकाएँ पढ़ें" },
  { title: "सहायता सूची", body: "हेल्पलाइन, सरकारी पोर्टल, तस्वीर हटाने के उपकरण और भारत में कानूनी सहायता के रास्ते।", cta: "सहायता खोजें" },
  { title: "आपके कानूनी अधिकार", body: "आईटी नियम और शिकायत दर्ज करने के रास्ते आपके लिए क्या अर्थ रखते हैं, सरल भाषा में।", cta: "अपने अधिकार जानें" },
] as const;

export default async function ResourcesPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        badge={say("Resources", "संसाधन")}
        title={say("Practical help, in one place", "व्यावहारिक मदद, एक जगह")}
        intro={
          <p>
            {say(
              "Guides you can follow, people you can call, and a plain account of what the law gives you. Take what you need.",
              "काम की मार्गदर्शिकाएँ, सहायता के लिए संपर्क और अपने कानूनी अधिकारों की सरल जानकारी। जो आपके काम आए, उसे चुनें।",
            )}
          </p>
        }
        visual={<Illustration name="page-resources" eager className="issue-hero-art" />}
      />

      <section className="lab-sub-section" aria-label={say("Resource areas", "संसाधनों के प्रकार")}>
        <div className="container">
          <IssueTopicCards
            headingLevel={2}
            cards={sections.map((section, index) => ({
              href: section.href,
              title: say(section.title, hindiSections[index].title),
              short: say(section.body, hindiSections[index].body),
              more: say(section.cta, hindiSections[index].cta),
              icon: RESOURCE_STYLE[section.href]?.icon ?? "book",
              tone: RESOURCE_STYLE[section.href]?.tone,
              number: index + 1,
            }))}
          />
        </div>
      </section>

      <section className="lab-sub-section" aria-label={say("Get help", "मदद लें")}>
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{say("Need to act now?", "अभी कदम उठाना है?")}</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                {say("Get help", "मदद लें")}
              </Link>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                {say("Helplines", "हेल्पलाइन")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
