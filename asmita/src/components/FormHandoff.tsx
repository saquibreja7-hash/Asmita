"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
  links: { name: string; formUrl: string }[];
  onBack?: () => void;
  /** Continue with Asmita. `track`: keep the form-only links in the case too. */
  onContinue?: (track: boolean) => void;
  /** Other links or platforms are left for Asmita to handle. */
  hasRemaining?: boolean;
  /** Offer to keep the form-only links in the case. Opt-in: Asmita then stores them. */
  trackOption?: boolean;
  /** The links are already in her case: say how to start the deadline clock. */
  tracked?: boolean;
  error?: string;
  fingerprintNotSent?: boolean;
};

export function FormHandoff({ locale, links, onBack, onContinue, hasRemaining = true, trackOption, tracked, error, fingerprintNotSent }: Props) {
  const hi = locale === "hi";
  const [track, setTrack] = useState(false);
  return (
    <section aria-labelledby="form-handoff-title" className="space-y-6">
      <div>
        <p className="eyebrow">{hi ? "सीधे रिपोर्ट करें" : "Report directly"}</p>
        <h2 id="form-handoff-title" className="section-title mt-3">{hi ? "प्लेटफ़ॉर्म का रिपोर्टिंग फ़ॉर्म खोलें" : "Open the platform’s reporting form"}</h2>
        <p className="muted mt-3 text-sm leading-[1.75]">{hi ? "इस फ़ॉर्म के लिए Asmita पर अकाउंट की ज़रूरत नहीं है। आगे की प्रक्रिया संबंधित प्लेटफ़ॉर्म संभालेगा। वह आपसे साइन इन करने या अतिरिक्त जानकारी देने को कह सकता है।" : "You do not need an Asmita account for these forms. The platform handles the process from here and may ask you to sign in or provide more information."}</p>
        {tracked
          ? <p className="muted mt-3 text-sm leading-[1.75]">{hi ? "Asmita आपके लिए फ़ॉर्म जमा नहीं करती। फ़ॉर्म दाखिल करने के बाद, अपने केस पेज पर उसे दाखिल के रूप में चिह्नित करें, ताकि हम प्लेटफ़ॉर्म की समय सीमा ट्रैक कर सकें।" : "Asmita does not submit the form for you. Once you have filed it, mark it as filed on your case page, so we can track the platform’s deadline."}</p>
          : <p className="muted mt-3 text-sm leading-[1.75]">{hi ? "आपको प्लेटफ़ॉर्म के फ़ॉर्म पर रिपोर्ट पूरी करके जमा करनी होगी। Asmita आपकी रिपोर्ट जमा नहीं करती। प्लेटफ़ॉर्म से मिली पुष्टि या संदर्भ संख्या संभाल कर रखें।" : "Complete and submit your report on the platform’s form. Asmita does not submit it for you. Keep any confirmation or reference number the platform gives you."}</p>}
      </div>
      {fingerprintNotSent && <p className="muted text-sm">{hi ? "आपका बनाया फ़िंगरप्रिंट इस प्लेटफ़ॉर्म को नहीं भेजा गया है।" : "The fingerprint you created has not been sent to these platforms."}</p>}
      <div className="space-y-3">
        {links.length ? links.map((link) => <a key={link.name + link.formUrl} href={link.formUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-5 py-4 hover:border-[var(--brand)]"><span className="font-medium text-[var(--ink)]">{link.name}</span><span className="text-sm text-[var(--brand-strong)]">{hi ? "फ़ॉर्म खोलें ↗" : "Open form ↗"}</span></a>) : <p className="muted text-sm">{hi ? "अभी कोई सत्यापित फ़ॉर्म उपलब्ध नहीं है।" : "No verified form is available here yet."}</p>}
      </div>
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5">
        <h3 className="font-medium text-[var(--ink)]">{hi ? "एक और विकल्प: StopNCII" : "Another option: StopNCII"}</h3>
        <p className="muted mt-2 text-sm leading-[1.75]">{hi ? "यदि आप पात्र हैं, तो StopNCII पर अलग से मामला बना सकते हैं। यह आपके डिवाइस पर तस्वीर का डिजिटल फ़िंगरप्रिंट बनाता है और भागीदार प्लेटफ़ॉर्म मिलते-जुलते कंटेंट की जाँच कर सकते हैं। यह हर वेबसाइट को कवर नहीं करता और हटाने की गारंटी नहीं देता।" : "If you are eligible, you can also create a separate case with StopNCII. It creates a digital fingerprint on your device so participating platforms can look for matches. It does not cover every website or guarantee removal."}</p>
        <a href="https://stopncii.org/" target="_blank" rel="noopener noreferrer" className="link-underline mt-3 inline-block text-sm text-[var(--ink)]">{hi ? "StopNCII खोलें ↗" : "Open StopNCII ↗"}</a>
      </div>
      {trackOption && onContinue && (
        <label className="flex items-start gap-3 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5 text-sm leading-[1.7]">
          <input type="checkbox" className="mt-1" checked={track} onChange={(event) => setTrack(event.target.checked)} />
          <span>{hi ? "मेरे Asmita केस में इन लिंक पर नज़र रखें। Asmita लिंक सेव करती है, आपको प्लेटफ़ॉर्म की समय सीमा दिखाती है, और अगर प्लेटफ़ॉर्म कार्रवाई नहीं करता, तो बताती है कि आगे क्या करना है।" : "Keep track of these links in my Asmita case. Asmita saves the link, shows you the platform’s deadline, and tells you what to do next if it does not act."}</span>
        </label>
      )}
      {onContinue && (hasRemaining || track) && (
        <div>
          {hasRemaining && <p className="muted mb-3 text-sm">{hi ? "बाकी लिंक या प्लेटफ़ॉर्म के लिए Asmita की सहायता जारी रखें।" : "Continue with Asmita for your remaining links or platforms."}</p>}
          <button type="button" className="btn btn-primary" onClick={() => onContinue(track)}>
            {hasRemaining ? (hi ? "बाकी रिपोर्ट जारी रखें" : "Continue with remaining reports") : (hi ? "Asmita के साथ जारी रखें" : "Continue with Asmita")}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      {onBack && <button type="button" className="link-underline text-sm" onClick={onBack}>{hi ? "लिंक पर वापस जाएँ" : "Back to your links"}</button>}
    </section>
  );
}
