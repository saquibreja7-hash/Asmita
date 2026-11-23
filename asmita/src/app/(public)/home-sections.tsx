import Link from "next/link";
import { HELPLINE } from "@/lib/helpline";
import { t, type Locale } from "@/lib/i18n";
import { PLATFORM_DEADLINE_HOURS } from "@/lib/escalation-ladder";
import { CHAT_COPY_KEYS, type ChatCopy } from "./chat-copy";
import { HomeChat } from "./HomeChat";
import { icons } from "./for-platforms/icons";

// Sections shared by the homepage and /help (the original homepage), moved
// here unchanged so both pages render the same markup and text.

type SayFn = (en: string, hi: string) => string;
const sayFor = (locale: Locale): SayFn => (en, hi) => (locale === "hi" ? hi : en);

const commitments = [
  {
    value: "URL-only",
    label: "Privacy by architecture",
    detail: "Current reporting uses links as text. We do not receive or inspect the image.",
  },
  {
    value: `${PLATFORM_DEADLINE_HOURS} hours`,
    label: "Qualifying complaints",
    detail: `Under Rule 3(2)(b), platforms must take reasonable and practicable steps to remove or disable access within ${PLATFORM_DEADLINE_HOURS} hours of receiving a qualifying complaint.`,
  },
  {
    value: "No media",
    label: "What never happens",
    detail: "We never fetch, preview, store, or view intimate content at any link you share.",
  },
] as const;

const commitmentsHi = [
  { value: "केवल URL", label: "बनावट में ही निजता", detail: "मौजूदा रिपोर्ट में लिंक केवल पाठ के रूप में लिए जाते हैं। हम तस्वीर प्राप्त या जाँच नहीं करते।" },
  { value: `${PLATFORM_DEADLINE_HOURS} घंटे`, label: "योग्य शिकायतें", detail: `नियम 3(2)(b) के तहत, योग्य शिकायत मिलने के ${PLATFORM_DEADLINE_HOURS} घंटे के भीतर प्लेटफ़ॉर्म को सामग्री हटाने या उस तक पहुँच रोकने के लिए उचित और व्यावहारिक कदम उठाने होते हैं।` },
  { value: "कोई मीडिया नहीं", label: "हम क्या नहीं करते", detail: "आपके साझा किए लिंक पर मौजूद निजी सामग्री को हम खोलते, देखते या सहेजते नहीं हैं।" },
] as const;

export function HomeHelpBand({ locale }: { locale: Locale }) {
  const say = sayFor(locale);
  const chatCopy = Object.fromEntries(CHAT_COPY_KEYS.map((key) => [key, t(locale, key)])) as ChatCopy;
  return (
    <>
  {/* GET HELP: every way to reach a person or the assistant, right under the hero. */}
  <section className="container pt-10 md:pt-14" aria-labelledby="help-heading">
    <div className="home-help-band grid gap-8 lg:grid-cols-[0.75fr_2fr] lg:items-center">
      <div>
        <h2 id="help-heading" className="section-title mt-3">
          {say("Call the helpline or use the AI assistant", "हेल्पलाइन पर कॉल करें या एआई सहायक से बात करें")}
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--text)]">
          {say("Free and private. Choose whatever feels easiest.", "मुफ़्त और निजी। जो आसान लगे, वह चुनें।")}
        </p>
      </div>
      <div>
          <ul className="grid gap-3 md:grid-cols-3">
            <li>
              <HomeChat copy={chatCopy} locale={locale} triggerClassName="home-help-tile">
                <span aria-hidden className="home-help-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg></span>
                <span className="min-w-0">
                  <span className="home-help-title">{chatCopy["chat.open"]}</span>
                  <span className="home-help-text">
                    {say("Type to an AI assistant, in any Indian language.", "किसी भी भारतीय भाषा में ए.आई. सहायक से चैट करें।")}
                  </span>
                </span>
              </HomeChat>
            </li>
            <li>
              {/* A full page load, not <Link>: /talk's own headers allow the microphone. */}
              <a className="home-help-tile" href="/talk">
                <span aria-hidden className="home-help-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></span>
                <span className="min-w-0">
                  <span className="home-help-title">{say("Talk in your browser", "अपने ब्राउज़र में बात करें")}</span>
                  <span className="home-help-text">
                    {say("Speak to the same assistant without dialling.", "बिना डायल किए उसी सहायक से बात करें।")}
                  </span>
                </span>
              </a>
            </li>
            <li>
              <a className="home-help-tile" href={`tel:${HELPLINE.tel}`}>
                <span aria-hidden className="home-help-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg></span>
                <span className="min-w-0">
                  <span className="home-help-title">{say("Call the 24/7 helpline", "24/7 हेल्पलाइन पर कॉल करें")}</span>
                  <span className="home-help-text home-help-number">{HELPLINE.display}</span>
                </span>
              </a>
            </li>
          </ul>
        <p className="mt-5 text-[14px] leading-[1.5] text-[var(--text)]">
          {say("In danger right now? Call", "अभी खतरे में हैं?")}{" "}
          <a className="link-underline font-medium text-[var(--ink)]" href="tel:112">112</a>
          {say(". Under 18? Call CHILDLINE", " पर कॉल करें। 18 साल से कम उम्र है? चाइल्डलाइन")}{" "}
          <a className="link-underline font-medium text-[var(--ink)]" href="tel:1098">1098</a>
          {say(".", " पर कॉल करें।")}
        </p>
      </div>
    </div>
  </section>
    </>
  );
}

