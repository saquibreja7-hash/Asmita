import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";

/*
 * Get Help hub — the triage front door.
 * Patterns: safety/helplines first (eSafety), survivor-voice scenario titles
 * (eSafety), the reusable four-step spine (eSafety), honest outcomes before
 * acting (eSafety + our own charter). English copy inline; Hindi + i18n follow
 * once content is signed off.
 */

export const metadata: Metadata = {
  title: "Get help",
  description:
    "Free, confidential help for image-based abuse in India. Find your situation, follow the steps, and reach the right support.",
};

const scenarios = [
  {
    title: "My private photos or video were shared without my consent.",
    action: "Start a report and prepare a takedown notice.",
    href: "/start",
  },
  {
    title: "Someone is threatening to share my photos.",
    action: "Do not wait. Save the messages as evidence, then start a report.",
    href: "/start",
  },
  {
    title: "Someone is demanding money or they will leak my photos.",
    action: "Do not pay. Do not send anything more. Keep the messages and report it.",
    href: "/start",
  },
  {
    title: "There is a fake or AI-made nude of me.",
    action: "Check the image first, then report it. A fake image is still abuse.",
    href: "/check-image",
  },
  {
    title: "Someone morphed my photo from social media.",
    action: "You can report morphed and edited images the same way.",
    href: "/start",
  },
  {
    title: "The person in the image is under 18.",
    action: "This needs a different, safer path. We will point you to the right help.",
    href: "/minor-support",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Save the evidence first",
    body: "Keep the link as text, and save messages, account names, dates, and times. Avoid saving or forwarding the intimate image. Never save or send intimate imagery of anyone under 18.",
  },
  {
    n: "2",
    title: "Report and send a takedown",
    body: "We help you prepare a legally grounded notice. You read and sign it before verified delivery. Fingerprint generation stays on your device; an optional deeper AI check sends the image with consent.",
  },
  {
    n: "3",
    title: "Stop contact and lock down",
    body: "Stop replying. Block the person only after you have saved evidence, not before. Change your passwords, turn on two-factor, and check who can see your accounts.",
  },
  {
    n: "4",
    title: "Get more support",
    body: "Reach a helpline, a counsellor, or a practical guide. This is not something you have to carry alone.",
  },
] as const;

const tools = [
  {
    tag: "Report",
    title: "Start a report",
    body: "Prepare a takedown notice. Review and sign when you are ready; delivery requires verified contacts.",
    href: "/start",
    cta: "Start a report",
  },
  {
    tag: "Check",
    title: "Check an image",
    body: "See whether an image carries signals that it was made or edited by AI.",
    href: "/check-image",
    cta: "Check an image",
  },
  {
    tag: "Under 18",
    title: "Support for a minor",
    body: "If the person is under 18, this routes you to child-protection help. No image is uploaded here.",
    href: "/minor-support",
    cta: "Find the right help",
  },
] as const;

const hindi = {
  scenarios: [
    { title: "मेरी निजी तस्वीर या वीडियो बिना मेरी सहमति के साझा किया गया है।", action: "रिपोर्ट शुरू करें। हम हटाने की सूचना तैयार करने में मदद करेंगे।" },
    { title: "कोई मेरी तस्वीरें साझा करने की धमकी दे रहा है।", action: "इंतज़ार न करें। संदेशों को सबूत के रूप में सुरक्षित रखें और मदद लें।" },
    { title: "कोई पैसे माँग रहा है और तस्वीरें लीक करने की धमकी दे रहा है।", action: "और पैसे या सामग्री न भेजें। संदेश सुरक्षित रखें और घटना की रिपोर्ट करें।" },
    { title: "मेरी नकली या AI से बनाई गई निजी तस्वीर है।", action: "तस्वीर में AI के संकेत जाँचें, फिर रिपोर्ट करें। नकली तस्वीर भी उत्पीड़न है।" },
    { title: "किसी ने सोशल मीडिया की मेरी तस्वीर बदल दी है।", action: "बदली हुई तस्वीर की रिपोर्ट भी इसी रास्ते से की जा सकती है।" },
    { title: "तस्वीर में दिख रहा व्यक्ति 18 साल से कम उम्र का है।", action: "इसके लिए अलग, सुरक्षित रास्ता है। सही बाल-सुरक्षा सहायता देखें।" },
  ],
  steps: [
    { title: "पहले सुरक्षित सबूत रखें", body: "लिंक केवल पाठ के रूप में रखें। संदेश, खाते का नाम, तारीख और समय सुरक्षित रखें। निजी तस्वीर को सहेजने या आगे भेजने से बचें। 18 साल से कम उम्र के किसी व्यक्ति की निजी तस्वीर कभी न सहेजें या भेजें।" },
    { title: "रिपोर्ट और हटाने की सूचना", body: "हम कानूनी आधार वाली सूचना तैयार करने में मदद करते हैं। आप उसे पढ़कर हस्ताक्षर करते हैं। आपकी तस्वीर आपके डिवाइस से बाहर नहीं जाती।" },
    { title: "संपर्क रोकें और खाते सुरक्षित करें", body: "सबूत सुरक्षित रखने के बाद जवाब देना बंद करें। पासवर्ड बदलें, दो-कारक सुरक्षा चालू करें और खाते की गोपनीयता जाँचें।" },
    { title: "अतिरिक्त सहायता लें", body: "हेल्पलाइन, परामर्शदाता या व्यावहारिक मार्गदर्शिका से मदद लें। आपको यह अकेले नहीं झेलना है।" },
  ],
  tools: [
    { tag: "रिपोर्ट", title: "रिपोर्ट शुरू करें", body: "हटाने की सूचना तैयार करें। आगे बढ़ने से पहले उसे पढ़ें और हस्ताक्षर करें।", cta: "रिपोर्ट शुरू करें" },
    { tag: "जाँच", title: "तस्वीर जाँचें", body: "देखें कि तस्वीर में AI से बनाए या बदले जाने के संकेत हैं या नहीं।", cta: "तस्वीर जाँचें" },
    { tag: "18 से कम", title: "नाबालिग के लिए सहायता", body: "18 साल से कम उम्र के व्यक्ति के लिए बाल-सुरक्षा रास्ता देखें। यहाँ तस्वीर अपलोड नहीं होती।", cta: "सही मदद देखें" },
  ],
} as const;

