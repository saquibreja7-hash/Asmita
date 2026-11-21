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
import { NoticeFlowTech } from "./NoticeFlowTech";

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

const offers = [
  {
    href: "/start",
    icon: "notice" as const,
    tone: "tone-teal",
    title: ["Takedown notices", "हटाने की सूचना"],
    body: [
      "A legally grounded removal notice you read and sign. We send it to the platform and follow up.",
      "कानूनी आधार वाली हटाने की सूचना, जिसे आप पढ़कर हस्ताक्षर करते हैं। हम इसे प्लेटफ़ॉर्म को भेजते हैं और आगे की कार्रवाई पर नज़र रखते हैं।",
    ],
  },
  {
    href: "/what-we-do",
    icon: "fingerprint" as const,
    tone: "tone-coral",
    title: ["Private fingerprints", "निजी फ़िंगरप्रिंट"],
    body: [
      "Made on your device, so platforms can block re-uploads without ever seeing your image.",
      "आपके डिवाइस पर बनता है, ताकि प्लेटफ़ॉर्म आपकी तस्वीर देखे बिना उसे दोबारा अपलोड होने से रोक सकें।",
    ],
  },
  {
    href: "/what-we-do",
    icon: "radar" as const,
    tone: "tone-gold",
    title: ["Crawler watch", "क्रॉलर निगरानी"],
    body: [
      "With your permission, our crawler watches for the same image coming back and we report it again.",
      "आपकी अनुमति से हमारा क्रॉलर नज़र रखता है कि वही तस्वीर दोबारा तो नहीं आई, और हम फिर से उसकी रिपोर्ट करते हैं।",
    ],
  },
  {
    href: "/help",
    icon: "chat" as const,
    tone: "tone-sky",
    title: ["Helpline and AI assistant", "हेल्पलाइन और AI सहायक"],
    body: [
      "Talk or type in any Indian language, at any hour, before you decide what to do.",
      "कुछ भी तय करने से पहले किसी भी भारतीय भाषा में, किसी भी समय बात करें या लिखें।",
    ],
  },
  {
    href: "/check-image",
    icon: "scan" as const,
    tone: "tone-coral",
    title: ["AI image check", "AI तस्वीर जाँच"],
    body: [
      "A private check for signs that an image was made or edited by AI. A fake image is still abuse.",
      "निजी जाँच कि तस्वीर AI से बनाई या बदली गई है या नहीं। नकली तस्वीर भी उत्पीड़न है।",
    ],
  },
  {
    href: "/for-platforms",
    icon: "layers" as const,
    tone: "tone-teal",
    title: ["Platform partner channel", "प्लेटफ़ॉर्म पार्टनर चैनल"],
    body: [
      "One channel for platforms: survivors' notices, fingerprints they can match, and outcomes back to us.",
      "प्लेटफ़ॉर्म के लिए एक ही चैनल: प्रभावित लोगों की सूचनाएँ, मिलान योग्य फ़िंगरप्रिंट, और नतीजों की जानकारी।",
    ],
  },
] as const;

const experiments = ["e1", "e2", "e3"] as const;

