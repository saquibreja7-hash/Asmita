import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { QuickExit } from "@/components/QuickExit";
import { RegisterForm } from "../register/RegisterForm";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Track your case" };

// Track your case: the same email-code sign-in as filing, without the age
// question, leading to a case she already has. It never starts a new case.
export default async function TrackPage() {
  const locale = await getLocale();
  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={false} />
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <h1 className="page-title-sm mt-2">{t(locale, "track.title")}</h1>
            <RegisterForm locale={locale} mode="track" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
