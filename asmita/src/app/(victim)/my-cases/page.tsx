import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { QuickExit } from "@/components/QuickExit";
import { requireSession } from "@/lib/auth/middleware";
import { listCasesForUser } from "@/lib/case-ops";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Your cases" };

// Her cases, newest first. Reached from Track your case (several cases) and
// from filing when the email already has a case (?existing=1).
export default async function MyCasesPage({ searchParams }: { searchParams: Promise<{ existing?: string }> }) {
  const locale = await getLocale();
  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) redirect("/track");
  const { existing } = await searchParams;
  const cases = await listCasesForUser(auth.session.sub);
  const fromFiling = existing === "1";
  const dateFormat = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={false} />
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <h1 className="page-title-sm">{t(locale, fromFiling && cases.length > 0 ? "myCases.existing.title" : "myCases.title")}</h1>
            <p className="muted mt-2 text-sm leading-[1.75]">
              {t(locale, cases.length === 0 ? "myCases.empty" : fromFiling ? "myCases.existing.sub" : "myCases.sub")}
            </p>
            {cases.length > 0 && (
              <ul className="mt-8 grid list-none gap-3 p-0" data-testid="my-cases">
                {cases.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="card flex items-center justify-between gap-4 !p-4 no-underline"
                      href={`/case/${item.id}`}
                    >
                      <span>
                        <span className="block font-mono text-[15px] font-semibold text-[var(--ink)]">{item.referenceNumber}</span>
                        <span className="muted block text-sm">
                          {t(locale, "myCases.opened")} {dateFormat.format(new Date(item.createdAt))}
                        </span>
                      </span>
                      <span className="link-underline text-sm" aria-hidden>
                        {t(locale, "myCases.open")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8">
              <Link className={`btn ${cases.length === 0 ? "btn-primary" : "btn-secondary"}`} href="/submit">
                {t(locale, "myCases.new")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
