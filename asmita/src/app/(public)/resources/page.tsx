import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Resources", "संसाधन")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("Resources", "संसाधन")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Practical help, in one place", "व्यावहारिक मदद, एक जगह")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("Guides you can follow, people you can call, and a plain account of what the law gives you. Take what you need.", "काम की मार्गदर्शिकाएँ, सहायता के लिए संपर्क और अपने कानूनी अधिकारों की सरल जानकारी। जो आपके काम आए, उसे चुनें।")}
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={say("Resource areas", "संसाधनों के प्रकार")}>
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-3">
                {sections.map((s, index) => (
                  <Link
                    key={s.title}
                    href={s.href}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <h2 className="text-[19px] font-medium text-[var(--heading)]">
                      {say(s.title, hindiSections[index].title)}
                    </h2>
                    <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                      {say(s.body, hindiSections[index].body)}
                    </p>
                    <span className="mt-5 inline-block text-sm font-medium text-[var(--color-off-black)]">
                      {say(s.cta, hindiSections[index].cta)}{" "}
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

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Need to act now?", "अभी कदम उठाना है?")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                  {say("Helplines", "हेल्पलाइन")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
