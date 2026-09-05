import { AppShell } from "@/components/layout/AppShell";
import { EligibilityWizard } from "./EligibilityWizard";
import { FlowProgress } from "@/components/FlowProgress";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function EligibilityPage() {
  const locale = await getLocale();

  const asideItems: [string, string][] = [
    [t(locale, "eligibility.aside.item1.heading"), t(locale, "eligibility.aside.item1.detail")],
    [t(locale, "eligibility.aside.item2.heading"), t(locale, "eligibility.aside.item2.detail")],
    [t(locale, "eligibility.aside.item3.heading"), t(locale, "eligibility.aside.item3.detail")],
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-8 md:py-24">
          <div className="mx-auto flex max-w-5xl flex-col gap-12 md:flex-row md:items-start md:gap-16">

            {/* LEFT - sticky context panel */}
            <aside className="order-2 md:order-1 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  {t(locale, "eligibility.pill")}
                </span>

                <p className="muted mt-6 text-sm leading-[1.75]">
                  {t(locale, "eligibility.aside.sub")}
                </p>

                <div className="mt-8 space-y-4">
                  {asideItems.map(([heading, detail]) => (
                    <div key={heading} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)]"
                        aria-hidden
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l2.5 2.5L9 1"
                            stroke="var(--teal)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* RIGHT - wizard steps */}
            <div className="order-1 min-w-0 flex-1 md:order-2">
              <FlowProgress step={1} locale={locale} />
              <EligibilityWizard locale={locale} />
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
