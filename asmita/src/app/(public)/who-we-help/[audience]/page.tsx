import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { audiences, getAudience } from "@/lib/audience-content";
import { audiencesHi } from "@/lib/audience-content-hi";
import { getLocale } from "@/lib/get-locale";

export function generateStaticParams() {
  return audiences.map((a) => ({ audience: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ audience: string }>;
}): Promise<Metadata> {
  const { audience } = await params;
  const data = getAudience(audience);
  if (!data) return { title: "Who we help" };
  if (await getLocale() === "hi") {
    const translated = audiencesHi[audience];
    return { title: translated.term, description: translated.cardLine };
  }
  return { title: data.term, description: data.cardLine };
}

export default async function AudiencePage({
  params,
}: {
  params: Promise<{ audience: string }>;
}) {
  const { audience } = await params;
  const englishData = getAudience(audience);
  if (!englishData) notFound();
  const locale = await getLocale();
  const say = (en: string, hi: string) => locale === "hi" ? hi : en;
  const data = locale === "hi" ? audiencesHi[audience] : englishData;

  const others = audiences.filter((a) => a.slug !== data.slug).slice(0, 3)
    .map((a) => locale === "hi" ? audiencesHi[a.slug] : a);

  return (
    <AppShell>
      <div className="page-canvas">
        {/* HERO */}
        <section className="hero" aria-label={data.term}>
          <div className="hero-content container section-pad">
            <div className="mx-auto max-w-5xl">
              <p className="text-sm">
                <Link href="/who-we-help" className="text-link font-medium">
                  {say("Who we help", "हम किसकी मदद करते हैं")}
                </Link>
              </p>
              <span className="eyebrow mt-4 inline-block">{data.term}</span>
              <h1 className="font-display mt-3 text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.08] text-[var(--heading)]">
                {data.title}
              </h1>
              <p className="font-size-large mt-6 max-w-2xl text-[var(--theme-color-2)]">
                {data.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="btn btn-midnight btn-arrow !m-0" href={data.cta.href}>
                  {data.cta.label}
                </Link>
                {data.secondary && (
                  <Link className="btn btn-secondary btn-arrow !m-0" href={data.secondary.href}>
                    {data.secondary.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* POINTS */}
        <section className="zone-white section-pad !pt-4" aria-label={say("How we help", "हम कैसे मदद करते हैं")}>
          <div className="container">
            <div className="mx-auto max-w-5xl">
              {data.callout && (
                <div className="mb-10 rounded-[var(--radius-lg)] border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] p-6 md:p-7">
                  <p className="font-display text-[1.05rem] font-medium text-[var(--heading)]">
                    {data.callout.title}
                  </p>
                  <p className="mt-2 text-[15px] leading-[1.65] text-[var(--body)]">
                    {data.callout.body}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {data.points.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--color-parchment)] p-6 shadow-[var(--shadow-sm)]"
                  >
                    <h2 className="text-[17px] font-medium text-[var(--heading)]">
                      {p.title}
                    </h2>
                    <p className="mt-2 text-sm leading-[1.65] text-[var(--body)]">
                      {p.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* OTHER AUDIENCES */}
        <section className="transform-section" aria-labelledby="others-heading">
          <div className="transform-content container section-pad">
            <h2
              id="others-heading"
              className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-[1.16]"
            >
              {say("Coming from somewhere else?", "किसी और स्थिति के बारे में पढ़ना है?")}
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {others.map((a) => (
                <Link
                  key={a.slug}
                  href={`/who-we-help/${a.slug}`}
                  className="group flex flex-col rounded-[var(--radius-lg)] bg-[var(--color-parchment)] p-6 backdrop-blur-sm transition hover:bg-[var(--color-parchment)]"
                >
                  <h3 className="text-[16px] font-medium leading-snug text-[var(--heading)]">
                    {a.term}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-[1.55] text-[var(--muted)]">
                    {a.cardLine}
                  </p>
                  <span className="mt-3 inline-block text-sm font-medium text-[var(--color-off-black)]">
                    {say("Open", "देखें")}{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden>
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
