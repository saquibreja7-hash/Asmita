import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "What we do",
  description:
    "How Asmita prepares takedown notices, on-device fingerprints, and optional image provenance checks.",
};

const capabilities = [
  {
    n: "01",
    title: "Legally grounded takedown notices",
    body: "We help prepare a removal notice citing the IT Rules and MeitY procedure. You read and sign it; delivery follows verified contact and template review.",
    href: "/start",
    cta: "Start a report",
  },
  {
    n: "02",
    title: "On-device fingerprints",
    body: "Adults can generate a fingerprint locally and submit its code with a case. Matching and blocking depend on participating platforms.",
    href: "/get-help",
    cta: "How to get help",
  },
  {
    n: "03",
    title: "Check AI-made images",
    body: "A fake image can still be abuse. Check provenance signals locally or consent to a deeper check, then report the post URL.",
    href: "/check-image",
    cta: "Learn about fake images",
  },
];

const flow = [
  { title: "You report", body: "Paste links as text. You can also generate a fingerprint locally and include its code." },
  { title: "We prepare a notice", body: "A legally grounded takedown notice, ready for you to review." },
  { title: "You sign, we prepare delivery", body: "You approve the notice. Dispatch waits for verified platform contacts, sender domains, and templates." },
  { title: "You can track outcomes", body: "Follow each reported link and report a reappearance as a new link." },
];

const hindi = {
  capabilities: [
    { title: "कानूनी आधार वाली हटाने की सूचना", body: "हम IT Rules और MeitY की प्रक्रिया का हवाला देने वाली सूचना तैयार करने में मदद करते हैं। आप उसे पढ़कर हस्ताक्षर करते हैं; पुष्टि किए गए संपर्क और समीक्षा के बाद ही भेजा जाता है।", cta: "रिपोर्ट शुरू करें" },
    { title: "भविष्य में दोबारा अपलोड रोकने का तरीका", body: "डिवाइस पर बनने वाले डिजिटल फ़िंगरप्रिंट उपकरण विकसित हो रहे हैं। वे अभी URL-आधारित रिपोर्ट में उपलब्ध नहीं हैं; हमें तस्वीर या फ़िंगरप्रिंट नहीं भेजा जाता।", cta: "मदद कैसे लें" },
    { title: "AI से बनी तस्वीर का URL रिपोर्ट करें", body: "नकली तस्वीर भी दुर्व्यवहार हो सकती है। मौजूदा प्रक्रिया में उसके पोस्ट का URL पाठ के रूप में लिया जाता है; स्वचालित तस्वीर जाँच आगे के चरण के लिए है।", cta: "नकली तस्वीरों के बारे में जानें" },
  ],
  flow: [
    { title: "आप रिपोर्ट करते हैं", body: "लिंक केवल पाठ के रूप में दें और घटना बताएं। तस्वीर अपलोड नहीं होती।" },
    { title: "हम सूचना तैयार करते हैं", body: "हटाने की सूचना आपके पढ़ने के लिए तैयार होती है।" },
    { title: "आप हस्ताक्षर करते हैं", body: "सूचना पढ़कर मंज़ूरी दें। प्लेटफ़ॉर्म संपर्क, भेजने वाला डोमेन और नमूना सूचना पुष्टि होने के बाद ही सूचना भेजी जाती है।" },
    { title: "आप परिणाम देख सकते हैं", body: "हर रिपोर्ट किए गए लिंक की स्थिति देखें। सामग्री दोबारा दिखे तो नया लिंक रिपोर्ट करें।" },
  ],
} as const;

