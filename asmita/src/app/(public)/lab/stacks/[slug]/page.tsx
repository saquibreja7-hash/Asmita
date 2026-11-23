import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { getStack } from "@/lib/lab/open-tools/stacks";
import type { Stack, StackStep } from "@/lib/lab/open-tools/types";
import { PipelineDiagram } from "../../open-tools/diagrams/PipelineDiagram";
import { BUILT_STACK_SLUGS, stackIsBuilt, WITH_ASMITA_LINK } from "../built-stacks";

// One free stack page (docs/lab/open-tools-spec.md, Part C3): breadcrumb,
// header with the "For:" line and the three fact boxes, the pipeline
// diagram as the visual centrepiece, one numbered section per step, the
// three-column plan, the honest gaps, the India notes, "Work with Asmita"
// and the closing band with every tool in the stack. All content comes
// from the WP150 stack data, so the page holds no facts of its own.
//
// WP153 built this template behind the first stack; WP154 renders all
// three stacks (stop-reuploads, ai-app-guardrails, rules-and-review)
// through it. stackIsBuilt keeps the invariant that only stacks listed
// in built-stacks.ts resolve, so data without a declared page 404s.
//
// Like every Lab page this answers 404 while ENABLE_LAB is off, so the
// gate runs per request (force-dynamic) while generateStaticParams still
// declares the built slug set. The body is English only by owner decision
// (spec Part C6, like /for-platforms): in the Hindi locale the chrome
// (breadcrumb, labels, section headings, plan columns) is translated and
// a one-line notice says why the body is English. Static content only:
// no stored input, no runtime fetch.

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return BUILT_STACK_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stack = getStack(slug);
  if (!stack) return { title: "Free stacks · Asmita AI Lab" };
  return {
    title: `${stack.title} · Free stacks · Asmita AI Lab`,
    description: stack.lede,
  };
}

