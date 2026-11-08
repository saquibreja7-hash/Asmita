import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { getCaseForUser } from "@/lib/case-ops";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { findPlatformByDomain } from "@/lib/platforms";
import { Illustration } from "@/components/Illustration";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;

  if (!record) {
    return (
      <AppShell>
        <div className="page-canvas">
          <section className="container page-hero text-center">
            <div className="mx-auto max-w-2xl">
              <span className="eyebrow">{t(locale, "confirm.notAvailable.pill")}</span>
              <h1 className="page-title-sm mt-8">
                {t(locale, "confirm.notAvailable.title.1")}{" "}
                <em className="not-italic text-gradient">{t(locale, "confirm.notAvailable.title.em")}</em>
                {t(locale, "confirm.notAvailable.title.2")}
              </h1>
              <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
                {t(locale, "confirm.notAvailable.sub")}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link className="btn btn-primary" href="/start">
                  {t(locale, "confirm.notAvailable.cta")}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const unknownLinks = record.urls.filter((url) => !findPlatformByDomain(url.domain));
  if (unknownLinks.length > 0) {
    const hi = locale === "hi";
    const mixed = unknownLinks.length < record.urls.length;
    return <AppShell><div className="page-canvas"><div className="container py-16 md:py-24"><div className="mx-auto max-w-xl space-y-6">
      <p className="eyebrow">{hi ? "अनुरोध प्राप्त हुआ" : "Request received"}</p>
      <h1 className="page-title-sm">{hi ? "हमें आपका अनुरोध मिल गया है।" : "We’ve received your request."}</h1>
      <p className="muted text-sm leading-[1.75]">{hi ? "हमारी टीम अनजान प्लेटफ़ॉर्म की सार्वजनिक रिपोर्टिंग जानकारी जाँचने और मदद का रास्ता ढूँढ़ने की कोशिश करेगी। हम प्लेटफ़ॉर्म से संपर्क या सामग्री हटने का वादा नहीं कर सकते।" : "Our team will try to find a reporting route for the unknown platform by checking its public reporting information. We cannot promise to contact the platform or secure removal."}</p>
      <p className="muted text-sm leading-[1.75]">{hi ? "अनजान प्लेटफ़ॉर्म के लिए अभी कोई शिकायत नहीं भेजी गई है। इस अनुरोध के लिए नोटिस पर हस्ताक्षर की आवश्यकता नहीं है।" : "No complaint has been sent to the unknown platform. You do not need to sign a notice for this investigation request."}</p>
      {mixed && <p className="muted text-sm">{hi ? "अन्य प्लेटफ़ॉर्म की स्थिति अपने डैशबोर्ड में देखें।" : "Check your dashboard for the status of your other platforms."}</p>}
      <div className="rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-6"><p className="eyebrow">{t(locale, "confirm.ref.eyebrow")}</p><p className="font-mono mt-3 text-2xl text-[var(--brand-strong)]">{record.referenceNumber}</p><p className="muted mt-3 text-sm">{hi ? "रिपोर्टिंग का रास्ता जाँच के अधीन है। स्थिति देखने के लिए डैशबोर्ड पर लौट सकते हैं।" : "Reporting route under review. You can return to your dashboard to check the status."}</p></div>
      <div className="flex flex-wrap gap-3"><Link className="btn btn-primary" href={`/case/${record.id}`}>{t(locale, "confirm.cta.dashboard")}</Link><Link className="btn btn-secondary" href="/resources">{t(locale, "confirm.cta.resources")}</Link></div>
    </div></div></div></AppShell>;
  }

  const hi = locale === "hi";
  const nextSteps = hi ? [
    { title: "सही संपर्क की जाँच", detail: "हम प्लेटफ़ॉर्म के उपलब्ध रिपोर्टिंग रास्ते और सही संपर्क की जाँच करते हैं। अनजान साइटों के लिए इसमें अधिक समय लग सकता है।" },
    { title: "नोटिस भेजने से पहले", detail: "कोई भी नोटिस भेजने से पहले उसकी और प्लेटफ़ॉर्म के संपर्क की जाँच होती है। यदि आपके हस्ताक्षर की ज़रूरत हो, तो आप नोटिस डैशबोर्ड पर देख सकते हैं।" },
    { title: "अपनी स्थिति देखें", detail: "अपने डैशबोर्ड पर केस की स्थिति और अगले कदम देखें। आप अपने केस के बारे में संपर्क करते समय यह संदर्भ संख्या इस्तेमाल कर सकते हैं।" },
  ] : [
    { title: "Checking the right contact", detail: "We check the available reporting route and the right contact for each platform. This can take longer for a site we do not yet know." },
    { title: "Before a notice is sent", detail: "The notice and platform contact are checked before sending. If your signature is needed, you can review the notice in your dashboard." },
    { title: "Keeping track", detail: "Your dashboard shows the case status and next steps. Use your reference number if you contact us about your case." },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-12 md:py-20">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16 lg:gap-20">
            <div className="min-w-0 md:order-2">
              <Illustration name="done-relief" eager className="mb-6 max-w-[240px]" />
              <p className="eyebrow">{hi ? "केस सहेजा गया" : "CASE SAVED"}</p>
              <h1 className="page-title-sm mt-4">{t(locale, "confirm.title")}</h1>
              <p className="muted mt-3 max-w-md text-[15px] leading-[1.7]">{hi ? "आपका केस सुरक्षित है। आप जब चाहें इसकी स्थिति देख सकते हैं।" : "Your case is saved. You can return to check its status whenever you need to."}</p>

              <section aria-labelledby="case-reference-title" className="mt-8 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6">
                <h2 id="case-reference-title" className="eyebrow">{t(locale, "confirm.ref.eyebrow")}</h2>
                <p className="font-mono mt-3 break-all text-xl tracking-tight text-[var(--brand-strong)] sm:text-2xl">{record.referenceNumber}</p>
                <p className="muted mt-3 text-sm leading-[1.65]">{hi ? "इसे सुरक्षित रखें। हमारे ईमेल में आपके लिंक या तस्वीरें नहीं होतीं।" : "Keep this number safe. Our emails do not include your links or images."}</p>
              </section>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
                <Link className="btn btn-primary justify-center" href={`/case/${record.id}`}>{t(locale, "confirm.cta.dashboard")}</Link>
                <Link className="btn btn-secondary justify-center" href="/resources">{t(locale, "confirm.cta.resources")}</Link>
              </div>
            </div>

            <section aria-labelledby="case-next-title" className="min-w-0 border-t border-[var(--line)] pt-7 md:order-1 md:border-r md:border-t-0 md:pr-10 md:pt-0 lg:pr-14">
              <p className="eyebrow">{hi ? "आगे का रास्ता" : "THE NEXT STEPS"}</p>
              <h2 id="case-next-title" className="subsection-title mt-3">{hi ? "अब क्या होगा" : "What happens next"}</h2>
              <ol className="mt-7 space-y-7">
                {nextSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span aria-hidden="true" className="font-mono mt-0.5 w-7 shrink-0 text-sm text-[var(--brand-strong)]">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3 className="text-[15px] font-semibold text-[var(--ink)]">{step.title}</h3><p className="muted mt-1.5 text-sm leading-[1.7]">{step.detail}</p></div>
                  </li>
                ))}
              </ol>
              <p className="muted mt-8 border-t border-[var(--line)] pt-5 text-sm leading-[1.65]">{hi ? "सहायता चाहिए? सहायता संसाधन आपके लिए उपलब्ध हैं।" : "If you would like to talk to someone, support resources are available."}</p>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
