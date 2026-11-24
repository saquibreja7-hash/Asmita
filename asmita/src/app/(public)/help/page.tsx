import type { Metadata } from "next";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { SupporterLogos } from "@/components/layout/Supporters";
import { AudiencePicker } from "../AudiencePicker";
import { HomeHelpBand, HomeIssueSection, HomePlatformsBand } from "../home-sections";

export const metadata: Metadata = {
  title: "Get help",
  description: "Free, confidential help in India for intimate images shared without consent: file a complaint, call the helpline or use the AI assistant.",
};

/*
 * /help: the original homepage, now in the calm site design (LabToolShell, white illustrations).
 */

// Each audience can have its own scene, shown while its button is hovered.
// Young people are under 18: their scene must never show a person.
const audiences: { title: string; href: string; art?: string }[] = [
  { title: "Survivors", href: "/who-we-help/survivors", art: "/images/illustrations/how-3-protect.webp" },
  { title: "People helping someone", href: "/who-we-help/helping-someone", art: "/images/illustrations/audience-helping.webp" },
  { title: "Parents and families", href: "/who-we-help/parents", art: "/images/illustrations/audience-parents.webp" },
  { title: "Young people", href: "/who-we-help/young-people", art: "/images/illustrations/audience-young.webp" },
];

const pipeline = [
  { icon: "¶", label: "Links as text" },
  { icon: "§", label: "Legal notice" },
  { icon: "✎", label: "You sign" },
  { icon: "→", label: "Platform" },
] as const;

const features = [
  {
    icon: "§",
    title: "Legally grounded takedown notices",
    body: "A removal notice citing the IT Rules and MeitY procedure. You read and sign it; delivery follows verified contact and template review.",
    href: "/what-we-do",
    cta: "How notices work",
  },
  {
    icon: "#",
    title: "Generate a private fingerprint",
    body: "Adults can generate a fingerprint on their device and add the code to a case. Matching depends on participating platforms.",
    href: "/get-help",
    cta: "Current ways to get help",
  },
  {
    icon: "?",
    title: "AI and deepfake check",
    body: "A private check for signals that an image was generated or edited by AI. A fake image is still abuse, and you can still report it.",
    href: "/check-image",
    cta: "Check an image",
  },
] as const;

const faqs = [
  {
    q: "Do I have to upload the image?",
    a: "No. In the current reporting flow, you paste links as text. We do not fetch or view the image.",
  },
  {
    q: "Will the content disappear from the whole internet?",
    a: "No one can honestly promise that. A report targets the named platform. Re-uploads need a new report while fingerprint blocking remains under development.",
  },
  {
    q: "Is this a government service?",
    a: "No. Asmita is an independent platform built by JAMSAQ Studio. We route you to official channels where they help, and stay honest about where they do not.",
  },
  {
    q: "What if I am under 18, or the image is from when I was?",
    a: "There is a separate, safer path. Cases involving minors are routed under POCSO and never enter the adult flow. Start from the minor support page.",
  },
] as const;

const hindi = {
  audiences: ["प्रभावित व्यक्ति", "किसी की मदद कर रहे लोग", "माता-पिता और परिवार", "युवा लोग"],
  pipeline: ["लिंक केवल पाठ के रूप में", "कानूनी सूचना", "आप हस्ताक्षर करें", "प्लेटफ़ॉर्म"],
  features: [
    {
      title: "कानूनी आधार वाली हटाने की सूचना",
      body: "हम IT Rules और MeitY की प्रक्रिया का हवाला देने वाली सूचना तैयार करने में मदद करते हैं। आप इसे पढ़कर हस्ताक्षर करते हैं; पुष्टि किए गए संपर्क और समीक्षा के बाद ही इसे भेजा जाता है।",
      cta: "सूचना कैसे काम करती है",
    },
    {
      title: "दोबारा अपलोड रोकने का तरीका विकसित हो रहा है",
      body: "भविष्य के डिजिटल फ़िंगरप्रिंट उपकरण आपके डिवाइस पर काम करेंगे। मौजूदा URL-आधारित रिपोर्ट में वे उपलब्ध नहीं हैं।",
      cta: "अभी उपलब्ध मदद देखें",
    },
    {
      title: "AI और डीपफ़ेक की जाँच",
      body: "निजी तौर पर देखें कि तस्वीर में AI से बनाए या बदले जाने के संकेत हैं या नहीं। नकली तस्वीर भी उत्पीड़न है और आप उसकी रिपोर्ट कर सकते हैं।",
      cta: "तस्वीर जाँचें",
    },
  ],
  faqs: [
    {
      q: "क्या मुझे तस्वीर अपलोड करनी होगी?",
      a: "नहीं। मौजूदा रिपोर्ट में आप लिंक केवल पाठ के रूप में देते हैं। हम तस्वीर खोलते या देखते नहीं हैं।",
    },
    {
      q: "क्या सामग्री पूरे इंटरनेट से हट जाएगी?",
      a: "इसका वादा कोई ईमानदारी से नहीं कर सकता। रिपोर्ट संबंधित प्लेटफ़ॉर्म के लिए होती है। सामग्री दोबारा दिखे तो नया लिंक रिपोर्ट करें; फ़िंगरप्रिंट से रोकने का तरीका अभी विकसित हो रहा है।",
    },
    {
      q: "क्या यह सरकारी सेवा है?",
      a: "नहीं। अस्मिता JAMSAQ Studio द्वारा बनाया गया स्वतंत्र प्लेटफ़ॉर्म है। जहाँ मदद मिल सकती है, वहाँ हम आपको आधिकारिक रास्ते दिखाते हैं।",
    },
    {
      q: "अगर मेरी उम्र 18 से कम है, या तस्वीर उस समय की है जब मैं नाबालिग था?",
      a: "इसके लिए अलग और अधिक सुरक्षित रास्ता है। नाबालिगों से जुड़े मामले वयस्क रिपोर्ट प्रक्रिया में नहीं जाते। नाबालिग सहायता पृष्ठ से शुरू करें।",
    },
  ],
} as const;

