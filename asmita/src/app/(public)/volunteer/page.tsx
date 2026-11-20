import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { StepList } from "@/components/Reading";
import { VolunteerForm } from "@/components/org/VolunteerForm";

// Volunteer roles, how it works, and the application form (56.4). The
// plain statement matters: volunteers never see survivors' case details.

export const metadata: Metadata = {
  title: "Volunteer",
  description: "Volunteer with Meri Asmita: legal help, translation, research, design, outreach and workshop facilitation.",
};

const ROLES = ["legal", "translation", "research", "designTech", "outreach", "facilitation"] as const;

const ROLE_FIELDS = {
  legal: { title: "org.volunteer.role.legal.title", body: "org.volunteer.role.legal.body", time: "org.volunteer.role.legal.time", skills: "org.volunteer.role.legal.skills", icon: "scale" },
  translation: { title: "org.volunteer.role.translation.title", body: "org.volunteer.role.translation.body", time: "org.volunteer.role.translation.time", skills: "org.volunteer.role.translation.skills", icon: "globe" },
  research: { title: "org.volunteer.role.research.title", body: "org.volunteer.role.research.body", time: "org.volunteer.role.research.time", skills: "org.volunteer.role.research.skills", icon: "clipboard" },
  designTech: { title: "org.volunteer.role.designTech.title", body: "org.volunteer.role.designTech.body", time: "org.volunteer.role.designTech.time", skills: "org.volunteer.role.designTech.skills", icon: "target" },
  outreach: { title: "org.volunteer.role.outreach.title", body: "org.volunteer.role.outreach.body", time: "org.volunteer.role.outreach.time", skills: "org.volunteer.role.outreach.skills", icon: "users" },
  facilitation: { title: "org.volunteer.role.facilitation.title", body: "org.volunteer.role.facilitation.body", time: "org.volunteer.role.facilitation.time", skills: "org.volunteer.role.facilitation.skills", icon: "presentation" },
} as const;

export default async function VolunteerPage() {
  const locale = await getLocale();
  return (
    <AppShell>
      <div className="page-canvas">
        <section className="hero" aria-label={t(locale, "org.volunteer.eyebrow")}>
          <div className="hero-content container section-pad page-hero-split">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow">{t(locale, "org.volunteer.eyebrow")}</span>
              <h1 className="page-title mt-5">{t(locale, "org.volunteer.title")}</h1>
              <p className="font-size-large mx-auto mt-5 max-w-2xl text-[var(--ink)]">{t(locale, "org.volunteer.sub")}</p>
            </div>
            <Illustration name="page-about" eager className="page-hero-art" />
          </div>
        </section>

        <section className="zone-white section-pad" aria-labelledby="roles-heading">
          <div className="container">
            <h2 id="roles-heading" className="section-title">
              {t(locale, "org.volunteer.rolesTitle")}
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {ROLES.map((role) => (
                <div key={role} className="card p-7">
                  <span className="icon-tile" aria-hidden>
                    <Icon name={ROLE_FIELDS[role].icon} />
                  </span>
                  <h3 className="mt-4 text-[20px] font-semibold text-[var(--ink)]">{t(locale, ROLE_FIELDS[role].title)}</h3>
                  <p className="mt-3 text-[16px] leading-[1.6] text-[var(--text)]">{t(locale, ROLE_FIELDS[role].body)}</p>
                  <p className="muted mt-4 text-sm leading-[1.6]">
                    <Icon name="clock" size={14} className="mr-1 inline align-[-2px]" /> {t(locale, ROLE_FIELDS[role].time)}
                  </p>
                  <p className="muted mt-1 text-sm leading-[1.6]">{t(locale, ROLE_FIELDS[role].skills)}</p>
                </div>
              ))}
            </div>

            <div className="callout mt-10">
              <Icon name="shieldCheck" className="mt-0.5 text-[var(--brand)]" />
              <div>
                <p className="font-medium">{t(locale, "org.volunteer.privacy")}</p>
                <p className="mt-1 text-[15px] font-normal">{t(locale, "org.volunteer.privacyBody")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="how-heading">
          <div className="transform-content container section-pad">
            <h2 id="how-heading" className="section-title">
              {t(locale, "org.volunteer.howTitle")}
            </h2>
            <StepList
              steps={[
                t(locale, "org.volunteer.how1"),
                t(locale, "org.volunteer.how2"),
                t(locale, "org.volunteer.how3"),
                t(locale, "org.volunteer.how4"),
              ]}
            />
          </div>
        </section>

        <section className="zone-white section-pad" id="apply" aria-labelledby="apply-heading">
          <div className="container max-w-3xl">
            <h2 id="apply-heading" className="section-title">
              {t(locale, "org.volunteer.formTitle")}
            </h2>
            <VolunteerForm locale={locale} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
