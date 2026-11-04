import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function DeleteAccountPage() {
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <span className="eyebrow">{t(locale, "delete.pill")}</span>
            <h1 className="page-title-sm mt-8">
              {t(locale, "delete.hero.title.1")}{" "}
              <em className="not-italic text-gradient">{t(locale, "delete.hero.title.em")}</em>
              {t(locale, "delete.hero.title.2")}
            </h1>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.7] md:text-lg md:leading-[1.7]">
              {t(locale, "delete.hero.sub")}
            </p>
          </div>
        </section>

        {/* WHAT GETS DELETED */}
        <section className="container py-14 text-center md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="eyebrow">
              {t(locale, "delete.what.eyebrow")}
            </p>
            <h2 className="section-title mt-4">
              {t(locale, "delete.what.title")}
            </h2>
            <ul className="muted mx-auto mt-8 max-w-md space-y-3 text-base leading-[1.75] md:text-lg">
              <li>
                <span className="font-medium text-[var(--ink)]">
                  {t(locale, "delete.what.item1.bold")}
                </span>{" "}
                {t(locale, "delete.what.item1.rest")}
              </li>
              <li>
                <span className="font-medium text-[var(--ink)]">
                  {t(locale, "delete.what.item2.bold")}
                </span>{" "}
                {t(locale, "delete.what.item2.rest")}
              </li>
            </ul>
            <p className="muted mx-auto mt-6 max-w-md text-sm leading-[1.7]">
              {t(locale, "delete.what.note")}
            </p>
          </div>
        </section>

        {/* FORM */}
        <section className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-xl">
            <DeleteAccountForm locale={locale} />
            <p className="mt-10 text-center">
              <Link
                href="/contact"
                className="link-underline text-sm text-[var(--ink)]"
              >
                {t(locale, "delete.form.cancelLink")}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
