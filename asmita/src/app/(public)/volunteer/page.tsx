import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { OrgHero } from "@/components/org/OrgHero";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";
import { VolunteerForm } from "@/components/org/VolunteerForm";

// Volunteer roles, how it works, and the application form (56.4). The
// plain statement matters: volunteers never see survivors' case details.

export const metadata: Metadata = {
  title: "Volunteer",
  description: "Volunteer with Meri Asmita: legal help, translation, research, design, outreach and workshop facilitation.",
};

// Workshop facilitation is not listed: the training programmes were taken out.
const ROLES = ["legal", "translation", "research", "designTech", "outreach"] as const;

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
        <OrgHero title={t(locale, "org.volunteer.title")} lede={t(locale, "org.volunteer.sub")} illustration="page-about">
          <div className="mt-8 flex">
            <a className="btn btn-primary btn-arrow !m-0" href="#apply">
              {t(locale, "org.volunteer.formTitle")}
            </a>
          </div>
        </OrgHero>

        <section className="zone-white" aria-labelledby="roles-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="roles-heading" className="section-title">
                {t(locale, "org.volunteer.rolesTitle")}
              </h2>
            </div>
            <ul className="org-rows org-rows-2">
              {ROLES.map((role) => (
                <li key={role}>
                  <div className="org-row">
                    <span className="org-row-icon" aria-hidden>
                      <Icon name={ROLE_FIELDS[role].icon} />
                    </span>
                    <h3 className="org-row-title">{t(locale, ROLE_FIELDS[role].title)}</h3>
                    <p className="org-row-body">{t(locale, ROLE_FIELDS[role].body)}</p>
                    <p className="org-row-meta">
                      {t(locale, ROLE_FIELDS[role].time)} {t(locale, ROLE_FIELDS[role].skills)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="org-note">
              <Icon name="shieldCheck" />
              <p>
                <strong>{t(locale, "org.volunteer.privacy")}</strong>
                {t(locale, "org.volunteer.privacyBody")}
              </p>
            </div>
          </div>
        </section>

        <section className="transform-section" aria-labelledby="how-heading">
          <div className="container org-section">
            <div className="org-head">
              <h2 id="how-heading" className="section-title">
                {t(locale, "org.volunteer.howTitle")}
              </h2>
            </div>
            <ol className="org-steps">
              {(["org.volunteer.how1", "org.volunteer.how2", "org.volunteer.how3", "org.volunteer.how4"] as const).map((k) => (
                <li key={k}>
                  <p>{t(locale, k)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="zone-white scroll-mt-20" id="apply" aria-labelledby="apply-heading">
          <div className="container org-section org-aside">
            <div className="org-head org-aside-sticky">
              <h2 id="apply-heading" className="section-title">
                {t(locale, "org.volunteer.formTitle")}
              </h2>
            </div>
            <div className="org-form">
              <VolunteerForm locale={locale} />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
