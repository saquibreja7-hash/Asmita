import type { Metadata } from "next";
import { LabScene } from "@/components/lab/LabScene";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { OPEN_TOOLS, getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { stacksUsingTool } from "@/lib/lab/open-tools/stacks";
import type { Category, Effort, OpenTool, Stage } from "@/lib/lab/open-tools/types";
import { WorkflowStrip } from "../WorkflowStrip";
import { OpenToolCard } from "../OpenToolCard";
import { ToolDiagram } from "../diagrams";
import { CodeBlock } from "./CodeBlock";

// One tool page of the open tools directory (docs/lab/open-tools-spec.md,
// Part C3): breadcrumb, header with the maintainer and licence, the sticky
// "At a glance" aside, the nine content sections the spec fixes, the credit
// card, the related-tool cards, the sources list and the closing "See it in
// a stack" band. All content comes from the catalogue (WP150), so the page
// holds no facts of its own.
//
// Like every Lab page it answers 404 while ENABLE_LAB is off, so the gate
// runs per request (force-dynamic, like the other Lab pages) while
// generateStaticParams still declares the catalogue's slug set.
//
// The page body is English only by owner decision (spec Part C6, like
// /for-platforms); in the Hindi locale the chrome (breadcrumb, aside,
// section headings, chips) is translated and a one-line notice says why
// the body is English. Nothing here stores user input or fetches anything
// at runtime: static content only.

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return OPEN_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getOpenTool(slug);
  if (!tool) return { title: "Open tools · Asmita AI Lab" };
  return {
    title: `${tool.name} · Open tools · Asmita AI Lab`,
    description: tool.summary.en,
  };
}

const CATEGORY_KEY: Record<Category, MessageKey> = {
  matching: "lab.openTools.category.matching",
  review: "lab.openTools.category.review",
  models: "lab.openTools.category.models",
  provenance: "lab.openTools.category.provenance",
  services: "lab.openTools.category.services",
  asmita: "lab.openTools.category.asmita",
  directories: "lab.openTools.category.directories",
};

const STAGE_KEY: Record<Stage, MessageKey> = {
  prevent: "lab.openTools.stage.prevent.name",
  detect: "lab.openTools.stage.detect.name",
  review: "lab.openTools.stage.review.name",
  act: "lab.openTools.stage.act.name",
  share: "lab.openTools.stage.share.name",
};

const EFFORT_KEY: Record<Effort, MessageKey> = {
  low: "lab.openTools.effort.low",
  medium: "lab.openTools.effort.medium",
  high: "lab.openTools.effort.high",
  none: "lab.openTools.effort.none",
};

/** Filled effort squares out of three: low 1, medium 2, high 3, none 0. */
const EFFORT_FILLED: Record<Effort, number> = { low: 1, medium: 2, high: 3, none: 0 };

/**
 * An external link as the design rules ask for them (Part C1): same tab, a
 * small external icon, and visually hidden text saying where it goes.
 */
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

/** A link that stays inside the site when its target is an internal path. */
function MaybeLink({
  href,
  locale,
  children,
}: {
  href: string;
  locale: Locale;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link className="text-link" href={href}>
        {children}
      </Link>
    );
  }
  return (
    <ExternalLink href={href} locale={locale}>
      {children}
    </ExternalLink>
  );
}

