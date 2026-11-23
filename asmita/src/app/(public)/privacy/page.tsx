import { Illustration } from "@/components/Illustration";
import { LabToolHero } from "@/components/lab/LabToolPage";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { Callout, Fold, ItemCards, ItemTable, NextStep, ReadingLayout, ReadingSection } from "@/components/Reading";
import { ReadingTime } from "@/components/ReadingTime";

const PROMISE_ICONS = ["eyeOff", "shieldCheck", "users"] as const;

export default async function PrivacyPage() {
  const locale = await getLocale();

  const toc = [
    { id: "scope",             title: t(locale, "privacy.toc.01") },
    { id: "who-we-are",        title: t(locale, "privacy.toc.02") },
    { id: "what-we-collect",   title: t(locale, "privacy.toc.03") },
    { id: "what-we-never-collect", title: t(locale, "privacy.toc.04") },
    { id: "why-we-collect",    title: t(locale, "privacy.toc.05") },
    { id: "legal-basis",       title: t(locale, "privacy.toc.06") },
    { id: "how-long",          title: t(locale, "privacy.toc.07") },
    { id: "who-we-share-with", title: t(locale, "privacy.toc.08") },
    { id: "fingerprints",      title: t(locale, "privacy.toc.fp") },
    { id: "video",             title: t(locale, "privacy.toc.video") },
    { id: "crawler",           title: t(locale, "privacy.toc.crawl") },
    { id: "watch",             title: t(locale, "privacy.toc.watch") },
    { id: "partner-sharing",   title: t(locale, "privacy.toc.pshare") },
    { id: "sscd",              title: t(locale, "privacy.toc.sscd") },
    { id: "platform-partners", title: t(locale, "privacy.toc.ppartners") },
    { id: "how-we-protect",    title: t(locale, "privacy.toc.09") },
    { id: "your-rights",       title: t(locale, "privacy.toc.10") },
    { id: "children",          title: t(locale, "privacy.toc.11") },
    { id: "cookies",           title: t(locale, "privacy.toc.12") },
    { id: "transfers",         title: t(locale, "privacy.toc.13") },
    { id: "breach",            title: t(locale, "privacy.toc.14") },
    { id: "changes",           title: t(locale, "privacy.toc.15") },
    { id: "contact",           title: t(locale, "privacy.toc.16") },
  ];

  const promises = [
    { bold: t(locale, "privacy.tldr.p1.bold"), detail: t(locale, "privacy.tldr.p1.detail") },
    { bold: t(locale, "privacy.tldr.p2.bold"), detail: t(locale, "privacy.tldr.p2.detail") },
    { bold: t(locale, "privacy.tldr.p3.bold"), detail: t(locale, "privacy.tldr.p3.detail") },
  ];

  return (
    <AppShell>
      <div className="page-canvas lab-theme calm-sub">
        {/* HERO */}
        <LabToolHero
          title={`${t(locale, "privacy.hero.title1")} ${t(locale, "privacy.hero.gradient")}.`}
          intro={<p>{t(locale, "privacy.hero.sub")}</p>}
          visual={<Illustration name="page-privacy" eager className="issue-hero-art" />}
        >
          <p className="issue-meta">{t(locale, "privacy.hero.version")}<ReadingTime label={t(locale, "reading.minutes")} /></p>
        </LabToolHero>


        <div className="container">
          <div className="hairline" />
        </div>

        {/* TL;DR - three promise cards */}
        <section className="container section-pad">
          <div className="mx-auto max-w-3xl">
            <h2 className="section-title">
              {t(locale, "privacy.tldr.title")}
            </h2>
            <ul className="mt-10 space-y-4">
              {promises.map(({ bold, detail }, n) => (
                <li
                  key={bold}
                  className="flex items-start gap-4 rounded-[var(--radius-box)] border border-[var(--line)] bg-[var(--card)] px-6 py-5"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <span className="icon-tile" aria-hidden>
                    <Icon name={PROMISE_ICONS[n]} />
                  </span>
                  <p className="text-base leading-[1.7] md:text-[17px]">
                    <span className="font-medium text-[var(--ink)]">{bold}</span>{" "}
                    <span className="text-[var(--text-muted)]">{detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="container">
          <div className="hairline" />
        </div>

        <ReadingLayout tocLabel={t(locale, "privacy.toc.label")} toc={toc}>
                <ReadingSection id="scope" icon="compass" title={t(locale, "privacy.toc.01")}>
                  <p>{t(locale, "privacy.s01.p1")}</p>
                  <Fold locale={locale}>
                    <p>{t(locale, "privacy.s01.p2")}</p>
                  </Fold>
                </ReadingSection>

                <ReadingSection id="who-we-are" icon="building" title={t(locale, "privacy.toc.02")}>
                  <p>{t(locale, "privacy.s02.p1")}</p>
                  <p>{t(locale, "privacy.s02.p2")}</p>
                </ReadingSection>

                <ReadingSection id="what-we-collect" icon="clipboard" title={t(locale, "privacy.toc.03")}>
                  <p>{t(locale, "privacy.s03.intro")}</p>
                  <ItemCards items={cards(locale, "s03", ["i1", "i2", "i3", "i4", "i5", "i6"])} mark="check" />
                </ReadingSection>

                <ReadingSection id="what-we-never-collect" icon="eyeOff" title={t(locale, "privacy.toc.04")}>
                  <Callout icon="shieldCheck">{t(locale, "privacy.s04.intro")}</Callout>
                  <ItemCards items={cards(locale, "s04", ["i1", "i2", "i3", "i4"])} mark="x" />
                  <NextStep
                    title={t(locale, "privacy.next.never.title")}
                    body={t(locale, "privacy.next.never.body")}
                    cta={t(locale, "privacy.next.never.cta")}
                    href="/how-it-works"
                  />
                </ReadingSection>

                <ReadingSection id="why-we-collect" icon="target" title={t(locale, "privacy.toc.05")}>
                  <p>{t(locale, "privacy.s05.intro")}</p>
                  <ItemTable head={[t(locale, "privacy.table.data"), t(locale, "privacy.table.why")]} rows={rows(locale, "s05", ["i1", "i2", "i2b", "i3", "i4", "i5", "i6"])} />
                </ReadingSection>

                <ReadingSection id="legal-basis" icon="scale" title={t(locale, "privacy.toc.06")}>
                  <p>
                    {t(locale, "privacy.s06.p1a")}{" "}
                    <span className="font-semibold text-[var(--ink)]">{t(locale, "privacy.s06.p1.bold")}</span>
                    {t(locale, "privacy.s06.p1b")}
                  </p>
                  <Fold locale={locale}>
                    <p>
                      {t(locale, "privacy.s06.p2a")}{" "}
                      <span className="font-semibold text-[var(--ink)]">{t(locale, "privacy.s06.p2.bold")}</span>{" "}
                      {t(locale, "privacy.s06.p2b")}
                    </p>
                  </Fold>
                </ReadingSection>

                <ReadingSection id="how-long" icon="clock" title={t(locale, "privacy.toc.07")}>
                  <p>{t(locale, "privacy.s07.intro")}</p>
                  <ItemTable head={[t(locale, "privacy.table.data"), t(locale, "privacy.table.how")]} rows={rows(locale, "s07", ["i1", "i2", "i3", "i4", "i5", "i6", "i7", "i8"])} />
                </ReadingSection>

                <ReadingSection id="who-we-share-with" icon="users" title={t(locale, "privacy.toc.08")}>
                  <Callout>{t(locale, "privacy.s08.intro")}</Callout>
                  <ItemCards items={cards(locale, "s08", ["i1", "i2", "i3", "i4", "i5", "i6"])} />
                </ReadingSection>

                <ReadingSection id="fingerprints" icon="lock" title={t(locale, "privacy.toc.fp")}>
                  <p>{t(locale, "privacy.fp.p1")}</p>
                  <ItemCards items={cards(locale, "fp", ["i1", "i2", "i3", "i4", "i5"])} mark="check" />
                  <Callout icon="lock">{t(locale, "privacy.fp.callout")}</Callout>
                </ReadingSection>

                <ReadingSection id="video" icon="clock" title={t(locale, "privacy.toc.video")}>
                  <p>{t(locale, "privacy.video.p1")}</p>
                  <ItemCards items={cards(locale, "video", ["i1", "i2", "i3", "i4", "i5"])} mark="check" />
                  <p>{t(locale, "privacy.video.p2")}</p>
                </ReadingSection>

                <ReadingSection id="crawler" icon="compass" title={t(locale, "privacy.toc.crawl")}>
                  <p>{t(locale, "privacy.crawl.p1")}</p>
                  <p>{t(locale, "privacy.crawl.p2")}</p>
                  <ItemCards items={cards(locale, "crawl", ["i1", "i2", "i3", "i4", "i5"])} />
                  <Callout icon="compass">{t(locale, "privacy.crawl.callout")}</Callout>
                </ReadingSection>

                <ReadingSection id="watch" icon="refresh" title={t(locale, "privacy.toc.watch")}>
                  <p>{t(locale, "privacy.watch.p1")}</p>
                  <ItemCards items={cards(locale, "watch", ["i1", "i2", "i3"])} />
                  <p>{t(locale, "privacy.watch.p2")}</p>
                </ReadingSection>

                <ReadingSection id="partner-sharing" icon="users" title={t(locale, "privacy.toc.pshare")}>
                  <p>{t(locale, "privacy.pshare.p1")}</p>
                  <ItemCards items={cards(locale, "pshare", ["i1", "i2", "i3", "i4", "i5"])} />
                </ReadingSection>

                <ReadingSection id="sscd" icon="shieldCheck" title={t(locale, "privacy.toc.sscd")}>
                  <p>{t(locale, "privacy.sscd.p1")}</p>
                  <ItemCards items={cards(locale, "sscd", ["i1", "i2", "i3", "i4", "i5"])} />
                </ReadingSection>

                <ReadingSection id="platform-partners" icon="building" title={t(locale, "privacy.toc.ppartners")}>
                  <p>{t(locale, "privacy.ppartners.p1")}</p>
                  <ItemCards items={cards(locale, "ppartners", ["i1", "i2", "i3", "i4"])} />
                </ReadingSection>

                <ReadingSection id="how-we-protect" icon="lock" title={t(locale, "privacy.toc.09")}>
                  <p>{t(locale, "privacy.s09.intro")}</p>
                  <ItemCards items={cards(locale, "s09", ["i1", "i2", "i3", "i4", "i5", "i6", "i7"])} grid />
                </ReadingSection>

                <ReadingSection id="your-rights" icon="shieldCheck" title={t(locale, "privacy.toc.10")}>
                  <p>{t(locale, "privacy.s10.intro")}</p>
                  <ItemCards items={cards(locale, "s10", ["i1", "i2", "i3", "i4", "i5"])} mark="check" />
                  <NextStep
                    title={t(locale, "privacy.next.rights.title")}
                    body={t(locale, "privacy.next.rights.body")}
                    cta={t(locale, "privacy.next.rights.cta")}
                    href="/contact"
                  />
                </ReadingSection>

                <ReadingSection id="children" icon="heart" title={t(locale, "privacy.toc.11")}>
                  <p>{t(locale, "privacy.s11.p1")}</p>
                  <p>{t(locale, "privacy.s11.p2")}</p>
                  <NextStep
                    title={t(locale, "privacy.next.children.title")}
                    body={t(locale, "privacy.next.children.body")}
                    cta={t(locale, "privacy.next.children.cta")}
                    href="/minor-support"
                  />
                </ReadingSection>

                <ReadingSection id="cookies" icon="cookie" title={t(locale, "privacy.toc.12")}>
                  <Callout icon="cookie">{t(locale, "privacy.s12.p1")}</Callout>
                  <p>{t(locale, "privacy.s12.p2")}</p>
                </ReadingSection>

                <ReadingSection id="transfers" icon="globe" title={t(locale, "privacy.toc.13")}>
                  <p>{t(locale, "privacy.s13.p1")}</p>
                  <Fold locale={locale}>
                    <p>{t(locale, "privacy.s13.p2")}</p>
                  </Fold>
                </ReadingSection>

                <ReadingSection id="breach" icon="alert" title={t(locale, "privacy.toc.14")}>
                  <Callout>{t(locale, "privacy.s14.p2")}</Callout>
                  <Fold locale={locale}>
                    <p>{t(locale, "privacy.s14.p1")}</p>
                  </Fold>
                </ReadingSection>

                <ReadingSection id="changes" icon="refresh" title={t(locale, "privacy.toc.15")}>
                  <p>{t(locale, "privacy.s15.p1")}</p>
                </ReadingSection>

                <ReadingSection id="contact" icon="mail" title={t(locale, "privacy.toc.16")}>
                  <p>{t(locale, "privacy.s16.p1")}</p>
                  <p>
                    {t(locale, "privacy.s16.p2a")}{" "}
                    <a
                      href="mailto:grievance@meriasmita.org"
                      className="link-underline text-[var(--ink)]"
                    >
                      grievance@meriasmita.org
                    </a>{" "}
                    {t(locale, "privacy.s16.p2b")}{" "}
                    <Link href="/contact" className="link-underline text-[var(--ink)]">
                      {t(locale, "privacy.s16.p2c")}
                    </Link>
                    .
                  </p>
                  <p>{t(locale, "privacy.s16.p3")}</p>
                </ReadingSection>
        </ReadingLayout>

        <div className="container">
          <div className="hairline" />
        </div>

        {/* CLOSING */}
        <section className="container page-hero text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="section-title">
              {t(locale, "privacy.closing.title")}
            </h2>
            <p className="muted mx-auto mt-7 max-w-lg text-base leading-[1.75] md:text-lg">
              {t(locale, "privacy.closing.sub")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className="btn btn-primary" href="/contact">
                {t(locale, "privacy.closing.cta1")}
              </Link>
              <Link className="btn btn-secondary" href="/start">
                {t(locale, "privacy.closing.cta2")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

type Section = "s03" | "s04" | "s05" | "s07" | "s08" | "s09" | "s10" | "fp" | "video" | "crawl" | "watch" | "pshare" | "sscd" | "ppartners";
type Key = Parameters<typeof t>[1];

// The policy's bold-and-detail list items, for ItemCards and ItemTable.
function cards(locale: Locale, section: Section, items: string[]) {
  return items.map((i) => ({
    title: t(locale, `privacy.${section}.${i}.bold` as Key),
    body: t(locale, `privacy.${section}.${i}.detail` as Key),
  }));
}

function rows(locale: Locale, section: Section, items: string[]): [string, string][] {
  return cards(locale, section, items).map(({ title, body }) => [title, body]);
}
