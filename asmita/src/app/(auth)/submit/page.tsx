import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/middleware";
import { ELIGIBLE_COOKIE } from "@/lib/eligibility";
import { SubmitForm } from "./SubmitForm";
import { FlowProgress } from "@/components/FlowProgress";
import { QuickExit } from "@/components/QuickExit";
import { listHashPickerPlatforms, type HashPickerPlatform } from "@/lib/hash-submission";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { platformDirectory } from "@/lib/platforms";

async function getPlatforms(): Promise<HashPickerPlatform[]> {
  try {
    return await listHashPickerPlatforms();
  } catch {
    return [];
  }
}

export default async function SubmitPage() {
  // Links can be added before the email code, but only after the eligibility
  // questions. Nothing typed here reaches the server until there is a session.
  const auth = await requireSession();
  if (auth.ok && !auth.session.ageOver18) redirect("/minor-support");
  if (!auth.ok && (await cookies()).get(ELIGIBLE_COOKIE)?.value !== "1") redirect("/start");
  const locale = await getLocale();
  const enableHashUpload = process.env.ENABLE_HASH_UPLOAD === "true";
  const platforms = enableHashUpload ? await getPlatforms() : [];
  // Names and domains only: grievance contacts stay on the server.
  const knownPlatforms = platformDirectory.map(({ id, name, domainPatterns, noticeBasis, grievanceEmail, formUrl, lastContactVerifiedByHuman }) => ({
    id, name, domainPatterns, formUrl: lastContactVerifiedByHuman && formUrl?.startsWith("https://") && (noticeBasis === "FORM_ONLY" || grievanceEmail === "<TO_BE_VERIFIED_BY_HUMAN>") ? formUrl : undefined,
  }));

  return (
    <AppShell>
      <QuickExit locale={locale} enableIdle={auth.ok} />
      <div className="page-canvas">
        <div className="container py-8 md:py-20">
          <div className="mx-auto max-w-xl">
            <SubmitForm signedIn={auth.ok} knownPlatforms={knownPlatforms} enableHashUpload={enableHashUpload} platforms={platforms} locale={locale}>
            <FlowProgress step={2} locale={locale} />
            <div className="filing-intro">
              <h1 className="page-title-sm">
                {t(locale, "submit.form.title")}
              </h1>
              <p className="mt-2 text-[15px] leading-[1.6] text-[var(--text)]">
                {t(locale, "submit.reassure")}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {(["submit.trust.1", "submit.trust.2", "submit.trust.3"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-[13px] text-[var(--ink)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" aria-hidden />
                    {t(locale, key)}
                  </li>
                ))}
              </ul>
            </div>
            </SubmitForm>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