/** "22 November 2026" from the catalogue's ISO date, per locale. */
function checkedOn(tool: OpenTool, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${tool.checkedAt}T00:00:00Z`));
}

export default async function OpenToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!labEnabled()) notFound();
  const { slug } = await params;
  const tool = getOpenTool(slug);
  if (!tool) notFound();
  const locale = await getLocale();

  const say = t(locale, "lab.openTools.card.by").split("{maintainer}");
  const byBefore = say[0];
  const byAfter = say[1] ?? "";

  const creditKey: MessageKey = tool.fromAsmita
    ? "lab.openTools.tool.creditAsmita"
    : tool.openSource
      ? "lab.openTools.tool.creditBody"
      : "lab.openTools.tool.creditService";
  const creditText = t(locale, creditKey)
    .replace("{name}", tool.name)
    .replace("{licence}", tool.licence)
    // The maintainer appears twice in the open-source sentence ("made by
    // {maintainer} ... affiliated with {maintainer}"), and a string
    // replace() swaps only the first match.
    .replace("{maintainer}", tool.maintainer)
    .replace("{maintainer}", tool.maintainer);

  const docsHref = tool.docsUrl ?? tool.repoUrl ?? tool.maintainerUrl;
  const stacks = stacksUsingTool(tool.slug);
  const filled = EFFORT_FILLED[tool.effort];
  const categoryLabel = t(locale, CATEGORY_KEY[tool.category]);
  // The one "From Asmita" tool sits in the "From Asmita" category, whose
  // label would repeat the From Asmita chip word for word; one of the two
  // is enough (DESIGN.md: remove labels that repeat).
  const showCategoryChip = !(tool.fromAsmita && categoryLabel === t(locale, "lab.openTools.chip.fromAsmita"));

  return (
    <AppShell>
      <div className="page-canvas lab-theme lab-sub">
        {/* HEADER: notice (Hindi only), breadcrumb, name, maintainer, chips */}
        <header className="ot-tool-head">
          <div className="container lab-detail-head">
            <LabScene kind="open-tools" className="lab-detail-scene" />
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
                {tool.name}
              </span>
            </nav>
            <h1 className="page-title ot-tool-title">{tool.name}</h1>
            <p className="ot-tool-by">
              {byBefore}
              <MaybeLink href={tool.maintainerUrl} locale={locale}>
                {tool.maintainer}
              </MaybeLink>
              {byAfter}
            </p>
            <div className="ot-tool-chips">
              <span className="ot-chip ot-chip-licence">{tool.licence}</span>
              {showCategoryChip && <span className="ot-chip">{categoryLabel}</span>}
              {!tool.openSource && (
                <span className="ot-chip ot-chip-closed">
                  {t(locale, "lab.openTools.chip.notOpenSource")}
                </span>
              )}
              {tool.fromAsmita && (
                <span className="ot-chip ot-chip-asmita">
                  {t(locale, "lab.openTools.chip.fromAsmita")}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* BODY: the sticky aside and the content sections */}
        <div className="ot-tool-body">
          <div className="container">
            <div className="ot-tool-grid">
              {/* Aside first in the DOM: after the header on phones, the
                  sticky right column on wide screens. */}
              <aside className="ot-glance card" aria-labelledby="ot-glance-title">
                <h2 id="ot-glance-title" className="ot-glance-title">
                  {t(locale, "lab.openTools.tool.atAGlance")}
                </h2>
                <dl className="ot-glance-list">
                  <div>
                    <dt>{t(locale, "lab.openTools.tool.what")}</dt>
                    <dd>{tool.kind}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "lab.openTools.tool.licence")}</dt>
                    <dd>
                      <MaybeLink href={tool.licenceUrl} locale={locale}>
                        {tool.licence}
                      </MaybeLink>
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, "lab.openTools.tool.runsOn")}</dt>
                    <dd>{tool.runsOn}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "lab.openTools.card.effort")}</dt>
                    <dd>
                      <span className="ot-glance-effort">
                        <span className="ot-effort-squares" aria-hidden="true">
                          {[0, 1, 2].map((square) => (
                            <span
                              key={square}
                              className={`ot-effort-sq${square < filled ? " on" : ""}`}
                            />
                          ))}
                        </span>
                        <span>{t(locale, EFFORT_KEY[tool.effort])}</span>
                      </span>
                      <span className="ot-glance-effortnote">{tool.effortNote}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, "lab.openTools.tool.stages")}</dt>
                    <dd>
                      <ul className="ot-stage-chips">
                        {tool.stages.map((stage) => (
                          <li key={stage} className="ot-chip ot-chip-stage">
                            {t(locale, STAGE_KEY[stage])}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, "lab.openTools.tool.links")}</dt>
                    <dd>
                      <ul className="ot-glance-links">
                        {tool.repoUrl && (
                          <li>
                            <MaybeLink href={tool.repoUrl} locale={locale}>
                              {t(locale, "lab.openTools.tool.repository")}
                            </MaybeLink>
                          </li>
                        )}
                        {tool.docsUrl && (
                          <li>
                            <MaybeLink href={tool.docsUrl} locale={locale}>
                              {t(locale, "lab.openTools.tool.docs")}
                            </MaybeLink>
                          </li>
                        )}
                        {!tool.repoUrl && !tool.docsUrl && (
                          <li>
                            <MaybeLink href={tool.maintainerUrl} locale={locale}>
                              {t(locale, "lab.openTools.tool.site")}
                            </MaybeLink>
                          </li>
                        )}
                      </ul>
                    </dd>
                  </div>
                </dl>
                <p className="ot-glance-checked">
                  {t(locale, "lab.openTools.tool.lastChecked").replace(
                    "{date}",
                    checkedOn(tool, locale),
                  )}
                </p>
              </aside>

              {/* The main column */}
              <div className="ot-tool-main">
                <section className="ot-section" aria-labelledby="ot-what">
                  <h2 id="ot-what" className="section-title">
                    {t(locale, "lab.openTools.tool.whatItDoes")}
                  </h2>
                  {tool.whatItDoes.map((paragraph, index) => (
                    <p key={index} className="ot-prose">
                      {paragraph}
                    </p>
                  ))}
                </section>

                <section className="ot-section" aria-labelledby="ot-how">
                  <h2 id="ot-how" className="section-title">
                    {t(locale, "lab.openTools.tool.howItWorks")}
                  </h2>
                  <ol className="ot-steps">
                    {tool.howItWorks.map((step, index) => (
                      <li key={index}>
                        <span className="ot-step-n" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="ot-step-text">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <ToolDiagram kind={tool.diagram} />
                </section>

                <section className="ot-section" aria-labelledby="ot-fits">
                  <h2 id="ot-fits" className="section-title">
                    {t(locale, "lab.openTools.tool.whereItFits")}
                  </h2>
                  <WorkflowStrip locale={locale} highlight={tool.stages} />
                  <ul className="ot-bullets">
                    {tool.fitsWhere.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="ot-section" aria-labelledby="ot-features">
                  <h2 id="ot-features" className="section-title">
                    {t(locale, "lab.openTools.tool.whatYouGet")}
                  </h2>
                  <ul className="ot-bullets">
                    {tool.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </section>

                <section className="ot-section" aria-labelledby="ot-limits">
                  <h2 id="ot-limits" className="section-title">
                    {t(locale, "lab.openTools.tool.limits")}
                  </h2>
                  <ul className="ot-bullets">
                    {tool.limits.map((limit, index) => (
                      <li key={index}>{limit}</li>
                    ))}
                  </ul>
                </section>

                <section className="ot-section" aria-labelledby="ot-start">
                  <h2 id="ot-start" className="section-title">
                    {t(locale, "lab.openTools.tool.gettingStarted")}
                  </h2>
                  <ol className="ot-steps">
                    {tool.gettingStarted.map((step, index) => (
                      <li key={index}>
                        <span className="ot-step-n" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="ot-step-text">
                          {step.step}
                          {step.code && <CodeBlock code={step.code} locale={locale} />}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="ot-docs-link">
                    <MaybeLink href={docsHref} locale={locale}>
                      {t(locale, "lab.openTools.tool.readDocs")}
                    </MaybeLink>
                  </p>
                </section>

                {tool.asmitaUse && (
                  <section className="ot-section" aria-labelledby="ot-asmita">
                    <h2 id="ot-asmita" className="section-title">
                      {t(locale, "lab.openTools.tool.asmitaUse")}
                    </h2>
                    <p className="ot-prose">{tool.asmitaUse}</p>
                  </section>
                )}

                <section className="ot-section" aria-labelledby="ot-credit">
                  <h2 id="ot-credit" className="section-title">
                    {t(locale, "lab.openTools.tool.credit")}
                  </h2>
                  <div className="card ot-credit">
                    <p>{creditText}</p>
                    <p>
                      <MaybeLink
                        href={tool.repoUrl ?? tool.maintainerUrl}
                        locale={locale}
                      >
                        {tool.repoUrl
                          ? t(locale, "lab.openTools.tool.repository")
                          : t(locale, "lab.openTools.tool.site")}
                      </MaybeLink>
                    </p>
                    {tool.paper && (
                      <p className="ot-paper">
                        {t(locale, "lab.openTools.tool.paper")}: {tool.paper}
                      </p>
                    )}
                  </div>
                </section>

                <section className="ot-section" aria-labelledby="ot-related">
                  <h2 id="ot-related" className="section-title">
                    {t(locale, "lab.openTools.tool.related")}
                  </h2>
                  <div className="ot-grid">
                    {tool.related.map((relatedSlug) => {
                      const related = getOpenTool(relatedSlug);
                      return related ? (
                        <OpenToolCard key={relatedSlug} tool={related} locale={locale} />
                      ) : null;
                    })}
                  </div>
                </section>

                <section className="ot-section" aria-labelledby="ot-sources">
                  <h2 id="ot-sources" className="section-title">
                    {t(locale, "lab.openTools.tool.sources")}
                  </h2>
                  <ol className="ot-sources">
                    {tool.sources.map((source, index) => (
                      <li key={index}>
                        <MaybeLink href={source} locale={locale}>
                          {source}
                        </MaybeLink>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* CLOSING BAND: the stacks that use this tool, or the directory */}
        <section className="ot-close" aria-labelledby="ot-stack-band">
          <div className="container">
            <div className="ot-close-inner">
              <h2 id="ot-stack-band" className="section-title">
                {t(locale, "lab.openTools.tool.stacks.title")}
              </h2>
              {stacks.length > 0 ? (
                <ul className="ot-stack-links">
                  {stacks.map((stack) => (
                    <li key={stack.slug}>
                      <Link className="text-link" href={`/lab/stacks/${stack.slug}`}>
                        {stack.title} <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p>{t(locale, "lab.openTools.tool.stacks.none")}</p>
                  <Link className="btn btn-secondary" href="/lab/open-tools">
                    {t(locale, "lab.openTools.tool.stacks.back")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