export default async function GetHelpPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO + safety first */}
        <section className="hero" aria-label={say("Get help", "मदद लें")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("Get help", "मदद लें")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Something happened. Here is what to do.", "कुछ हुआ है। अब आप ये कदम उठा सकते हैं।")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say(
                  "Free and confidential. Pick the situation that fits, or follow the four steps below. You can go at your own pace.",
                  "मदद नि:शुल्क और गोपनीय है। अपनी स्थिति चुनें या नीचे दिए चार चरण देखें। अपनी गति से आगे बढ़ें।",
                )}
              </p>
            </div>

            {/* Emergency strip — safety before instructions */}
            <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius-lg)] border border-[var(--warm-border)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm">
              <p className="text-sm font-medium uppercase tracking-[-0.033em] text-[var(--heading)]">
                {say("If you need urgent help", "अगर तुरंत मदद चाहिए")}
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>{say("In immediate danger?", "तुरंत खतरा है?")}</strong> {say("Call", "कॉल करें")}{" "}
                  <a className="text-link" href="tel:112">112</a>.
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>{say("Women’s helpline:", "महिला हेल्पलाइन:")}</strong>{" "}
                  <a className="text-link" href="tel:181">181</a>. {say("If unavailable, call 112.", "नंबर उपलब्ध न हो तो 112 पर कॉल करें।")}
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>{say("Under 18:", "18 साल से कम:")}</strong> {say("Childline", "बाल हेल्पलाइन")}{" "}
                  <a className="text-link" href="tel:1098">1098</a>.
                </li>
                <li className="text-[15px] leading-[1.5] text-[var(--body)]">
                  <strong>{say("Report cybercrime:", "साइबर अपराध रिपोर्ट करें:")}</strong>{" "}
                  <a className="text-link" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>{" "}
                  {say("or", "या")} <a className="text-link" href="tel:1930">1930</a>.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* SCENARIOS — survivor voice */}
        <section className="zone-white section-pad" aria-labelledby="scenarios-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <h2
                id="scenarios-heading"
                className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
              >
                {say("Start with your situation", "अपनी स्थिति से शुरू करें")}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-[1.6] text-[var(--body)]">
                {say(
                  "Whatever is happening, there is a path. Choose the one that sounds closest to yours.",
                  "जो भी हुआ है, मदद का रास्ता है। अपनी स्थिति के सबसे करीब विकल्प चुनें।",
                )}
              </p>
              <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {scenarios.map((s, i) => (
                  <Link
                    key={s.title}
                    href={s.href}
                    className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-6 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <h3 className="text-[17px] font-medium leading-snug text-[var(--heading)]">
                      &ldquo;{locale === "hi" ? hindi.scenarios[i].title : s.title}&rdquo;
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-[1.6] text-[var(--muted)]">
                      {locale === "hi" ? hindi.scenarios[i].action : s.action}
                    </p>
                    <span className="mt-4 inline-block text-sm font-medium text-[var(--color-off-black)]">
                      {say("What to do", "क्या करें")}{" "}
                      <span className="transition-transform group-hover:translate-x-0.5 inline-block" aria-hidden>
                        →
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FOUR-STEP SPINE */}
        <section className="transform-section" aria-labelledby="steps-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("The four steps", "चार चरण")}</span>
              <h2
                id="steps-heading"
                className="font-display mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
              >
                {say("What to do, step by step", "एक-एक चरण में क्या करें")}
              </h2>
              <p className="mt-4 text-lg leading-[1.6] text-[var(--body)]">
                {say(
                  "The same four steps work for a shared image, a threat, or blackmail. Do what you can, in order.",
                  "तस्वीर साझा होने, धमकी या ब्लैकमेल की स्थिति में ये चरण मदद कर सकते हैं। जितना संभव हो, क्रम से करें।",
                )}
              </p>
            </div>
            <ol className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
              {steps.map((s, i) => (
                <li
                  key={s.n}
                  className="rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm"
                >
                  <span className="font-display text-[var(--color-off-black)] text-2xl font-medium">
                    {s.n}
                  </span>
                  <h3 className="mt-2 text-[18px] font-medium text-[var(--heading)]">
                    {locale === "hi" ? hindi.steps[i].title : s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.65] text-[var(--body)]">
                    {locale === "hi" ? hindi.steps[i].body : s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TOOLS */}
        <section className="zone-white section-pad" aria-labelledby="tools-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <h2
                id="tools-heading"
                className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]"
              >
                {say("The tools you can use now", "अभी उपलब्ध साधन")}
              </h2>
              <div className="mt-10 grid gap-8 md:grid-cols-3">
                {tools.map((tool, i) => (
                  <div key={tool.title} className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)]">
                    <p className="text-xs font-medium uppercase tracking-[-0.033em] text-[var(--color-off-black)]">
                      {locale === "hi" ? hindi.tools[i].tag : tool.tag}
                    </p>
                    <h3 className="mt-3 text-[19px] font-medium text-[var(--heading)]">
                      {locale === "hi" ? hindi.tools[i].title : tool.title}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-[1.65] text-[var(--muted)]">
                      {locale === "hi" ? hindi.tools[i].body : tool.body}
                    </p>
                    <div className="mt-6">
                      <Link href={tool.href} className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                        {locale === "hi" ? hindi.tools[i].cta : tool.cta}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* HONEST OUTCOMES */}
        <section className="zone-white section-pad !pt-0" aria-labelledby="honest-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-8 md:p-12">
                <h2
                  id="honest-heading"
                  className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.15]"
                >
                  {say("What a takedown can and cannot do", "हटाने की कार्रवाई से क्या हो सकता है और क्या नहीं")}
                </h2>
                <div className="mt-6 grid gap-8 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[-0.033em] text-[var(--success)]">
                      {say("What it can do", "क्या संभव है")}
                    </p>
                    <ul className="mt-3 space-y-2 text-[15px] leading-[1.6] text-[var(--body)]">
                      <li>{say("Get content removed from platforms that respond.", "कार्रवाई करने वाले प्लेटफ़ॉर्म से सामग्री हटवाई जा सकती है।")}</li>
                      <li>{say("Ask search engines to stop showing it in results.", "खोज परिणामों से सामग्री हटाने का अनुरोध किया जा सकता है।")}</li>
                      <li>{say("Track each reported link and submit a new link if content reappears.", "हर रिपोर्ट किए लिंक की स्थिति देखें; सामग्री दोबारा दिखे तो नया लिंक दें।")}</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[-0.033em] text-[var(--warning)]">
                      {say("What it cannot do", "क्या नहीं हो सकता")}
                    </p>
                    <ul className="mt-3 space-y-2 text-[15px] leading-[1.6] text-[var(--body)]">
                      <li>{say("Erase content from the whole internet or private devices.", "पूरे इंटरनेट या निजी डिवाइस से सामग्री मिटाने की गारंटी नहीं है।")}</li>
                      <li>{say("Force a platform that ignores the law to act instantly.", "किसी प्लेटफ़ॉर्म से तुरंत कार्रवाई करवाने की गारंटी नहीं है।")}</li>
                      <li>{say("Promise a result. We tell you exactly where things stand.", "किसी परिणाम का वादा नहीं है; हम स्थिति साफ़ बताते हैं।")}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="zone-sunset" aria-label={say("Get started", "शुरू करें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.9rem,4.5vw,3rem)] font-medium leading-[1.12]">
                {say("You do not have to deal with this alone.", "आपको इसका सामना अकेले नहीं करना है।")}
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                {say(
                  "Start when you are ready. Every step is confidential, and you stay in control the whole way.",
                  "जब तैयार हों, तब शुरू करें। हर चरण गोपनीय है और फ़ैसला आपके हाथ में रहता है।",
                )}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/start">
                  {say("Start a report", "रिपोर्ट शुरू करें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources">
                  {say("Browse resources", "सहायता सामग्री देखें")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