export default async function HelpPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        title={say("You are not alone. Let's take it down.", "आप अकेली नहीं हैं। आइए इसे हटवाएँ।")}
        intro={
          <p>
            {say(
              "Asmita offers free, confidential help in India for intimate images shared without consent. Share the links, sign the notice, and we handle the platforms. Your photos never leave your phone.",
              "अस्मिता भारत में बिना सहमति साझा की गई अंतरंग तस्वीरों को हटवाने के लिए मुफ़्त और गोपनीय मदद देती है। लिंक साझा करें, सूचना पर हस्ताक्षर करें, और प्लेटफ़ॉर्म से हम बात करेंगे। आपकी तस्वीरें कभी आपके फ़ोन से बाहर नहीं जातीं।",
            )}
          </p>
        }
        visual={<Illustration name="home-hero" eager className="issue-hero-art" />}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link className="btn btn-primary btn-arrow !m-0" href="/start">
            {say("File a complaint", "शिकायत दर्ज करें")}
          </Link>
          <Link className="btn btn-secondary !m-0" href="/how-it-works">
            {say("How it works", "यह कैसे काम करता है")}
          </Link>
        </div>
        <ul className="home-hero-trust mt-8">
          <li>{say("Free, always", "मुफ़्त, हमेशा")}</li>
          <li>{say("No ID or Aadhaar needed", "किसी आईडी या आधार की आवश्यकता नहीं")}</li>
          <li>{say("Your photo never leaves your device", "आपकी फोटो कभी भी आपके डिवाइस से बाहर नहीं जाती")}</li>
        </ul>
      </LabToolHero>

        <HomeHelpBand locale={locale} />

        {/* SUPPORTERS: a full-width white strip so the partners stand out from the page. */}
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

        {/* Pipeline diagram */}
        <section>
          <div className="container pt-16 pb-20 md:pt-20 md:pb-28">
            <div className="pipeline" role="list">
              {pipeline.map((n, i) => (
                <div key={n.label} className="contents" role="listitem">
                  {i > 0 && <span className="pipeline-link" aria-hidden />}
                  <span className={`node ${i === 1 ? "node-hub" : ""}`}>
                    <span className="node-icon" aria-hidden>
                      {n.icon}
                    </span>
                    {locale === "hi" ? hindi.pipeline[i] : n.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="eyebrow mt-6 w-full justify-center text-center">
              {say("No image is uploaded at any step", "किसी भी चरण में तस्वीर अपलोड नहीं होती")}
            </p>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        <HomeIssueSection locale={locale} />

        {/* FEATURES */}
        <section className="section-pad !pt-0" aria-labelledby="features-heading">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 id="features-heading" className="section-title mt-5">
                  {say("Tools for taking action on content", "सामग्री पर कार्रवाई के साधन")}
                </h2>
              </div>
              <Link href="/what-we-do" className="arrow-link">
                {say("More on what we do", "हमारे काम के बारे में और जानें")}
              </Link>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {features.map((f, i) =>
                // A full page load for /check-image: its own headers allow the C2PA WASM reader.
                f.href === "/check-image" ? (
                  <a key={f.title} href={f.href} className="card fade flex flex-col">
                    <span className="card-icon" aria-hidden>
                      {f.icon}
                    </span>
                    <h3>{locale === "hi" ? hindi.features[i].title : f.title}</h3>
                    <p className="mt-4 flex-1">{locale === "hi" ? hindi.features[i].body : f.body}</p>
                    <span className="arrow-link mt-8">{locale === "hi" ? hindi.features[i].cta : f.cta}</span>
                  </a>
                ) : (
                  <Link key={f.title} href={f.href} className="card fade flex flex-col">
                    <span className="card-icon" aria-hidden>
                      {f.icon}
                    </span>
                    <h3>{locale === "hi" ? hindi.features[i].title : f.title}</h3>
                    <p className="mt-4 flex-1">{locale === "hi" ? hindi.features[i].body : f.body}</p>
                    <span className="arrow-link mt-8">{locale === "hi" ? hindi.features[i].cta : f.cta}</span>
                  </Link>
                ),
              )}
            </div>

            {/* Elevated teal-mist card */}
            <div className="card card-elevated mt-4 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
              <div className="wash-art" aria-hidden />
              <div className="relative z-[1]">
                <span className="card-icon" aria-hidden>
                  ◐
                </span>
                <h3 className="text-[clamp(24px,3vw,32px)]">
                  {say("Your case can start with a link", "आप लिंक से मामला शुरू कर सकते हैं")}
                </h3>
                <p className="mt-4 max-w-md">
                  {say(
                    "Links are handled as text. Fingerprints are generated on your device. The optional deeper AI check sends an image only with your consent. Read the privacy promise before you begin.",
                    "लिंक पाठ के रूप में लिए जाते हैं। फिंगरप्रिंट आपके डिवाइस पर बनता है। वैकल्पिक विस्तृत AI जाँच में आपकी सहमति से ही तस्वीर भेजी जाती है। शुरू करने से पहले निजता का वादा पढ़ें।",
                  )}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/privacy" className="btn btn-primary">
                    {say("Read the privacy promise", "निजता का वादा पढ़ें")}
                  </Link>
                </div>
              </div>
              <div className="relative z-[1] hidden md:block" aria-hidden />
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* AUDIENCES */}
        <section className="section-pad" aria-labelledby="audience-heading">
          <div className="container text-center">
            <h2 id="audience-heading" className="section-title mx-auto mt-5 max-w-3xl">
              {say("Everyone has a role to play", "हर व्यक्ति मदद कर सकता है")}
            </h2>
            <p className="font-size-large mx-auto mt-6 max-w-xl">
              {say(
                "We do not have to scroll past while harm happens. Find the path written for your situation.",
                "नुकसान को देखकर आगे बढ़ जाना ज़रूरी नहीं है। अपनी स्थिति के मुताबिक सहायता का रास्ता चुनें।",
              )}
            </p>
            <AudiencePicker
              defaultArt="/images/illustrations/who-we-help.webp"
              audiences={audiences.map((a, i) => ({
                label: locale === "hi" ? hindi.audiences[i] : a.title,
                href: a.href,
                art: a.art,
              }))}
            />
          </div>
        </section>

        <HomePlatformsBand locale={locale} />

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FAQ */}
        <section className="section-pad" aria-labelledby="faq-heading">
          <div className="container grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-24">
            <div>
              <h2 id="faq-heading" className="section-title mt-5">
                {say("Honest answers first", "पहले स्पष्ट जवाब")}
              </h2>
              <p className="mt-6 text-[16px] leading-[1.5] text-[var(--text)]">
                {say(
                  "We say exactly what a notice can and cannot do. That honesty is the product.",
                  "हम साफ़ बताते हैं कि सूचना से क्या हो सकता है और क्या नहीं।",
                )}
              </p>
              <Link href="/faq" className="arrow-link mt-8">
                {say("Read the full FAQ", "सभी सवाल-जवाब पढ़ें")}
              </Link>
            </div>
            <div className="border-t border-[var(--line)]">
              {faqs.map((f, i) => (
                <details key={f.q} className="faq-item">
                  <summary>{locale === "hi" ? hindi.faqs[i].q : f.q}</summary>
                  <div className="faq-answer">{locale === "hi" ? hindi.faqs[i].a : f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="lab-sub-section">
          <div className="container">
            <div className="issue-close">
              <p className="lab-badge">{say("The Asmita promise", "अस्मिता का वादा")}</p>
              <h2 className="lab-h2 mt-4">{say("You do not have to deal with this alone.", "आपको इसका सामना अकेले नहीं करना है।")}</h2>
              <p className="issue-close-body">
                {say(
                  "Start a confidential report, or read how it works first. In your language, on your terms.",
                  "गोपनीय रिपोर्ट शुरू करें, या पहले प्रक्रिया समझें। अपनी भाषा में, अपनी गति से।",
                )}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn btn-primary btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary !m-0" href="/faq">
                  {say("Read the FAQ", "सवाल-जवाब पढ़ें")}
                </Link>
              </div>
            </div>
          </div>
        </section>
    </LabToolShell>
  );
}
