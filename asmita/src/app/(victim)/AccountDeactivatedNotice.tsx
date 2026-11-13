import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

// Shown instead of any survivor page when the session's account has a
// deletion scheduled; the session itself no longer grants access.
export async function AccountDeactivatedNotice() {
  const locale = await getLocale();
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "case.deactivated.pill")}</span>
            <h1 className="page-title-sm mt-8">
              {t(locale, "case.deactivated.title")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg">
              {t(locale, "case.deactivated.sub")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-secondary" href="/contact">{t(locale, "case.deactivated.cta")}</Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