export function HomeIssueSection({ locale }: { locale: Locale }) {
  const say = sayFor(locale);
  return (
    <>
  {/* ISSUE + COMMITMENTS */}
  <section id="issue" className="section-pad" aria-labelledby="issue-heading">
    <div className="container grid items-start gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
      <div>
        <h2 id="issue-heading" className="section-title mt-5">
          {say("The internet makes it easier to harm people. The law gives you a way back.", "इंटरनेट पर नुकसान फैलना आसान है। कानून कार्रवाई का रास्ता देता है।")}
        </h2>
        <p className="mt-6 max-w-xl text-[16px] leading-[1.5] text-[var(--text)] md:text-[18px]">
          {say(
            "Non-consensual intimate imagery, deepfakes, morphing, and sextortion spread fast across platforms and WhatsApp groups. Asmita helps you review and send a removal request for the links you report.",
            "बिना सहमति साझा की गई निजी तस्वीरें, डीपफ़ेक, बदली हुई तस्वीरें और धमकियाँ कई प्लेटफ़ॉर्म पर तेज़ी से फैल सकती हैं। अस्मिता रिपोर्ट किए गए लिंक हटाने का अनुरोध तैयार करने और भेजने में आपकी मदद करती है।",
          )}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="arrow-link" href="/issue">
            {say("Learn about the issue", "समस्या को समझें")}
          </Link>
        </div>
      </div>

      <div>
        <p className="eyebrow">{say("What we commit to, every day", "हमारी प्रतिबद्धता")}</p>
        {commitments.map((c, i) => (
          <div key={c.label} className="stat-block">
            {i > 0 && <hr className="hr-thorn" />}
            <div className={i === 0 ? "mt-6" : ""}>
              <p className="stat-label">{locale === "hi" ? commitmentsHi[i].label : c.label}</p>
              <span className="statistic mt-2">{locale === "hi" ? commitmentsHi[i].value : c.value}</span>
              <p className="stat-detail">{locale === "hi" ? commitmentsHi[i].detail : c.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
    </>
  );
}

export function HomePlatformsBand({ locale }: { locale: Locale }) {
  const say = sayFor(locale);
  return (
    <>
  {/* FOR PLATFORMS: the partner programme, linking to /for-platforms. */}
  <section className="container pb-4 md:pb-8" aria-labelledby="platforms-heading">
    <div className="pf-home-band mx-auto max-w-6xl p-7 md:p-12">
      <div className="grid items-center gap-10 lg:grid-cols-[6fr_5fr]">
        <div>
          <span className="eyebrow">{say("For platforms", "प्लेटफ़ॉर्म के लिए")}</span>
          <h2 id="platforms-heading" className="section-title mt-4">
            {say("Run a platform? Help us keep abuse off it.", "क्या आप कोई प्लेटफ़ॉर्म चलाते हैं? इस दुर्व्यवहार को रोकने में साथ दें।")}
          </h2>
          <span aria-hidden="true" className="pf-rule mt-5" />
          <p className="mt-5 max-w-xl text-base leading-[1.7] text-[var(--text)] md:text-lg">
            {say(
              "Join Asmita's partner programme. Get survivors' reports through one channel, with fingerprints you can match, so content comes down quickly and stays down. It is free.",
              "अस्मिता के पार्टनर कार्यक्रम से जुड़ें। पीड़ितों की रिपोर्ट एक ही जगह, मिलान योग्य फ़िंगरप्रिंट के साथ पाएँ, ताकि सामग्री जल्दी हटे और दोबारा न आए। यह निःशुल्क है।",
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="btn btn-primary btn-arrow !m-0" href="/for-platforms">
              {say("Become a partner", "पार्टनर बनें")}
            </Link>
            {locale === "hi" && <span className="muted text-sm">यह पेज अंग्रेज़ी में है।</span>}
          </div>
        </div>
        <ul className="grid gap-3">
          {[
            { icon: "fingerprint" as const, en: "Fingerprint alerts from survivors' cases", hi: "पीड़ितों के मामलों से फ़िंगरप्रिंट अलर्ट" },
            { icon: "inbox" as const, en: "One channel for takedown notices", hi: "हटाने की सूचनाओं के लिए एक ही चैनल" },
            { icon: "radar" as const, en: "Crawler monitoring, with your permission", hi: "आपकी अनुमति से क्रॉलर निगरानी" },
          ].map((item) => (
            <li key={item.icon} className="pf-home-item">
              <span className="pf-chip pf-chip-flame">{icons[item.icon]}</span>
              <span className="text-[16px] font-medium leading-[1.4] text-[var(--ink)]">{say(item.en, item.hi)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
    </>
  );
}