const flow = [
  {
    title: ["You share the links", "आप लिंक साझा करते हैं"],
    body: ["Links go in as text. Your photo stays on your phone.", "लिंक पाठ के रूप में जाते हैं। आपकी तस्वीर आपके फ़ोन पर ही रहती है।"],
  },
  {
    title: ["We draft the notice, you sign it", "हम सूचना तैयार करते हैं, आप हस्ताक्षर करते हैं"],
    body: ["A legal removal notice, ready for you to read and sign.", "हटाने की कानूनी सूचना, जिसे आप पढ़कर हस्ताक्षर करते हैं।"],
  },
  {
    title: ["The platform takes it down", "प्लेटफ़ॉर्म उसे हटाता है"],
    body: ["We send the signed notice and follow up until it is answered.", "हम हस्ताक्षरित सूचना भेजते हैं और जवाब आने तक नज़र रखते हैं।"],
  },
  {
    title: ["Our crawler keeps watching", "हमारा क्रॉलर नज़र रखता है"],
    body: ["With your permission, it looks for the same image coming back.", "आपकी अनुमति से यह देखता है कि वही तस्वीर दोबारा तो नहीं आई।"],
  },
  {
    title: ["A re-upload matches", "दोबारा अपलोड पकड़ में आता है"],
    body: ["Its fingerprint matches yours, without anyone viewing the image.", "उसका फ़िंगरप्रिंट आपके फ़िंगरप्रिंट से मिलता है, बिना किसी के तस्वीर देखे।"],
  },
  {
    title: ["It comes down again", "वह फिर से हटाई जाती है"],
    body: ["We report the new copy and the platform removes it.", "हम नई प्रति की रिपोर्ट करते हैं और प्लेटफ़ॉर्म उसे हटाता है।"],
  },
] as const;

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

        {/* SUPPORTERS: right under the help strip. */}
        <section className="supporters-strip mt-12 md:mt-16" aria-labelledby="supporters-heading">
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
        {/* FILE A COMPLAINT: the workflow in four steps; the full help page is the original homepage. */}
        <section className="zone-white pt-12 md:pt-16" aria-labelledby="file-heading">
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

        {/* HOW A TAKEDOWN WORKS: the looping scene, with the steps as text. */}
        <section className="zone-white" aria-labelledby="flow-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="flow-heading" className="section-title">
                {say("How a takedown works", "हटवाने की प्रक्रिया कैसे चलती है")}
              </h2>
            </div>
            <NoticeFlowTech
              labels={{
                device: say("PDQ fingerprint · on your device", "PDQ फ़िंगरप्रिंट · आपके डिवाइस पर"),
                hub: say("Asmita drafts the notice", "अस्मिता सूचना तैयार करती है"),
                platforms: say("Platforms", "प्लेटफ़ॉर्म"),
                scanning: say("Crawler scanning", "क्रॉलर जाँच रहा है"),
                match: say("Match · distance ≤ 31", "मेल · दूरी ≤ 31"),
                removed: say("Taken down", "हटाया गया"),
              }}
              label={say(
                "Animation: a link becomes a signed notice, the platform removes the content, then our crawler finds a re-upload by its fingerprint and it is removed again.",
                "एनिमेशन: एक लिंक हस्ताक्षरित सूचना बनता है, प्लेटफ़ॉर्म सामग्री हटाता है, फिर हमारा क्रॉलर फ़िंगरप्रिंट से दोबारा अपलोड पकड़ता है और उसे फिर हटाया जाता है।",
              )}
              steps={flow.map((step) => ({ title: pick(step.title), body: pick(step.body) }))}
            />
          </div>
        </section>

        {/* WHAT WE OFFER: the services and tools, each with its own colour. */}
        <section className="transform-section" aria-labelledby="offer-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="offer-heading" className="section-title">
                {say("What we offer", "हम क्या देते हैं")}
              </h2>
            </div>
            <ul className="org-rows org-rows-2 org-rows-3">
              {offers.map((item) => {
                const inner = (
                  <>
                    <span className={`org-row-icon ${item.tone}`} aria-hidden>
                      <Icon name={item.icon} />
                    </span>
                    <h3 className="org-row-title">{pick(item.title)}</h3>
                    <p className="org-row-body">{pick(item.body)}</p>
                    <Icon name="arrowRight" className="org-row-arrow" />
                  </>
                );
                return (
                  <li key={item.title[0]}>
                    {/* A full page load for /check-image: its own headers allow the C2PA WASM reader. */}
                    {item.href === "/check-image" ? (
                      <a href={item.href} className="org-row">{inner}</a>
                    ) : (
                      <Link href={item.href} className="org-row">{inner}</Link>
                    )}
                  </li>
                );
              })}
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
            <div className="mt-10">
            <ol className="org-steps">
              {experiments.map((id) => (
                <li key={id}>
                  <h3>{t(locale, `lab.exp.${id}.title` as Parameters<typeof t>[1])}</h3>
                  <p>{t(locale, `lab.exp.${id}.body` as Parameters<typeof t>[1])}</p>
                </li>
              ))}
            </ol>
            </div>
          </div>
        </section>

        {/* WHY WE DO THIS: the issue and the commitments, unchanged from the original homepage. */}
        <div className="border-t border-[var(--line)]">
          <HomeIssueSection locale={locale} />
        </div>

        {/* WHO WE WORK WITH: the platform partner programme. */}
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