/** The tools this stack uses, in first-appearance order, deduplicated. */
function stackTools(stack: Stack) {
  const slugs: string[] = [];
  for (const step of stack.steps) {
    for (const slug of step.tools) {
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs
    .map((slug) => getOpenTool(slug))
    .filter((tool): tool is NonNullable<typeof tool> => tool !== undefined);
}

/** A stack step with its pipeline number attached by the page. */
type NumberedStep = StackStep & { number: number };

/** One numbered step section: what, why, the tools, what you need, the
 *  concrete done-when check and the common mistakes (spec Part C3). */
function StepSection({ step, locale }: { step: NumberedStep; locale: Locale }) {
  return (
    <section className="ot-section" aria-labelledby={`ot-step-${step.number}`}>
      <h2 id={`ot-step-${step.number}`} className="section-title ot-stack-step-title">
        <span className="ot-stack-stepnum" aria-hidden="true">
          {step.number}
        </span>
        {step.name}
      </h2>
      <p className="ot-prose">{step.what}</p>
      <p className="ot-prose">{step.why}</p>
      {step.tools.length > 0 && (
        <p className="ot-stack-steptools">
          <span className="ot-stack-label">{t(locale, "lab.stacks.page.step.tools")}:</span>{" "}
          {step.tools.map((slug, index) => {
            const tool = getOpenTool(slug);
            return (
              <span key={slug}>
                {index > 0 && ", "}
                {tool ? (
                  <Link className="text-link" href={`/lab/open-tools/${slug}`}>
                    {tool.name}
                  </Link>
                ) : (
                  slug
                )}
              </span>
            );
          })}
          .
        </p>
      )}
      <p className="ot-stack-line">
        <span className="ot-stack-label">{t(locale, "lab.stacks.page.step.need")}:</span> {step.need}
      </p>
      <p className="ot-stack-done">
        <span className="ot-stack-label">{t(locale, "lab.stacks.page.step.doneWhen")}:</span> {step.doneWhen}
      </p>
      <div className="ot-stack-mistakes">
        <p className="ot-stack-label">{t(locale, "lab.stacks.page.step.mistakes")}:</p>
        <ul className="ot-bullets">
          {step.mistakes.map((mistake, index) => (
            <li key={index}>{mistake}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function StackPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!labEnabled()) notFound();
  const { slug } = await params;
  const stack = getStack(slug);
  if (!stack || !stackIsBuilt(stack.slug)) notFound();
  const locale = await getLocale();

  const steps = stack.steps.map((step, index) => ({ ...step, number: index + 1 }));
  const tools = stackTools(stack);
  // The India notes always end with the spec's not-legal-advice line
  // (checked by the WP150 tests); render it as the quiet closing line.
  const notes = stack.indiaNotes.slice(0, -1);
  const notLaw = stack.indiaNotes[stack.indiaNotes.length - 1];
  const plan: { key: "week1" | "weeks2to3" | "month2"; label: string }[] = [
    { key: "week1", label: t(locale, "lab.stacks.plan.week1") },
    { key: "weeks2to3", label: t(locale, "lab.stacks.plan.weeks2to3") },
    { key: "month2", label: t(locale, "lab.stacks.plan.month2") },
  ];
  const withAsmitaLink = WITH_ASMITA_LINK.get(stack.slug);

  return (
    <AppShell>
      <div className="page-canvas lab-theme lab-sub">
        {/* HEADER: notice (Hindi only), breadcrumb, title, For: line, lede,
            the three fact boxes */}
        <header className="ot-stack-head">
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
              <Link className="text-link" href="/lab/stacks">
                {t(locale, "lab.stacks.title")}
              </Link>
              <span className="ot-crumb-sep" aria-hidden="true">
                ›
              </span>
              <span className="ot-crumb-here" aria-current="page">
                {stack.title}
              </span>
            </nav>
            <h1 className="page-title ot-stack-title">{stack.title}</h1>
            <p className="ot-stack-for">
              <span className="ot-stack-label">{t(locale, "lab.stacks.page.for")}:</span> {stack.forWho}
            </p>
            <p className="ot-stack-lede">{stack.lede}</p>
            <dl className="ot-stack-facts">
              <div className="ot-stack-fact">
                <dt>{t(locale, "lab.stacks.page.time")}</dt>
                <dd>{stack.time}</dd>
              </div>
              <div className="ot-stack-fact">
                <dt>{t(locale, "lab.stacks.page.people")}</dt>
                <dd>{stack.people}</dd>
              </div>
              <div className="ot-stack-fact">
                <dt>{t(locale, "lab.stacks.page.cost")}</dt>
                <dd>{stack.resources}</dd>
              </div>
            </dl>
          </div>
        </header>

        {/* THE PIPELINE DIAGRAM — the steps left to right on desktop, top to
            bottom on phones. Both drawings are aria-hidden decoration; the
            numbered sections below carry the same facts with real links. */}
        <div className="ot-stack-pipeline">
          <div className="container">
            <div className="ot-diagram ot-pipeline-row">
              <PipelineDiagram steps={stack.steps} orientation="row" />
            </div>
            <div className="ot-diagram ot-pipeline-col">
              <PipelineDiagram steps={stack.steps} orientation="col" />
            </div>
          </div>
        </div>

        {/* THE STEPS — one numbered section per pipeline box */}
        <div className="ot-stack-body">
          <div className="container">
            {steps.map((step) => (
              <StepSection key={step.number} step={step} locale={locale} />
            ))}

            {/* THE PLAN — the three-column timeline */}
            <section className="ot-section" aria-labelledby="ot-plan">
              <h2 id="ot-plan" className="section-title">
                {t(locale, "lab.stacks.page.plan")}
              </h2>
              <div className="ot-stack-plan">
                {plan.map((column) => (
                  <div key={column.key} className="ot-stack-plan-col">
                    <h3 className="ot-stack-plan-title">{column.label}</h3>
                    <ul className="ot-stack-checklist">
                      {stack.plan[column.key].map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* WHAT THIS WILL NOT CATCH */}
            <section className="ot-section" aria-labelledby="ot-wont">
              <h2 id="ot-wont" className="section-title">
                {t(locale, "lab.stacks.page.wontCatch")}
              </h2>
              <ul className="ot-bullets">
                {stack.wontCatch.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* INDIA NOTES — the /for-platforms law sentences reused
                verbatim, then the not-legal-advice line */}
            <section className="ot-section" aria-labelledby="ot-india">
              <h2 id="ot-india" className="section-title">
                {t(locale, "lab.stacks.page.indiaNotes")}
              </h2>
              <div className="card ot-stack-notes">
                <ul className="ot-bullets">
                  {notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
                <p className="ot-stack-notlaw">{notLaw}</p>
              </div>
            </section>

            {/* WORK WITH ASMITA */}
            <section className="ot-section" aria-labelledby="ot-with">
              <h2 id="ot-with" className="section-title">
                {t(locale, "lab.stacks.page.withAsmita")}
              </h2>
              <ul className="ot-bullets">
                {stack.withAsmita.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              {withAsmitaLink && (
                <p className="ot-stack-cta">
                  <Link className="text-link" href={withAsmitaLink.href}>
                    {t(locale, withAsmitaLink.labelKey)} <span aria-hidden="true">→</span>
                  </Link>
                </p>
              )}
            </section>
          </div>
        </div>

        {/* CLOSING BAND — every tool in this stack, and the other stacks */}
        <section className="ot-close" aria-labelledby="ot-stack-close">
          <div className="container">
            <div className="ot-close-inner">
              <h2 id="ot-stack-close" className="section-title">
                {t(locale, "lab.stacks.page.close.title")}
              </h2>
              <div className="ot-stack-closegrid">
                {tools.map((tool) => (
                  <div key={tool.slug} className="ot-stack-closecard">
                    <p className="ot-stack-closetitle">
                      <Link className="text-link" href={`/lab/open-tools/${tool.slug}`}>
                        {tool.name}
                      </Link>
                    </p>
                    <p className="ot-by">
                      {t(locale, "lab.openTools.card.by").replace("{maintainer}", tool.maintainer)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="ot-stack-others">
                <Link className="text-link" href="/lab/stacks">
                  {t(locale, "lab.stacks.page.close.others")} <span aria-hidden="true">→</span>
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
