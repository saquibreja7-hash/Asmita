import { QuickExit } from "@/components/QuickExit";
import type { Metadata } from "next";
import Link from "next/link";
import { LabSection, LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { Icon, type IconName } from "@/components/Icon";
import { BRAND_TONES } from "@/components/IssueTopicCards";
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
    action: "File a complaint and prepare a takedown notice.",
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
    action: "You can report a fake image directly. Checking it for AI signals is optional.",
    href: "/start",
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
    body: "We help you prepare a legally grounded notice. You read and sign it before verified delivery. Fingerprints are generated on your device. If a separate deeper image check is available, it sends the image only when you consent.",
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

const TOOLS = [
  {
    tag: "Report",
    title: "File a complaint",
    body: "Prepare a takedown notice. Review and sign when you are ready; delivery requires verified contacts.",
    href: "/start",
    cta: "File a complaint",
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

const SCENARIO_ICONS: IconName[] = ["eyeOff", "alert", "lock", "scan", "overlap", "shieldCheck"];
const TOOL_ICONS: IconName[] = ["notice", "scan", "shieldCheck"];

const hindi = {
  scenarios: [
    { title: "मेरी निजी तस्वीर या वीडियो बिना मेरी सहमति के साझा किया गया है।", action: "शिकायत दर्ज करें। हम हटाने की सूचना तैयार करने में मदद करेंगे।" },
    { title: "कोई मेरी तस्वीरें साझा करने की धमकी दे रहा है।", action: "इंतज़ार न करें। संदेशों को सबूत के रूप में सुरक्षित रखें और मदद लें।" },
    { title: "कोई पैसे माँग रहा है और तस्वीरें लीक करने की धमकी दे रहा है।", action: "और पैसे या सामग्री न भेजें। संदेश सुरक्षित रखें और घटना की रिपोर्ट करें।" },
    { title: "मेरी नकली या AI से बनाई गई निजी तस्वीर है।", action: "आप नकली तस्वीर की शिकायत सीधे कर सकते हैं। एआई के संकेतों की जाँच वैकल्पिक है।" },
    { title: "किसी ने सोशल मीडिया की मेरी तस्वीर बदल दी है।", action: "बदली हुई तस्वीर की रिपोर्ट भी इसी रास्ते से की जा सकती है।" },
    { title: "तस्वीर में दिख रहा व्यक्ति 18 साल से कम उम्र का है।", action: "इसके लिए अलग, सुरक्षित रास्ता है। सही बाल-सुरक्षा सहायता देखें।" },
  ],
  steps: [
    { title: "पहले सुरक्षित सबूत रखें", body: "लिंक केवल पाठ के रूप में रखें। संदेश, खाते का नाम, तारीख और समय सुरक्षित रखें। निजी तस्वीर को सहेजने या आगे भेजने से बचें। 18 साल से कम उम्र के किसी व्यक्ति की निजी तस्वीर कभी न सहेजें या भेजें।" },
    { title: "रिपोर्ट और हटाने की सूचना", body: "हम कानूनी आधार वाली सूचना तैयार करने में मदद करते हैं। आप उसे पढ़कर हस्ताक्षर करते हैं। डिजिटल फ़िंगरप्रिंट आपके डिवाइस पर बनते हैं। अलग से गहरी तस्वीर जाँच उपलब्ध हो तो उसमें तस्वीर केवल आपकी सहमति से भेजी जाती है।" },
    { title: "संपर्क रोकें और खाते सुरक्षित करें", body: "सबूत सुरक्षित रखने के बाद जवाब देना बंद करें। पासवर्ड बदलें, दो-कारक सुरक्षा चालू करें और खाते की गोपनीयता जाँचें।" },
    { title: "अतिरिक्त सहायता लें", body: "हेल्पलाइन, परामर्शदाता या व्यावहारिक मार्गदर्शिका से मदद लें। आपको यह अकेले नहीं झेलना है।" },
  ],
  tools: [
    { tag: "रिपोर्ट", title: "शिकायत दर्ज करें", body: "हटाने की सूचना तैयार करें। आगे बढ़ने से पहले उसे पढ़ें और हस्ताक्षर करें।", cta: "शिकायत दर्ज करें" },
    { tag: "जाँच", title: "तस्वीर जाँचें", body: "देखें कि तस्वीर में AI से बनाए या बदले जाने के संकेत हैं या नहीं।", cta: "तस्वीर जाँचें" },
    { tag: "18 से कम", title: "नाबालिग के लिए सहायता", body: "18 साल से कम उम्र के व्यक्ति के लिए बाल-सुरक्षा रास्ता देखें। यहाँ तस्वीर अपलोड नहीं होती।", cta: "सही मदद देखें" },
  ],
} as const;

export default async function GetHelpPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const tools = TOOLS.map((tool, i) => ({ ...tool, ...(locale === "hi" ? hindi.tools[i] : {}) }));
  return (
    <LabToolShell variant="calm">
      <QuickExit locale={locale} enableIdle={false} />
      <LabToolHero
        badge={say("Free and confidential", "मुफ़्त और गोपनीय")}
        title={say("Get help with image-based abuse", "तस्वीरों के ज़रिए हुए उत्पीड़न में मदद लें")}
        intro={
          <p>
            {say(
              "Free and confidential. Pick the situation that fits, or follow the four steps below. You can go at your own pace.",
              "मदद नि:शुल्क और गोपनीय है। अपनी स्थिति चुनें या नीचे दिए चार चरण देखें। अपनी गति से आगे बढ़ें।",
            )}
          </p>
        }
        visual={
          <div className="help-urgent">
            <p className="help-urgent-title">
              <Icon name="alert" size={18} /> {say("If you need urgent help", "अगर तुरंत मदद चाहिए")}
            </p>
            <ul className="help-urgent-list" role="list">
              <li className="issue-tone-coral">
                <span>{say("In immediate danger?", "तुरंत खतरा है?")}</span>
                <a href="tel:112">112</a>
              </li>
              <li className="issue-tone-teal">
                <span>
                  {say("Women’s helpline", "महिला हेल्पलाइन")}
                  <small>{say("If unavailable, call 112.", "नंबर उपलब्ध न हो तो 112 पर कॉल करें।")}</small>
                </span>
                <a href="tel:181">181</a>
              </li>
              <li className="issue-tone-gold">
                <span>{say("Under 18: Childline", "18 साल से कम: बाल हेल्पलाइन")}</span>
                <a href="tel:1098">1098</a>
              </li>
              <li className="issue-tone-teal">
                <span>
                  {say("Report cybercrime", "साइबर अपराध रिपोर्ट करें")}
                  <small>
                    <a className="text-link" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">
                      cybercrime.gov.in
                    </a>
                  </small>
                </span>
                <a href="tel:1930">1930</a>
              </li>
            </ul>
          </div>
        }
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn-primary btn-arrow !m-0" href="/start">
            {say("File a complaint", "शिकायत दर्ज करें")}
          </Link>
          <Link className="btn btn-secondary !m-0" href="/minor-support">
            {say("Under-18 help", "कम उम्र में मदद")}
          </Link>
        </div>
      </LabToolHero>

      {/* SCENARIOS: survivor voice */}
      <LabSection
        id="scenarios-heading"
        index="01"
        title={say("Start with your situation", "अपनी स्थिति से शुरू करें")}
        lede={
          <p>
            {say(
              "Whatever is happening, there is a path. Choose the one that sounds closest to yours.",
              "जो भी हुआ है, मदद का रास्ता है। अपनी स्थिति के सबसे करीब विकल्प चुनें।",
            )}
          </p>
        }
      >
        <ul className="help-scenarios" role="list">
          {scenarios.map((scenario, i) => (
            <li key={scenario.title} className={`help-scenario issue-tone-${BRAND_TONES[i % BRAND_TONES.length]}`}>
              <details>
                <summary>
                  <span className="issue-topic-icon" aria-hidden="true">
                    <Icon name={SCENARIO_ICONS[i]} size={20} />
                  </span>
                  <span className="help-scenario-q">{locale === "hi" ? hindi.scenarios[i].title : scenario.title}</span>
                  <span className="help-scenario-chev" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="help-scenario-a">
                  <p>{locale === "hi" ? hindi.scenarios[i].action : scenario.action}</p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
                    <Link className="text-link" href={scenario.href}>
                      {scenario.href === "/minor-support"
                        ? say("Get under-18 support", "कम उम्र में मदद लें")
                        : say("File a complaint", "शिकायत दर्ज करें")}
                    </Link>
                    {i === 3 && (
                      <a className="text-link" href="/check-image">
                        {say("Check the image if you want", "चाहें तो तस्वीर जाँचें")}
                      </a>
                    )}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </LabSection>

      {/* FOUR-STEP SPINE */}
      <LabSection
        id="steps-heading"
        index="02"
        title={say("What to do, step by step", "एक-एक चरण में क्या करें")}
        lede={
          <p>
            {say(
              "The same four steps work for a shared image, a threat, or blackmail. Do what you can, in order.",
              "तस्वीर साझा होने, धमकी या ब्लैकमेल की स्थिति में ये चरण मदद कर सकते हैं। जितना संभव हो, क्रम से करें।",
            )}
          </p>
        }
      >
        <ol className="issue-points" role="list">
          {steps.map((step, i) => (
            <li key={step.n} className={`issue-point issue-tone-${BRAND_TONES[i % BRAND_TONES.length]}`}>
              <span className="issue-point-n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="issue-point-title">{locale === "hi" ? hindi.steps[i].title : step.title}</h3>
              <p className="issue-point-body">{locale === "hi" ? hindi.steps[i].body : step.body}</p>
            </li>
          ))}
        </ol>
      </LabSection>

      {/* TOOLS */}
      <LabSection id="tools-heading" index="03" title={say("The tools you can use now", "अभी उपलब्ध साधन")}>
        <ul className="issue-topics" role="list">
          {tools.map((tool, i) => (
            <li key={tool.href} className={`issue-topic issue-tone-${BRAND_TONES[i % BRAND_TONES.length]}`}>
              <div className="issue-topic-top">
                <span className="issue-topic-icon" aria-hidden="true">
                  <Icon name={TOOL_ICONS[i]} size={22} />
                </span>
                <span className="issue-topic-n">{tool.tag}</span>
              </div>
              <h3 className="issue-topic-title">{tool.title}</h3>
              <p className="issue-topic-short">{tool.body}</p>
              <div className="mt-6">
                {/* A full page load for /check-image: its own headers allow the C2PA WASM reader. */}
                {tool.href === "/check-image" ? (
                  <a href={tool.href} className="btn btn-primary btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                    {tool.cta}
                  </a>
                ) : (
                  <Link href={tool.href} className="btn btn-primary btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                    {tool.cta}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </LabSection>

      {/* HONEST OUTCOMES */}
      <LabSection
        id="honest-heading"
        index="04"
        title={say("What a takedown can and cannot do", "हटाने की कार्रवाई से क्या हो सकता है और क्या नहीं")}
      >
        <div className="help-honest">
          <div className="help-honest-col issue-tone-teal">
            <p className="help-honest-label">
              <Icon name="check" size={18} /> {say("What it can do", "क्या संभव है")}
            </p>
            <ul>
              <li>{say("Get content removed from platforms that respond.", "कार्रवाई करने वाले प्लेटफ़ॉर्म से सामग्री हटवाई जा सकती है।")}</li>
              <li>{say("Ask search engines to stop showing it in results.", "खोज परिणामों से सामग्री हटाने का अनुरोध किया जा सकता है।")}</li>
              <li>
                {say(
                  "Track each reported link and submit a new link if content reappears.",
                  "हर रिपोर्ट किए लिंक की स्थिति देखें; सामग्री दोबारा दिखे तो नया लिंक दें।",
                )}
              </li>
            </ul>
          </div>
          <div className="help-honest-col issue-tone-coral">
            <p className="help-honest-label">
              <Icon name="x" size={18} /> {say("What it cannot do", "क्या नहीं हो सकता")}
            </p>
            <ul>
              <li>{say("Erase content from the whole internet or private devices.", "पूरे इंटरनेट या निजी डिवाइस से सामग्री मिटाने की गारंटी नहीं है।")}</li>
              <li>{say("Force a platform that ignores the law to act instantly.", "किसी प्लेटफ़ॉर्म से तुरंत कार्रवाई करवाने की गारंटी नहीं है।")}</li>
              <li>{say("Promise a result. We tell you exactly where things stand.", "किसी परिणाम का वादा नहीं है; हम स्थिति साफ़ बताते हैं।")}</li>
            </ul>
          </div>
        </div>
      </LabSection>

      {/* CLOSING */}
      <section className="lab-sub-section" aria-label={say("Get started", "शुरू करें")}>
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{say("You do not have to deal with this alone.", "आपको इसका सामना अकेले नहीं करना है।")}</h2>
            <p className="issue-close-body">
              {say(
                "Start when you are ready. Every step is confidential, and you stay in control the whole way.",
                "जब तैयार हों, तब शुरू करें। हर चरण गोपनीय है और फ़ैसला आपके हाथ में रहता है।",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary btn-arrow !m-0" href="/start">
                {say("File a complaint", "शिकायत दर्ज करें")}
              </Link>
              <Link className="btn btn-secondary btn-arrow !m-0" href="/resources">
                {say("Browse resources", "सहायता सामग्री देखें")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
