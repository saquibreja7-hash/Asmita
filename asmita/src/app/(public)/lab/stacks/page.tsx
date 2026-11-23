import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { getLocale } from "@/lib/get-locale";
import { t, type Locale } from "@/lib/i18n";
import { labEnabled } from "@/lib/lab/flags";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";
import { STACKS } from "@/lib/lab/open-tools/stacks";
import type { Stack } from "@/lib/lab/open-tools/types";

export const metadata: Metadata = {
  title: "Free stacks",
  description:
    "Ready-made combinations of open tools for one job each, with the order to set them up in: stop re-uploads on a platform, guard an AI image app, run rules and review at scale.",
};

export const dynamic = "force-dynamic";

// The free stacks index (docs/lab/open-tools-spec.md, Part C3): one large
// card per stack, in the WP150 data's order. Like every Lab page it
// answers 404 while ENABLE_LAB is off. WP154 completes the set, so every
// card links its stack's page — the WP153 "Coming next" state is gone.
// Static content only: the stacks are typed data in the repository,
// nothing here stores user input or fetches anything at runtime. The
// index hero and card text are translated (Part C6); the stack pages'
// bodies are English only.

/** The tools one stack uses, in first-appearance order, deduplicated. */
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

function StackCard({ stack, locale }: { stack: Stack; locale: Locale }) {
  const hindi = locale === "hi";
  const title = hindi ? stack.hi.title : stack.title;
  const who = hindi ? stack.hi.forWho : stack.forWho;
  const meta = hindi ? `${stack.hi.time} · ${stack.hi.people}` : `${stack.time} · ${stack.people}`;
  const tools = stackTools(stack);

  return (
    <article className="ot-stacks-card">
      <p className="ot-stacks-who">{who}</p>
      <h3 className="ot-stacks-job">
        <Link className="text-link" href={`/lab/stacks/${stack.slug}`}>
          {title}
        </Link>
      </h3>
      <ul className="ot-stacks-tools" aria-label={t(locale, "lab.stacks.index.toolsLabel")}>
        {tools.map((tool) => (
          <li key={tool.slug} className="ot-chip ot-stacks-tool">
            {tool.name}
          </li>
        ))}
      </ul>
      <p className="ot-stacks-meta">{meta}</p>
      <Link className="btn btn-secondary" href={`/lab/stacks/${stack.slug}`}>
        {t(locale, "lab.stacks.index.read")}
      </Link>
    </article>
  );
}

export default async function StacksPage() {
  if (!labEnabled()) notFound();
  const locale = await getLocale();

  return (
    <LabToolShell>
      <LabToolHero
        backLabel={t(locale, "lab.eyebrow")}
        title={t(locale, "lab.stacks.title")}
        intro={<p>{t(locale, "lab.stacks.lede")}</p>}
        scene="stacks"
      />

        {/* THE THREE CARDS */}
        <section className="ot-stacks-list" aria-labelledby="ot-stacks-heading">
          <div className="container">
            <h2 id="ot-stacks-heading" className="section-title">
              {t(locale, "lab.stacks.index.heading")}
            </h2>
            <div className="ot-stacks-grid">
              {STACKS.map((stack) => (
                <StackCard key={stack.slug} stack={stack} locale={locale} />
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING BAND — the one gradient the design rules allow */}
        <section className="ot-close" aria-labelledby="ot-stacks-close">
          <div className="container">
            <div className="ot-close-inner">
              <h2 id="ot-stacks-close" className="section-title">
                {t(locale, "lab.stacks.index.close.title")}
              </h2>
              <p>{t(locale, "lab.stacks.index.close.body")}</p>
              <Link className="btn btn-secondary" href="/lab/open-tools">
                {t(locale, "lab.stacks.index.close.cta")}
              </Link>
            </div>
          </div>
        </section>
    </LabToolShell>
  );
}
