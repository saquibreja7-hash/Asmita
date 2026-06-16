import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function RegisterPage() {
  const locale = await getLocale();

  const asideItems = [
    { heading: t(locale, "reg.aside.item1.heading"), detail: t(locale, "reg.aside.item1.detail") },
    { heading: t(locale, "reg.aside.item2.heading"), detail: t(locale, "reg.aside.item2.detail") },
    { heading: t(locale, "reg.aside.item3.heading"), detail: t(locale, "reg.aside.item3.detail") },
  ];

  return (
    <AppShell>
      <div className="page-canvas">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-5xl gap-16 md:flex md:items-start">

            {/* LEFT - sticky context panel */}
            <aside className="mb-12 md:mb-0 md:w-64 md:shrink-0">
              <div className="md:sticky md:top-28">
                <span className="pill">
                  <span className="dot" />
                  {t(locale, "reg.pill")}
                </span>

                <p className="muted mt-6 text-sm leading-[1.75]">
                  {t(locale, "reg.aside.sub")}
                </p>

                <div className="mt-8 space-y-4">
                  {asideItems.map(({ heading, detail }) => (
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
                        <p className="text-sm font-semibold text-[var(--foreground)]">{heading}</p>
                        <p className="muted mt-0.5 text-sm leading-[1.65]">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* RIGHT - form */}
            <div className="min-w-0 flex-1">
              <RegisterForm locale={locale} />
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
