import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { LabToolHero } from "@/components/lab/LabToolPage";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { renderMarkdown } from "@/lib/markdown";
import { getOrgJobBySlug } from "@/lib/org-jobs";
import type { OrgJobType } from "@/lib/org-jobs";

// One open role (docs/org/spec.md, 56.5): the description, the equal-
// opportunity statement and applying by email with a mailto: that puts the
// role in the subject. No CV upload, no stored applications. The page
// carries JobPosting structured data.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await getOrgJobBySlug(slug);
  if (!job) return { title: "Not found" };
  return { title: job.title, description: `Open role at Meri Asmita: ${job.title} (${job.team}, ${job.location}).` };
}

const TYPE_KEY: Record<OrgJobType, Parameters<typeof t>[1]> = {
  FULL_TIME: "org.careers.type.fullTime",
  PART_TIME: "org.careers.type.partTime",
  CONTRACT: "org.careers.type.contract",
  INTERNSHIP: "org.careers.type.internship",
  FELLOWSHIP: "org.careers.type.fellowship",
};

const TYPE_JSONLD: Record<OrgJobType, string> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  CONTRACT: "CONTRACTOR",
  INTERNSHIP: "INTERN",
  FELLOWSHIP: "OTHER",
};

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://meriasmita.org").replace(/\/+$/, "");

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getOrgJobBySlug(slug);
  if (!job || job.status !== "OPEN") notFound();
  const locale = await getLocale();
  const mailto = `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application for ${job.title} — Meri Asmita`)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionMd,
    employmentType: TYPE_JSONLD[job.type],
    hiringOrganization: {
      "@type": "NGO",
      name: "Meri Asmita",
      sameAs: siteUrl(),
    },
    datePosted: job.createdAt,
    validThrough: job.closesAt ?? undefined,
    jobLocationType: "TELECOMMUTE",
    ...(job.location.toLowerCase().includes("remote")
      ? {}
      : {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" },
          },
        }),
  };

  return (
    <AppShell>
      <div className="page-canvas lab-theme calm-sub">
        <LabToolHero
          backLabel={t(locale, "org.careers.back")}
          backHref="/careers"
          badge={t(locale, "org.careers.eyebrow")}
          title={job.title}
          intro={<></>}
        >
          <ul className="lab-facts" role="list">
            <li className="lab-fact">
              {t(locale, "org.careers.teamLabel")}: {job.team}
            </li>
            <li className="lab-fact">
              {t(locale, "org.careers.locationLabel")}: {job.location}
            </li>
            <li className="lab-fact">
              {t(locale, "org.careers.typeLabel")}: {t(locale, TYPE_KEY[job.type])}
            </li>
            {job.closesAt && (
              <li className="lab-fact">
                {t(locale, "org.careers.closesLabel")}:{" "}
                {new Date(job.closesAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}
              </li>
            )}
          </ul>
        </LabToolHero>

        <div className="container pb-14 md:pb-20">
          <div className="reading-col job-body">
            <div className="reading-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(job.descriptionMd) }} />

            <div className="next-step mt-10">
              <div>
                <p className="font-semibold text-[var(--ink)]">{t(locale, "org.careers.applyTitle")}</p>
                <p className="mt-1 text-[15px] text-[var(--text)]">
                  {t(locale, "org.careers.applyIntro")}
                  {job.applyInstructions ? ` ${job.applyInstructions}` : ""}
                </p>
              </div>
              <a className="btn btn-primary btn-arrow !m-0 shrink-0" href={mailto}>
                {t(locale, "org.careers.applyCta")}
              </a>
            </div>

            <p className="muted mt-10 text-[15px] leading-[1.7]">{t(locale, "org.careers.equalOps")}</p>

            <p className="mt-8">
              <Link className="arrow-link" href="/careers">
                {t(locale, "org.careers.back")}
              </Link>
            </p>
          </div>
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </div>
    </AppShell>
  );
}
