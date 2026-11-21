import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { SupporterLogos } from "@/components/layout/Supporters";
import { t } from "@/lib/i18n";
import { PostCard } from "@/components/org/PostCard";
import { listPublishedOrgPosts } from "@/lib/org-posts";
import { HomeHelpBand, HomeIssueSection, HomePlatformsBand } from "./home-sections";

/*
 * Home: the organization's front page. Who Meri Asmita is, help within the
 * first screen, filing a complaint, what we do, the AI Lab, why we do this,
 * who we work with, news (only once there is some) and a closing call to get
 * involved. The original homepage lives on unchanged at /help.
 */

const steps = [
  {
    title: ["Links as text", "लिंक केवल पाठ के रूप में"],
    body: ["Paste the links. We do not fetch or view the image.", "लिंक दें। हम तस्वीर खोलते या देखते नहीं हैं।"],
  },
  {
    title: ["Legal notice", "कानूनी सूचना"],
    body: ["A removal notice citing the IT Rules and MeitY procedure.", "IT Rules और MeitY की प्रक्रिया का हवाला देने वाली हटाने की सूचना।"],
  },
  {
    title: ["You sign", "आप हस्ताक्षर करें"],
    body: ["You read and sign it before anything is sent.", "कुछ भी भेजे जाने से पहले आप इसे पढ़कर हस्ताक्षर करते हैं।"],
  },
  {
    title: ["Platform", "प्लेटफ़ॉर्म"],
    body: ["We send it to the platform and follow up.", "हम इसे प्लेटफ़ॉर्म को भेजते हैं और आगे की कार्रवाई पर नज़र रखते हैं।"],
  },
] as const;

const work = [
  {
    href: "/help",
    icon: "heart" as const,
    title: ["Survivor support", "प्रभावित लोगों की मदद"],
    body: [
      "Free, confidential help to report and remove intimate images shared without consent.",
      "बिना सहमति साझा की गई निजी तस्वीरों की रिपोर्ट करने और उन्हें हटवाने के लिए मुफ़्त, गोपनीय मदद।",
    ],
  },
  {
    href: "/what-we-do",
    icon: "shieldCheck" as const,
    title: ["Takedown technology", "हटवाने की तकनीक"],
    body: [
      "Legally grounded notices, private fingerprints made on your device, and follow-up with platforms.",
      "कानूनी आधार वाली सूचनाएँ, आपके डिवाइस पर बनने वाले निजी फ़िंगरप्रिंट, और प्लेटफ़ॉर्म से लगातार संपर्क।",
    ],
  },
  {
    href: "/lab",
    icon: "target" as const,
    title: ["Research and the AI Lab", "शोध और AI लैब"],
    body: [
      "Experiments against AI-made and morphed images: detecting them, tracing them and getting them taken down.",
      "AI से बनी और बदली गई तस्वीरों के ख़िलाफ़ प्रयोग: उनकी पहचान, उनका स्रोत खोजना और उन्हें हटवाना।",
    ],
  },
  {
    href: "/partners",
    icon: "handshake" as const,
    title: ["Partnerships and policy", "साझेदारी और नीति"],
    body: [
      "Working with NGOs, lawyers, police, universities and platforms so survivors find help faster.",
      "NGO, वकीलों, पुलिस, विश्वविद्यालयों और प्लेटफ़ॉर्म के साथ काम, ताकि प्रभावित लोगों को जल्दी मदद मिले।",
    ],
  },
] as const;

const experiments = ["e1", "e2", "e3"] as const;

