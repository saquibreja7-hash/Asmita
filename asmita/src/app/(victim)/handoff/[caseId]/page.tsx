import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FormHandoff } from "@/components/FormHandoff";
import { findPlatformByDomain, HUMAN_VERIFICATION_REQUIRED } from "@/lib/platforms";
import { getCaseForUser } from "@/lib/case-ops";
import { requireSession } from "@/lib/auth/middleware";
import { getLocale } from "@/lib/get-locale";

export default async function HandoffPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  const record = auth.ok ? await getCaseForUser(caseId, auth.session.sub) : null;
  const links = record ? [...new Map(record.urls.flatMap((url) => {
    const p = findPlatformByDomain(url.domain);
    return p?.lastContactVerifiedByHuman && p.formUrl && p.formUrl !== HUMAN_VERIFICATION_REQUIRED ? [[p.id, { name: p.name, formUrl: p.formUrl }] as const] : [];
  })).values()] : [];
  return <AppShell><div className="page-canvas"><div className="container py-16"><div className="mx-auto max-w-xl">
    {record ? <><FormHandoff locale={locale} links={links} /><Link href={`/case/${record.id}`} className="link-underline mt-8 inline-block">{locale === "hi" ? "डैशबोर्ड पर वापस जाएँ" : "Back to dashboard"}</Link></> : <p>{locale === "hi" ? "यह केस उपलब्ध नहीं है।" : "This case is unavailable."}</p>}
  </div></div></div></AppShell>;
}
