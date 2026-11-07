"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";

// Shown when a survivor has a fingerprint but does not know where the image
// is, or it has not been posted yet. Asmita sends fingerprints only to a
// platform she chooses, so nothing is sent from here; she gets the routes
// that work without a known platform.
export function UnsureHandoff({ locale, onBack }: { locale: Locale; onBack: () => void }) {
  const hi = locale === "hi";
  return (
    <section aria-labelledby="unsure-handoff-title" className="space-y-6">
      <div>
        <p className="eyebrow">{hi ? "पता नहीं कि तस्वीर कहाँ है" : "Not sure where it is"}</p>
        <h2 id="unsure-handoff-title" className="section-title mt-3">{hi ? "अब आप क्या कर सकते हैं" : "What you can do now"}</h2>
        <p className="muted mt-3 text-sm leading-[1.75]">{hi ? "Asmita फ़िंगरप्रिंट केवल उसी प्लेटफ़ॉर्म को भेजती है जिसे आप चुनते हैं, इसलिए आपका फ़िंगरप्रिंट कहीं नहीं भेजा गया है।" : "Asmita sends a fingerprint only to a platform you choose, so your fingerprint has not been sent anywhere."}</p>
      </div>

      <div className="rounded-[var(--radius-box)] border border-[var(--brand)] bg-[var(--card)] p-5">
        <h3 className="font-medium text-[var(--ink)]">{hi ? "StopNCII से कॉपी रोकें" : "Block copies with StopNCII"}</h3>
        <p className="muted mt-2 text-sm leading-[1.75]">{hi ? "StopNCII.org निःशुल्क है और इसे ब्रिटेन की संस्था SWGfL चलाती है। वहाँ आपको तस्वीर फिर से चुननी होगी, और फ़िंगरप्रिंट वहाँ भी आपके डिवाइस पर ही बनता है। भागीदार प्लेटफ़ॉर्म फिर मिलते-जुलते अपलोड की जाँच करते हैं। यह हर वेबसाइट को कवर नहीं करता और हटाने की गारंटी नहीं देता।" : "StopNCII.org is free and run by the UK charity SWGfL. You choose the photo again on their site, and the fingerprint is made on your device there too. Participating platforms then look for matching uploads. It does not cover every website or guarantee removal."}</p>
        <a href="https://stopncii.org/" target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-4">{hi ? "StopNCII खोलें ↗" : "Open StopNCII ↗"}</a>
      </div>

      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="font-medium text-[var(--ink)]">{hi ? "अगर बाद में लिंक मिल जाए" : "If you find a link later"}</h3>
        <p className="muted mt-2 text-sm leading-[1.75]">{hi ? "वापस आकर लिंक जोड़ें। Asmita उस प्लेटफ़ॉर्म के लिए नोटिस तैयार करेगी, और तब आप फ़िंगरप्रिंट फिर से जोड़ सकते हैं।" : "Come back and add the link. Asmita will prepare a notice to that platform, and you can add the fingerprint again then."}</p>
      </div>

      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="font-medium text-[var(--ink)]">{hi ? "किसी से बात करें" : "Talk to someone"}</h3>
        <p className="muted mt-2 text-sm leading-[1.75]">{hi ? "‘सहायता पाएँ’ पेज पर किसी से बात करने के तरीके दिए गए हैं, जो बता सकते हैं कि कहाँ देखें और आगे क्या करें।" : "The Get help page lists ways to talk to someone about where to look and what to do next."}</p>
        <Link href="/get-help" className="link-underline mt-3 inline-block text-sm text-[var(--ink)]">{hi ? "सहायता पाएँ" : "Get help"}</Link>
      </div>

      <button type="button" className="link-underline text-sm" onClick={onBack}>{hi ? "प्लेटफ़ॉर्म चुनने पर वापस जाएँ" : "Back to choose a platform"}</button>
    </section>
  );
}
