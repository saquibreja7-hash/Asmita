import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { QuickExit } from "@/components/QuickExit";
import { requireSession } from "@/lib/auth/middleware";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { listCasesForUser } from "@/lib/case-ops";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { RegisterForm } from "../register/RegisterForm";
import { WatchForm } from "./WatchForm";

/*
 * "Watch for my images" (WP22). The entry is on the start page, next to
 * "File a complaint". She signs in through the same registration flow (age
 * check with minor routing, email, one-time code), then fingerprints her
 * images — on her device; only the fingerprint code is sent — and ticks one
 * box. No links are ever asked for. One watch per person: an existing watch
 * case (even a stopped one) is the one to keep or restart.
 */

export default async function WatchPage() {
  const locale = await getLocale();
  const available = process.env.ENABLE_HASH_UPLOAD === "true" && crawlerEnabled();

  if (!available) {
    return (
      <AppShell>
        <QuickExit locale={locale} enableIdle={false} />
        <div className="page-canvas">
          <div className="container py-8 md:py-20">
            <div className="mx-auto max-w-xl">
              <span className="eyebrow">{t(locale, "watch.pill")}</span>
              <h1 className="page-title-sm mt-8">{t(locale, "watch.notAvailable.title")}</h1>
              <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "watch.notAvailable.sub")}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const auth = await requireSession({ adultOnly: true });
  if (!auth.ok) {
    // The registration flow, with the age check and its minor routing, then
    // back here to fingerprint and tick.
    return (
      <AppShell>
        <QuickExit locale={locale} enableIdle={false} />
        <div className="page-canvas">
          <div className="container py-8 md:py-20">
            <div className="mx-auto max-w-xl">
              <span className="eyebrow">{t(locale, "watch.pill")}</span>
              <h1 className="page-title-sm mt-8">{t(locale, "watch.title")}</h1>
              <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "watch.sub")}</p>
              <RegisterForm locale={locale} mode="watch" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const existing = (await listCasesForUser(auth.session.sub)).find((record) => record.mode === "WATCH");
  if (existing) redirect(`/case/${existing.id}`);

  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={false} />
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <span className="eyebrow">{t(locale, "watch.pill")}</span>
            <h1 className="page-title-sm mt-8">{t(locale, "watch.title")}</h1>
            <p className="muted mt-3 text-sm leading-[1.75]">{t(locale, "watch.sub")}</p>
            <WatchForm locale={locale} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
