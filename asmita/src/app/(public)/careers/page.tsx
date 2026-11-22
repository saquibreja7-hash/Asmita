import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { NewsletterInlineForm } from "@/components/org/NewsletterInlineForm";
import { listOpenOrgJobs } from "@/lib/org-jobs";
import type { OrgJobType } from "@/lib/org-jobs";

// Open roles (docs/org/spec.md, 56.5). Applying is by email only; no CV
// upload and no stored applications. Empty state offers volunteering and
// the newsletter instead.

export const metadata: Metadata = {
  title: "Careers",
  description: "Open roles at Meri Asmita. We apply by email — no CV upload, no stored applications.",
};

const TYPE_KEY: Record<OrgJobType, Parameters<typeof t>[1]> = {
  FULL_TIME: "org.careers.type.fullTime",
  PART_TIME: "org.careers.type.partTime",
  CONTRACT: "org.careers.type.contract",
  INTERNSHIP: "org.careers.type.internship",
  FELLOWSHIP: "org.careers.type.fellowship",
};

export default async function CareersPage() {
  const locale = await getLocale();
  const jobs = await listOpenOrgJobs();

  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.careers.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.careers.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.careers.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.careers.sub")}</p>
            </div>
            <Illustration name="page-about" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-label={t(locale, "org.careers.title")}>
          <div className="container">
            {jobs.length === 0 ? (
              <div className="mx-auto max-w-3xl rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
                <h2 className="section-title">{t(locale, "org.careers.emptyTitle")}</h2>
                <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.65] text-[var(--text)]">{t(locale, "org.careers.emptyBody")}</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Link className="btn btn-primary btn-arrow !m-0" href="/volunteer">
                    {t(locale, "org.careers.emptyCta")}
                  </Link>
                </div>
                <div className="mx-auto mt-8 max-w-md">
                  <p className="eyebrow mb-3 block">{t(locale, "org.newsletter.eyebrow")}</p>
                  <NewsletterInlineForm locale={locale} source="careers" />
                </div>
              </div>
            ) : (
              <ul className="mx-auto grid max-w-3xl gap-4">
                {jobs.map((job) => (
                  <li key={job.id} className="card p-7">
                    <h2 className="text-[20px] font-semibold">
                      <Link href={`/careers/${job.slug}`} className="hover:text-[var(--brand-strong)]">
                        {job.title}
                      </Link>
                    </h2>
                    <p className="muted mt-2 text-sm">
                      {t(locale, "org.careers.teamLabel")}: {job.team} · {job.location} · {t(locale, TYPE_KEY[job.type])}
                      {job.closesAt ? ` · ${t(locale, "org.careers.closesLabel")}: ${new Date(job.closesAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}` : ""}
                    </p>
                    <Link className="arrow-link mt-4" href={`/careers/${job.slug}`}>
                      {t(locale, "reading.more")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="transform-section" aria-labelledby="why-heading">
          <div className="transform-content container section-pad">
            <h2 id="why-heading" className="section-title">
              {t(locale, "org.careers.whyTitle")}
            </h2>
            <p className="mt-5 max-w-2xl text-[17px] leading-[1.75] text-[var(--text)]">
              {t(locale, "org.careers.whyIntro")}
            </p>
            <div className="callout mt-8 max-w-xl">
              <div>
                <p className="text-[15px] font-normal">{t(locale, "org.careers.equalOps")}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
