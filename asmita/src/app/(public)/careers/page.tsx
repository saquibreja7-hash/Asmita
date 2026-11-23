import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/Icon";
import { OrgHero } from "@/components/org/OrgHero";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
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
        <OrgHero title={t(locale, "org.careers.title")} lede={t(locale, "org.careers.sub")} illustration="page-about" />

        <section className="zone-white" aria-label={t(locale, "org.careers.title")}>
          <div className="container org-section org-section-first">
            {jobs.length === 0 ? (
              <div className="org-empty">
                <div>
                  <h2>{t(locale, "org.careers.emptyTitle")}</h2>
                  <p>{t(locale, "org.careers.emptyBody")}</p>
                </div>
                <Link className="btn btn-primary btn-arrow !m-0" href="/volunteer">
                  {t(locale, "org.careers.emptyCta")}
                </Link>
              </div>
            ) : (
              <ul className="org-rows">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <Link href={`/careers/${job.slug}`} className="org-row">
                      <span className="org-row-icon" aria-hidden>
                        <Icon name="briefcase" />
                      </span>
                      <h2 className="org-row-title">{job.title}</h2>
                      <p className="org-row-meta">
                        {t(locale, "org.careers.teamLabel")}: {job.team} · {job.location} · {t(locale, TYPE_KEY[job.type])}
                        {job.closesAt ? ` · ${t(locale, "org.careers.closesLabel")}: ${new Date(job.closesAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}` : ""}
                      </p>
                      <Icon name="arrowRight" className="org-row-arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="transform-section" aria-labelledby="why-heading">
          <div className="container org-section org-aside">
            <div className="org-head">
              <h2 id="why-heading" className="section-title">
                {t(locale, "org.careers.whyTitle")}
              </h2>
            </div>
            <div>
              <p className="max-w-[62ch] text-[length:var(--text-label)] leading-[1.7] text-[var(--text)]">{t(locale, "org.careers.whyIntro")}</p>
              <p className="org-note">{t(locale, "org.careers.equalOps")}</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
