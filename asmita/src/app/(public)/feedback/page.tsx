import Link from "next/link";
import { LabToolHero, LabToolShell, LabWorkspace } from "@/components/lab/LabToolPage";
import { FeedbackForm } from "@/app/(public)/feedback/FeedbackForm";
import { getLocale } from "@/lib/get-locale";
import { Illustration } from "@/components/Illustration";

export default async function FeedbackPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <LabToolShell variant="calm">
      <LabToolHero
        badge={say("Feedback", "प्रतिक्रिया")}
        title={say("Tell us how Asmita treated you.", "बताएँ कि अस्मिता के साथ आपका अनुभव कैसा रहा।")}
        intro={
          <>
            <p>
              {say(
                "Tell the team what you want it to know about your experience. The form does not ask for your name or intimate content. A case reference is optional; case URLs are not accepted.",
                "अपने अनुभव के बारे में टीम को जो बताना चाहें, लिखें। फ़ॉर्म आपका नाम या निजी सामग्री नहीं माँगता। केस संदर्भ वैकल्पिक है; केस URL स्वीकार नहीं किए जाते।",
              )}
            </p>
            <p className="text-xs tracking-wide text-[var(--text)]">
              {say("Available in English and Hindi", "हिंदी और अंग्रेज़ी में उपलब्ध")}
            </p>
          </>
        }
        visual={<Illustration name="page-feedback" eager className="issue-hero-art" />}
      >
        {/* What not to send: a quiet, trauma-informed line. */}
        <div className="lab-callout">
          <p>
            {say(
              "Please do not paste intimate images, videos, or raw URLs here. This form is for service feedback only.",
              "कृपया यहाँ निजी तस्वीरें, वीडियो या URL न लिखें। यह फ़ॉर्म केवल सेवा पर प्रतिक्रिया के लिए है।",
            )}
          </p>
        </div>
      </LabToolHero>

      <LabWorkspace label={say("Three questions, none required.", "तीन सवाल; कोई भी अनिवार्य नहीं।")}>
        <div className="mx-auto max-w-xl">
          <h2 className="lab-h2 text-center">{say("Three questions, none required.", "तीन सवाल; कोई भी अनिवार्य नहीं।")}</h2>
          <FeedbackForm locale={locale} />
        </div>
      </LabWorkspace>

      <section className="lab-sub-section">
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{say("Thank you for taking the time.", "समय देने के लिए धन्यवाद।")}</h2>
            <p className="issue-close-body">
              {say(
                "If you would rather write to the team, the inbox is on the contact page.",
                "यदि आप टीम को सीधे लिखना चाहें, तो संपर्क पेज पर ईमेल पता है।",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-secondary !m-0" href="/contact">
                {say("Contact Asmita", "अस्मिता से संपर्क करें")}
              </Link>
              <Link className="btn btn-secondary !m-0" href="/faq">
                {say("Read the FAQ", "अक्सर पूछे सवाल पढ़ें")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
