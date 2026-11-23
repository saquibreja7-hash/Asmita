import { QuickExit } from "@/components/QuickExit";
import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { Icon } from "@/components/Icon";
import { getLocale } from "@/lib/get-locale";
import { t } from "@/lib/i18n";

export default async function MinorSupportPage() {
  const locale = await getLocale();

  const groups = [
    {
      eyebrow: t(locale, "minor.g1.label"),
      title: t(locale, "minor.g1.title"),
      subtitle: t(locale, "minor.g1.sub"),
      items: [
        {
          name: t(locale, "minor.r1.name"),
          contact: t(locale, "minor.r1.contact"),
          href: "tel:112",
          external: false,
          description: t(locale, "minor.r1.desc"),
        },
        {
          name: t(locale, "minor.r2.name"),
          contact: t(locale, "minor.r2.contact"),
          href: "tel:1098",
          external: false,
          description: t(locale, "minor.r2.desc"),
        },
      ],
    },
    {
      eyebrow: t(locale, "minor.g2.label"),
      title: t(locale, "minor.g2.title"),
      subtitle: t(locale, "minor.g2.sub"),
      items: [
        {
          name: t(locale, "minor.r3.name"),
          contact: t(locale, "minor.r3.contact"),
          href: "https://takeitdown.ncmec.org/",
          external: true,
          description: t(locale, "minor.r3.desc"),
        },
        {
          name: t(locale, "minor.r4.name"),
          contact: t(locale, "minor.r4.contact"),
          href: "https://stopncii.org/",
          external: true,
          description: t(locale, "minor.r4.desc"),
        },
      ],
    },
    {
      eyebrow: t(locale, "minor.g3.label"),
      title: t(locale, "minor.g3.title"),
      subtitle: t(locale, "minor.g3.sub"),
      items: [
        {
          name: t(locale, "minor.r5.name"),
          contact: t(locale, "minor.r5.contact"),
          href: "https://cybercrime.gov.in/",
          external: true,
          description: t(locale, "minor.r5.desc"),
        },
        {
          name: t(locale, "minor.r6.name"),
          contact: t(locale, "minor.r6.contact"),
          href: "https://cyberpeace.org/",
          external: true,
          description: t(locale, "minor.r6.desc"),
        },
      ],
    },
  ];

  const tones = ["teal", "coral", "gold"] as const;
  return (
    <LabToolShell variant="calm" withoutNewsletter>
      <QuickExit locale={locale} enableIdle={false} />
      <LabToolHero
        title={`${t(locale, "minor.hero.title.1")} ${t(locale, "minor.hero.title.2")}`}
        intro={
          <>
            <p>{t(locale, "minor.hero.sub")}</p>
            <p className="text-xs tracking-wide text-[var(--text)]">
              {t(locale, "minor.langNote")} <span lang="hi">हिंदी</span>
            </p>
          </>
        }
        visual={
          <div className="help-urgent">
            <ul className="help-urgent-list" role="list">
              <li className="issue-tone-teal">
                <span>{locale === "hi" ? "चाइल्डलाइन 1098 पर कॉल करें" : "Call Childline 1098"}</span>
                <a href="tel:1098">1098</a>
              </li>
              <li className="issue-tone-coral">
                <span>{locale === "hi" ? "आपात स्थिति में 112" : "Emergency 112"}</span>
                <a href="tel:112">112</a>
              </li>
            </ul>
          </div>
        }
      />

      {/* VALIDATION */}
      <section className="lab-sub-section">
        <div className="container">
          <p className="minor-validation">{t(locale, "minor.validation")}</p>
        </div>
      </section>

      {/* RESOURCE GROUPS */}
      {groups.map((group, gi) => (
        <section key={group.eyebrow} className="lab-sub-section" aria-labelledby={`minor-group-${gi}`}>
          <div className="container">
            <header className="lab-section-head">
              <span className="lab-index" aria-hidden="true">
                {String(gi + 1).padStart(2, "0")}
              </span>
              <h2 id={`minor-group-${gi}`} className="lab-h2">
                {group.title}
              </h2>
              <p className="lab-section-note">{group.subtitle}</p>
            </header>
            <div className="minor-resources">
              {group.items.map((item, ii) => (
                <a
                  key={item.name}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  aria-label={
                    item.external ? `${item.name} - ${item.contact} (opens in new tab)` : `${item.name} - call ${item.contact}`
                  }
                  className={`minor-resource issue-tone-${tones[(gi + ii) % tones.length]}`}
                >
                  <span className="minor-resource-text">
                    <span className="minor-resource-name">{item.name}</span>
                    <span className="minor-resource-desc">{item.description}</span>
                  </span>
                  <span className="minor-resource-contact">
                    {item.contact} {item.external ? "↗" : "→"}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* WHY NOT ASMITA */}
      <section className="lab-sub-section" aria-labelledby="minor-why-not">
        <div className="container">
          <div className="issue-act issue-tone-gold">
            <span className="issue-topic-icon" aria-hidden="true">
              <Icon name="shieldCheck" size={22} />
            </span>
            <h2 id="minor-why-not" className="issue-act-title">
              {t(locale, "minor.whyNot.title")}
            </h2>
            <p className="issue-act-body">{t(locale, "minor.whyNot.body")}</p>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="lab-sub-section">
        <div className="container">
          <div className="issue-close">
            <h2 className="lab-h2">{t(locale, "minor.closing.title")}</h2>
            <p className="issue-close-body">{t(locale, "minor.closing.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="btn btn-primary !m-0" href="tel:1098">
                {t(locale, "minor.closing.cta1")}
              </a>
              <Link className="btn btn-secondary !m-0" href="/">
                {t(locale, "minor.closing.cta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LabToolShell>
  );
}