export default async function WhatWeDoPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("What we do", "हम क्या करते हैं")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("What we do", "हम क्या करते हैं")}</span>
              <h1 className="font-display mt-5 text-[clamp(2.25rem,5.5vw,4rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Tools for taking action on content", "सामग्री पर कार्रवाई के साधन")}
              </h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say(
                  "Not just advice. Asmita is built to help you take real action, and built so your image never has to leave your device to do it.",
                  "अस्मिता आपको कार्रवाई के चरण समझने और आगे बढ़ने में मदद करती है। इसके लिए आपकी तस्वीर को आपके डिवाइस से बाहर जाने की ज़रूरत नहीं है।",
                )}
              </p>
            </div>
          </div>
        </section>

        {/* CAPABILITIES */}
        <section className="zone-white section-pad" aria-label={say("Capabilities", "उपलब्ध साधन")}>
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-4 md:grid-cols-3">
                {capabilities.map((c, i) => (
                  <div key={c.title} className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-7 shadow-[var(--shadow-sm)]">
                    <span className="font-mono text-xs font-medium text-[var(--color-off-black)]">{c.n}</span>
                    <h2 className="mt-4 text-[19px] font-medium text-[var(--heading)]">{locale === "hi" ? hindi.capabilities[i].title : c.title}</h2>
                    <p className="mt-3 flex-1 text-sm leading-[1.65] text-[var(--body)]">{locale === "hi" ? hindi.capabilities[i].body : c.body}</p>
                    <div className="mt-6">
                      <Link href={c.href} className="btn btn-midnight btn-arrow !m-0 !min-h-[44px] !text-[15px]">
                        {locale === "hi" ? hindi.capabilities[i].cta : c.cta}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT FITS TOGETHER */}
        <section className="transform-section" aria-labelledby="flow-heading">
          <div className="transform-content container section-pad">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{say("How it fits together", "ये चरण कैसे जुड़ते हैं")}</span>
              <h2 id="flow-heading" className="font-display mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-medium leading-[1.14]">
                {say("From a link to a takedown", "लिंक से हटाने की कार्रवाई तक")}
              </h2>
            </div>
            <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {flow.map((f, i) => (
                <li key={f.title} className="rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm">
                  <span className="font-display text-2xl font-medium text-[var(--color-off-black)]">{i + 1}</span>
                  <h3 className="mt-2 text-[16px] font-medium text-[var(--heading)]">{locale === "hi" ? hindi.flow[i].title : f.title}</h3>
                  <p className="mt-2 text-sm leading-[1.6] text-[var(--body)]">{locale === "hi" ? hindi.flow[i].body : f.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* HONEST LIMITS */}
        <section className="zone-white section-pad" aria-labelledby="limits-heading">
          <div className="container">
            <div className="mx-auto max-w-5xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-8 md:p-10">
              <h2 id="limits-heading" className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]">
                {say("What we will not do", "हम क्या नहीं करेंगे")}
              </h2>
              <ul className="mt-5 space-y-3 text-[16px] leading-[1.6] text-[var(--body)]">
                <li>{say("We never fetch, preview, or store intimate content on our servers.", "हम अपने सर्वर पर निजी सामग्री खोलते, दिखाते या सहेजते नहीं हैं।")}</li>
                <li>{say("We do not promise to erase content from the whole internet.", "हम पूरे इंटरनेट से सामग्री मिटाने का वादा नहीं करते।")}</li>
                <li>{say("We do not put a minor’s image into the adult flow. That follows a separate, protected path.", "नाबालिग की तस्वीर वयस्क रिपोर्ट प्रक्रिया में नहीं जाती। उसके लिए अलग सुरक्षित रास्ता है।")}</li>
              </ul>
              <p className="mt-5 text-sm leading-[1.6] text-[var(--muted)]">
                {say(
                  "Being honest about the limits is part of the tool. You always know exactly where things stand.",
                  "इन सीमाओं को साफ़ बताना ज़रूरी है, ताकि आपको हर चरण की स्थिति पता रहे।",
                )}
              </p>
            </div>
          </div>
        </section>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("See it work for your situation.", "अपनी स्थिति के मुताबिक रास्ता देखें।")}
              </h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">{say("Get help", "मदद लें")}</Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/about">{say("About Asmita", "अस्मिता के बारे में")}</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
