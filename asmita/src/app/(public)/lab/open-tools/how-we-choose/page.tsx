import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";

// How we choose tools (docs/lab/open-tools-spec.md, Part C3, WP155): a
// short editorial page behind the directory — what "open" means here,
// what is checked before a tool is listed, what is never listed, how to
// suggest a tool or report an error, and the credit the directory owes
// the ROOST lists it draws on.
//
// Like every Lab page it answers 404 while ENABLE_LAB is off, so the
// gate runs per request (force-dynamic, like the other Lab pages). The
// body is English only by owner decision (spec Part C6, like
// /for-platforms): in the Hindi locale the chrome (breadcrumb, notice,
// section headings, the suggest button) is translated and a one-line
// notice says why the body is English. Static content only: nothing
// here stores user input or fetches anything at runtime.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How we choose tools · Open tools · Asmita AI Lab",
  description:
    "What 'open' means in the Asmita AI Lab's tool directory, what we check before listing a tool, what we never list, and how to suggest one or report an error.",
};

/** An external link as the design rules ask for them (Part C1): same
 * tab, a small external icon, and visually hidden text saying where it
 * goes. */
function ExternalLink({
  href,
  locale,
  children,
}: {
  href: string;
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <a className="text-link" href={href}>
      {children}{" "}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> {t(locale, "lab.openTools.tool.externalHint")}</span>
    </a>
  );
}

// The English-only body. Every fact about a tool below comes from the
// spec's own checked method text or from Part D (the two ROOST
// directories and the three not-open-source services), and the credit
// sentence is the spec's own.

const OPEN_MEANS = [
  "A tool counts as open here when anyone can download its source code or model weights, when its licence lets a commercial platform or a public NGO service use it, and when no paid tier is required for the core function. A repository anyone can read is not enough on its own; the licence has to allow the uses a real service needs.",
  "Some services in this field are free to use but not open source: they run on someone else's machines, and their code cannot be audited. Two are listed here in the Free services group: StopNCII.org, for adults' intimate images, and Take It Down, for images taken when the person was under 18. Each carries the Not open source mark, and its page says what that means. Asmita's own fingerprint feed is listed separately under From Asmita: it is free for approved partner platforms but is not an open-source package, and its partner API is documented in Asmita's public repository.",
];

const WE_CHECK: [label: string, text: string][] = [
  [
    "Licence",
    "We read the licence text itself, not the label on a download page, and every tool page links the licence it runs under.",
  ],
  [
    "Maintenance",
    "A release or a commit in the last 18 months, or a stated reason from the maintainers that the tool is stable as it is. One listed tool, SSCD, is archived; it is listed because Asmita uses it, and its page says it gets no new fixes.",
  ],
  [
    "Fit",
    "The tool has to cover a real stage of the workflow this directory is organised around: prevent, detect, review, act, share.",
  ],
  [
    "Privacy",
    "Whether the tool can run without sending images to a third party. When it cannot, its page says so.",
  ],
  [
    "Limits",
    "The known limits and bias notes the maintainers themselves publish. Every tool page has a 'What it cannot do' section, and it is never empty.",
  ],
];

const NOT_LISTED = [
  "A tool whose licence forbids commercial use for its core function. A platform or a public NGO service must be able to adopt a listed tool without a special agreement.",
  "A tool that requires sending intimate images to an unknown third party.",
  "Anything that generates sexual content. This directory exists to help stop image-based abuse, not to equip it.",
];

const SUGGEST = [
  "If a tool is missing, tell us which one, what it does, and where its licence and repository live. If a fact on one of these pages is wrong, tell us that too; a correction is as welcome as a suggestion.",
  "Both go through the site's feedback form.",
];

export default async function HowWeChoosePage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HEADER — the tool pages' pattern: notice (Hindi only),
            breadcrumb, title, lede. No hero band and no eyebrow. */}
        <header className="ot-tool-head">
          <div className="container">
            {locale === "hi" && (
              <p className="ot-en-note">{t(locale, "lab.openTools.tool.englishNotice")}</p>
            )}
            <nav
              className="ot-breadcrumb"
              aria-label={t(locale, "lab.openTools.tool.breadcrumbLabel")}
            >
              <Link className="text-link" href="/lab">
                {t(locale, "lab.openTools.tool.breadcrumbLab")}
              </Link>
              <span className="ot-crumb-sep" aria-hidden="true">
                ›
              </span>
              <Link className="text-link" href="/lab/open-tools">
                {t(locale, "lab.sections.openTools.name")}
              </Link>
              <span className="ot-crumb-sep" aria-hidden="true">
                ›
              </span>
              <span className="ot-crumb-here" aria-current="page">
                {t(locale, "lab.openTools.how.title")}
              </span>
            </nav>
            <h1 className="page-title mt-5">{t(locale, "lab.openTools.how.title")}</h1>
            <p className="ot-lede mt-6">{t(locale, "lab.openTools.how.lede")}</p>
          </div>
        </header>

        {/* BODY — one column, the 68ch reading measure */}
        <div className="ot-how-body">
          <div className="container">
            <div className="ot-how-main">
              <section className="ot-section" aria-labelledby="ot-how-open">
                <h2 id="ot-how-open" className="section-title">
                  {t(locale, "lab.openTools.how.openMeans")}
                </h2>
                {OPEN_MEANS.map((paragraph, index) => (
                  <p key={index} className="ot-prose">
                    {paragraph}
                  </p>
                ))}
              </section>

              <section className="ot-section" aria-labelledby="ot-how-check">
                <h2 id="ot-how-check" className="section-title">
                  {t(locale, "lab.openTools.how.weCheck")}
                </h2>
                <p className="ot-prose">
                  Before a tool gets a page in this directory, we check five things:
                </p>
                <ul className="ot-bullets">
                  {WE_CHECK.map(([label, text]) => (
                    <li key={label}>
                      <strong>{label}.</strong> {text}
                    </li>
                  ))}
                </ul>
                <p className="ot-prose">Every tool page also carries the date we last checked its facts.</p>
              </section>

              <section className="ot-section" aria-labelledby="ot-how-not">
                <h2 id="ot-how-not" className="section-title">
                  {t(locale, "lab.openTools.how.notList")}
                </h2>
                <p className="ot-prose">Three kinds of tool never get a page here:</p>
                <ul className="ot-bullets">
                  {NOT_LISTED.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="ot-section" aria-labelledby="ot-how-suggest">
                <h2 id="ot-how-suggest" className="section-title">
                  {t(locale, "lab.openTools.how.suggest")}
                </h2>
                {SUGGEST.map((paragraph, index) => (
                  <p key={index} className="ot-prose">
                    {paragraph}
                  </p>
                ))}
                <p className="ot-how-cta">
                  <Link className="btn btn-secondary" href="/feedback">
                    {t(locale, "lab.openTools.suggest.cta")}
                  </Link>
                </p>
              </section>

              <section className="ot-section" aria-labelledby="ot-how-credit">
                <h2 id="ot-how-credit" className="section-title">
                  {t(locale, "lab.openTools.how.credit")}
                </h2>
                <div className="card ot-credit">
                  <p>
                    Our list draws on ROOST&apos;s{" "}
                    <ExternalLink
                      href="https://github.com/roostorg/awesome-safety-tools"
                      locale={locale}
                    >
                      awesome-safety-tools
                    </ExternalLink>{" "}
                    directory (CC BY 4.0) and the{" "}
                    <ExternalLink href="https://github.com/roostorg/model-community" locale={locale}>
                      ROOST Model Community
                    </ExternalLink>
                    .
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
