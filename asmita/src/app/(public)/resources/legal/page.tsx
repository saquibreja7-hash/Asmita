import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { legalSections } from "@/lib/resources-content";
import { legalSectionsHi } from "@/lib/resources-content-hi";
import { getLocale } from "@/lib/get-locale";

export const metadata: Metadata = {
  title: "Your legal rights",
  description:
    "Plain-language rights for image-based abuse in India: the IT Rules, the MeitY procedure, reporting, escalation, and legal aid.",
};

export default async function LegalRightsPage() {
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={say("Your legal rights", "आपके कानूनी अधिकार")}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm">
                <Link href="/resources" className="text-link font-medium">
                  {say("Resources", "संसाधन")}
                </Link>
              </p>
              <h1 className="font-display mt-4 text-[clamp(2.25rem,5.5vw,3.75rem)] font-medium leading-[1.06] text-[var(--heading)]">
                {say("Your rights, in plain words", "आपके अधिकार, सरल शब्दों में")}
              </h1>
              <p className="font-size-large mt-5 max-w-2xl text-[var(--theme-color-2)]">
                {say("Indian rules give you ways to act. Here is what they mean in plain language.", "भारतीय नियम कार्रवाई के रास्ते देते हैं। यहाँ उनका सरल अर्थ समझें।")}
              </p>
            </div>
          </div>
        </section>

        <section className="zone-white section-pad !pt-4" aria-label={say("Rights", "अधिकार")}>
          <div className="container">
            <div className="mx-auto max-w-3xl divide-y divide-[var(--hairline)]">
              {legalSections.map((s, index) => (
                <div key={s.title} className="py-7">
                  <h2 className="font-display text-[clamp(1.2rem,2.5vw,1.6rem)] font-medium leading-[1.2] text-[var(--heading)]">
                    {say(s.title, legalSectionsHi[index].title)}
                  </h2>
                  <p className="mt-3 text-[16px] leading-[1.65] text-[var(--body)]">
                    {say(s.body, legalSectionsHi[index].body)}
                  </p>
                </div>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-3xl text-sm leading-[1.6] text-[var(--muted)]">
              {say("This is general information, not legal advice, and the law can change. For advice on your situation, ask NALSA about eligibility for free legal aid or consult a lawyer.", "यह सामान्य जानकारी है, कानूनी सलाह नहीं। नियम बदल सकते हैं। अपनी स्थिति के लिए NALSA से मुफ़्त सहायता की पात्रता पूछें या वकील से सलाह लें।")}
            </p>
          </div>
        </section>

        <section className="zone-sunset" aria-label={say("Get help", "मदद लें")}>
          <div className="zone-sunset-content container section-pad text-center">
            <div className="mx-auto max-w-2xl">
              <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.14]">
                {say("Use the right reporting path.", "रिपोर्ट का सही रास्ता चुनें।")}
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-[1.65] text-[var(--body)]">
                {say("The URL-only flow helps prepare a takedown notice you can review and sign. Dispatch waits for verified contacts and templates.", "URL-आधारित प्रक्रिया हटाने की सूचना तैयार करने में मदद करती है। आप उसे पढ़कर हस्ताक्षर कर सकते हैं। भेजने से पहले संपर्क और नमूने की पुष्टि ज़रूरी है।")}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href="/get-help">
                  {say("Get help", "मदद लें")}
                </Link>
                <Link className="btn btn-secondary btn-arrow !m-0" href="/resources/directory">
                  {say("Support directory", "सहायता सूची")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