export default async function HomePage() {
  const locale = await getLocale();
  const hi = locale === "hi";
  const say = (en: string, hindi: string) => (hi ? hindi : en);
  const pick = (pair: readonly [string, string]) => (hi ? pair[1] : pair[0]);
  const news = (await listPublishedOrgPosts({ kind: "NEWS", perPage: 3 })).posts;

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO: who Meri Asmita is, with help one tap away. */}
        <section className="home-hero">
          <div className="container relative z-[1] grid items-center gap-10 pb-14 pt-14 md:pb-20 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
              <h1 className="hero-title max-w-3xl">
                {say("Ending image-based abuse in India.", "भारत में तस्वीरों के ज़रिए होने वाले दुर्व्यवहार को ख़त्म करना।")}
              </h1>
              <p className="font-size-large mt-6 max-w-xl text-[var(--text)]">
                {say(
                  "Meri Asmita is an independent organization. We help survivors remove intimate images shared without consent, build open technology to stop them spreading, and work with platforms and partners to do better.",
                  "मेरी अस्मिता एक स्वतंत्र संगठन है। हम बिना सहमति साझा की गई निजी तस्वीरें हटवाने में प्रभावित लोगों की मदद करते हैं, उन्हें फैलने से रोकने के लिए खुली तकनीक बनाते हैं, और प्लेटफ़ॉर्म व साझेदारों के साथ मिलकर बेहतर काम करते हैं।",
                )}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link className="btn btn-primary btn-arrow" href="/help">
                  {say("Get help now", "अभी मदद लें")}
                </Link>
                <Link className="btn btn-secondary" href="/what-we-do">
                  {say("What we do", "हम क्या करते हैं")}
                </Link>
              </div>
            </div>
            <Illustration name="home-hero" eager className="mx-auto max-w-[380px] lg:max-w-[600px]" />
          </div>
        </section>

        {/* HELP: the helpline, the assistant and the under-18 line, right under the hero. */}
        <HomeHelpBand locale={locale} />

        {/* FILE A COMPLAINT: the workflow in four steps; the full help page is the original homepage. */}
        <section className="zone-white mt-12 md:mt-16" aria-labelledby="file-heading">
          <div className="container org-section org-section-first">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
              <div>
                <h2 id="file-heading" className="section-title">
                  {say("File a complaint", "शिकायत दर्ज करें")}
                </h2>
                <p className="mt-4 max-w-md text-[length:var(--text-label)] leading-[1.6] text-[var(--text)]">
                  {say(
                    "Share the links, sign the notice, and we handle the platforms. Your photos never leave your phone.",
                    "लिंक साझा करें, सूचना पर हस्ताक्षर करें, और प्लेटफ़ॉर्म से हम बात करेंगे। आपकी तस्वीरें कभी आपके फ़ोन से बाहर नहीं जातीं।",
                  )}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link className="btn btn-primary btn-arrow !m-0" href="/start">
                    {say("File a complaint", "शिकायत दर्ज करें")}
                  </Link>
                  <Link className="link-underline" href="/help">
                    {say("All ways to get help", "मदद के सभी रास्ते")}
                  </Link>
                </div>
                <ul className="home-hero-trust mt-7">
                  <li>{say("Free, always", "मुफ़्त, हमेशा")}</li>
                  <li>{say("No ID or Aadhaar needed", "किसी आईडी या आधार की आवश्यकता नहीं")}</li>
                  <li>{say("Your photo never leaves your device", "आपकी फोटो कभी भी आपके डिवाइस से बाहर नहीं जाती")}</li>
                </ul>
              </div>
              <ol className="org-steps org-steps-2 self-start">
                {steps.map((step) => (
                  <li key={step.title[0]}>
                    <h3>{pick(step.title)}</h3>
                    <p>{pick(step.body)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* WHAT WE DO: the four parts of the work. */}
        <section className="transform-section" aria-labelledby="work-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="work-heading" className="section-title">
                {say("What we do", "हम क्या करते हैं")}
              </h2>
            </div>
            <ul className="org-rows org-rows-2">
              {work.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="org-row">
                    <span className="org-row-icon" aria-hidden>
                      <Icon name={item.icon} />
                    </span>
                    <h3 className="org-row-title">{pick(item.title)}</h3>
                    <p className="org-row-body">{pick(item.body)}</p>
                    <Icon name="arrowRight" className="org-row-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* AI LAB: the research arm and its experiments, from the Lab's own text. */}
        <section className="zone-white" aria-labelledby="lab-heading">
          <div className="container org-section">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="org-head !mb-0">
                <h2 id="lab-heading" className="section-title">
                  {t(locale, "lab.title")}
                </h2>
                <p>{t(locale, "lab.intro")}</p>
              </div>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/lab">
                {say("Visit the AI Lab", "AI लैब देखें")}
              </Link>
            </div>
            <ol className="org-steps mt-10">
              {experiments.map((id) => (
                <li key={id}>
                  <h3>{t(locale, `lab.exp.${id}.title` as Parameters<typeof t>[1])}</h3>
                  <p>{t(locale, `lab.exp.${id}.body` as Parameters<typeof t>[1])}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* WHY WE DO THIS: the issue and the commitments, unchanged from the original homepage. */}
        <div className="border-t border-[var(--line)]">
          <HomeIssueSection locale={locale} />
        </div>

        {/* WHO WE WORK WITH: supporters and the platform partner programme. */}
        <section className="supporters-strip" aria-labelledby="supporters-heading">
          <div className="container flex flex-col items-center gap-6 py-10 md:flex-row md:justify-center md:gap-12">
            <div className="text-center md:text-left">
              <p id="supporters-heading" className="eyebrow">
                {say("Supported by", "के द्वारा समर्थित")}
              </p>
              <p className="mt-1 text-[14px] text-[var(--text)]">
                {say("Technology partners who back this work", "इस काम में साथ देने वाले तकनीकी साझेदार")}
              </p>
            </div>
            <span className="hidden h-12 w-px bg-[var(--line)] md:block" aria-hidden />
            <SupporterLogos className="supporters-strip-logos justify-center" />
          </div>
        </section>
        <div className="pt-12 md:pt-16">
          <HomePlatformsBand locale={locale} />
        </div>

        {/* LATEST NEWS: only once something is published, so there is never an empty band. */}
        {news.length > 0 && (
          <section className="transform-section" aria-labelledby="news-heading">
            <div className="container org-section">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="org-head !mb-0">
                  <h2 id="news-heading" className="section-title">
                    {t(locale, "org.news.title")}
                  </h2>
                </div>
                <Link className="arrow-link" href="/news">
                  {say("All news", "सभी समाचार")}
                </Link>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {news.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* GET INVOLVED: the closing band. */}
        <section className="org-cta mt-12 md:mt-16" aria-labelledby="involved-heading">
          <div className="container org-cta-inner">
            <div>
              <h2 id="involved-heading" className="section-title">
                {t(locale, "org.getInvolved.title")}
              </h2>
              <p>{t(locale, "org.getInvolved.sub")}</p>
            </div>
            <div className="org-cta-actions">
              <Link className="btn btn-primary btn-arrow !m-0" href="/get-involved">
                {say("Get involved", "जुड़िए")}
              </Link>
              <Link className="btn btn-secondary !m-0" href="/volunteer">
                {t(locale, "org.getInvolved.cardVolunteerTitle")}
              </Link>
              <Link className="btn btn-secondary !m-0" href="/partners">
                {t(locale, "org.getInvolved.cardPartnerTitle")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
