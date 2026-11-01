import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { SupporterLogos } from "@/components/layout/Supporters";
import { HELPLINE } from "@/lib/helpline";

/*
 * Home. Editorial system from DESIGN.md: parchment canvas, serif headlines at 400,
 * monospace for every functional string, pill buttons, hairline cards, one teal action.
 */

const audiences = [
  { title: "Survivors", href: "/who-we-help/survivors" },
  { title: "People helping someone", href: "/who-we-help/helping-someone" },
  { title: "Parents and families", href: "/who-we-help/parents" },
  { title: "Young people", href: "/who-we-help/young-people" },
] as const;

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

const commitments = [
  {
    value: "URL-only",
    label: "Privacy by architecture",
    detail: "Current reporting uses links as text. We do not receive or inspect the image.",
  },
  {
    value: "24 hours",
    label: "Qualifying complaints",
    detail: "Under the IT Rules, platforms must take reasonable removal steps within 24 hours of receiving a qualifying complaint.",
  },
  {
    value: "No media",
    label: "What never happens",
    detail: "We never fetch, preview, store, or view intimate content at any link you share.",
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
  commitments: [
    { value: "केवल URL", label: "बनावट में ही निजता", detail: "मौजूदा रिपोर्ट में लिंक केवल पाठ के रूप में लिए जाते हैं। हम तस्वीर प्राप्त या जाँच नहीं करते।" },
    { value: "24 घंटे", label: "योग्य शिकायतें", detail: "IT Rules के तहत योग्य शिकायत मिलने पर प्लेटफ़ॉर्म को हटाने के उचित कदम 24 घंटे में उठाने होते हैं।" },
    { value: "कोई मीडिया नहीं", label: "हम क्या नहीं करते", detail: "आपके साझा किए लिंक पर मौजूद निजी सामग्री को हम खोलते, देखते या सहेजते नहीं हैं।" },
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

export default async function HomePage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO: pure typographic, wash behind */}
        <section className="hero hero-image" aria-label={say("Introduction", "परिचय")}>
          <div className="hero-image-bg" aria-hidden>
            <picture>
              <source media="(max-width: 720px)" srcSet="/images/hero-bg-sm.webp" />
              <img src="/images/hero-bg.webp" alt="" width={2400} height={1350} fetchPriority="high" decoding="async" />
            </picture>
            <span className="hero-image-tint" />
            <span className="hero-image-fade" />
          </div>
          <div className="hero-content container">
            <div className="hero-image-copy">
              <span className="pill">
                <span className="dot" />
                {say("Free and confidential, for India", "भारत के लिए नि:शुल्क और गोपनीय")}
              </span>
              <h1 className="mt-8 max-w-3xl text-[clamp(40px,6vw,76px)]">
                {say("Take the image down. Keep the image private.", "तस्वीर हटाने की कार्रवाई करें। तस्वीर निजी रखें।")}
              </h1>
              <p className="font-size-large mt-6 max-w-xl">
                {say(
                  "A private path to prepare takedown notices for anyone in India facing non-consensual or AI-made intimate images. You can report a link or generate a fingerprint on your device.",
                  "बिना सहमति साझा की गई या AI से बनाई गई निजी तस्वीरों के लिए, भारत में URL के ज़रिए गोपनीय रिपोर्ट और हटाने की सूचना तैयार करने का रास्ता। आपकी तस्वीर आपके फ़ोन से बाहर नहीं जाती।",
                )}
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link className="btn btn-primary btn-arrow" href="/start">
                  {say("Start a case", "मामला शुरू करें")}
                </Link>
                <Link className="btn btn-secondary" href="/what-we-do">
                  {say("How it works", "यह कैसे काम करता है")}
                </Link>
              </div>
              {/* Hindi copy pending a native speaker; the English shows until then. */}
              <a
                href={`tel:${HELPLINE.tel}`}
                className="mt-8 flex max-w-xl items-center gap-4 rounded-2xl border border-[var(--color-ash)] bg-white/85 px-5 py-4 no-underline shadow-sm backdrop-blur transition-colors hover:border-[var(--color-graphite)]"
              >
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-off-black)] text-lg text-white">
                  ☎
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] uppercase tracking-[0.08em] text-[var(--color-graphite)]">
                    Prefer to talk? 24/7 helpline
                  </span>
                  <span className="mt-0.5 block text-[22px] font-medium leading-tight text-[var(--color-off-black)]">
                    {HELPLINE.display}
                  </span>
                  <span className="mt-1 block text-[14px] leading-[1.45] text-[var(--color-graphite)]">
                    An AI assistant guides you step by step through filing your complaint, in any Indian language.
                  </span>
                </span>
              </a>
              {/* A full page load, not <Link>: /talk's own headers allow the microphone. */}
              <a className="btn btn-secondary mt-3" href="/talk">
                Talk to us from your browser
              </a>
            </div>
          </div>

        </section>

        {/* Pipeline diagram */}
        <section aria-label={say("How a report moves", "रिपोर्ट के चरण")}>
          <div className="container pt-16 pb-20 md:pt-20 md:pb-28">
            <div className="pipeline" role="list" aria-label={say("How a report moves", "रिपोर्ट के चरण")}>
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

        {/* ISSUE + COMMITMENTS */}
        <section id="issue" className="section-pad" aria-labelledby="issue-heading">
          <div className="container grid items-start gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
            <div>
              <span className="eyebrow">{say("The issue", "समस्या")}</span>
              <h2 id="issue-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                {say("The internet makes it easier to harm people. The law gives you a way back.", "इंटरनेट पर नुकसान फैलना आसान है। कानून कार्रवाई का रास्ता देता है।")}
              </h2>
              <p className="mt-6 max-w-xl text-[16px] leading-[1.5] text-[var(--color-graphite)] md:text-[18px]">
                {say(
                  "Non-consensual intimate imagery, deepfakes, morphing, and sextortion spread fast across platforms and WhatsApp groups. Platforms must act on certain takedown notices within 24 hours under Indian law. We turn that right into one calm, reviewable flow.",
                  "बिना सहमति साझा की गई निजी तस्वीरें, डीपफ़ेक, बदली हुई तस्वीरें और धमकियाँ कई प्लेटफ़ॉर्म पर तेज़ी से फैल सकती हैं। भारतीय कानून के तहत कुछ हटाने की सूचनाओं पर प्लेटफ़ॉर्म को 24 घंटे में कार्रवाई करनी होती है। हम इस रास्ते को शांत और समझने योग्य चरणों में रखते हैं।",
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
                    <p className="stat-label">{locale === "hi" ? hindi.commitments[i].label : c.label}</p>
                    <span className="statistic mt-2">{locale === "hi" ? hindi.commitments[i].value : c.value}</span>
                    <p className="stat-detail">{locale === "hi" ? hindi.commitments[i].detail : c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="section-pad !pt-0" aria-labelledby="features-heading">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <span className="eyebrow">{say("What we do", "हम क्या करते हैं")}</span>
                <h2 id="features-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                  {say("Tools for taking action on content", "सामग्री पर कार्रवाई के साधन")}
                </h2>
              </div>
              <Link href="/what-we-do" className="arrow-link">
                {say("More on what we do", "हमारे काम के बारे में और जानें")}
              </Link>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {features.map((f, i) => (
                <Link key={f.title} href={f.href} className="card fade flex flex-col">
                  <span className="card-icon" aria-hidden>
                    {f.icon}
                  </span>
                  <h3>{locale === "hi" ? hindi.features[i].title : f.title}</h3>
                  <p className="mt-4 flex-1">{locale === "hi" ? hindi.features[i].body : f.body}</p>
                  <span className="arrow-link mt-8">{locale === "hi" ? hindi.features[i].cta : f.cta}</span>
                </Link>
              ))}
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
                  <Link href="/privacy" className="btn btn-midnight">
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
            <span className="eyebrow">{say("Who we help", "हम किसकी मदद करते हैं")}</span>
            <h2 id="audience-heading" className="mx-auto mt-5 max-w-3xl text-[clamp(32px,4vw,48px)]">
              {say("Everyone has a role to play", "हर व्यक्ति मदद कर सकता है")}
            </h2>
            <p className="font-size-large mx-auto mt-6 max-w-xl">
              {say(
                "We do not have to scroll past while harm happens. Find the path written for your situation.",
                "नुकसान को देखकर आगे बढ़ जाना ज़रूरी नहीं है। अपनी स्थिति के मुताबिक सहायता का रास्ता चुनें।",
              )}
            </p>
            <div className="audience-pills mt-10">
              {audiences.map((a, i) => (
                <Link key={a.title} href={a.href} className="btn btn-secondary">
                  {locale === "hi" ? hindi.audiences[i] : a.title}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* FAQ */}
        <section className="section-pad" aria-labelledby="faq-heading">
          <div className="container grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-24">
            <div>
              <span className="eyebrow">{say("Questions", "सवाल")}</span>
              <h2 id="faq-heading" className="mt-5 text-[clamp(32px,4vw,48px)]">
                {say("Honest answers first", "पहले स्पष्ट जवाब")}
              </h2>
              <p className="mt-6 text-[16px] leading-[1.5] text-[var(--color-graphite)]">
                {say(
                  "We say exactly what a notice can and cannot do. That honesty is the product.",
                  "हम साफ़ बताते हैं कि सूचना से क्या हो सकता है और क्या नहीं।",
                )}
              </p>
              <Link href="/faq" className="arrow-link mt-8">
                {say("Read the full FAQ", "सभी सवाल-जवाब पढ़ें")}
              </Link>
            </div>
            <div className="border-t border-[var(--color-ash)]">
              {faqs.map((f, i) => (
                <details key={f.q} className="faq-item">
                  <summary>{locale === "hi" ? hindi.faqs[i].q : f.q}</summary>
                  <div className="faq-answer">{locale === "hi" ? hindi.faqs[i].a : f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* SUPPORTERS */}
        <section className="pb-16 md:pb-20" aria-labelledby="supporters-heading">
          <div className="container flex flex-col items-center gap-6 text-center">
            <p id="supporters-heading" className="eyebrow">Supported by</p>
            <SupporterLogos className="justify-center" />
          </div>
        </section>

        {/* CLOSING */}
        <section className="relative overflow-hidden section-pad" aria-label={say("Get help", "मदद लें")}>
          <div
            className="wash wash-sky-mint"
            aria-hidden
            style={{ width: "40vw", height: "40vw", maxWidth: 600, maxHeight: 600, bottom: "-20vw", right: "-8vw" }}
          />
          <div className="container relative z-[1]">
            <div className="pledge-block">
              <p className="pledge-label">{say("The Asmita promise", "अस्मिता का वादा")}</p>
              <p className="pledge-quote">{say("You do not have to deal with this alone.", "आपको इसका सामना अकेले नहीं करना है।")}</p>
              <p className="mt-6 text-[16px] leading-[1.5] text-[var(--color-graphite)]">
                {say(
                  "Start a confidential report, or read how it works first. In your language, on your terms.",
                  "गोपनीय रिपोर्ट शुरू करें, या पहले प्रक्रिया समझें। अपनी भाषा में, अपनी गति से।",
                )}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary btn-arrow" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary" href="/faq">
                  {say("Read the FAQ", "सवाल-जवाब पढ़ें")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
