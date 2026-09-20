import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FeedbackForm } from "@/app/(public)/feedback/FeedbackForm";
import { getLocale } from "@/lib/get-locale";

export default async function FeedbackPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container pb-12 pt-20 text-center md:pb-16 md:pt-32">
          <div className="mx-auto max-w-2xl">
            <span className="pill">
              <span className="dot" />
              {say("Feedback", "प्रतिक्रिया")}
            </span>
            <p className="muted mt-3 text-xs tracking-wide">
              {say("Available in English and Hindi", "हिंदी और अंग्रेज़ी में उपलब्ध")}
            </p>
            <h1 className="font-display mt-8 text-[40px] font-normal leading-[1.08] tracking-tight md:text-[68px] md:leading-[1.06]">
              {say("Tell us how Asmita treated you.", "बताएँ कि अस्मिता के साथ आपका अनुभव कैसा रहा।")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {say("Tell the team what you want it to know about your experience. The form does not ask for your name or intimate content. A case reference is optional; case URLs are not accepted.", "अपने अनुभव के बारे में टीम को जो बताना चाहें, लिखें। फ़ॉर्म आपका नाम या निजी सामग्री नहीं माँगता। केस संदर्भ वैकल्पिक है; केस URL स्वीकार नहीं किए जाते।")}
            </p>
          </div>
        </section>

        {/* WHAT NOT TO SEND - quiet trauma-informed line */}
        <section className="container py-10 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <p className="font-display text-[20px] leading-[1.5] tracking-tight text-[var(--foreground)] md:text-[24px] md:leading-[1.45]">
              {say("Please do not paste intimate images, videos, or raw URLs here. This form is for service feedback only.", "कृपया यहाँ निजी तस्वीरें, वीडियो या URL न लिखें। यह फ़ॉर्म केवल सेवा पर प्रतिक्रिया के लिए है।")}
            </p>
          </div>
        </section>

        {/* THE FORM */}
        <section className="container py-10 md:py-14">
          <div className="mx-auto max-w-xl">
            <p className="font-mono text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {say("The form", "फ़ॉर्म")}
            </p>
            <h2 className="font-display mt-4 text-center text-[28px] font-normal leading-[1.18] tracking-tight md:text-[40px] md:leading-[1.14]">
              {say("Three questions, none required.", "तीन सवाल; कोई भी अनिवार्य नहीं।")}
            </h2>
            <FeedbackForm locale={locale} />
          </div>
        </section>

        {/* CLOSING */}
        <section className="container pb-24 pt-16 text-center md:pb-32 md:pt-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-[32px] font-normal leading-[1.15] tracking-tight md:text-[52px] md:leading-[1.12]">
              {say("Thank you for taking the time.", "समय देने के लिए धन्यवाद।")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {say("If you would rather write to the team, the inbox is on the contact page.", "यदि आप टीम को सीधे लिखना चाहें, तो संपर्क पेज पर ईमेल पता है।")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-secondary" href="/contact">
                {say("Contact Asmita", "अस्मिता से संपर्क करें")}
              </Link>
              <Link className="btn btn-secondary" href="/faq">
                {say("Read the FAQ", "अक्सर पूछे सवाल पढ़ें")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
